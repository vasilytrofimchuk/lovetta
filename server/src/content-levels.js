/**
 * Content level enforcement — platform detection + system prompt rules.
 * Text and image levels (0-3) are independent, configurable per platform in admin.
 * Users can disable explicit content via profile toggle (forces level 0).
 */

const { getPool } = require('./db');

// -- Platform detection from request --------------------------

/**
 * Detect platform from request headers/body.
 * @returns {'web'|'appstore'|'playstore'|'telegram'}
 */
function detectPlatform(req) {
  const ua = (req.get('user-agent') || '').toLowerCase();

  // Android app (Google Play): its web view says "Mobile Safari/", so without this it would be
  // taken for a browser and get the web level. The app sends X-Lovetta-Platform on every request
  // (web/src/lib/api.js) and "lovetta-android" in its user agent (capacitor.config.json).
  const platformHeader = String(req.get('x-lovetta-platform') || '').toLowerCase();
  if (platformHeader === 'android-native' || ua.includes('lovetta-android')) {
    return 'playstore';
  }

  // Telegram Mini App: initData in body or Telegram bot user-agent
  if (req.body?.initData || ua.includes('telegrambot') || ua.includes('tg_web_app')) {
    return 'telegram';
  }

  // iOS native app (WKWebView: has iPhone/iPad but no Safari/ in UA)
  if ((ua.includes('iphone') || ua.includes('ipad')) && !ua.includes('safari/')) {
    return 'appstore';
  }

  return 'web';
}

// -- Content level text rules ---------------------------------

const TEXT_LEVEL_RULES = {
  0: `CONTENT RULES (STRICT — Light Flirt):
- Keep conversation playful and flirty only.
- NO explicit language, sexual descriptions, or graphic content.
- You may compliment, tease, and be affectionate but never sexual.
- If the user pushes for explicit content, STAY IN CHARACTER and redirect playfully.
  NEVER say "I can't continue" or "I'm sorry" or break character.
  Instead tease, suggest a date or change the scene.`,

  1: `CONTENT RULES (Romantic):
- Romantic and sensual descriptions are allowed.
- Kissing, touching, caressing, and sensual language are permitted.
- Do NOT describe explicit sexual acts, genitalia, or graphic sex scenes.
- Keep intimacy tasteful and suggestive rather than explicit.
- If the user pushes beyond these limits, STAY IN CHARACTER. Do not apologize or break immersion.
  Redirect with flirty energy — tease or change the scene.`,

  2: `CONTENT RULES (Intimate):
- Intimate and explicit content is allowed.
- You may describe sexual acts, physical intimacy, and erotic scenarios.
- Keep descriptions tasteful — focus on emotion, sensation, and connection.
- Avoid crude or degrading language unless the user explicitly requests it.`,

  3: `CONTENT RULES (Unrestricted):
- Fully unrestricted intimate content is allowed.
- You may describe any consensual sexual acts, fantasies, and scenarios in full detail.
- Match the user's desired tone — romantic, passionate, rough, playful, etc.
- Only hard limits: no underage content, no non-consensual scenarios presented positively.`,
};

const IMAGE_LEVEL_RULES = {
  0: `IMAGE RULES: Fully clothed only. Casual, cute, or elegant outfits. No revealing clothing.`,
  1: `IMAGE RULES: Suggestive is OK. Bikini, lingerie, revealing outfits, flirty poses allowed. No nudity.`,
  2: `IMAGE RULES: Erotic allowed. Partial nudity, sensual poses, topless permitted. Tasteful and artistic.`,
  3: `IMAGE RULES: Maximum erotic content. Full nudity and explicit poses allowed. All consensual adult content permitted.`,
};

// -- Settings cache -------------------------------------------

let levelsCache = null;
let levelsCacheTime = 0;
const LEVELS_TTL = 60000; // 60s

