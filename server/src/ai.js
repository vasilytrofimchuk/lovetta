/**
 * AI integration — OpenRouter (chat) + fal.ai (image/video).
 * All calls track consumption, enforce content levels, and run age guard.
 */

const { trackConsumption } = require('./consumption');
const { buildContentPrompt, buildImagePrompt } = require('./content-levels');
const { processResponse, scanUserMessage, STRICT_REGENERATE_PROMPT } = require('./age-guard');
const { getPool } = require('./db');
const { uploadFromUrl } = require('./r2');

const https = require('https');
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const FAL_KEY = (process.env.FAL_KEY || '').trim();

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const FAL_BASE = 'https://fal.run';

// Max regeneration attempts when age guard flags a response
const MAX_REGENERATE_ATTEMPTS = 2;

// -- Pricing maps (fallback when header not available) --------

const FAL_PRICING = {
  'fal-ai/flux-dev': 0.025,
  'fal-ai/flux/dev': 0.025,
  'fal-ai/flux-schnell': 0.003,
  'fal-ai/wan-2.6': 0.25,
  'fal-ai/wan/v2.6/image-to-video': 0.25,
  'wan/v2.6/image-to-video': 0.25,
};

// -- Settings cache -------------------------------------------

let settingsCache = null;
let settingsCacheTime = 0;
const SETTINGS_TTL = 60000; // 60s

