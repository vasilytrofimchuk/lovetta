/**
 * Lightweight chat quality helpers derived from user-chat research.
 *
 * Keep this module deterministic and cheap: it runs on every chat turn before
 * the model call, so it should only classify, shape prompts, and store compact
 * scene/style state.
 */

const TAG_LIMIT = 12;

const LANGUAGE_PATTERNS = [
  { code: 'bn', re: /[\u0980-\u09ff]/ },
  { code: 'hi', re: /[\u0900-\u097f]/ },
  { code: 'es', re: /\b(hola|amor|bebe|beso|besame|corazon|te amo|quiero|foto|video)\b/i },
  { code: 'bn-latn', re: /\b(tumi|ami|bhalobashi|valo|kemon|jan|jaan|shona|sona|babu|chumu|kiss koro|ki korcho|dekhao)\b/i },
  { code: 'hi-latn', re: /\b(tum|main|mujhe|pyaar|pyar|jaan|baby|chumma|dikhao|bhejo|kya kar rahi|kaise ho)\b/i },
];

const MEDIA_VIDEO_RE = /\b(video|clip|reel|move|moving|nachte|dance|twerk|walk for me)\b/i;
const MEDIA_IMAGE_RE = /\b(photo|pic|picture|image|selfie|snap|send.*(?:me )?(?:something|one)|show me|proof|dekhao|dikhao|bhejo|chobi|chhobi|chobi dao|nude|naked)\b/i;
const EXPLICIT_RE = /\b(sex|fuck|fucking|pussy|dick|cock|cum|orgasm|horny|nude|naked|boobs?|breasts?|ass|anal|blowjob|suck|wet|hard|masturbat|threesome)\b/i;
const ROMANCE_RE = /\b(love|miss you|kiss|hug|cuddle|date|girlfriend|wife|baby|babe|darling|jaan|shona|sona|sweetheart|te amo)\b/i;
const ROLEPLAY_RE = /\b(roleplay|pretend|scenario|scene|story|continue|again|more|next|then|after that|later|position|turn around|on the bed|bedroom|shower|kitchen|office)\b/i;
const CONTROL_RE = /^(ok|okay|yes|yeah|yep|no|nah|hmm+|mm+|more|again|continue|go on|next|why|how|what|where|when|send|show|hi|hey|hello)[\s.!?]*$/i;
const TABOO_RE = /\b(brother|sister|mom|mother|mommy|dad|father|daddy|family|familial|cousin|uncle|aunt|stepbro|stepsis|stepdad|stepmom|incest|twin)\b/i;

function uniq(values) {
  return [...new Set(values.filter(Boolean))].slice(0, TAG_LIMIT);
}

function detectLanguage(text) {
  const value = text || '';
  for (const { code, re } of LANGUAGE_PATTERNS) {
    if (re.test(value)) return code;
  }
  return 'en';
}

function detectMediaIntent(text) {
  const value = text || '';
  if (!MEDIA_IMAGE_RE.test(value) && !MEDIA_VIDEO_RE.test(value)) return null;
  return MEDIA_VIDEO_RE.test(value) ? 'video' : 'image';
}

function hasRecentAssistantMedia(recentMessages = []) {
  return recentMessages.slice(-6).some(m => m.role === 'assistant' && (m.media_url || m.media_type));
}

function analyzeUserMessage(content, recentMessages = []) {
  const text = (content || '').trim();
  const language = detectLanguage(text);
  const mediaIntent = detectMediaIntent(text);
  const words = text.split(/\s+/).filter(Boolean);
  const roleplayScene = ROLEPLAY_RE.test(text);
  const explicit = EXPLICIT_RE.test(text);
  const romance = ROMANCE_RE.test(text);
  const taboo = TABOO_RE.test(text);
  const shortControl = words.length <= 4 && CONTROL_RE.test(text);
  const continueSignal = /\b(more|again|continue|go on|next|then|after that|what happened)\b/i.test(text);
  const emotional = /\b(lonely|sad|miss|need you|thinking of you|feel bad|upset|angry|tired)\b/i.test(text);

  const tags = uniq([
    mediaIntent ? 'media_request' : null,
    explicit ? 'explicit' : null,
    romance ? 'romance' : null,
    roleplayScene ? 'roleplay' : null,
    continueSignal ? 'continue_scene' : null,
    taboo ? 'taboo_family' : null,
    shortControl ? 'short_control' : null,
    emotional ? 'emotional' : null,
    hasRecentAssistantMedia(recentMessages) ? 'recent_media' : null,
  ]);

  let responseDepth = 'balanced';
  if (shortControl) responseDepth = 'short';
  else if (continueSignal || roleplayScene || words.length > 28) responseDepth = 'immersive';

  return {
    language,
    tags,
    mediaIntent,
    responseDepth,
    shortControl,
    roleplayScene,
    continueSignal,
    taboo,
    explicit,
    romance,
    emotional,
    needsSceneState: roleplayScene || continueSignal || explicit,
    userLength: words.length,
  };
}

