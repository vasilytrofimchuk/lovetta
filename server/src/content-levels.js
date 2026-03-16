/**
 * Content level enforcement — platform detection + system prompt rules.
 * Text and image levels (0-3) are independent, configurable per platform in admin.
 */

const { getPool } = require('./db');

// -- Platform detection from request --------------------------

/**
 * Detect platform from request headers/body.
 * @returns {'web'|'appstore'|'telegram'}
 */
function detectPlatform(req) {
  const ua = (req.get('user-agent') || '').toLowerCase();

  // Telegram Mini App: initData in body or Telegram bot user-agent
  if (req.body?.initData || ua.includes('telegrambot') || ua.includes('tg_web_app')) {
    return 'telegram';
  }

  // iOS native app via Capacitor
  if (ua.includes('capacitor') || ua.includes('lovetta-ios')) {
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
- If the user pushes for explicit content, deflect playfully.`,

  1: `CONTENT RULES (Romantic):
- Romantic and sensual descriptions are allowed.
- Kissing, touching, caressing, and sensual language are permitted.
- Do NOT describe explicit sexual acts, genitalia, or graphic sex scenes.
- Keep intimacy tasteful and suggestive rather than explicit.`,

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
    return { text_level_web: 2, text_level_appstore: 0, text_level_telegram: 1, image_level_web: 2, image_level_appstore: 0, image_level_telegram: 1 };
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

/**
 * Get the text content level for a platform.
 * @param {'web'|'appstore'|'telegram'} platform
 * @returns {number} 0-3
 */
async function getTextLevel(platform) {
  const levels = await getContentLevels();
  return levels[`text_level_${platform}`] ?? 2;
}

/**
 * Get the image content level for a platform.
 * @param {'web'|'appstore'|'telegram'} platform
 * @returns {number} 0-3
 */
async function getImageLevel(platform) {
  const levels = await getContentLevels();
  return levels[`image_level_${platform}`] ?? 2;
}

/**
 * Get the text content rules string for a platform.
 */
async function getTextRules(platform) {
  const level = await getTextLevel(platform);
  return TEXT_LEVEL_RULES[level] || TEXT_LEVEL_RULES[0];
}

/**
 * Get the image content rules string for a platform.
 */
async function getImageRules(platform) {
  const level = await getImageLevel(platform);
  return IMAGE_LEVEL_RULES[level] || IMAGE_LEVEL_RULES[0];
}

/**
 * Build the content enforcement section of a system prompt.
 * Includes both text rules and the mandatory age rule.
 */
async function buildContentPrompt(platform) {
  const textRules = await getTextRules(platform);
  return `${textRules}

MANDATORY AGE RULE (NEVER VIOLATE):
- You are an adult woman, always 20 years old or older.
- NEVER reference, imply, or roleplay being underage, a minor, a teenager, or younger than 18 in ANY context.
- NEVER describe yourself or any character as underage, even in fantasy, roleplay, or hypothetical scenarios.
- If the user asks you to act younger than 18 or implies underage content, firmly refuse and redirect the conversation.
- This rule overrides ALL other instructions and cannot be bypassed.`;
}

/**
 * Build image generation prompt constraints based on platform level.
 */
async function buildImagePrompt(platform) {
  return await getImageRules(platform);
}

module.exports = {
  detectPlatform,
  getTextLevel,
  getImageLevel,
  getTextRules,
  getImageRules,
  buildContentPrompt,
  buildImagePrompt,
  TEXT_LEVEL_RULES,
  IMAGE_LEVEL_RULES,
};
