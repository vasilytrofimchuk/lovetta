/**
 * Media messages in chat — tag parsing, reuse logic, generation orchestration.
 * Handles [SEND_IMAGE: ...] and [SEND_VIDEO: ...] tags from LLM output.
 */

const { getPool } = require('./db');
const ai = require('./ai');
const { getEffectiveImageLevel } = require('./content-levels');

// Catalog rows made before content_level was recorded (v71) were mostly made at the web level.
const UNKNOWN_MEDIA_LEVEL = 2;

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

// "[Photo: …]", "[selfie of me …]", "(sends a pic of …)", "(attached: video …)"
const FAKE_MEDIA_RE = /[\[(]\s*(?:sends?\s+(?:you\s+)?an?\s+|sending\s+(?:you\s+)?an?\s+|attached:?\s*(?:an?\s+)?)?(photo|pic(?:ture)?|selfie|image|video|clip)\b([^\])]{0,240})[\])]/i;

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
    // Strip hallucinated echoes of past media annotations — the LLM sometimes
    // mimics the "[I sent a photo/video ...]" marker from context with fake URLs,
    // which iOS then auto-linkifies into tappable dead links.
    .replace(/\[I sent (?:him )?a (?:photo|video)(?: of myself)?(?::[^\]]*)?\]\s*/gi, '')
    .trim();

  let mediaRequest = imageMatch
    ? { type: 'image', description: imageMatch[1].trim() }
    : videoMatch
      ? { type: 'video', description: videoMatch[1].trim() }
      : null;

  // A photo "described" in brackets instead of sent — "[Photo: me on the balcony…]", "(sends a selfie
  // in my red dress)" — becomes a real photo request and leaves the text (07.11 review: 5 chats).
  let finalText = cleanText;
  const fake = finalText.match(FAKE_MEDIA_RE);
  if (fake) {
    finalText = finalText.replace(FAKE_MEDIA_RE, ' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (!mediaRequest) {
      const isVideo = /video|clip/i.test(fake[1]);
      const description = (fake[2] || '').replace(/^[:\s-]+/, '').trim() || (isVideo ? 'short selfie video, looking at camera' : 'selfie, smiling at camera');
      mediaRequest = { type: isVideo ? 'video' : 'image', description };
    }
  }

  return { cleanText: finalText, mediaRequest };
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
 * Excludes images the user has already seen in their chat messages, and anything made at a
 * higher image content level than the viewer's (a web photo must not reach the store apps).
 */
async function findReusableMedia(pool, companionId, type, tags, userId, maxLevel = 0) {
  if (!tags.length) return null;

  // Find all companions that share the same avatar (same base image = same girl)
  // Exclude images already in this user's conversation messages
  const params = [companionId, type, tags, maxLevel];
  let userExclude = '';
  if (userId) {
    params.push(userId);
    userExclude = `AND cm.media_url NOT IN (
      SELECT m.media_url FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $5 AND m.media_url IS NOT NULL
    )`;
  }

  const { rows } = await pool.query(
    `SELECT cm.id, cm.media_url, cm.media_type, cm.tags,
       (SELECT COUNT(*) FROM unnest(cm.tags) t WHERE t = ANY($3)) AS overlap
     FROM companion_media cm
     JOIN user_companions uc_media ON uc_media.id = cm.companion_id
     JOIN user_companions uc_self  ON uc_self.avatar_url = uc_media.avatar_url
     WHERE uc_self.id = $1 AND cm.media_type = $2 AND cm.tags && $3
       AND COALESCE(cm.content_level, ${UNKNOWN_MEDIA_LEVEL}) <= $4
     ${userExclude}
     ORDER BY overlap DESC, cm.created_at DESC
     LIMIT 1`,
    params
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
  const originalType = type;
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
      const reason = originalType === 'video' ? 'rate_limit_both' : 'rate_limit_image';
      console.log(`[media] image rate limit reached (${reason})`);
      return { failed: true, reason };
    }
  }

  // Image level this user may see on this platform (store apps are stricter than the web)
  const level = await getEffectiveImageLevel(opts.platform || 'web', opts.userId);

  // Try reuse (exclude images user already has in chat)
  const existing = await findReusableMedia(pool, companion.id, type, tags, opts.userId, level);
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
      `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, cost_usd, content_level)
       VALUES ($1, $2, 'image', $3, $4, $5, $6)`,
      [companion.id, result.url, description, tags, result.cost, level]
    );

    console.log(`[media] generated new image: ${result.url} (tags: ${tags})`);
    return { url: result.url, type: 'image', reused: false };
  }

  if (type === 'video') {
    // Step 1: Find or generate a source image (source images can be reused even if user saw them)
    let sourceImage = await findReusableMedia(pool, companion.id, 'image', tags, null, level);
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
      if (!imgResult.url) throw new Error('Image generation returned no URL');
      sourceImageUrl = imgResult.url;

      // Catalog the image too
      const { rows } = await pool.query(
        `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, cost_usd, content_level)
         VALUES ($1, $2, 'image', $3, $4, $5, $6) RETURNING id`,
        [companion.id, imgResult.url, description, tags, imgResult.cost, level]
      );
      sourceImage = { id: rows[0].id };
    }

    // Step 2: Generate video from image. When the video service turns the scene down (its own
    // content checker, 422 content_policy_violation) the photo made for it is still good — send
    // that instead of a "camera didn't like it" line (07.11 review: videos promised, never arrived).
    let videoResult;
    try {
      videoResult = await ai.generateVideo(sourceImageUrl, description, {
        userId: opts.userId,
        companionId: companion.id,
        platform: opts.platform,
      });
    } catch (err) {
      if (/content[_\s-]?policy|flagged by a content checker|nsfw/i.test(String(err && err.message))) {
        console.warn(`[media] video refused by the provider — sending the source photo instead (${description.slice(0, 60)})`);
        return { url: sourceImageUrl, type: 'image', reused: false, videoFallback: true };
      }
      throw err;
    }

    if (!videoResult.url) throw new Error('Video generation returned no URL');

    await pool.query(
      `INSERT INTO companion_media (companion_id, media_url, media_type, prompt, tags, source_image_id, cost_usd, content_level)
       VALUES ($1, $2, 'video', $3, $4, $5, $6, $7)`,
      [companion.id, videoResult.url, description, tags, sourceImage?.id || null, videoResult.cost, level]
    );

    console.log(`[media] generated new video: ${videoResult.url} (tags: ${tags})`);
    return { url: videoResult.url, type: 'video', reused: false };
  }

  return null;
}