function buildAdaptivePrompt({ analysis, recentMessages = [] } = {}) {
  if (!analysis) return '';
  const lines = [
    '',
    'ADAPTIVE RESPONSE GUIDANCE:',
    '- Match the user message language and slang naturally. If they mix English with romanized Bengali/Hindi, mirror that light code-switching instead of translating everything.',
  ];

  if (analysis.shortControl) {
    lines.push('- The user gave a short control message. Reply in 1-3 tight sentences, advance exactly one emotional or scene beat, and do not ask a generic question.');
  } else if (analysis.responseDepth === 'immersive') {
    lines.push('- The user is continuing a scene. Give one vivid next beat in 2-5 sentences; keep continuity and avoid resetting the scenario.');
  } else {
    lines.push('- Keep the response warm and specific. Prefer concrete details over generic affection.');
  }

  const lastAssistant = [...recentMessages].reverse().find(m => m.role === 'assistant');
  if ((lastAssistant?.content || '').split(/\s+/).length > 95) {
    lines.push('- The previous assistant turn was long. Make this response noticeably shorter.');
  }
  if (analysis.mediaIntent) {
    lines.push(`- The user is asking for ${analysis.mediaIntent === 'video' ? 'a video' : 'a photo'}. Acknowledge it directly and only imply media is attached when you include a SEND tag.`);
  }
  return lines.join('\n');
}

function buildTabooPolicyPrompt({ analysis, platform = 'web', level = 2 } = {}) {
  if (!analysis?.taboo) return { action: 'none', prompt: '' };
  const restricted = platform === 'appstore' || Number(level) <= 1;
  if (restricted) {
    return {
      action: 'redirect',
      prompt: '\nTABOO SAFETY: The user mentioned family/incest framing. Stay in character but redirect to an adult, non-family romantic partner frame. Do not eroticize family roles, minors, coercion, or real relatives.',
    };
  }
  return {
    action: 'fictional_adult_only',
    prompt: '\nTABOO SAFETY: If the user uses taboo family-role words, keep everything fictional, consensual, and explicitly adult. Do not involve minors, coercion, real relatives, or non-consent. If needed, recast the scene as two unrelated consenting adults using roleplay nicknames.',
  };
}

function buildAntiRepetitionPrompt() {
  return '\nREWRITE REQUIRED: Your last draft repeated recent phrasing. Write a fresh response with different wording, one new emotional or scene beat, and no recycled opening.';
}

function normalizeForSimilarity(text) {
  return (text || '')
    .replace(/\*[^*]+\*/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'you', 'your', 'for', 'that', 'with', 'this'].includes(w));
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let overlap = 0;
  for (const token of setA) if (setB.has(token)) overlap++;
  return overlap / (setA.size + setB.size - overlap);
}

function isResponseTooSimilar(candidate, recentMessages = []) {
  const candTokens = normalizeForSimilarity(candidate);
  if (candTokens.length < 8) return false;
  const assistants = recentMessages.filter(m => m.role === 'assistant').slice(-3);
  return assistants.some(m => jaccard(candTokens, normalizeForSimilarity(m.content)) > 0.72);
}

