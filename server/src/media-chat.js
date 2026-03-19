/**
 * Media messages in chat — tag parsing, reuse logic, generation orchestration.
 * Handles [SEND_IMAGE: ...] and [SEND_VIDEO: ...] tags from LLM output.
 */

const { getPool } = require('./db');
const ai = require('./ai');

// -- Tag vocabulary for reuse matching ----------------------------

const TAG_VOCABULARY = [
  'selfie', 'bedroom', 'beach', 'pool', 'gym', 'lingerie', 'dress',
  'casual', 'closeup', 'smile', 'wink', 'couch', 'kitchen', 'mirror',
  'nightgown', 'bikini', 'outdoor', 'car', 'office', 'bath', 'morning',
  'evening', 'sunset', 'rain', 'bed', 'window', 'garden', 'bar',
  'restaurant', 'shirt', 'pajamas', 'towel', 'sporty', 'elegant',
  'playful', 'seductive', 'shy', 'flirty', 'confident', 'lazy',
];

// Synonyms: tag → related tags to add (bidirectional groups)
const TAG_SYNONYMS = {
  bed:       ['bedroom'],
  bedroom:   ['bed'],
  beach:     ['pool', 'outdoor', 'bikini'],
  pool:      ['beach', 'outdoor', 'bikini'],
  bikini:    ['beach', 'pool'],
  bath:      ['towel'],
  towel:     ['bath'],
  lingerie:  ['nightgown', 'seductive'],
  nightgown: ['lingerie', 'bed', 'bedroom'],
  couch:     ['bed', 'lazy'],
  lazy:      ['couch', 'bed', 'morning'],
  morning:   ['bed', 'bedroom', 'lazy'],
  evening:   ['sunset', 'bar'],
  sunset:    ['evening', 'outdoor'],
  garden:    ['outdoor'],
  outdoor:   ['garden'],
  gym:       ['sporty'],
  sporty:    ['gym'],
  seductive: ['lingerie', 'flirty'],
  flirty:    ['playful', 'seductive'],
  playful:   ['flirty', 'smile'],
  smile:     ['playful', 'selfie'],
  selfie:    ['closeup', 'smile'],
  closeup:   ['selfie'],
  shy:       ['smile'],
  elegant:   ['dress'],
  dress:     ['elegant'],
};

// -- Tag parsing --------------------------------------------------

/**
 * Extract [SEND_IMAGE: ...] or [SEND_VIDEO: ...] tags from LLM text.
 * Returns clean text (tags stripped) and parsed media request.
 */
function parseMediaTags(text) {
  const imageMatch = text.match(/\[SEND_IMAGE:\s*(.+?)\]/i);
  const videoMatch = text.match(/\[SEND_VIDEO:\s*(.+?)\]/i);

  const cleanText = text
    .replace(/\[SEND_IMAGE:\s*.+?\]/gi, '')
    .replace(/\[SEND_VIDEO:\s*.+?\]/gi, '')
    .trim();

  const mediaRequest = imageMatch
    ? { type: 'image', description: imageMatch[1].trim() }
    : videoMatch
      ? { type: 'video', description: videoMatch[1].trim() }
      : null;

  return { cleanText, mediaRequest };
}

// -- Tag extraction -----------------------------------------------

/**
 * Extract matching tags from a scene description, then expand with synonyms.
 */
function extractTags(description) {
  const lower = description.toLowerCase();
  const matched = TAG_VOCABULARY.filter(tag => lower.includes(tag));
  // Also extract any multi-word patterns
  if (/look(ing|s)?\s*(at\s*)?camera/i.test(lower)) matched.push('selfie');
  if (/lying|laying|stretched/i.test(lower)) matched.push('bed');
  if (/swim|water/i.test(lower) && !matched.includes('pool') && !matched.includes('beach')) matched.push('pool');
  // Expand with synonyms for better reuse matching
  const expanded = new Set(matched);
  for (const tag of matched) {
    const syns = TAG_SYNONYMS[tag];
    if (syns) syns.forEach(s => expanded.add(s));
  }
  return [...expanded].slice(0, 8);
}

// -- Reuse lookup -------------------------------------------------

/**
 * Find existing media that matches the requested context.
 * Looks across ALL companions that share the same avatar_url (same girl),
 * not just the current companion. Requires at least 2 overlapping tags.
 */