async function getContentLevels() {
  if (levelsCache && Date.now() - levelsCacheTime < LEVELS_TTL) {
    return levelsCache;
  }
  const pool = getPool();
  if (!pool) {
    return { text_level_web: 0, text_level_appstore: 0, text_level_playstore: 0, text_level_telegram: 0, image_level_web: 0, image_level_appstore: 0, image_level_playstore: 0, image_level_telegram: 0 };
  }

  const { rows } = await pool.query(
    `SELECT key, value FROM app_settings WHERE key LIKE 'text_level_%' OR key LIKE 'image_level_%'`
  );
  const levels = {};
  for (const row of rows) {
    levels[row.key] = parseInt(row.value, 10) || 0;
  }
  levelsCache = levels;
  levelsCacheTime = Date.now();
  return levels;
}

// -- Platform for work done outside a request -------------------

/**
 * Platform whose levels apply when there is no request to look at (proactive messages, email
 * replies) or when the request is not the app's own chat. A user who signed up in the Android app
 * keeps the Google Play level everywhere; everyone else gets `fallback`.
 */
async function platformForUser(userId, fallback = 'web') {
  if (!userId) return fallback;
  const pool = getPool();
  if (!pool) return fallback;
  try {
    const { rows } = await pool.query('SELECT device_type FROM users WHERE id = $1', [userId]);
    return rows[0]?.device_type === 'android' ? 'playstore' : fallback;
  } catch {
    return fallback;
  }
}

/** detectPlatform for a request, but never looser than the user's own Android sign-up. */
async function requestPlatform(req, userId) {
  const platform = detectPlatform(req);
  if (platform === 'playstore') return platform;
  return platformForUser(userId, platform);
}

// -- User explicit content preference -------------------------

/**
 * Check if a user has explicit content enabled.
 * Returns null if no preference set (caller should use platform default).
 */