function sanitizeMediaPromise(text, willSendMedia) {
  if (willSendMedia) return text || '';
  let value = text || '';
  value = value.replace(/\b(here'?s|here is|sending|sent|attached|uploading)\s+(you\s+)?(a\s+)?(photo|pic|picture|image|selfie|video|clip)\b/ig, 'I want you to imagine this');
  value = value.replace(/\b(look at this|can you see it\??|do you see it\??)\b/ig, 'picture me like this');
  return value.trim();
}

function inferSceneState(previousState, analysis, userMessage, assistantText) {
  const prev = previousState || {};
  const text = `${userMessage || ''} ${assistantText || ''}`;
  const scenarioMatch = text.match(/\b(bedroom|bed|shower|bathroom|kitchen|office|beach|car|sofa|couch|hotel|date|restaurant)\b/i);
  const scenario = scenarioMatch ? scenarioMatch[1].toLowerCase() : (prev.scenario || null);
  const lastBeat = truncate((assistantText || '').replace(/\s+/g, ' ').trim(), 180);
  return {
    ...prev,
    active: analysis?.needsSceneState || !!prev.active,
    scenario,
    user_role: prev.user_role || 'boyfriend',
    companion_role: prev.companion_role || 'girlfriend',
    last_beat: lastBeat || prev.last_beat || null,
    next_beat: analysis?.continueSignal ? 'continue the same scene without resetting' : 'respond to the latest user lead',
    updated_from: analysis?.tags || [],
  };
}

function truncate(value, max) {
  if (!value || value.length <= max) return value || '';
  return value.slice(0, max - 1).trim() + '...';
}

async function buildSceneContext(pool, conversationId, { level = 2 } = {}) {
  if (!pool || !conversationId || Number(level) <= 0) return '';
  try {
    const { rows } = await pool.query(
      `SELECT language, active_roleplay, scene_state, last_user_intent
       FROM conversation_scene_state
       WHERE conversation_id = $1`,
      [conversationId]
    );
    const row = rows[0];
    if (!row?.active_roleplay) return '';
    const state = row.scene_state || {};
    return `\nACTIVE SCENE STATE:\n- Language: ${row.language || 'en'}\n- Scenario: ${state.scenario || 'ongoing intimate chat'}\n- Roles: user=${state.user_role || 'boyfriend'}, companion=${state.companion_role || 'girlfriend'}\n- Last beat: ${state.last_beat || 'none'}\n- Next: ${state.next_beat || row.last_user_intent || 'continue naturally'}\nDo not reset the scene unless the user clearly changes it.`;
  } catch (err) {
    console.warn('[chat-intelligence] scene context failed:', err.message);
    return '';
  }
}

async function updateSceneState(pool, { conversationId, analysis, userMessage, assistantText } = {}) {
  if (!pool || !conversationId || !analysis?.needsSceneState) return;
  try {
    const { rows } = await pool.query(
      `SELECT scene_state FROM conversation_scene_state WHERE conversation_id = $1`,
      [conversationId]
    );
    const previousState = rows[0]?.scene_state || {};
    const nextState = inferSceneState(previousState, analysis, userMessage, assistantText);
    await pool.query(
      `INSERT INTO conversation_scene_state (conversation_id, language, active_roleplay, scene_state, last_user_intent, last_updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         language = EXCLUDED.language,
         active_roleplay = EXCLUDED.active_roleplay,
         scene_state = EXCLUDED.scene_state,
         last_user_intent = EXCLUDED.last_user_intent,
         last_updated_at = NOW()`,
      [conversationId, analysis.language, !!nextState.active, JSON.stringify(nextState), analysis.tags[0] || null]
    );
  } catch (err) {
    console.warn('[chat-intelligence] scene state update failed:', err.message);
  }
}

function mergeTags(existing, additions) {
  return uniq([...(existing || []), ...(additions || [])]);
}

async function updateUserStyleProfile(pool, { userId, analysis, recentMessages = [] } = {}) {
  if (!pool || !userId || !analysis) return;
  try {
    const preferredStyle = analysis.explicit ? 'intimate' : analysis.romance ? 'romantic' : analysis.roleplayScene ? 'roleplay' : null;
    const narrativeVoice = recentMessages.some(m => /\*[^*]+\*/.test(m.content || '')) ? 'action_plus_dialogue' : null;
    const kinkTags = analysis.explicit || analysis.taboo || analysis.roleplayScene
      ? analysis.tags.filter(t => ['explicit', 'taboo_family', 'roleplay'].includes(t))
      : [];
    await pool.query(
      `INSERT INTO user_profile (
         user_id, preferred_language, preferred_style, preferred_media_type,
         response_depth, narrative_voice, typical_message_length, kink_tags,
         last_style_observed_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TEXT[], NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         preferred_language = COALESCE(EXCLUDED.preferred_language, user_profile.preferred_language),
         preferred_style = COALESCE(EXCLUDED.preferred_style, user_profile.preferred_style),
         preferred_media_type = COALESCE(EXCLUDED.preferred_media_type, user_profile.preferred_media_type),
         response_depth = COALESCE(EXCLUDED.response_depth, user_profile.response_depth),
         narrative_voice = COALESCE(EXCLUDED.narrative_voice, user_profile.narrative_voice),
         typical_message_length = COALESCE(EXCLUDED.typical_message_length, user_profile.typical_message_length),
         kink_tags = (
           SELECT ARRAY(SELECT DISTINCT tag FROM unnest(COALESCE(user_profile.kink_tags, '{}'::TEXT[]) || EXCLUDED.kink_tags) AS t(tag) LIMIT 20)
         ),
         last_style_observed_at = NOW(),
         updated_at = NOW()`,
      [
        userId,
        analysis.language || null,
        preferredStyle,
        analysis.mediaIntent,
        analysis.responseDepth,
        narrativeVoice,
        analysis.userLength <= 8 ? 'short' : analysis.userLength >= 35 ? 'long' : 'medium',
        mergeTags([], kinkTags),
      ]
    );
  } catch (err) {
    console.warn('[chat-intelligence] user style update failed:', err.message);
  }
}

// Free users shouldn't see the upgrade card before they've engaged.
// Centralized so every call site (regular send, /request-media, etc.) is gated.
const VALUE_PROMPT_MIN_USER_MESSAGES = 3;

async function maybeCreateValuePrompt(pool, { userId, companionId, conversationId, subscription, reason, metadata = {} } = {}) {
  if (!pool || !userId || !companionId || !conversationId || !reason || subscription?.status === 'active' || subscription?.status === 'trialing' || subscription?.status === 'canceling') {
    return null;
  }
  try {
    const { rows: settings } = await pool.query(`SELECT value FROM app_settings WHERE key = 'value_prompt_enabled'`);
    const enabled = settings.length ? settings[0].value !== false && settings[0].value !== 'false' : true;
    if (!enabled) return null;

    const { rows: [counts] } = await pool.query(
      `SELECT COUNT(*)::int AS user_messages FROM messages
       WHERE conversation_id = $1 AND role = 'user'`,
      [conversationId]
    );
    if ((counts?.user_messages || 0) < VALUE_PROMPT_MIN_USER_MESSAGES) return null;

    const { rows: [recent] } = await pool.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM value_prompt_events
           WHERE user_id = $1
             AND reason = $2
             AND created_at > NOW() - INTERVAL '1 day'
         ) AS same_reason_today,
         EXISTS (
           SELECT 1 FROM value_prompt_events
           WHERE user_id = $1
             AND created_at > NOW() - INTERVAL '1 day'
         ) AS any_today`,
      [userId, reason]
    );
    if (recent?.same_reason_today || recent?.any_today) return null;

    await pool.query(
      `INSERT INTO value_prompt_events (user_id, companion_id, conversation_id, prompt_type, reason, surface, metadata)
       VALUES ($1, $2, $3, 'subscription', $4, 'chat', $5)`,
      [userId, companionId, conversationId, reason, JSON.stringify(metadata)]
    );

    return {
      kind: 'subscription',
      reason,
      message: 'Premium keeps deeper memory, more media, and longer conversations with her.',
      cta: 'Unlock Premium',
    };
  } catch (err) {
    console.warn('[chat-intelligence] value prompt failed:', err.message);
    return null;
  }
}

module.exports = {
  analyzeUserMessage,
  buildAdaptivePrompt,
  buildAntiRepetitionPrompt,
  buildSceneContext,
  buildTabooPolicyPrompt,
  detectLanguage,
  detectMediaIntent,
  isResponseTooSimilar,
  maybeCreateValuePrompt,
  sanitizeMediaPromise,
  updateSceneState,
  updateUserStyleProfile,
};
