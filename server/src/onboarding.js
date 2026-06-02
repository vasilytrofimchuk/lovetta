/**
 * Welcome-flow onboarding orchestration.
 *
 * Variant B (`welcome_flow_B_skip_create`): at the END of any signup
 * transaction, auto-provision a companion (Lily by default) + her
 * conversation + a pre-baked opener row in the SAME transaction so the
 * frontend can route the user directly to /chat/<id>?firstSession=1
 * instead of through Pricing → CompanionList → CompanionCreate.
 *
 * Variant A (`A_control`): no-op. Frontend uses the existing post-signup
 * path (/my/pricing?onboarding=1).
 *
 * Defensive: this MUST NEVER throw to the caller. A failure here would
 * roll back a perfectly good signup. All failures degrade gracefully to
 * A_control with a Sentry warning.
 */

const { logEvent } = require('./events');

const EVENT_TYPE = 'welcome_flow_auto_provisioned';
const ASSIGNED_EVENT_TYPE = 'welcome_flow_assigned';

// FNV-1a 32-bit hash of a string → stable variant assignment per userId.
function hashUserIdMod100(userId) {
  const s = String(userId || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 100;
}

async function readWelcomeSettings(client) {
  const { rows } = await client.query(
    `SELECT key, value FROM app_settings
     WHERE key IN (
       'welcome_flow_B_skip_create',
       'welcome_flow_B_variant_pct',
       'welcome_flow_B_template_name'
     )`
  );
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  // app_settings.value is JSONB — strings come back already-parsed.
  // Defensive: handle both raw string and JSON-encoded string shapes.
  const parse = (v, dflt) => {
    if (v == null) return dflt;
    if (typeof v === 'string') return v;
    try { return typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; } catch { return dflt; }
  };
  const enabledRaw = parse(map['welcome_flow_B_skip_create'], 'false');
  const enabled = enabledRaw === true || enabledRaw === 'true';
  const pctRaw = parse(map['welcome_flow_B_variant_pct'], '50');
  const pct = Math.max(0, Math.min(100, parseInt(pctRaw, 10) || 0));
  const templateName = parse(map['welcome_flow_B_template_name'], 'Lily');
  return { enabled, pct, templateName };
}

/**
 * Auto-provision the first companion for a fresh signup if the variant flag
 * is on and the user falls into the B cohort. Designed to run INSIDE the
 * caller's signup transaction (the second arg is a pg client/transaction).
 *
 * @param {string} userId — the just-inserted user.id
 * @param {{ query: Function }} client — pg client (transaction) or pool
 * @param {{ skip?: boolean }} [opts]
 * @returns {Promise<{ variant: 'A_control'|'B_skip_create', companionId?: string, conversationId?: string, templateName?: string, error?: boolean }>}
 */
async function autoProvisionFirstCompanion(userId, client, opts = {}) {
  // Idempotency / explicit-skip path (e.g. Apple existing-user relink).
  if (!userId || opts.skip) {
    return { variant: 'A_control', skip: true };
  }
  if (!client || typeof client.query !== 'function') {
    return { variant: 'A_control', error: true };
  }
  try {
    const { enabled, pct, templateName } = await readWelcomeSettings(client);
    if (!enabled || pct <= 0) {
      // Flag is off — everyone is in control. Don't even log an assignment
      // event so we don't pollute analytics with non-experiment users.
      return { variant: 'A_control' };
    }

    const bucket = hashUserIdMod100(userId);
    const variant = bucket < pct ? 'B_skip_create' : 'A_control';
    // Always log assignment so A/B analytics has a denominator.
    logEvent(userId, ASSIGNED_EVENT_TYPE, { variant, bucket, template_name: templateName }).catch(() => {});

    if (variant === 'A_control') return { variant };

    // Look up the template (Lily by default).
    const { rows: templateRows } = await client.query(
      `SELECT id, name, personality, backstory, avatar_url, video_url, traits,
              communication_style, age, voice_id,
              opener_line, opener_context, opener_scene
       FROM companion_templates
       WHERE name = $1
       LIMIT 1`,
      [templateName]
    );
    if (!templateRows.length) {
      console.warn(`[onboarding] template "${templateName}" not found — degrading to A_control`);
      return { variant: 'A_control', error: true };
    }
    const t = templateRows[0];
    if (!t.opener_line) {
      console.warn(`[onboarding] template "${t.name}" has no opener_line — degrading to A_control`);
      return { variant: 'A_control', error: true };
    }

    // Insert the user_companions row (auto_provisioned = TRUE).
    // `traits` is jsonb on both source and dest. node-pg returns jsonb as a
    // JS value (array here) but then serializes JS arrays as PG array literals
    // (`{a,b}`) which fail the jsonb cast — mirror companion-api.js:183 and
    // JSON.stringify before binding. This silent failure was 100% breaking
    // welcome flow B from 2026-05-30 ship through 2026-06-01 detection.
    const traitsJson = JSON.stringify(t.traits || []);
    const { rows: ucRows } = await client.query(
      `INSERT INTO user_companions (
         user_id, template_id, name, personality, backstory, avatar_url,
         traits, communication_style, age, video_url, voice_id, auto_provisioned
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
       RETURNING id`,
      [
        userId, t.id, t.name, t.personality, t.backstory, t.avatar_url,
        traitsJson, t.communication_style, t.age, t.video_url, t.voice_id,
      ]
    );
    const companionId = ucRows[0].id;

    // Insert the conversation.
    const { rows: convRows } = await client.query(
      `INSERT INTO conversations (user_id, companion_id) VALUES ($1, $2) RETURNING id`,
      [userId, companionId]
    );
    const conversationId = convRows[0].id;

    // Insert the pre-baked opener as an assistant message. media_url points
    // at the template video so the avatar lights up on first paint (mirrors
    // the existing companion-create behavior in companion-api.js byte-for-byte).
    await client.query(
      `INSERT INTO messages (
         conversation_id, role, content, context_text, scene_text, media_url, media_type
       )
       VALUES ($1, 'assistant', $2, $3, $4, $5, $6)`,
      [
        conversationId,
        t.opener_line,
        t.opener_context || null,
        t.opener_scene || null,
        t.video_url || null,
        t.video_url ? 'video' : null,
      ]
    );

    logEvent(userId, EVENT_TYPE, {
      variant,
      template_name: t.name,
      companion_id: companionId,
      conversation_id: conversationId,
    }).catch(() => {});

    return { variant, companionId, conversationId, templateName: t.name };
  } catch (err) {
    console.warn('[onboarding] autoProvisionFirstCompanion failed:', err.message);
    return { variant: 'A_control', error: true };
  }
}

module.exports = {
  autoProvisionFirstCompanion,
  hashUserIdMod100,
};