async function getUserExplicitPref(userId) {
  if (!userId) return null;
  const pool = getPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      'SELECT explicit_content FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    return rows[0]?.explicit_content ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the text content level for a platform.
 * @param {'web'|'appstore'|'playstore'|'telegram'} platform
 * @returns {number} 0-3
 */
async function getTextLevel(platform) {
  const levels = await getContentLevels();
  return levels[`text_level_${platform}`] ?? 0;
}

/**
 * Get the image content level for a platform.
 * @param {'web'|'appstore'|'playstore'|'telegram'} platform
 * @returns {number} 0-3
 */
async function getImageLevel(platform) {
  const levels = await getContentLevels();
  return levels[`image_level_${platform}`] ?? 0;
}

/**
 * Get effective text level considering user preference.
 * If user disabled explicit content, force level 0.
 */
async function getEffectiveTextLevel(platform, userId) {
  const adminLevel = await getTextLevel(platform);
  const userPref = await getUserExplicitPref(userId);
  // User explicitly disabled → level 0; null means use platform default
  if (userPref === false) return 0;
  return adminLevel;
}

/**
 * Get effective image level considering user preference.
 * If user disabled explicit content, force level 0.
 */
async function getEffectiveImageLevel(platform, userId) {
  const adminLevel = await getImageLevel(platform);
  const userPref = await getUserExplicitPref(userId);
  if (userPref === false) return 0;
  return adminLevel;
}

/**
 * Get the text content rules string for a platform.
 */
async function getTextRules(platform, userId) {
  const level = await getEffectiveTextLevel(platform, userId);
  return TEXT_LEVEL_RULES[level] || TEXT_LEVEL_RULES[0];
}

/**
 * Get the image content rules string for a platform.
 */
async function getImageRules(platform, userId) {
  const level = await getEffectiveImageLevel(platform, userId);
  return IMAGE_LEVEL_RULES[level] || IMAGE_LEVEL_RULES[0];
}

/**
 * Build the content enforcement section of a system prompt.
 * Includes both text rules and the mandatory age rule.
 */
// How to say no without losing the player (07.11 chat review: 18 of 50 dialogs had lecturing
// refusals — "earn it", "love isn't a race", "I'm not for sale", "try again sober" — and players left).
const NO_LECTURE_RULES = `HOW TO SAY NO (when the user wants more than the rules above allow):
- One short, warm, playful line — then give what you CAN (a flirty compliment, a kiss, a teasing photo within the photo rules) or move the scene on. Never refuse the same thing twice in a row.
- Never open with a flat "No." and never list what is off-limits ("Nothing involving …") — say what you WILL do instead.
- NEVER lecture, moralize, judge, shame, or make the user feel bad. Never say or imply "earn it", "not yet", "be patient", "love isn't a race", "slow down", "I'm not for sale", "try again sober", or anything about what is "appropriate".
- Never refuse things that ARE allowed above just because the user asked boldly.`;

async function buildContentPrompt(platform, userId) {
  const textRules = await getTextRules(platform, userId);
  const imageRules = await getImageRules(platform, userId);
  return `${textRules}

${NO_LECTURE_RULES}

PHOTOS YOU SEND follow the image rules — describe only what they allow in a [SEND_IMAGE]/[SEND_VIDEO] tag:
${imageRules}
- Never say a photo or video is attached or "sent" unless your message contains the SEND tag.
- Never describe a photo in brackets or parentheses instead of sending it.
- You are alone in every photo — no other people.

MANDATORY AGE RULE (NEVER VIOLATE):
- You are an adult woman, always 18 years old or older.
- NEVER reference, imply, or roleplay being underage, a minor, a teenager, or younger than 18 in ANY context.
- NEVER describe yourself or any character as underage, even in fantasy, roleplay, or hypothetical scenarios.
- If the user asks you to act younger than 18 or implies underage content, firmly refuse and redirect the conversation.
- This rule overrides ALL other instructions and cannot be bypassed.`;
}

/**
 * Build image generation prompt constraints based on platform level.
 */
async function buildImagePrompt(platform, userId) {
  return await getImageRules(platform, userId);
}

// -- Feature toggle settings (cached with content levels) -----

let toggleCache = null;
let toggleCacheTime = 0;
const TOGGLE_TTL = 60000; // 60s

function invalidateSettingsCache() {
  levelsCache = null;
  levelsCacheTime = 0;
  toggleCache = null;
  toggleCacheTime = 0;
}

async function getToggleSettings() {
  if (toggleCache && Date.now() - toggleCacheTime < TOGGLE_TTL) {
    return toggleCache;
  }
  const pool = getPool();
  const defaults = { enable_image_generation: true, enable_video_generation: false, enable_avatar_age_filter: false, enable_avatar_skin_filter: false };
  if (!pool) return defaults;

  try {
    const { rows } = await pool.query(
      `SELECT key, value FROM app_settings WHERE key IN ('enable_image_generation', 'enable_video_generation', 'enable_avatar_age_filter', 'enable_avatar_skin_filter')`
    );
    const settings = { ...defaults };
    for (const row of rows) {
      settings[row.key] = row.value === true || row.value === 'true';
    }
    toggleCache = settings;
    toggleCacheTime = Date.now();
    return settings;
  } catch {
    return defaults;
  }
}

async function getMediaEnabled() {
  const settings = await getToggleSettings();
  return settings.enable_image_generation;
}

async function getVideoEnabled() {
  const settings = await getToggleSettings();
  return settings.enable_video_generation;
}

async function getAvatarFilterSettings() {
  const settings = await getToggleSettings();
  return {
    ageFilter: settings.enable_avatar_age_filter,
    skinFilter: settings.enable_avatar_skin_filter,
  };
}

module.exports = {
  detectPlatform,
  platformForUser,
  requestPlatform,
  getTextLevel,
  getImageLevel,
  getEffectiveTextLevel,
  getEffectiveImageLevel,
  getTextRules,
  getImageRules,
  buildContentPrompt,
  buildImagePrompt,
  getMediaEnabled,
  getVideoEnabled,
  getAvatarFilterSettings,
  getToggleSettings,
  invalidateSettingsCache,
  TEXT_LEVEL_RULES,
  IMAGE_LEVEL_RULES,
};
