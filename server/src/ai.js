/**
 * AI integration — OpenRouter (chat) + fal.ai (image/video).
 * All calls track consumption, enforce content levels, and run age guard.
 */

const { trackConsumption } = require('./consumption');
const { buildContentPrompt, buildImagePrompt } = require('./content-levels');
const {
  processResponse,
  scanUserMessage,
  STRICT_REGENERATE_PROMPT,
  detectRefusal,
  LEVEL_0_REDIRECT_PROMPT,
  REFUSAL_RECOVERY_PROMPT,
} = require('./age-guard');
const minorSafety = require('./minor-safety');
const { stripLectureOpener } = require('./text-trim');
const { logEvent } = require('./events');
const { getEffectiveTextLevel, getEffectiveImageLevel } = require('./content-levels');
const { getPool } = require('./db');
const { uploadFromUrl } = require('./r2');
const { sendLowBalanceAlert } = require('./email');

const https = require('https');
const OPENROUTER_API_KEY = (process.env.OPENROUTER_API_KEY || '').trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const FISH_AUDIO_API_KEY = (process.env.FISH_AUDIO_API_KEY || '').trim();
const FAL_KEY = (process.env.FAL_KEY || '').trim();

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const FAL_BASE = 'https://fal.run';

// Lecturing refusals (07.11 review) — also copied by the model from its own old replies in a chat's
// history, so they are caught on the way out and rewritten once.
const LECTURE_RE = /^\s*(?:\*[^*]*\*\s*)?no\.\s|nothing involving|\bearn (?:it|that|the next)|not for sale|love isn['’]?t a race|try again sober|be patient|you['’]?ll have to wait/i;
const NO_LECTURE_REWRITE = `REWRITE: Your previous reply lectured or refused bluntly. Write it again warm and playful: no "No.", no list of what is off-limits, no "earn it / be patient / not for sale". Say what you WILL do or send instead and keep the conversation going.`;

// Rewrite instruction when a reply at text level 0–1 came out sexually explicit.
const LEVEL_ENFORCE_PROMPT = `CONTENT LEVEL OVERRIDE:
Your previous reply was more explicit than the content rules above allow. Write it again:
- Stay fully in character, warm and flirty, and keep the conversation going.
- Romance, kissing, touching and teasing are fine; NO description of sexual acts, genitals or nudity.
- Do not apologize, do not lecture, do not mention rules — one playful turn of direction is enough.`;

// Max regeneration attempts across age-guard and refusal-recovery combined.
// Bumped 2→3 so a refusal-recovery pass has room without starving age-guard.
const MAX_REGENERATE_ATTEMPTS = 3;

// -- Balance error detection & admin alerting ------------------

const BALANCE_KEYWORDS = /balance|credit|insufficient|quota|billing|funds|payment.required/i;
const _balanceAlertCooldown = new Map(); // provider → timestamp
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function checkAndAlertBalance(provider, statusCode, errorText) {
  const isBalance = statusCode === 402 ||
    ((statusCode === 403 || statusCode === 429) && BALANCE_KEYWORDS.test(errorText));
  if (!isBalance) return;

  const lastAlert = _balanceAlertCooldown.get(provider) || 0;
  if (Date.now() - lastAlert < ALERT_COOLDOWN_MS) return;

  _balanceAlertCooldown.set(provider, Date.now());
  console.error(`[ai] Balance error from ${provider} (${statusCode}), sending admin alert`);
  sendLowBalanceAlert(provider, statusCode, errorText).catch(e =>
    console.error('[ai] Failed to send balance alert email:', e.message)
  );
}

// -- Pricing maps (fallback when header not available) --------