async function getAISettings() {
  if (settingsCache && Date.now() - settingsCacheTime < SETTINGS_TTL) {
    return settingsCache;
  }
  const pool = getPool();
  if (!pool) return {};

  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key IN ('openrouter_model', 'openrouter_fallback_model', 'fal_image_model', 'fal_video_model')`
  );
  const settings = {};
  for (const row of rows) {
    settings[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
    settings[row.key] = settings[row.key].replace(/^"|"$/g, '');
  }
  settingsCache = settings;
  settingsCacheTime = Date.now();
  return settings;
}

// -- System prompt assembly -----------------------------------

/**
 * Build a full system prompt with content level rules appended.
 * @param {string} basePrompt - Companion personality/context prompt
 * @param {string} platform - 'web', 'appstore', 'telegram'
 * @returns {string} Full system prompt with content rules
 */
async function buildSystemPrompt(basePrompt, platform = 'web') {
  const contentRules = await buildContentPrompt(platform);
  return `${basePrompt}\n\n${contentRules}`;
}

// -- OpenRouter (chat) ----------------------------------------

/**
 * Internal: make a single OpenRouter streaming request.
 * Does NOT run age guard — that's done by the caller.
 */
async function _chatRequest(systemPrompt, messages, model) {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };

  const jsonBody = JSON.stringify(body);

  // Use https module — Node's native fetch streaming is unreliable
  const { responseChunks, statusCode, headers } = await new Promise((resolve, reject) => {
    const url = new URL(`${OPENROUTER_BASE}/chat/completions`);
    const agent = new https.Agent({ keepAlive: false });
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      agent,
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lovetta.ai',
        'X-Title': 'Lovetta',
        'Content-Length': Buffer.byteLength(jsonBody),
      },
    }, (res) => {
      const responseChunks = [];
      res.on('data', chunk => responseChunks.push(chunk));
      res.on('end', () => resolve({ responseChunks, statusCode: res.statusCode, headers: res.headers }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(new Error('Request timeout')); });
    req.write(jsonBody);
    req.end();
  });
  if (statusCode !== 200) {
    const errText = Buffer.concat(responseChunks).toString();
    const err = new Error(`OpenRouter ${statusCode}: ${errText}`);
    err.status = statusCode;
    throw err;
  }

  const headerCost = headers['x-openrouter-cost'];
  const rawBody = Buffer.concat(responseChunks).toString();
  const result = JSON.parse(rawBody);
  const fullText = result.choices?.[0]?.message?.content || '';
  const inputTokens = result.usage?.prompt_tokens || 0;
  const outputTokens = result.usage?.completion_tokens || 0;
  const usageCost = result.usage?.cost || 0;
  const costUsd = headerCost ? parseFloat(headerCost) : estimateChatCost(inputTokens, outputTokens, usageCost);

  return { fullText, inputTokens, outputTokens, costUsd };
}

/**
 * Stream a chat completion with content level enforcement and age guard.
 *
 * @param {string} systemPrompt - Base system prompt (companion personality)
 * @param {Array} messages - [{role, content}]
 * @param {object} opts - { userId, companionId, model?, platform? }
 *
 * Yields:
 *   {type: 'chunk', data: text}     — streamed text chunks
 *   {type: 'done', data: {...}}     — final result with metrics
 *
 * If age guard flags the response, it automatically regenerates with a stricter
 * prompt (up to MAX_REGENERATE_ATTEMPTS times). On regeneration, previously
 * yielded chunks are invalidated — the caller receives a {type: 'regenerate'}
 * event and then new chunks for the clean response.
 */
async function* streamChat(systemPrompt, messages, opts = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const settings = await getAISettings();
  const primaryModel = opts.model || settings.openrouter_model || 'meta-llama/llama-3.1-70b-instruct';
  const fallbackModel = settings.openrouter_fallback_model || 'meta-llama/llama-3.1-70b-instruct';
  let model = primaryModel;
  const platform = opts.platform || 'web';

  const fullSystemPrompt = await buildSystemPrompt(systemPrompt, platform);

  // Pre-screen user's last message for underage solicitation
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg) {
    const userScan = scanUserMessage(lastUserMsg.content);
    if (userScan.flagged) {
      console.warn(`[age-guard] User message flagged: ${userScan.reason}`);
    }
  }

  let attempt = 0;
  let currentPrompt = fullSystemPrompt;
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let triedFallback = false;

  while (attempt <= MAX_REGENERATE_ATTEMPTS) {
    let result;

    try {
      result = await _chatRequest(currentPrompt, messages, model);
    } catch (err) {
      // Auto-fallback on rate limit (429) or model unavailable (503)
      if ((err.status === 429 || err.status === 503) && !triedFallback && fallbackModel !== model) {
        console.warn(`[ai] ${model} returned ${err.status}, falling back to ${fallbackModel}`);
        model = fallbackModel;
        triedFallback = true;
        continue;
      }
      throw err;
    }

    // Yield response as a single chunk (non-streaming for reliability)
    yield { type: 'chunk', data: result.fullText };

    totalCostUsd += result.costUsd;
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;

    const meta = result;

    // Run age guard on the complete response
    const guardResult = processResponse(meta.fullText);

    if (guardResult.safe) {
      // Response passed — track consumption and finish
      let consumptionResult = { shouldRequestTip: false };
      if (opts.userId) {
        consumptionResult = await trackConsumption({
          userId: opts.userId,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: { fullTextLength: meta.fullText.length, ageGuardAttempts: attempt },
        });
      }

      yield { type: 'done', data: { fullText: meta.fullText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, ...consumptionResult } };
      return;
    }

    // Response flagged — regenerate with stricter prompt
    attempt++;
    if (attempt > MAX_REGENERATE_ATTEMPTS) {
      console.error(`[age-guard] Max regeneration attempts reached. Blocking response.`);

      // Track the cost even for blocked responses
      if (opts.userId) {
        await trackConsumption({
          userId: opts.userId,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: { ageGuardBlocked: true, reason: guardResult.reason },
        });
      }

      // Yield a safe fallback message
      yield { type: 'regenerate' };
      const fallback = "*smiles warmly* Hey, let's talk about something else. Tell me about your day — I'd love to hear what you've been up to.";
      yield { type: 'chunk', data: fallback };
      yield { type: 'done', data: { fullText: fallback, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, ageGuardBlocked: true } };
      return;
    }

    console.warn(`[age-guard] Regenerating response (attempt ${attempt}): reason=${guardResult.reason}`);
    yield { type: 'regenerate' };
    currentPrompt = `${fullSystemPrompt}\n\n${STRICT_REGENERATE_PROMPT}`;
  }
}

/**
 * Non-streaming chat completion with content levels and age guard.
 * Used for summaries, fact extraction, etc.
 */
async function chatCompletion(systemPrompt, messages, opts = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const settings = await getAISettings();
  const model = opts.model || settings.openrouter_model || 'venice/uncensored';
  const platform = opts.platform || 'web';

  const fullSystemPrompt = await buildSystemPrompt(systemPrompt, platform);

  let attempt = 0;
  let currentPrompt = fullSystemPrompt;
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  while (attempt <= MAX_REGENERATE_ATTEMPTS) {
    const result = await _chatRequest(currentPrompt, messages, model);
    const content = result.fullText;
    const inputTokens = result.inputTokens;
    const outputTokens = result.outputTokens;
    const costUsd = result.costUsd;

    totalCostUsd += costUsd;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;

    const guardResult = processResponse(content);

    if (guardResult.safe) {
      let consumptionResult = { shouldRequestTip: false };
      if (opts.userId) {
        consumptionResult = await trackConsumption({
          userId: opts.userId,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: { ageGuardAttempts: attempt },
        });
      }
      return { content, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, ...consumptionResult };
    }

    attempt++;
    if (attempt > MAX_REGENERATE_ATTEMPTS) {
      console.error(`[age-guard] Max regeneration attempts reached for chatCompletion. Returning safe fallback.`);
      if (opts.userId) {
        await trackConsumption({
          userId: opts.userId,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: { ageGuardBlocked: true },
        });
      }
      return { content: '', inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, ageGuardBlocked: true };
    }

    console.warn(`[age-guard] Regenerating chatCompletion (attempt ${attempt}): reason=${guardResult.reason}`);
    currentPrompt = `${fullSystemPrompt}\n\n${STRICT_REGENERATE_PROMPT}`;
  }
}

function estimateChatCost(inputTokens, outputTokens, usageCost) {
  // Prefer cost from OpenRouter usage object if available
  if (usageCost && usageCost > 0) return usageCost;
  return (inputTokens * 0.0000005) + (outputTokens * 0.0000015);
}

// -- fal.ai (image generation) --------------------------------

/**
 * Generate an image via fal.ai with content level enforcement.
 * @param {string} prompt - Image prompt
 * @param {object} opts - { userId, companionId, model?, imageSize?, numImages?, platform? }
 */
async function generateImage(prompt, opts = {}) {
  if (!FAL_KEY) throw new Error('FAL_KEY not configured');

  const settings = await getAISettings();
  const model = opts.model || settings.fal_image_model || 'fal-ai/flux-dev';
  const platform = opts.platform || 'web';

  // Append image level rules to the prompt
  const imageRules = await buildImagePrompt(platform);
  const constrainedPrompt = `${prompt}\n\n${imageRules}\n\nMANDATORY: The subject must be a clearly adult woman, 20+ years old. Never generate images of minors or anyone appearing underage.`;

  const response = await fetch(`${FAL_BASE}/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: constrainedPrompt,
      image_size: opts.imageSize || 'landscape_16_9',
      num_images: opts.numImages || 1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`fal.ai ${response.status}: ${err}`);
  }

  const result = await response.json();
  const falUrl = result.images?.[0]?.url || result.image?.url || null;
  const costUsd = FAL_PRICING[model] || 0.025;

  // Upload to R2 for permanent storage
  let imageUrl = falUrl;
  if (falUrl) {
    try {
      const folder = opts.companionId ? `images/${opts.companionId}` : 'images/misc';
      const { url } = await uploadFromUrl(falUrl, folder);
      imageUrl = url;
    } catch (e) {
      console.error('[r2] Image upload failed, using fal.ai URL:', e.message);
    }
  }

  let consumptionResult = { shouldRequestTip: false };
  if (opts.userId) {
    consumptionResult = await trackConsumption({
      userId: opts.userId,
      companionId: opts.companionId || null,
      provider: 'fal',
      model,
      callType: 'image',
      costUsd,
      metadata: { prompt: prompt.slice(0, 200) },
    });
  }

  return { url: imageUrl, cost: costUsd, ...consumptionResult };
}