async function findReusableMedia(pool, companionId, type, tags) {
  if (!tags.length) return null;

  // Find all companions that share the same avatar (same base image = same girl)
  const { rows } = await pool.query(
    `SELECT cm.id, cm.media_url, cm.media_type, cm.tags,
       (SELECT COUNT(*) FROM unnest(cm.tags) t WHERE t = ANY($3)) AS overlap
     FROM companion_media cm
     JOIN user_companions uc_media ON uc_media.id = cm.companion_id
     JOIN user_companions uc_self  ON uc_self.avatar_url = uc_media.avatar_url
     WHERE uc_self.id = $1 AND cm.media_type = $2 AND cm.tags && $3
     ORDER BY overlap DESC, cm.created_at DESC
     LIMIT 1`,
    [companionId, type, tags]
  );

  // Require at least 2 tag overlap for reuse
  if (rows.length && parseInt(rows[0].overlap) >= 2) {
    return rows[0];
  }
  return null;
}

// -- Rate limiting ------------------------------------------------

async function checkRateLimit(pool, companionId, type) {
  const limits = { image: 10, video: 1 };
  const limit = limits[type] || 10;

  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM companion_media
     WHERE companion_id = $1 AND media_type = $2
     AND created_at > NOW() - INTERVAL '24 hours'`,
    [companionId, type]
  );

  return parseInt(rows[0].cnt) < limit;
}

// -- Main orchestrator --------------------------------------------

/**
 * Generate or reuse media for a chat message.
 * @param {object} companion - user_companions row (must have avatar_url)
 * @param {{ type: string, description: string }} mediaRequest
 * @param {object} opts - { userId, companionId, platform }
 * @returns {{ url: string, type: string, reused: boolean }}
 */
async function generateOrReuseMedia(companion, mediaRequest, opts = {}) {
  const pool = getPool();
  if (!pool) throw new Error('No database');

  let { type, description } = mediaRequest;
  const tags = extractTags(description);

  // Rate limit — downgrade video to image if exceeded
  if (type === 'video') {
    const allowed = await checkRateLimit(pool, companion.id, 'video');
    if (!allowed) {
      console.log('[media] video rate limit reached, downgrading to image');
      type = 'image';
    }
  }

  // Check image rate limit too
  if (type === 'image') {
    const allowed = await checkRateLimit(pool, companion.id, 'image');
    if (!allowed) {
      console.log('[media] image rate limit reached');
      return null;
    }
  }

  // Try reuse
  const existing = await findReusableMedia(pool, companion.id, type, tags);
  if (existing) {
    console.log(`[media] reusing existing ${type}: ${existing.media_url} (tags: ${existing.tags})`);
    return { url: existing.media_url, type: existing.media_type, reused: true };
  }

  // Generate new
  if (type === 'image') {
    const result = await ai.generateCharacterImage(companion.avatar_url, description, {
      userId: opts.userId,
      companionId: companion.id,
      platform: opts.platform,
    });

    if (!result.url) throw new Error('Image generation returned no URL');

    // Save to catalog
    await pool.query(
      `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, cost_usd)
       VALUES ($1, $2, 'image', $3, $4, $5)`,
      [companion.id, result.url, description, tags, result.cost]
    );

    console.log(`[media] generated new image: ${result.url} (tags: ${tags})`);
    return { url: result.url, type: 'image', reused: false };
  }

  if (type === 'video') {
    // Step 1: Find or generate a source image
    let sourceImage = await findReusableMedia(pool, companion.id, 'image', tags);
    let sourceImageUrl;

    if (sourceImage) {
      sourceImageUrl = sourceImage.media_url;
    } else {
      // Generate source image first
      const imgResult = await ai.generateCharacterImage(companion.avatar_url, description, {
        userId: opts.userId,
        companionId: companion.id,
        platform: opts.platform,
      });
      sourceImageUrl = imgResult.url;

      // Catalog the image too
      const { rows } = await pool.query(
        `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, cost_usd)
         VALUES ($1, $2, 'image', $3, $4, $5) RETURNING id`,
        [companion.id, imgResult.url, description, tags, imgResult.cost]
      );
      sourceImage = { id: rows[0].id };
    }

    // Step 2: Generate video from image
    const videoResult = await ai.generateVideo(sourceImageUrl, description, {
      userId: opts.userId,
      companionId: companion.id,
      platform: opts.platform,
    });

    if (!videoResult.url) throw new Error('Video generation returned no URL');

    await pool.query(
      `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, source_image_id, cost_usd)
       VALUES ($1, $2, 'video', $3, $4, $5, $6)`,
      [companion.id, videoResult.url, description, tags, sourceImage?.id || null, videoResult.cost]
    );

    console.log(`[media] generated new video: ${videoResult.url} (tags: ${tags})`);
    return { url: videoResult.url, type: 'video', reused: false };
  }

  return null;
}

module.exports = {
  parseMediaTags,
  extractTags,
  findReusableMedia,
  checkRateLimit,
  generateOrReuseMedia,
};