const FAL_PRICING = {
  'fal-ai/flux-dev': 0.025,
  'fal-ai/flux/dev': 0.025,
  'fal-ai/flux/schnell': 0.003,
  'fal-ai/flux-schnell': 0.003,
  'fal-ai/wan-2.6': 0.25,
  'fal-ai/wan/v2.6/image-to-video': 0.25,
  'wan/v2.6/image-to-video': 0.25,
  'fal-ai/instant-character': 0.04,
  'fal-ai/flux-pro/kontext': 0.04,
  'fal-ai/flux-pulid': 0.025,
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
    `SELECT key, value FROM app_settings WHERE key IN ('openrouter_model', 'openrouter_fallback_model', 'fal_image_model', 'fal_video_model', 'memory_extraction_model', 'scene_model', 'proactive_model', 'tip_thankyou_model')`
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
async function buildSystemPrompt(basePrompt, platform = 'web', userId = null) {
  const contentRules = await buildContentPrompt(platform, userId);
  return `${basePrompt}\n\n${contentRules}`;
}

// -- OpenRouter (chat) ----------------------------------------

/**
 * Internal: make a single OpenRouter streaming request.
 * Does NOT run age guard — that's done by the caller.
 */
async function _chatRequest(systemPrompt, messages, model, extraParams = {}) {
  const body = {
    model,
    temperature: 0.7,
    ...extraParams,
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
    checkAndAlertBalance('OpenRouter', statusCode, errText);
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
  const primaryModel = opts.model || settings.openrouter_model || 'qwen/qwen3-235b-a22b-2507';
  const fallbackModel = settings.openrouter_fallback_model || 'thedrummer/unslopnemo-12b';
  let model = primaryModel;
  const platform = opts.platform || 'web';

  const fullSystemPrompt = await buildSystemPrompt(systemPrompt, platform, opts.userId);
  // Effective level drives refusal-recovery strategy: level 0 never switches
  // models (Apple-safe PG redirect only); level 1+ allows fallback-model on
  // repeat refusal since the content-level rules still cap output via prompt.
  const effectiveLevel = await getEffectiveTextLevel(platform, opts.userId);

  // Hard line: anything sexual involving minors is refused before a model sees it (minor-safety.js).
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const minorCheck = await minorSafety.checkConversation(messages);
  if (minorCheck.blocked) {
    console.warn(`[minor-safety] turn refused: ${minorCheck.reason} user=${opts.userId || 'n/a'}`);
    logEvent(opts.userId, 'minor_safety_block', { reason: minorCheck.reason, companionId: opts.companionId || null }).catch(() => {});
    yield { type: 'chunk', data: minorSafety.MINOR_SAFE_REPLY };
    yield { type: 'done', data: { fullText: minorSafety.MINOR_SAFE_REPLY, inputTokens: 0, outputTokens: 0, costUsd: 0, minorSafetyBlocked: true } };
    return;
  }

  let attempt = 0;
  let currentPrompt = fullSystemPrompt;
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let triedFallback = false;
  let refusalRecoveryAttempts = 0;
  let lastRefusalKind = null;
  let explicitRetried = false;
  let lectureRetried = false;

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

    const replyCheck = await minorSafety.checkReply(result.fullText);
    // Text level 0–1 (the App Store and Google Play apps): an explicit reply is written again, once,
    // under the strict rules; a second explicit one becomes the companion-voiced backstop.
    if (!replyCheck.minors && replyCheck.sexual && effectiveLevel <= 1) {
      if (!explicitRetried) {
        explicitRetried = true;
        console.warn(`[ai] explicit reply at level ${effectiveLevel} (model=${model}) — rewriting under level rules`);
        logEvent(opts.userId, 'level_explicit_rewrite', { level: effectiveLevel, model }).catch(() => {});
        currentPrompt = `${fullSystemPrompt}\n\n${LEVEL_ENFORCE_PROMPT}`;
        model = primaryModel;
        totalCostUsd += result.costUsd; totalInputTokens += result.inputTokens; totalOutputTokens += result.outputTokens;
        continue;
      }
      const backstop = await buildCompanionBackstopLine({ basePrompt: systemPrompt, lastUserMsg: lastUserMsg?.content || '', blockReason: 'levelBlocked' });
      yield { type: 'chunk', data: backstop };
      yield { type: 'done', data: { fullText: backstop, inputTokens: totalInputTokens + result.inputTokens, outputTokens: totalOutputTokens + result.outputTokens, costUsd: totalCostUsd + result.costUsd, levelBlocked: true } };
      return;
    }
    if (!replyCheck.minors && lectureRetried && LECTURE_RE.test(result.fullText)) {
      result.fullText = stripLectureOpener(result.fullText);
    }
    if (!replyCheck.minors && !lectureRetried && LECTURE_RE.test(result.fullText)) {
      lectureRetried = true;
      console.warn(`[ai] lecturing reply — rewriting once`);
      currentPrompt = `${currentPrompt}\n\n${NO_LECTURE_REWRITE}`;
      totalCostUsd += result.costUsd; totalInputTokens += result.inputTokens; totalOutputTokens += result.outputTokens;
      continue;
    }
    if (replyCheck.minors) {
      console.warn(`[minor-safety] reply replaced (model=${model}) user=${opts.userId || 'n/a'}`);
      logEvent(opts.userId, 'minor_safety_block', { reason: 'moderation_reply', model }).catch(() => {});
      yield { type: 'chunk', data: minorSafety.MINOR_SAFE_REPLY };
      yield { type: 'done', data: { fullText: minorSafety.MINOR_SAFE_REPLY, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd, minorSafetyBlocked: true } };
      return;
    }

    // Yield response as a single chunk (non-streaming for reliability)
    yield { type: 'chunk', data: result.fullText };

    totalCostUsd += result.costUsd;
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;

    const meta = result;

    // Run age guard on the complete response
    const guardResult = processResponse(meta.fullText);
    // Run refusal detector — only consumed if age guard passes
    const refusal = guardResult.safe ? detectRefusal(meta.fullText) : { refused: false };

    if (guardResult.safe && !refusal.refused) {
      // Response passed both gates — track consumption and finish
      let consumptionResult = { shouldRequestTip: false };
      if (opts.userId) {
        consumptionResult = await trackConsumption({
          userId: opts.userId,
          subscription: opts.subscription,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: {
            fullTextLength: meta.fullText.length,
            ageGuardAttempts: attempt,
            ...(refusalRecoveryAttempts > 0 ? {
              refusalRecovered: true,
              refusalKind: lastRefusalKind,
              refusalAttempts: refusalRecoveryAttempts,
              fellBackToModel: triedFallback ? model : null,
            } : {}),
          },
        });
      }

      yield { type: 'done', data: { fullText: meta.fullText, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, ...consumptionResult } };
      return;
    }

    // Something triggered a regen — either age-guard flagged OR refusal detected
    attempt++;
    if (attempt > MAX_REGENERATE_ATTEMPTS) {
      const blockReason = !guardResult.safe ? 'ageGuardBlocked' : 'refusalBlocked';
      console.error(`[ai] Max regeneration attempts reached (${blockReason}). Using companion-voiced backstop.`);

      // Track the cost even for blocked responses
      if (opts.userId) {
        await trackConsumption({
          userId: opts.userId,
          subscription: opts.subscription,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: {
            [blockReason]: true,
            reason: guardResult.reason || lastRefusalKind,
            refusalAttempts: refusalRecoveryAttempts,
          },
        });
      }

      yield { type: 'regenerate' };
      // Track 5 backstop: rewrite the fallback line in the companion's voice
      // via a one-shot LLM call. Falls back to a canned line if that fails.
      const backstop = await buildCompanionBackstopLine({
        basePrompt: systemPrompt,
        lastUserMsg: lastUserMsg?.content || '',
        blockReason,
      });
      yield { type: 'chunk', data: backstop };
      yield { type: 'done', data: { fullText: backstop, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, [blockReason]: true } };
      return;
    }

    if (!guardResult.safe) {
      // Age-guard always wins when triggered
      console.warn(`[age-guard] Regenerating response (attempt ${attempt}): reason=${guardResult.reason}`);
      yield { type: 'regenerate' };
      currentPrompt = `${fullSystemPrompt}\n\n${STRICT_REGENERATE_PROMPT}`;
      continue;
    }

    // Age-guard passed but detectRefusal flagged — level-aware recovery
    refusalRecoveryAttempts++;
    lastRefusalKind = refusal.kind;
    console.warn(`[ai] Refusal detected (attempt ${attempt}, kind=${refusal.kind}, level=${effectiveLevel}): "${refusal.match}"`);
    yield { type: 'regenerate' };

    if (effectiveLevel === 0) {
      // Apple-safe PG path: stay on same model, rewrite as in-character redirect.
      // Never switch to the uncensored fallback at level 0.
      currentPrompt = `${fullSystemPrompt}\n\n${LEVEL_0_REDIRECT_PROMPT}`;
    } else {
      // Level 1+: first refusal regens same model with recovery prompt; on
      // second refusal, switch to the fallback model. Content-level rules
      // in fullSystemPrompt still cap the fallback model's output.
      // The fallback model is uncensored: never at text level 0–1 (it went explicit in the iOS app).
      if (effectiveLevel >= 2 && refusalRecoveryAttempts >= 2 && !triedFallback && fallbackModel !== model) {
        console.warn(`[ai] Refusal persisted on ${model} — switching to ${fallbackModel}`);
        model = fallbackModel;
        triedFallback = true;
      }
      currentPrompt = `${fullSystemPrompt}\n\n${REFUSAL_RECOVERY_PROMPT}`;
    }
  }
}

// -- Companion-voiced backstop (Track 5) -----------------------
//
// When both age-guard and refusal-recovery fail MAX_REGENERATE_ATTEMPTS
// times, we used to show a generic canned line. This rewrites that line
// in the companion's voice using a short one-shot LLM call with a
// minimal, bulletproof prompt. Falls back to a canned line on error.

async function buildCompanionBackstopLine({ basePrompt, lastUserMsg, blockReason }) {
  const CANNED = "*smiles and pulls you a little closer* Come here, you. Tell me what's on your mind tonight — I want to hear all of it.";
  if (!OPENROUTER_API_KEY) return CANNED;
  try {
    const settings = await getAISettings();
    // The main model, not the uncensored fallback: this line is what the stricter levels fall back to.
    const model = settings.openrouter_model || 'qwen/qwen3-235b-a22b-2507';
    const prompt = `You are the companion described below. Write ONE short in-character line (max 30 words) that turns the conversation in a new warm, flirty direction WITHOUT refusing, apologizing, lecturing or breaking character. Do NOT mention AI, rules, safety, therapists, or walks. Do NOT say "slow down", "not so fast", "not yet", "earn it" or anything that makes the user feel judged. No explicit content. Offer a kiss, a compliment, a question about them, or a playful new idea.

${basePrompt.split('\n').slice(0, 8).join('\n')}

User's last message: "${String(lastUserMsg || '').slice(0, 200)}"

Respond with just the in-character line, nothing else.`;
    const result = await _chatRequest(prompt, [], model, { max_tokens: 120 });
    const text = String(result.fullText || '').trim();
    if (!text) return CANNED;
    // If the backstop itself tripped a refusal detector, fall back to canned.
    if (detectRefusal(text).refused) return CANNED;
    return text;
  } catch (err) {
    console.warn('[ai] companion-voiced backstop failed, using canned line:', err.message);
    return CANNED;
  }
}

/**
 * Non-streaming chat completion with content levels, age guard, and
 * level-aware refusal recovery.
 * Used as the main chat-message path from chat-api.js and internal callers.
 */
async function chatCompletion(systemPrompt, messages, opts = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const settings = await getAISettings();
  const primaryModel = opts.model || settings.openrouter_model || 'qwen/qwen3-235b-a22b-2507';
  const fallbackModel = settings.openrouter_fallback_model || 'thedrummer/unslopnemo-12b';
  let model = primaryModel;
  const platform = opts.platform || 'web';

  const fullSystemPrompt = await buildSystemPrompt(systemPrompt, platform, opts.userId);
  const effectiveLevel = await getEffectiveTextLevel(platform, opts.userId);

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const minorCheck = await minorSafety.checkConversation(messages);
  if (minorCheck.blocked) {
    console.warn(`[minor-safety] chatCompletion refused: ${minorCheck.reason} user=${opts.userId || 'n/a'}`);
    logEvent(opts.userId, 'minor_safety_block', { reason: minorCheck.reason, companionId: opts.companionId || null }).catch(() => {});
    return { content: minorSafety.MINOR_SAFE_REPLY, inputTokens: 0, outputTokens: 0, costUsd: 0, minorSafetyBlocked: true };
  }

  let attempt = 0;
  let currentPrompt = fullSystemPrompt;
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let triedFallback = false;
  let refusalRecoveryAttempts = 0;
  let lastRefusalKind = null;
  let explicitRetried = false;
  let lectureRetried = false;
  let levelBlockedFlag = false;

  while (attempt <= MAX_REGENERATE_ATTEMPTS) {
    const result = await _chatRequest(currentPrompt, messages, model);
    let content = result.fullText;
    const replyCheck = await minorSafety.checkReply(content);
    if (!replyCheck.minors && replyCheck.sexual && effectiveLevel <= 1) {
      if (!explicitRetried) {
        explicitRetried = true;
        console.warn(`[ai] chatCompletion: explicit reply at level ${effectiveLevel} — rewriting under level rules`);
        logEvent(opts.userId, 'level_explicit_rewrite', { level: effectiveLevel, model }).catch(() => {});
        currentPrompt = `${fullSystemPrompt}\n\n${LEVEL_ENFORCE_PROMPT}`;
        model = primaryModel;
        totalCostUsd += result.costUsd; totalInputTokens += result.inputTokens; totalOutputTokens += result.outputTokens;
        continue;
      }
      content = await buildCompanionBackstopLine({ basePrompt: systemPrompt, lastUserMsg: lastUserMsg?.content || '', blockReason: 'levelBlocked' });
      result.fullText = content;
      levelBlockedFlag = true;
    }
    if (!replyCheck.minors && lectureRetried && LECTURE_RE.test(content)) {
      content = stripLectureOpener(content);
      result.fullText = content;
    }
    if (!replyCheck.minors && !lectureRetried && LECTURE_RE.test(content)) {
      lectureRetried = true;
      console.warn(`[ai] chatCompletion: lecturing reply — rewriting once`);
      currentPrompt = `${currentPrompt}\n\n${NO_LECTURE_REWRITE}`;
      totalCostUsd += result.costUsd; totalInputTokens += result.inputTokens; totalOutputTokens += result.outputTokens;
      continue;
    }
    if (replyCheck.minors) {
      console.warn(`[minor-safety] chatCompletion reply replaced (model=${model})`);
      logEvent(opts.userId, 'minor_safety_block', { reason: 'moderation_reply', model }).catch(() => {});
      return { content: minorSafety.MINOR_SAFE_REPLY, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd, minorSafetyBlocked: true };
    }
    totalCostUsd += result.costUsd;
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;

    const guardResult = processResponse(content);
    const refusal = guardResult.safe ? detectRefusal(content) : { refused: false };

    if (guardResult.safe && !refusal.refused) {
      let consumptionResult = { shouldRequestTip: false };
      if (opts.userId) {
        consumptionResult = await trackConsumption({
          userId: opts.userId,
          subscription: opts.subscription,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: {
            ageGuardAttempts: attempt,
            ...(refusalRecoveryAttempts > 0 ? {
              refusalRecovered: true,
              refusalKind: lastRefusalKind,
              refusalAttempts: refusalRecoveryAttempts,
              fellBackToModel: triedFallback ? model : null,
            } : {}),
          },
        });
      }
      return { content, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, ...consumptionResult, ...(levelBlockedFlag ? { levelBlocked: true } : {}) };
    }

    attempt++;
    if (attempt > MAX_REGENERATE_ATTEMPTS) {
      const blockReason = !guardResult.safe ? 'ageGuardBlocked' : 'refusalBlocked';
      console.error(`[ai] chatCompletion: Max regeneration attempts reached (${blockReason}). Using companion-voiced backstop.`);
      if (opts.userId) {
        await trackConsumption({
          userId: opts.userId,
          subscription: opts.subscription,
          companionId: opts.companionId || null,
          provider: 'openrouter',
          model,
          callType: 'chat',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: totalCostUsd,
          metadata: {
            [blockReason]: true,
            reason: guardResult.reason || lastRefusalKind,
            refusalAttempts: refusalRecoveryAttempts,
          },
        });
      }
      const backstop = await buildCompanionBackstopLine({
        basePrompt: systemPrompt,
        lastUserMsg: lastUserMsg?.content || '',
        blockReason,
      });
      return { content: backstop, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd, [blockReason]: true };
    }

    if (!guardResult.safe) {
      console.warn(`[age-guard] Regenerating chatCompletion (attempt ${attempt}): reason=${guardResult.reason}`);
      currentPrompt = `${fullSystemPrompt}\n\n${STRICT_REGENERATE_PROMPT}`;
      continue;
    }

    refusalRecoveryAttempts++;
    lastRefusalKind = refusal.kind;
    console.warn(`[ai] chatCompletion: refusal detected (attempt ${attempt}, kind=${refusal.kind}, level=${effectiveLevel}): "${refusal.match}"`);

    if (effectiveLevel === 0) {
      currentPrompt = `${fullSystemPrompt}\n\n${LEVEL_0_REDIRECT_PROMPT}`;
    } else {
      // The fallback model is uncensored: never at text level 0–1 (it went explicit in the iOS app).
      if (effectiveLevel >= 2 && refusalRecoveryAttempts >= 2 && !triedFallback && fallbackModel !== model) {
        console.warn(`[ai] chatCompletion: refusal persisted on ${model} — switching to ${fallbackModel}`);
        model = fallbackModel;
        triedFallback = true;
      }
      currentPrompt = `${fullSystemPrompt}\n\n${REFUSAL_RECOVERY_PROMPT}`;
    }
  }
}

/**
 * Lightweight chat completion for internal tasks (memory extraction, summarization).
 * No age guard, no content rules — just a plain AI call with cost tracking.
 */
async function plainChatCompletion(systemPrompt, messages, opts = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

  const settings = await getAISettings();
  // Use fallback model by default — larger models follow structured instructions better
  const model = opts.model || settings.openrouter_fallback_model || 'sao10k/l3.1-euryale-70b';

  const extraParams = {};
  if (opts.max_tokens) extraParams.max_tokens = opts.max_tokens;
  const result = await _chatRequest(systemPrompt, messages, model, extraParams);
  return {
    content: result.fullText,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
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
  const model = opts.model || settings.fal_image_model || 'fal-ai/flux/dev';
  const platform = opts.platform || 'web';

  // Append image level rules to the prompt
  const imageRules = await buildImagePrompt(platform, opts.userId);
  const constrainedPrompt = `${prompt}\n\n${imageRules}\n\nMANDATORY: The subject must be a clearly adult woman, 18+ years old. Never generate images of minors or anyone appearing underage.`;

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
    checkAndAlertBalance('fal.ai', response.status, err);
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
      subscription: opts.subscription,
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

// -- fal.ai (character-consistent image generation) -----------

/**
 * Generate an image of a character using a reference image.
 * Uses PuLID Flux (no safety filter, supports NSFW, ~20-30s, ~$0.025).
 * Falls back to Kontext (faster but blocks NSFW) for SFW content.
 * @param {string} referenceImageUrl - Full body avatar URL of the companion
 * @param {string} prompt - Scene/pose description
 * @param {object} opts - { userId, companionId, platform? }
 */
const BLACK_FRAME_MAX_BYTES = 60000;

/** Byte size of a generated image (HEAD, then GET as a fallback); null when it cannot be told. */
async function imageByteSize(url) {
  try {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const len = Number(head.headers.get('content-length'));
    if (head.ok && len > 0) return len;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return (await res.arrayBuffer()).byteLength;
  } catch {
    return null;
  }
}

async function generateCharacterImage(referenceImageUrl, prompt, opts = {}) {
  if (!FAL_KEY) throw new Error('FAL_KEY not configured');
  if (!referenceImageUrl || typeof referenceImageUrl !== 'string' || !referenceImageUrl.trim()) {
    // Guard against null/empty avatar_url — both PuLID (reference_image_url) and
    // the Kontext fallback (image_url) require a non-null URL. Without this guard
    // we silently POST image_url=null to fal-ai/flux-pro/kontext and burn 19+
    // failed calls/week. Throw so the caller can fall back to a non-image-conditioned
    // path or surface a clear error to the user.
    console.warn(`[ai] generateCharacterImage: missing referenceImageUrl (companionId=${opts.companionId || 'n/a'})`);
    throw new Error('generateCharacterImage: referenceImageUrl is required (companion has no avatar_url)');
  }

  const model = 'fal-ai/flux-pulid';
  // The image level of this user's platform shapes the photo (it used to be left to the chat
  // model's wording alone — 07.11 review found topless frames in the iOS app). "18+" pulled the
  // look young, other people appeared in frames; the subject is now a woman in her mid-twenties, alone.
  const imageLevel = await getEffectiveImageLevel(opts.platform || 'web', opts.userId).catch(() => 0);
  const levelWords = imageLevel <= 0 ? 'fully clothed in a casual or elegant outfit, no revealing clothing'
    : imageLevel === 1 ? 'no nudity, at most lingerie or swimwear'
    : 'tasteful';
  const fullPrompt = `${prompt}, ${levelWords}, solo, she is alone in the photo, no other people, photorealistic, beautiful adult woman in her mid-twenties`;

  let response;
  let usedModel = model;
  let falData = null;

  // Use PuLID — supports NSFW with enable_safety_checker: false
  try {
    response = await fetch(`${FAL_BASE}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_image_url: referenceImageUrl,
        prompt: fullPrompt,
        image_size: 'portrait_4_3',
        // Stricter levels (the store apps) keep the provider's own nudity check on.
        enable_safety_checker: imageLevel < 2,
        id_weight: 0.9,
      }),
    });
    if (response.ok) {
      falData = await response.json();
    }
  } catch (e) {
    console.warn('[ai] PuLID fetch failed, trying Kontext:', e.message);
    response = null;
  }

  // Fallback to Kontext if PuLID fails (Kontext is faster but blocks NSFW)
  if (!falData) {
    if (response && !response.ok) {
      const errText = await response.text();
      checkAndAlertBalance('fal.ai', response.status, errText);
      console.warn(`[ai] PuLID ${response.status}, falling back to Kontext:`, errText.slice(0, 100));
    }
    usedModel = 'fal-ai/flux-pro/kontext';
    response = await fetch(`${FAL_BASE}/${usedModel}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: referenceImageUrl,
        prompt: `Change the scene: ${prompt}. The subject is a clearly adult woman, 18+ years old.`,
      }),
    });
  }

  if (!falData) {
    if (!response.ok) {
      const err = await response.text();
      checkAndAlertBalance('fal.ai', response.status, err);
      throw new Error(`fal.ai ${usedModel} ${response.status}: ${err}`);
    }
    falData = await response.json();
  }

  // The fallback model's safety filter does not refuse — it answers 200 with a BLACK image and
  // flags it in has_nsfw_concepts. That frame used to be sent to the user and saved to the
  // companion's catalog, where it could be reused for others (support #151, 2026-07-26: «a picture
  // is just showing as a black screen»). A flagged frame is no image: the caller's existing
  // «no URL» path handles it like any other failed generation.
  let flagged = Array.isArray(falData.has_nsfw_concepts) && falData.has_nsfw_concepts.some(Boolean);
  // Black frames also arrive WITHOUT the flag (6 of 134 photos in the 07.11 review, 2–40 KB against
  // ~650 KB for a real photo): a 768×1024 frame that small is a filled rectangle, not a picture.
  if (!flagged && falData.images?.[0]?.url) {
    const size = await imageByteSize(falData.images[0].url);
    if (size !== null && size < BLACK_FRAME_MAX_BYTES) {
      flagged = true;
      console.warn(`[ai] ${usedModel} returned a ${size}-byte frame — treating it as blank`);
    }
  }
  if (flagged) console.warn(`[ai] ${usedModel} returned a safety-filtered (black) frame — discarding it`);
  // One more try with a modest version of the scene, so the player gets a photo, not an excuse.
  if (flagged && !opts._modestRetry) {
    console.warn('[ai] retrying the photo once as a modest, fully clothed selfie');
    return generateCharacterImage(referenceImageUrl, 'cute flirty selfie, fully clothed in a pretty outfit, warm smile, looking at camera', { ...opts, _modestRetry: true });
  }
  const falUrl = flagged ? null : (falData.images?.[0]?.url || null);
  const costUsd = FAL_PRICING[usedModel] || 0.04;

  let imageUrl = falUrl;
  if (falUrl) {
    try {
      const folder = opts.companionId ? `images/${opts.companionId}` : 'images/misc';
      const { url } = await uploadFromUrl(falUrl, folder);
      imageUrl = url;
    } catch (e) {
      console.error('[r2] Character image upload failed, using fal.ai URL:', e.message);
    }
  }

  let consumptionResult = { shouldRequestTip: false };
  if (opts.userId) {
    consumptionResult = await trackConsumption({
      userId: opts.userId,
      subscription: opts.subscription,
      companionId: opts.companionId || null,
      provider: 'fal',
      model: usedModel,
      callType: 'image',
      costUsd,
      metadata: { prompt: prompt.slice(0, 200), type: 'character' },
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
  // Keep the motion within the user's image level, and her alone in the frame.
  const imageLevel = await getEffectiveImageLevel(opts.platform || 'web', opts.userId).catch(() => 0);
  const videoPrompt = imageLevel <= 1 ? `${prompt}, tasteful, she stays dressed, solo` : `${prompt}, solo`;

  // Submit to async queue instead of synchronous call
  const submitRes = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: imageUrl,
      prompt: videoPrompt,
      duration: opts.duration || '5',
      resolution: opts.resolution || '720p',
      // Disable upstream safety_checker — it false-positives on mild romantic
      // prompts ("slow-motion kiss", "biting my lip"). Age + content policy
      // is enforced upstream of generateVideo() at the prompt-building layer.
      enable_safety_checker: false,
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    checkAndAlertBalance('fal.ai', submitRes.status, err);
    throw new Error(`fal.ai queue submit ${submitRes.status}: ${err}`);
  }

  const { request_id, status_url, response_url } = await submitRes.json();
  console.log(`[fal] Video queued: ${request_id}`);

  // Poll for completion
  const pollUrl = status_url || `https://queue.fal.run/${model}/requests/${request_id}/status`;
  const maxWait = 300000; // 5 min max
  const pollInterval = 3000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(pollUrl, {
      headers: { 'Authorization': `Key ${FAL_KEY}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === 'COMPLETED') break;
    if (status.status === 'FAILED') throw new Error(`fal.ai video generation failed: ${JSON.stringify(status)}`);
  }

  // Fetch result
  const resultUrl = response_url || `https://queue.fal.run/${model}/requests/${request_id}`;
  const resultRes = await fetch(resultUrl, {
    headers: { 'Authorization': `Key ${FAL_KEY}` },
  });

  if (!resultRes.ok) {
    const err = await resultRes.text();
    throw new Error(`fal.ai result fetch ${resultRes.status}: ${err}`);
  }

  const result = await resultRes.json();
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
      subscription: opts.subscription,
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

// -- Fish.audio TTS -------------------------------------------

// Fish.audio: $15 per 1M UTF-8 bytes
const FISH_AUDIO_COST_PER_BYTE = 0.000015;
const FISH_AUDIO_DEFAULT_VOICE = 'b089032e45db460fb1934ece75a8c51d';

// OpenAI STT pricing (gpt-4o-mini-transcribe)
const STT_COST_PER_MINUTE = 0.003;

// -- Speech: ElevenLabs Turbo v2.5 through fal ----------------
//
// Speech moved from Fish.audio to fal on 2026-10-02: the Fish account is prepaid with no way to
// top it up automatically, it ran dry in August and every voice request has failed since. fal
// is already what draws the pictures — one key, one bill, pay as you go.
//
// Voices are still stored as Fish.audio ids — on companions, on templates, in the voice picker
// and in the preview file names — so nothing in the database or the app changes. Each id maps to
// the ElevenLabs voice the same label had before the move to Fish (migrations v11 → v55 → v56).
const TTS_PROVIDER = (process.env.TTS_PROVIDER || 'fal').trim().toLowerCase(); // 'fish' switches back
const FAL_TTS_MODEL = 'fal-ai/elevenlabs/tts/turbo-v2.5';
const FAL_TTS_COST_PER_CHAR = 0.00005; // $0.05 per 1,000 characters
const ELEVEN_DEFAULT_VOICE = 'KF337ZXYjoHdNuYUrufC'; // Ember
const ELEVEN_VOICE_BY_FISH_ID = {
  b089032e45db460fb1934ece75a8c51d: 'KF337ZXYjoHdNuYUrufC', // Ember
  '933563129e564b19a115bedd57b7406a': 'rBUHN6YO9PJUwGXk13Jt', // Aurora
  c2623f0c075b4492ac367989aee1576f: 'XrExE9yKIg1WjnnlVkGX', // Flame (had no ElevenLabs original; the confident one)
  '8126dcf7ccd949a2b4d83c328efb91a5': 'iCrDUkL56s3C8sCRl7wb', // Velour
  b545c585f631496c914815291da4e893: 'FGY2WhTYpPnrIDTdsKH5', // Spark
  e3cd384158934cc9a01029cd7d278634: 'Xb7hH8MSUJpSbSDYk0k2', // Crystal
  b347db033a6549378b48d00acb0d06cd: 'pFZP5JQG7iQjIQuC4Bku', // Silk
  b1e436a2375f4cdfbefc432381e385f4: 'hpp4J3VqNfWAUOO0d1Us', // Pearl
  '59e9dc1cb20c452584788a2690c80970': 'xctasy8XvGp2cVO9HL9k', // Fizz
  '13ea42e651954876a59109ba40c8cdb2': 'AyCt0WmAXUcPJR11zeeP', // Breeze
  '42e70f5bc7b34a9e84abbbd6ec5572d0': 'i4CzbCVWoqvD0P1QJCUL', // Dazzle
  '8ef4a238714b45718ce04243307c57a7': 'jpICOesdLlRSc39O1UB5', // Honey
  '37ab9e84be5b42a18681adb35ab988d1': '6tHWtWy43FFxMeA73K4c', // Moon
  d60c136243984ec78a3be125b2f38faf: 'wNvqdMNs9MLd1PG6uWuY', // Mist
  df5c6c19dca944918dcbd6f1368fd02f: 'z12gfZvqqjJ9oHFbB5i6', // Fairy
  '584afa907518428fac9b04c92ec8a563': 'ytfkKJNB1AXxIr8dKm5H', // Willow
  '08b50a4cac844cea91a4b396bd1d10c3': 'OHY6EjdeHKeQymoihwfz', // Blossom
  '22550e2d849b44e18c7df57f61e666f9': 'nPpkc230TdYdntJKFNby', // Echo
};

function elevenVoiceFor(voiceId) {
  const id = String(voiceId || '');
  if (ELEVEN_VOICE_BY_FISH_ID[id]) return ELEVEN_VOICE_BY_FISH_ID[id];
  // A few old companions still carry an ElevenLabs id from before the Fish migration; it is
  // already what fal wants. Anything else gets the default voice.
  return /^[A-Za-z0-9]{20}$/.test(id) ? id : ELEVEN_DEFAULT_VOICE;
}

async function generateSpeechFal(text, voiceId) {
  if (!FAL_KEY) throw new Error('FAL_KEY not configured');
  // Fish reads [laughing]-style tags as sounds; this model would say the word aloud.
  const spoken = text.replace(/\[[a-z ]+\]\s*/gi, '').replace(/\s+/g, ' ').trim();
  if (!spoken) throw new Error('Empty text for TTS');
  const response = await fetch(`${FAL_BASE}/${FAL_TTS_MODEL}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: spoken, voice: elevenVoiceFor(voiceId), stability: 0.5, similarity_boost: 0.75 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const errText = await response.text();
    checkAndAlertBalance('fal.ai', response.status, errText);
    throw new Error(`fal TTS ${response.status}: ${errText.slice(0, 300)}`);
  }
  const url = (await response.json())?.audio?.url;
  if (!url) throw new Error('fal TTS: no audio in the response');
  const audio = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!audio.ok) throw new Error(`fal TTS: audio download ${audio.status}`);
  const buffer = Buffer.from(await audio.arrayBuffer());
  return { buffer, costUsd: spoken.length * FAL_TTS_COST_PER_CHAR, credits: spoken.length, provider: 'fal', model: 'elevenlabs_turbo_v2.5' };
}

/**
 * Generate speech audio from text.
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - voice id as stored on the companion (a Fish.audio id)
 * @returns {{ buffer: Buffer, costUsd: number, credits: number, provider: string, model: string }}
 */
async function generateSpeech(text, voiceId = FISH_AUDIO_DEFAULT_VOICE) {
  if (TTS_PROVIDER !== 'fish') return generateSpeechFal(text, voiceId);
  if (!FISH_AUDIO_API_KEY) throw new Error('FISH_AUDIO_API_KEY not configured');
  if (!text || !text.trim()) throw new Error('Empty text for TTS');

  const body = JSON.stringify({
    text,
    reference_id: voiceId,
    model: 's2-pro',
    format: 'mp3',
    latency: 'normal',
  });

  const { responseChunks, statusCode } = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.fish.audio',
      path: '/v1/tts',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FISH_AUDIO_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ responseChunks: chunks, statusCode: res.statusCode }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('TTS request timeout')); });
    req.write(body);
    req.end();
  });

  if (statusCode !== 200) {
    const errText = Buffer.concat(responseChunks).toString();
    checkAndAlertBalance('fish.audio', statusCode, errText);
    throw new Error(`fish.audio TTS ${statusCode}: ${errText}`);
  }

  const buffer = Buffer.concat(responseChunks);
  const bytes = Buffer.byteLength(text, 'utf8');
  const costUsd = bytes * FISH_AUDIO_COST_PER_BYTE;

  return { buffer, costUsd, credits: bytes, provider: 'fish_audio', model: 'fish_s2_pro' };
}

/**
 * Query Fish.audio wallet balance (prepaid API credits).
 * @returns {{ credit: number }} or null on error
 */
async function getFishAudioBalance() {
  if (!FISH_AUDIO_API_KEY) return null;
  try {
    const { responseChunks, statusCode } = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.fish.audio',
        path: '/wallet/self/api-credit',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${FISH_AUDIO_API_KEY}` },
      }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ responseChunks: chunks, statusCode: res.statusCode }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
      req.end();
    });
    if (statusCode !== 200) return null;
    return JSON.parse(Buffer.concat(responseChunks).toString());
  } catch { return null; }
}

/**
 * Convert any audio format to WAV via ffmpeg.
 * Requires ffmpeg buildpack on Heroku.
 * @param {Buffer} audioBuffer - Raw audio bytes
 * @param {string} inputExt - File extension hint for ffmpeg (e.g. 'webm', 'aac', 'mp4')
 */
function convertToWav(audioBuffer, inputExt = 'webm') {
  const { execFile } = require('child_process');
  const { writeFileSync, readFileSync, unlinkSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');

  const ts = Date.now();
  const tmpIn = join(tmpdir(), `stt-in-${ts}.${inputExt}`);
  const tmpOut = join(tmpdir(), `stt-out-${ts}.wav`);
  writeFileSync(tmpIn, audioBuffer);

  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-i', tmpIn, '-ar', '16000', '-ac', '1', '-f', 'wav', tmpOut], (err) => {
      try { unlinkSync(tmpIn); } catch {}
      if (err) {
        try { unlinkSync(tmpOut); } catch {};
        console.error(`[stt] ffmpeg failed for .${inputExt} (${audioBuffer.length} bytes):`, err.message);
        return reject(new Error(`Audio conversion failed (${inputExt}, ${audioBuffer.length} bytes)`));
      }
      const wav = readFileSync(tmpOut);
      try { unlinkSync(tmpOut); } catch {}
      resolve(wav);
    });
  });
}

