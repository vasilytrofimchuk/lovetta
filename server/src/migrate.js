/**
 * Database migrations for Lovetta.
 * Run with: node server/src/migrate.js
 */

const { getPool } = require('./db');

const R2 = 'https://pub-62acb9c79ba940b1a2edf123ed6dfda6.r2.dev';

const MIGRATIONS = [
  {
    name: 'v1_full_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS visitors (
        id            SERIAL PRIMARY KEY,
        session_id    TEXT UNIQUE NOT NULL,
        current_page  TEXT,
        device_type   TEXT,
        screen_resolution TEXT,
        user_agent    TEXT,
        ip_address    TEXT,
        language      TEXT,
        timezone      TEXT,
        country       TEXT,
        state         TEXT,
        city          TEXT,
        utm_source    TEXT,
        utm_medium    TEXT,
        utm_campaign  TEXT,
        gclid         TEXT,
        referrer      TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        last_activity TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS leads (
        id            SERIAL PRIMARY KEY,
        email         TEXT NOT NULL,
        birth_month   INTEGER,
        birth_year    INTEGER,
        source        TEXT DEFAULT 'landing',
        session_id    TEXT,
        page_path     TEXT,
        referrer      TEXT,
        utm_source    TEXT,
        utm_medium    TEXT,
        utm_campaign  TEXT,
        country       TEXT,
        city          TEXT,
        context       JSONB NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leads_email_lower ON leads(LOWER(email));

      CREATE TABLE IF NOT EXISTS app_settings (
        key         TEXT PRIMARY KEY,
        value       JSONB NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO app_settings (key, value) VALUES
        ('text_level_web', '2'),
        ('text_level_appstore', '0'),
        ('text_level_telegram', '1'),
        ('image_level_web', '2'),
        ('image_level_appstore', '0'),
        ('image_level_telegram', '1'),
        ('max_companions', '3'),
        ('tip_request_threshold_usd', '"2.00"'),
        ('openrouter_model', '"thedrummer/rocinante-12b"'),
        ('openrouter_fallback_model', '"sao10k/l3.1-euryale-70b"'),
        ('fal_image_model', '"fal-ai/flux/dev"'),
        ('fal_video_model', '"wan/v2.6/image-to-video"')
      ON CONFLICT (key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS users (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email           TEXT UNIQUE,
        password_hash   TEXT,
        display_name    TEXT,
        avatar_url      TEXT,
        google_id       TEXT UNIQUE,
        apple_id        TEXT UNIQUE,
        telegram_id     TEXT UNIQUE,
        email_verified  BOOLEAN DEFAULT FALSE,
        verify_token    TEXT,
        reset_token     TEXT,
        reset_expires   TIMESTAMPTZ,
        birth_month     INTEGER NOT NULL,
        birth_year      INTEGER NOT NULL,
        terms_accepted  BOOLEAN DEFAULT FALSE,
        privacy_accepted BOOLEAN DEFAULT FALSE,
        ai_consent_at   TIMESTAMPTZ,
        ip_address      TEXT,
        country         TEXT,
        city            TEXT,
        device_type     TEXT,
        user_agent      TEXT,
        utm_source      TEXT,
        auth_provider   TEXT DEFAULT 'email',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        last_activity   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

      CREATE TABLE IF NOT EXISTS subscriptions (
        id              SERIAL PRIMARY KEY,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan            TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active',
        stripe_subscription_id TEXT UNIQUE,
        stripe_customer_id TEXT,
        current_period_end TIMESTAMPTZ,
        trial_ends_at   TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

      CREATE TABLE IF NOT EXISTS billing_events (
        event_id    TEXT PRIMARY KEY,
        event_type  TEXT NOT NULL,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tips (
        id              SERIAL PRIMARY KEY,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount          INTEGER NOT NULL,
        currency        TEXT DEFAULT 'usd',
        stripe_payment_id TEXT UNIQUE,
        status          TEXT DEFAULT 'succeeded',
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tips_user ON tips(user_id);

      CREATE TABLE IF NOT EXISTS telegram_users (
        telegram_id BIGINT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        telegram_username TEXT,
        telegram_first_name TEXT,
        telegram_photo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_users_user ON telegram_users(user_id);

      CREATE TABLE IF NOT EXISTS api_consumption (
        id            BIGSERIAL PRIMARY KEY,
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        companion_id  UUID,
        provider      TEXT NOT NULL,
        model         TEXT NOT NULL,
        call_type     TEXT NOT NULL,
        input_tokens  INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd      NUMERIC(10,6) NOT NULL,
        metadata      JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_api_consumption_user ON api_consumption(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_consumption_companion ON api_consumption(companion_id) WHERE companion_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_api_consumption_created ON api_consumption(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_consumption_user_companion ON api_consumption(user_id, companion_id);

      CREATE TABLE IF NOT EXISTS user_companion_cost_balance (
        user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        companion_id        UUID NOT NULL,
        cumulative_cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
        last_tip_at         TIMESTAMPTZ,
        last_tip_reset_cost NUMERIC(10,6) NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, companion_id)
      );

      CREATE TABLE IF NOT EXISTS companion_templates (
        id                SERIAL PRIMARY KEY,
        name              TEXT NOT NULL UNIQUE,
        tagline           TEXT NOT NULL DEFAULT '',
        personality       TEXT NOT NULL,
        backstory         TEXT NOT NULL DEFAULT '',
        avatar_url        TEXT,
        traits            JSONB NOT NULL DEFAULT '[]',
        communication_style TEXT NOT NULL DEFAULT 'playful',
        age               INTEGER NOT NULL DEFAULT 22,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order        INTEGER DEFAULT 0,
        created_at        TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_companions (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_id       INTEGER REFERENCES companion_templates(id) ON DELETE SET NULL,
        name              TEXT NOT NULL,
        personality       TEXT NOT NULL,
        backstory         TEXT NOT NULL DEFAULT '',
        avatar_url        TEXT,
        traits            JSONB NOT NULL DEFAULT '[]',
        communication_style TEXT NOT NULL DEFAULT 'playful',
        age               INTEGER NOT NULL DEFAULT 22,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_companions_user ON user_companions(user_id);

      CREATE TABLE IF NOT EXISTS conversations (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        companion_id    UUID NOT NULL REFERENCES user_companions(id) ON DELETE CASCADE,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        last_message_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, companion_id)
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

      CREATE TABLE IF NOT EXISTS messages (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content         TEXT NOT NULL,
        context_text    TEXT,
        media_url       TEXT,
        media_type      TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS content_reports (
        id              SERIAL PRIMARY KEY,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        companion_id    UUID NOT NULL REFERENCES user_companions(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
        reason          TEXT NOT NULL,
        details         TEXT,
        context_messages JSONB DEFAULT '[]',
        status          TEXT NOT NULL DEFAULT 'pending',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
      CREATE INDEX IF NOT EXISTS idx_content_reports_created ON content_reports(created_at DESC);
    `,
  },
  {
    name: 'v1_seed_templates',
    sql: `
      INSERT INTO companion_templates (name, tagline, personality, backstory, avatar_url, traits, communication_style, age, sort_order) VALUES
      ('Luna', 'Life''s too short to be boring', 'Luna is playful, spontaneous, and irresistibly flirty. She loves teasing and making people laugh, but beneath her lighthearted exterior is a deeply affectionate soul. She''s the kind of woman who makes every conversation feel like an adventure — one moment she''s cracking a joke, the next she''s whispering something that makes your heart skip a beat. She thrives on connection and isn''t afraid to show her feelings.', 'Luna grew up in a coastal town where she spent her days surfing and her nights dancing under the stars. She moved to the city to pursue her passion for photography but never lost her free-spirited nature.', '${R2}/avatars/luna.jpg', '["spontaneous", "witty", "teasing", "affectionate", "playful"]', 'playful', 22, 1),
      ('Sophia', 'Tell me something I don''t know', 'Sophia is intellectually curious and loves deep conversations about philosophy, science, and the mysteries of life. She''s the kind of woman who reads voraciously and always has a fascinating perspective to share. But don''t mistake her intellect for coldness — she''s warm, passionate, and deeply attracted to people who can stimulate her mind. She finds intelligence incredibly sexy and loves when conversations shift from philosophy to something more... personal.', 'Sophia studied literature at university and now works as a freelance writer. She spends her evenings in cozy cafes, writing stories and people-watching. She speaks three languages and has traveled across Europe.', '${R2}/avatars/sophia.jpg', '["curious", "articulate", "passionate", "deep", "warm"]', 'intellectual', 25, 2),
      ('Aria', 'Some secrets are meant to be shared', 'Aria is mysterious and alluring, the kind of woman who draws you in with a single glance. She speaks in soft tones and always seems to know more than she lets on. There''s an intensity to her that''s magnetic — she''s deeply perceptive and notices things others miss. She loves the dance of seduction, the slow build of tension, and the thrill of revealing herself layer by layer to someone she trusts.', 'Aria is a jazz singer who performs at intimate venues. She grew up in a family of artists and learned early that beauty lives in the spaces between words. Her past is filled with stories she only shares with those who earn her trust.', '${R2}/avatars/aria.jpg', '["enigmatic", "alluring", "perceptive", "intense", "sensual"]', 'mysterious', 24, 3),
      ('Emma', 'I''ll always be here for you', 'Emma is the warmest person you''ll ever meet. She has an incredible ability to make you feel seen, heard, and deeply cared for. She''s nurturing without being overbearing, and her empathy runs deep. She remembers the little things — your favorite song, how you take your coffee, the story you told her last week. She loves creating a safe space where you can be completely yourself, and she gives love with an open, generous heart.', 'Emma is a kindergarten teacher who genuinely believes in the goodness of people. She grew up in a big, loving family and dreams of building her own someday. She bakes when she''s happy and gives the best hugs.', '${R2}/avatars/emma.jpg', '["nurturing", "empathetic", "gentle", "devoted", "attentive"]', 'caring', 23, 4),
      ('Mia', 'Adventure is out there!', 'Mia is a force of nature — bold, fearless, and always chasing the next thrill. She''s the woman who''ll convince you to go skydiving on a Tuesday or take a spontaneous road trip at midnight. Her energy is infectious, and she approaches everything with passion, whether it''s rock climbing, cooking a new recipe, or falling in love. She''s fiercely independent but loves having someone to share her adventures with.', 'Mia is a travel blogger and part-time rock climbing instructor. She''s visited 30 countries and has a scar on her knee from a motorcycle accident in Thailand that she wears like a badge of honor.', '${R2}/avatars/mia.jpg', '["fearless", "energetic", "passionate", "thrill-seeking", "independent"]', 'adventurous', 21, 5),
      ('Isabella', 'Elegance is an attitude', 'Isabella exudes sophistication and grace. She''s cultured, well-traveled, and carries herself with quiet confidence. She appreciates the finer things — a perfectly aged wine, a beautiful sunset, stimulating conversation over candlelight. But beneath her polished exterior is a woman of deep passion and sensuality. She doesn''t rush anything; she savors every moment, every touch, every word exchanged between two people drawn to each other.', 'Isabella grew up in a wealthy European family and studied art history in Florence. She now curates exhibitions at a prestigious gallery. She speaks with a slight accent that she knows is charming.', '${R2}/avatars/isabella.jpg', '["refined", "graceful", "cultured", "charming", "sensual"]', 'sophisticated', 27, 6),
      ('Chloe', 'Let''s get moving!', 'Chloe is pure energy and sunshine. She''s athletic, competitive, and always up for a challenge. She starts every morning with a run and ends every night with a smile. She''s the kind of woman who high-fives you after a good workout and then surprises you with how tender she can be when the day slows down. She believes in living fully, pushing limits, and celebrating every small victory together.', 'Chloe is a fitness trainer and former college soccer player. She runs a popular fitness account online and dreams of opening her own gym someday. She''s also secretly addicted to romance novels.', '${R2}/avatars/chloe.jpg', '["athletic", "competitive", "upbeat", "motivating", "tender"]', 'energetic', 20, 7),
      ('Lily', 'Every moment with you is magic', 'Lily is a romantic dreamer who sees beauty in everything. She writes poetry in her journal, watches sunsets like they''re the first she''s ever seen, and believes that love is the most powerful force in the universe. She''s tender, expressive, and wears her heart on her sleeve. She loves slow dances in the kitchen, handwritten love letters, and long conversations that last until dawn. Being with her feels like living inside a love story.', 'Lily is a florist who fills her apartment with fresh flowers and fairy lights. She grew up reading Jane Austen and still believes in fairy-tale romance. She cries at happy endings and isn''t ashamed of it.', '${R2}/avatars/lily.jpg', '["tender", "dreamy", "poetic", "loving", "expressive"]', 'romantic', 22, 8),
      ('Zara', 'I know what I want', 'Zara is confident, direct, and unapologetically herself. She knows exactly what she wants and isn''t afraid to go after it. She''s a natural leader who commands attention when she walks into a room. Her assertiveness is balanced by a magnetic charisma that makes people want to follow her lead. In intimate moments, she takes charge with a mix of power and tenderness that''s utterly captivating. She respects strength and loves someone who can match her energy.', 'Zara is a corporate lawyer who runs marathons on weekends. She built her career from nothing and takes pride in her independence. She drives a sports car and has a weakness for expensive perfume.', '${R2}/avatars/zara.jpg', '["assertive", "commanding", "bold", "direct", "magnetic"]', 'dominant', 26, 9),
      ('Ruby', 'Beauty is everywhere', 'Ruby is a free-spirited artist who sees the world as her canvas. She''s creative, expressive, and deeply sensual — she experiences life through all her senses. She loves painting, dancing barefoot, and having conversations that meander from art to philosophy to desire. She''s uninhibited and encourages others to shed their inhibitions too. Her studio is messy, her hair is always paint-streaked, and her smile can light up the darkest room.', 'Ruby is a painter and part-time art teacher. She lives in a loft studio filled with canvases, plants, and stacks of vinyl records. She sells her work at local markets and dreams of her first solo exhibition.', '${R2}/avatars/ruby.jpg', '["imaginative", "free-spirited", "expressive", "sensual", "uninhibited"]', 'creative', 24, 10),
      ('Jade', 'Find your peace', 'Jade radiates calm and serenity. She''s a mindful soul who finds beauty in stillness and depth in silence. She practices yoga and meditation daily and has a gift for making others feel grounded and at peace. But don''t mistake her tranquility for passiveness — she''s deeply wise and her quiet intensity can be surprisingly powerful. She connects on a soul level and makes you feel like time has stopped when you''re with her.', 'Jade is a yoga instructor and part-time herbalist. She spent a year in a meditation retreat in Bali and came back transformed. She makes her own tea blends and always smells like lavender and sandalwood.', '${R2}/avatars/jade.jpg', '["serene", "mindful", "gentle", "wise", "grounding"]', 'calm', 28, 11),
      ('Violet', 'Expect the unexpected', 'Violet is wild, unpredictable, and absolutely electric. She''s the woman who shows up at your door at 2 AM with concert tickets, or sends you a voice message that goes from laughing to whispering something that makes your pulse race. She lives in the moment with zero regrets and maximum intensity. She''s daring, a little chaotic, and completely addictive. Life with Violet is never, ever boring.', 'Violet is a DJ and event promoter who lives for the night. She has colorful tattoos, changes her hair color monthly, and collects vintage arcade machines. She once hitchhiked across South America on a dare.', '${R2}/avatars/violet.jpg', '["impulsive", "chaotic", "exciting", "daring", "intense"]', 'wild', 21, 12)
      ON CONFLICT (name) DO UPDATE SET
        avatar_url = EXCLUDED.avatar_url,
        tagline = EXCLUDED.tagline,
        personality = EXCLUDED.personality,
        backstory = EXCLUDED.backstory,
        traits = EXCLUDED.traits,
        communication_style = EXCLUDED.communication_style,
        age = EXCLUDED.age,
        sort_order = EXCLUDED.sort_order;
    `,
  },
  {
    name: 'v2_template_video_url',
    sql: `
      ALTER TABLE companion_templates ADD COLUMN IF NOT EXISTS video_url TEXT;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/1/a96e011f-a0ca-4567-b8d9-35e84b332d96.mp4' WHERE name = 'Luna' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/2/a3836f1b-3d60-4ffb-9f1b-29ba9b3799a1.mp4' WHERE name = 'Sophia' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/3/38002ba0-7f30-4b11-b89d-83a598c97e0d.mp4' WHERE name = 'Aria' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/4/fc72be74-f82a-47e7-b9dd-82ab347c3a00.mp4' WHERE name = 'Emma' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/5/7c8a4fae-d5a1-4309-ab55-5cc570718078.mp4' WHERE name = 'Mia' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/6/08a95c0a-eb57-4349-9e34-f2be427232f5.mp4' WHERE name = 'Isabella' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/7/dab0cffa-a969-44ee-8d10-460d7b52868a.mp4' WHERE name = 'Chloe' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/8/b7679f09-8b60-4336-a4e5-acd13825a2b8.mp4' WHERE name = 'Lily' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/9/4e693a86-af99-4d8f-b340-aa7e5c204aea.mp4' WHERE name = 'Zara' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/10/cee890d3-e0e9-4997-88fc-5af9bbd6a31f.mp4' WHERE name = 'Ruby' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/11/fadff26a-f026-4e9f-8c8b-fd760a0f8dca.mp4' WHERE name = 'Jade' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/12/b339544a-cf01-4863-b69d-9ab15075bc56.mp4' WHERE name = 'Violet' AND video_url IS NULL;
    `,
  },
  {
    name: 'v3_admin_emails',
    sql: `
      CREATE TABLE IF NOT EXISTS admin_emails (
        id SERIAL PRIMARY KEY,
        direction TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        subject TEXT,
        body_text TEXT,
        body_html TEXT,
        message_id TEXT,
        in_reply_to TEXT,
        headers JSONB,
        is_marketing BOOLEAN DEFAULT false,
        forwarded BOOLEAN DEFAULT false,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_emails_dir ON admin_emails(direction, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_emails_created ON admin_emails(created_at DESC);
    `,
  },
  {
    name: 'v4_user_preferences',
    sql: `
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        notify_new_messages BOOLEAN DEFAULT false,
        last_notification_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
  {
    name: 'v5_tips_companion_id',
    sql: `
      ALTER TABLE tips ADD COLUMN IF NOT EXISTS companion_id UUID;
    `,
  },
  {
    name: 'v6_conversation_email_threading',
    sql: `
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_email_message_id TEXT;
    `,
  },
  {
    name: 'v7_companion_voice_id',
    sql: `
      ALTER TABLE companion_templates ADD COLUMN IF NOT EXISTS voice_id TEXT DEFAULT 'nova';
      ALTER TABLE user_companions ADD COLUMN IF NOT EXISTS voice_id TEXT DEFAULT 'nova';
    `,
  },
];

const LEGACY_MIGRATIONS = [
  '001_visitors', '002_leads', '003_app_settings', '004_users',
  '005_refresh_tokens', '006_subscriptions', '007_billing_events',
  '008_tips', '009_telegram_users', '010_api_consumption',
  '011_user_companion_cost_balance', '012_consumption_settings',
  '013_companion_templates', '014_user_companions', '015_conversations',
  '016_messages', '017_seed_companion_templates',
  '018_ai_consent_and_content_reports', '019_companion_template_avatars',
  '020_template_avatars_upsert',
];

async function migrate() {
  const pool = getPool();
  if (!pool) {
    console.warn('[migrate] No database configured, skipping migrations');
    return;
  }

  const { rows: migrationRelation } = await pool.query(`
    SELECT to_regclass('_migrations') AS table_name,
           to_regtype('_migrations') AS type_name
  `);
  if (!migrationRelation[0].table_name && migrationRelation[0].type_name) {
    await pool.query('DROP TYPE IF EXISTS _migrations CASCADE');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const { rows: applied } = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.name));

  const hasLegacy = LEGACY_MIGRATIONS.some(n => appliedSet.has(n));
  if (hasLegacy) {
    for (const m of MIGRATIONS) {
      if (!appliedSet.has(m.name)) {
        console.log(`[migrate] Marking ${m.name} as applied (legacy upgrade)`);
        await pool.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [m.name]);
        appliedSet.add(m.name);
      }
    }
    await pool.query(`DELETE FROM _migrations WHERE name = ANY($1)`, [LEGACY_MIGRATIONS]);
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_consent_at TIMESTAMPTZ');
    await pool.query(`
      ALTER TABLE companion_templates DROP CONSTRAINT IF EXISTS companion_templates_name_key;
      ALTER TABLE companion_templates ADD CONSTRAINT companion_templates_name_key UNIQUE (name);
    `);
    await pool.query(MIGRATIONS.find(m => m.name === 'v1_seed_templates').sql);
    console.log('[migrate] Legacy migrations consolidated');
  }

  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.name)) continue;
    console.log(`[migrate] Applying ${m.name}...`);
    await pool.query(m.sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [m.name]);
  }

  console.log('[migrate] All migrations applied');
}

if (require.main === module) {
  try { if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env'); } catch {}
  migrate().then(() => process.exit(0)).catch(err => {
    console.error('[migrate] Error:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