// -- fal.ai (video generation) --------------------------------

/**
 * Generate a short video from an image via fal.ai.
 * @param {string} imageUrl - Source image URL
 * @param {string} prompt - Motion/scene prompt
 * @param {object} opts - { userId, companionId, model?, platform? }
 */
async function generateVideo(imageUrl, prompt, opts = {}) {
  if (!FAL_KEY) throw new Error('FAL_KEY not configured');

  const settings = await getAISettings();
  const model = opts.model || settings.fal_video_model || 'wan/v2.6/image-to-video';

  const response = await fetch(`${FAL_BASE}/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      duration: opts.duration || '5',
      resolution: opts.resolution || '720p',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`fal.ai ${response.status}: ${err}`);
  }

  const result = await response.json();
  const falUrl = result.video?.url || result.url || null;
  const costUsd = FAL_PRICING[model] || 0.25;

  // Upload to R2 for permanent storage
  let videoUrl = falUrl;
  if (falUrl) {
    try {
      const folder = opts.companionId ? `videos/${opts.companionId}` : 'videos/misc';
      const { url } = await uploadFromUrl(falUrl, folder, { extension: '.mp4' });
      videoUrl = url;
    } catch (e) {
      console.error('[r2] Video upload failed, using fal.ai URL:', e.message);
    }
  }

  let consumptionResult = { shouldRequestTip: false };
  if (opts.userId) {
    consumptionResult = await trackConsumption({
      userId: opts.userId,
      companionId: opts.companionId || null,
      provider: 'fal',
      model,
      callType: 'video',
      costUsd,
      metadata: { prompt: prompt.slice(0, 200) },
    });
  }

  return { url: videoUrl, cost: costUsd, ...consumptionResult };
}

module.exports = {
  streamChat,
  chatCompletion,
  generateImage,
  generateVideo,
  getAISettings,
  buildSystemPrompt,
};