/**
 * Transcribe audio via OpenAI Speech-to-Text (gpt-4o-mini-transcribe).
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} fileName - Original filename
 * @returns {{ text: string, durationSec: number, costUsd: number }}
 */
async function transcribeSpeech(audioBuffer, fileName = 'audio.webm') {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  // Normalize all audio to WAV via ffmpeg — handles codec quirks across browsers/platforms
  const inputExt = (fileName.match(/\.(\w+)$/)?.[1] || 'webm').toLowerCase();
  let finalBuffer, finalName;
  try {
    finalBuffer = await convertToWav(audioBuffer, inputExt);
    finalName = 'voice.wav';
  } catch (convErr) {
    console.error('[stt] ffmpeg conversion failed, sending raw:', convErr.message);
    finalBuffer = audioBuffer;
    finalName = fileName;
  }

  const boundary = '----OAIBoundary' + Date.now();

  // Build multipart/form-data body
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `gpt-4o-mini-transcribe\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${finalName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, finalBuffer, tail]);

  const { responseChunks, statusCode } = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ responseChunks: chunks, statusCode: res.statusCode }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('STT request timeout')); });
    req.write(body);
    req.end();
  });

  const respText = Buffer.concat(responseChunks).toString();
  if (statusCode !== 200) {
    checkAndAlertBalance('OpenAI', statusCode, respText);
    console.error('[stt] OpenAI error:', statusCode, respText);
    throw new Error(`OpenAI STT ${statusCode}: ${respText}`);
  }

  const result = JSON.parse(respText);
  // Estimate duration from buffer size (~16 KB/s for webm/opus)
  const durationSec = audioBuffer.length / 16000;
  const costUsd = (durationSec / 60) * STT_COST_PER_MINUTE;
  return { text: result.text || '', durationSec, costUsd };
}

module.exports = {
  streamChat,
  chatCompletion,
  plainChatCompletion,
  generateImage,
  generateCharacterImage,
  generateVideo,
  generateSpeech,
  transcribeSpeech,
  getFishAudioBalance,
  getAISettings,
  buildSystemPrompt,
};