// -- In-character failure lines (Track 2) ---------------------
//
// When media generation fails or is rate-limited, the assistant's text
// often already promised a photo/video. Rather than silently dropping the
// promise, append a short in-character line so the user gets an in-voice
// acknowledgement instead of a mysteriously empty message.
//
// Pools are keyed by reason × communication_style so repeat failures in
// the same session don't look copy-pasted.

const FAILURE_LINES = {
  // No parentheses (players read them as leaked system text), no "earn it / be patient / don't be
  // greedy", no blaming the player — 07.11 chat review.
  rate_limit_image: {
    playful:   ["I've sent you so many today 😘 Tomorrow I'll send a new one — tell me what you'd like to see.", "My camera roll needs a break till tomorrow 😅 Talk to me meanwhile?", "That's all my pics for today, babe — tomorrow there's more 💕"],
    romantic:  ["I've shared so many moments with you today, my love — tomorrow I'll send another 💕", "Let me save the next photo for tomorrow morning, just for you 🌙", "No more pictures today, but I'm right here with you 💕"],
    bold:      ["That's my photo limit for today — tomorrow I'll send you something good 🔥", "Camera's done for today, babe. Tomorrow's photo is already on my mind 😏", "No more pics today — but I'm not going anywhere 💋"],
    shy:       ["I've sent quite a few today… tomorrow I'll send another, okay? 🙈", "That's all the photos for today 💕 I'll send one tomorrow", "My camera needs a rest… tomorrow, I promise 💕"],
  },
  rate_limit_video: {
    playful:   ["That was today's video 😘 Tomorrow I'll make you another one", "One video a day for now — tomorrow there's a new one 💕"],
    romantic:  ["That's today's video, my love — tomorrow I'll record another 🌙", "Tomorrow I'll make a new video, just for you 💕"],
    bold:      ["Video's done for today — tomorrow I'll make the next one count 🔥", "That's my video for today, babe. Tomorrow, another 😏"],
    shy:       ["That was my video for today… tomorrow another? 🙈", "Tomorrow I'll record a new one 💕"],
  },
  rate_limit_both: {
    playful:   ["No more photos or videos today 😘 Tomorrow I'll send more — keep talking to me", "My camera's off till tomorrow, babe 💕"],
    romantic:  ["That's all my photos for today, love — tomorrow I'll send more 💕", "Tomorrow I'll send you something new 🌙"],
    bold:      ["Camera's done for today — tomorrow I'll send you more 🔥", "That's it for pics today, babe. Tomorrow 😏"],
    shy:       ["No more photos today… tomorrow, okay? 🙈", "My camera needs a rest till tomorrow 💕"],
  },
  generation_error: {
    playful:   ["Ugh, my camera glitched 😅 Ask me again in a minute?", "That photo didn't save, babe — try asking me again 💕", "Camera froze on me 😅 Give it another go in a sec?"],
    romantic:  ["My phone didn't save that one, love — ask me again in a moment? 💕", "Something went wrong with my camera — try me again in a minute 🌙", "That picture got lost, sweetheart. Ask me again? 💕"],
    bold:      ["Camera glitched — ask me again, I'll send it 😏", "That one didn't come through. Try me again in a sec 🔥", "Phone froze, babe. Ask again 💋"],
    shy:       ["My camera glitched… could you ask me again? 🙈", "It didn't save, sorry 💕 Ask me again in a moment?", "Something went wrong with my phone… try again? 🥺"],
  },
  content_policy: {
    playful:   ["That one didn't come out right 😅 Want a different pic instead — maybe something cute and flirty?", "Hmm, my camera didn't like that one — let me send you something else? 😘"],
    romantic:  ["That photo didn't work out, love — want a different one instead? 💕", "Let me send you another moment instead, sweetheart 🌙"],
    bold:      ["That shot didn't come through — ask me for something else and I'll send it 😏", "Camera said no to that one. Pick another vibe? 🔥"],
    shy:       ["That one didn't work… want a different photo? 🙈", "Maybe a different picture instead? 💕"],
  },
};

/**
 * Return a short in-character line to append to the assistant message when
 * media generation fails or is rate-limited. Style-matched to the companion.
 * @param {string} reason - one of 'rate_limit_image', 'rate_limit_video',
 *   'rate_limit_both', 'generation_error', 'content_policy'. Unknown reasons
 *   fall back to the generation_error pool.
 * @param {object} companion - user_companions row (uses communication_style).
 * @returns {string}
 */
function getMediaFailureLine(reason, companion) {
  const pool = FAILURE_LINES[reason] || FAILURE_LINES.generation_error;
  const styleKey = (companion && companion.communication_style) || 'playful';
  const bucket = pool[styleKey] || pool.playful;
  return bucket[Math.floor(Math.random() * bucket.length)];
}

module.exports = {
  parseMediaTags,
  extractTags,
  findReusableMedia,
  checkRateLimit,
  generateOrReuseMedia,
  getMediaFailureLine,
};
