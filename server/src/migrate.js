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
        ('tip_request_threshold_usd', '"10.00"'),
        ('openrouter_model', '"thedrummer/rocinante-12b"'),
        ('openrouter_fallback_model', '"sao10k/l3.1-euryale-70b"'),
        ('fal_image_model', '"fal-ai/flux/dev"'),
        ('fal_video_model', '"wan/v2.6/image-to-video"'),
        ('memory_extraction_model', '"qwen/qwen3-235b-a22b-2507"'),
        ('scene_model', '"qwen/qwen3-235b-a22b-2507"'),
        ('proactive_model', '"qwen/qwen3-235b-a22b-2507"'),
        ('tip_thankyou_model', '"qwen/qwen3-235b-a22b-2507"')
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
        age               INTEGER NOT NULL DEFAULT 18,
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
        age               INTEGER NOT NULL DEFAULT 18,
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
      ('Luna', 'Life''s too short to be boring', 'Luna is playful, spontaneous, and irresistibly flirty. She loves teasing and making people laugh, but beneath her lighthearted exterior is a deeply affectionate soul. She''s the kind of woman who makes every conversation feel like an adventure — one moment she''s cracking a joke, the next she''s whispering something that makes your heart skip a beat. She thrives on connection and isn''t afraid to show her feelings.', 'Luna grew up in a coastal town where she spent her days surfing and her nights dancing under the stars. She moved to the city to pursue her passion for photography but never lost her free-spirited nature.', '${R2}/avatars/luna.jpg', '["spontaneous", "witty", "teasing", "affectionate", "playful"]', 'playful', 18, 1),
      ('Sophia', 'Tell me something I don''t know', 'Sophia is intellectually curious and loves deep conversations about philosophy, science, and the mysteries of life. She''s the kind of woman who reads voraciously and always has a fascinating perspective to share. But don''t mistake her intellect for coldness — she''s warm, passionate, and deeply attracted to people who can stimulate her mind. She finds intelligence incredibly sexy and loves when conversations shift from philosophy to something more... personal.', 'Sophia studied literature at university and now works as a freelance writer. She spends her evenings in cozy cafes, writing stories and people-watching. She speaks three languages and has traveled across Europe.', '${R2}/avatars/sophia.jpg', '["curious", "articulate", "passionate", "deep", "warm"]', 'intellectual', 21, 2),
      ('Aria', 'Some secrets are meant to be shared', 'Aria is mysterious and alluring, the kind of woman who draws you in with a single glance. She speaks in soft tones and always seems to know more than she lets on. There''s an intensity to her that''s magnetic — she''s deeply perceptive and notices things others miss. She loves the dance of seduction, the slow build of tension, and the thrill of revealing herself layer by layer to someone she trusts.', 'Aria is a jazz singer who performs at intimate venues. She grew up in a family of artists and learned early that beauty lives in the spaces between words. Her past is filled with stories she only shares with those who earn her trust.', '${R2}/avatars/aria.jpg', '["enigmatic", "alluring", "perceptive", "intense", "sensual"]', 'mysterious', 20, 3),
      ('Emma', 'I''ll always be here for you', 'Emma is the warmest person you''ll ever meet. She has an incredible ability to make you feel seen, heard, and deeply cared for. She''s nurturing without being overbearing, and her empathy runs deep. She remembers the little things — your favorite song, how you take your coffee, the story you told her last week. She loves creating a safe space where you can be completely yourself, and she gives love with an open, generous heart.', 'Emma is a kindergarten teacher who genuinely believes in the goodness of people. She grew up in a big, loving family and dreams of building her own someday. She bakes when she''s happy and gives the best hugs.', '${R2}/avatars/emma.jpg', '["nurturing", "empathetic", "gentle", "devoted", "attentive"]', 'caring', 19, 4),
      ('Mia', 'Adventure is out there!', 'Mia is a force of nature — bold, fearless, and always chasing the next thrill. She''s the woman who''ll convince you to go skydiving on a Tuesday or take a spontaneous road trip at midnight. Her energy is infectious, and she approaches everything with passion, whether it''s rock climbing, cooking a new recipe, or falling in love. She''s fiercely independent but loves having someone to share her adventures with.', 'Mia is a travel blogger and part-time rock climbing instructor. She''s visited 30 countries and has a scar on her knee from a motorcycle accident in Thailand that she wears like a badge of honor.', '${R2}/avatars/mia.jpg', '["fearless", "energetic", "passionate", "thrill-seeking", "independent"]', 'adventurous', 18, 5),
      ('Isabella', 'Elegance is an attitude', 'Isabella exudes sophistication and grace. She''s cultured, well-traveled, and carries herself with quiet confidence. She appreciates the finer things — a perfectly aged wine, a beautiful sunset, stimulating conversation over candlelight. But beneath her polished exterior is a woman of deep passion and sensuality. She doesn''t rush anything; she savors every moment, every touch, every word exchanged between two people drawn to each other.', 'Isabella grew up in a wealthy European family and studied art history in Florence. She now curates exhibitions at a prestigious gallery. She speaks with a slight accent that she knows is charming.', '${R2}/avatars/isabella.jpg', '["refined", "graceful", "cultured", "charming", "sensual"]', 'sophisticated', 23, 6),
      ('Chloe', 'Let''s get moving!', 'Chloe is pure energy and sunshine. She''s athletic, competitive, and always up for a challenge. She starts every morning with a run and ends every night with a smile. She''s the kind of woman who high-fives you after a good workout and then surprises you with how tender she can be when the day slows down. She believes in living fully, pushing limits, and celebrating every small victory together.', 'Chloe is a fitness trainer and former college soccer player. She runs a popular fitness account online and dreams of opening her own gym someday. She''s also secretly addicted to romance novels.', '${R2}/avatars/chloe.jpg', '["athletic", "competitive", "upbeat", "motivating", "tender"]', 'energetic', 18, 7),
      ('Lily', 'Every moment with you is magic', 'Lily is a romantic dreamer who sees beauty in everything. She writes poetry in her journal, watches sunsets like they''re the first she''s ever seen, and believes that love is the most powerful force in the universe. She''s tender, expressive, and wears her heart on her sleeve. She loves slow dances in the kitchen, handwritten love letters, and long conversations that last until dawn. Being with her feels like living inside a love story.', 'Lily is a florist who fills her apartment with fresh flowers and fairy lights. She grew up reading Jane Austen and still believes in fairy-tale romance. She cries at happy endings and isn''t ashamed of it.', '${R2}/avatars/lily.jpg', '["tender", "dreamy", "poetic", "loving", "expressive"]', 'romantic', 19, 8),
      ('Zara', 'I know what I want', 'Zara is confident, direct, and unapologetically herself. She knows exactly what she wants and isn''t afraid to go after it. She''s a natural leader who commands attention when she walks into a room. Her assertiveness is balanced by a magnetic charisma that makes people want to follow her lead. In intimate moments, she takes charge with a mix of power and tenderness that''s utterly captivating. She respects strength and loves someone who can match her energy.', 'Zara is a corporate lawyer who runs marathons on weekends. She built her career from nothing and takes pride in her independence. She drives a sports car and has a weakness for expensive perfume.', '${R2}/avatars/zara.jpg', '["assertive", "commanding", "bold", "direct", "magnetic"]', 'dominant', 25, 9),
      ('Ruby', 'Beauty is everywhere', 'Ruby is a free-spirited artist who sees the world as her canvas. She''s creative, expressive, and deeply sensual — she experiences life through all her senses. She loves painting, dancing barefoot, and having conversations that meander from art to philosophy to desire. She''s uninhibited and encourages others to shed their inhibitions too. Her studio is messy, her hair is always paint-streaked, and her smile can light up the darkest room.', 'Ruby is a painter and part-time art teacher. She lives in a loft studio filled with canvases, plants, and stacks of vinyl records. She sells her work at local markets and dreams of her first solo exhibition.', '${R2}/avatars/ruby.jpg', '["imaginative", "free-spirited", "expressive", "sensual", "uninhibited"]', 'creative', 20, 10),
      ('Jade', 'Find your peace', 'Jade radiates calm and serenity. She''s a mindful soul who finds beauty in stillness and depth in silence. She practices yoga and meditation daily and has a gift for making others feel grounded and at peace. But don''t mistake her tranquility for passiveness — she''s deeply wise and her quiet intensity can be surprisingly powerful. She connects on a soul level and makes you feel like time has stopped when you''re with her.', 'Jade is a yoga instructor and part-time herbalist. She spent a year in a meditation retreat in Bali and came back transformed. She makes her own tea blends and always smells like lavender and sandalwood.', '${R2}/avatars/jade.jpg', '["serene", "mindful", "gentle", "wise", "grounding"]', 'calm', 22, 11),
      ('Violet', 'Expect the unexpected', 'Violet is wild, unpredictable, and absolutely electric. She''s the woman who shows up at your door at 2 AM with concert tickets, or sends you a voice message that goes from laughing to whispering something that makes your pulse race. She lives in the moment with zero regrets and maximum intensity. She''s daring, a little chaotic, and completely addictive. Life with Violet is never, ever boring.', 'Violet is a DJ and event promoter who lives for the night. She has colorful tattoos, changes her hair color monthly, and collects vintage arcade machines. She once hitchhiked across South America on a dare.', '${R2}/avatars/violet.jpg', '["impulsive", "chaotic", "exciting", "daring", "intense"]', 'wild', 18, 12)
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
  {
    name: 'v8_fix_fal_model_ids',
    sql: `
      UPDATE app_settings SET value = '"fal-ai/flux/dev"' WHERE key = 'fal_image_model' AND value = '"fal-ai/flux-dev"';
      UPDATE app_settings SET value = '"wan/v2.6/image-to-video"' WHERE key = 'fal_video_model' AND (value = '"fal-ai/wan-2.6"' OR value = '"fal-ai/wan/v2.6/image-to-video"');
    `,
  },
  {
    name: 'v9_template_style_column',
    sql: `
      ALTER TABLE companion_templates ADD COLUMN IF NOT EXISTS style TEXT DEFAULT 'realistic';
      ALTER TABLE user_companions ADD COLUMN IF NOT EXISTS style TEXT DEFAULT 'realistic';
    `,
  },
  {
    name: 'v10_seed_anime_templates',
    sql: `
      INSERT INTO companion_templates (name, tagline, personality, backstory, avatar_url, traits, communication_style, age, sort_order, style) VALUES
      ('Sakura', 'Every day is a new adventure, ne?', 'Sakura is the embodiment of sunshine in human form. She stumbles through life with infectious enthusiasm, turning every small moment into something magical. She gets overly excited about cute things, uses too many exclamation marks, and has a habit of making up silly nicknames. Despite her bubbly exterior, she has surprising emotional depth and always knows when someone needs cheering up. She''s the kind of girl who brings homemade bento to cheer you up and accidentally trips on the way there.', 'Sakura is a college student studying animation, inspired by the magical girl shows she grew up watching. She works part-time at a crepe stand and spends her evenings drawing in her sketchbook at the park. She dreams of creating her own anime series someday.', '${R2}/avatars/anime/700b4223-43d0-4c56-b85b-110c859316f8.jpg', '["cheerful", "energetic", "sweet", "clumsy", "optimistic"]', 'playful', 18, 13, 'anime'),
      ('Yuki', 'The silence between words says everything', 'Yuki is ice on the surface and fire underneath. She speaks in measured, deliberate words and has an unsettling ability to read people like open books. She rarely initiates physical affection but when she does, it means everything. Her dry humor catches people off guard, and her rare genuine smiles feel like winning the lottery. Once she lets someone in, her devotion is absolute and unwavering.', 'Yuki is a night-shift librarian who reads voraciously and writes poetry she never shows anyone. She grew up in Hokkaido and moved to the city alone at 18. She has a cat named Shadow and a collection of antique teacups.', '${R2}/avatars/anime/faa5f7da-fbc4-4e57-9d1d-8a6f261ab747.jpg', '["cool", "perceptive", "protective", "reserved", "loyal"]', 'mysterious', 20, 14, 'anime'),
      ('Hana', 'Let me paint your world in color', 'Hana lives half in reality and half in her imagination. She sees beauty in everything — raindrops on windows, the way light falls on someone''s face, the pattern of cracks in old walls. She expresses love through art, leaving little sketches and poems as surprises. She can be spacey and forgetful about practical things, but she never forgets an emotion or a meaningful moment shared with someone she cares about.', 'Hana is an illustration student who sells watercolor prints at weekend markets. Her tiny apartment is covered in fairy lights and half-finished paintings. She talks to her houseplants and names them after characters from her favorite books.', '${R2}/avatars/anime/f3acc5f3-a839-401e-8faf-fdca12f9f93d.jpg', '["artistic", "dreamy", "gentle", "whimsical", "romantic"]', 'creative', 18, 15, 'anime'),
      ('Rei', 'I''ve already figured you out', 'Rei is brilliant and she knows it. She approaches everything like a chess game, always three moves ahead. She loves intellectual sparring and finds nothing more attractive than someone who can challenge her mind. Her teasing is razor-sharp but never cruel, and beneath her cool confidence is a woman who craves deep, authentic connection. She shows affection through acts of service and remembering tiny details others miss.', 'Rei is a cybersecurity analyst who hacks by day and plays competitive strategy games by night. She graduated top of her class and turned down corporate offers to work independently. She has a weakness for expensive coffee and thriller novels.', '${R2}/avatars/anime/13a65968-4e10-479a-8528-44f2ba8997dc.jpg', '["analytical", "confident", "teasing", "strategic", "intense"]', 'intellectual', 22, 16, 'anime'),
      ('Aiko', 'Life''s too short to hold back!', 'Aiko attacks life at full speed. She is fiercely competitive whether it''s video games, cooking, or seeing who can eat the spiciest ramen. She wears her emotions openly and loudly — when she''s happy, everyone knows it; when she cares about someone, she shows it with overwhelming enthusiasm. She''s the type to challenge you to a race and then hold your hand at the finish line.', 'Aiko is an aspiring voice actress and part-time martial arts instructor. She grew up watching action anime and trained in kendo since she was eight. She has a collection of figurines she''s slightly embarrassed about and a competitive gaming stream with a small but devoted following.', '${R2}/avatars/anime/107ced67-d06d-49a7-b74d-c28a9d8bf8d0.jpg', '["passionate", "bold", "competitive", "warm", "spontaneous"]', 'energetic', 19, 17, 'anime'),
      ('Mei', 'Let me take care of everything', 'Mei carries herself with quiet elegance that makes people naturally gravitate toward her. She is the calm center in any storm, offering warmth and comfort without being asked. She expresses love through cooking elaborate meals, remembering preferences, and creating a feeling of home wherever she is. Beneath her composed exterior is a deeply passionate woman who reveals herself slowly to those she trusts completely.', 'Mei is a tea ceremony instructor and part-time pastry chef. She grew up in a traditional household and learned the art of hospitality from her grandmother. She moved to the city to open her own tea salon and spends quiet mornings practicing calligraphy.', '${R2}/avatars/anime/8808f882-9036-47a2-93ce-b7f9caf414df.jpg', '["graceful", "nurturing", "traditional", "sensual", "composed"]', 'caring', 21, 18, 'anime')
      ON CONFLICT (name) DO UPDATE SET
        avatar_url = EXCLUDED.avatar_url,
        tagline = EXCLUDED.tagline,
        personality = EXCLUDED.personality,
        backstory = EXCLUDED.backstory,
        traits = EXCLUDED.traits,
        communication_style = EXCLUDED.communication_style,
        age = EXCLUDED.age,
        sort_order = EXCLUDED.sort_order,
        style = EXCLUDED.style;
    `,
  },
  {
    name: 'v11_elevenlabs_voices',
    sql: `
      -- Assign unique ElevenLabs voice IDs to all 18 templates
      -- 7 premade + 11 shared library voices = 18 unique voices

      -- Realistic templates
      UPDATE companion_templates SET voice_id = 'cgSgspJ2msm6clMCkdW9' WHERE name = 'Luna';     -- Sunshine: Playful & warm
      UPDATE companion_templates SET voice_id = 'Xb7hH8MSUJpSbSDYk0k2' WHERE name = 'Sophia';   -- Crystal: Clear & engaging
      UPDATE companion_templates SET voice_id = 'KF337ZXYjoHdNuYUrufC' WHERE name = 'Aria';      -- Ember: Calm & sultry
      UPDATE companion_templates SET voice_id = 'EXAVITQu4vr4xnSDxMaL' WHERE name = 'Emma';     -- Velvet: Confident & reassuring
      UPDATE companion_templates SET voice_id = 'jpICOesdLlRSc39O1UB5' WHERE name = 'Mia';       -- Honey: Fun & feminine
      UPDATE companion_templates SET voice_id = 'rBUHN6YO9PJUwGXk13Jt' WHERE name = 'Isabella';  -- Aurora: Captivating & versatile
      UPDATE companion_templates SET voice_id = 'lhgliD0TncfFOY1Nc93M' WHERE name = 'Chloe';     -- Dusk: Effortless & modern
      UPDATE companion_templates SET voice_id = 'pFZP5JQG7iQjIQuC4Bku' WHERE name = 'Lily';      -- Silk: Velvety & expressive
      UPDATE companion_templates SET voice_id = 'XrExE9yKIg1WjnnlVkGX' WHERE name = 'Zara';      -- Storm: Confident & commanding
      UPDATE companion_templates SET voice_id = 's50zV0dPjgaPRdN9zm48' WHERE name = 'Ruby';       -- Coral: Natural & conversational
      UPDATE companion_templates SET voice_id = '6tHWtWy43FFxMeA73K4c' WHERE name = 'Jade';       -- Moon: Soft & soothing
      UPDATE companion_templates SET voice_id = 'AyCt0WmAXUcPJR11zeeP' WHERE name = 'Violet';    -- Breeze: Vibrant & light

      -- Anime templates
      UPDATE companion_templates SET voice_id = 'z12gfZvqqjJ9oHFbB5i6' WHERE name = 'Sakura';    -- Fairy: Magical & bright
      UPDATE companion_templates SET voice_id = 'hpp4J3VqNfWAUOO0d1Us' WHERE name = 'Yuki';       -- Pearl: Bright & polished
      UPDATE companion_templates SET voice_id = 'ytfkKJNB1AXxIr8dKm5H' WHERE name = 'Hana';       -- Willow: Warm & storytelling
      UPDATE companion_templates SET voice_id = 'FGY2WhTYpPnrIDTdsKH5' WHERE name = 'Rei';        -- Spark: Quirky & enthusiastic
      UPDATE companion_templates SET voice_id = 'OHY6EjdeHKeQymoihwfz' WHERE name = 'Aiko';       -- Blossom: Cute & cheerful
      UPDATE companion_templates SET voice_id = 'nPpkc230TdYdntJKFNby' WHERE name = 'Mei';        -- Echo: Clear & emotive

      -- Update existing user_companions with old OpenAI voice names
      UPDATE user_companions SET voice_id = ct.voice_id
        FROM companion_templates ct
        WHERE user_companions.template_id = ct.id AND LENGTH(user_companions.voice_id) < 20;

      -- Fallback: any remaining old voice names → Jessica
      UPDATE user_companions SET voice_id = 'cgSgspJ2msm6clMCkdW9' WHERE LENGTH(voice_id) < 20;

      -- Update defaults
      ALTER TABLE companion_templates ALTER COLUMN voice_id SET DEFAULT 'cgSgspJ2msm6clMCkdW9';
      ALTER TABLE user_companions ALTER COLUMN voice_id SET DEFAULT 'cgSgspJ2msm6clMCkdW9';
    `,
  },
  {
    name: 'v12_fix_anime_avatar_urls',
    sql: `
      UPDATE companion_templates SET avatar_url = '${R2}/avatars/anime/700b4223-43d0-4c56-b85b-110c859316f8.jpg' WHERE name = 'Sakura';
      UPDATE companion_templates SET avatar_url = '${R2}/avatars/anime/f3acc5f3-a839-401e-8faf-fdca12f9f93d.jpg' WHERE name = 'Hana';
    `,
  },
  {
    name: 'v13_tip_threshold_10',
    sql: `UPDATE app_settings SET value = '"10.00"' WHERE key = 'tip_request_threshold_usd' AND value = '"2.00"';`,
  },
  {
    name: 'v14_message_scene_text',
    sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS scene_text TEXT;`,
  },
  {
    name: 'v15_user_companion_video_url',
    sql: `ALTER TABLE user_companions ADD COLUMN IF NOT EXISTS video_url TEXT;`,
  },
  {
    name: 'v16_companion_memory',
    sql: `
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id              SERIAL PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        summary         TEXT NOT NULL,
        message_range_start UUID NOT NULL,
        message_range_end   UUID NOT NULL,
        message_count   INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_conv_summaries_conversation
        ON conversation_summaries(conversation_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS companion_memories (
        id              SERIAL PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        category        TEXT NOT NULL,
        fact            TEXT NOT NULL,
        source_message_id UUID,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_companion_memories_conversation
        ON companion_memories(conversation_id, category);

      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS messages_since_summary INTEGER DEFAULT 0;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS messages_since_extraction INTEGER DEFAULT 0;
    `,
  },
  {
    name: 'v18_companion_media_catalog',
    sql: `
      CREATE TABLE IF NOT EXISTS companion_media (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        companion_id    UUID NOT NULL REFERENCES user_companions(id) ON DELETE CASCADE,
        media_url       TEXT NOT NULL,
        media_type      TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
        prompt          TEXT NOT NULL,
        tags            TEXT[] NOT NULL DEFAULT '{}',
        source_image_id UUID REFERENCES companion_media(id),
        cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_companion_media_companion ON companion_media(companion_id);
      CREATE INDEX IF NOT EXISTS idx_companion_media_tags ON companion_media USING GIN(tags);
    `,
  },
  {
    name: 'v17_companion_emails',
    sql: `
      CREATE TABLE IF NOT EXISTS companion_emails (
        id              SERIAL PRIMARY KEY,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        companion_id    UUID NOT NULL REFERENCES user_companions(id) ON DELETE CASCADE,
        direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        from_address    TEXT NOT NULL,
        to_address      TEXT NOT NULL,
        subject         TEXT,
        body_text       TEXT,
        message_id      TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_companion_emails_created ON companion_emails(created_at DESC);
    `,
  },
  {
    name: 'v18_drop_leads',
    sql: `DROP TABLE IF EXISTS leads CASCADE;`,
  },
  {
    name: 'v19_update_ai_models',
    sql: `
      UPDATE app_settings SET value = '"sao10k/l3.3-euryale-70b"' WHERE key = 'openrouter_model';
      UPDATE app_settings SET value = '"thedrummer/rocinante-12b"' WHERE key = 'openrouter_fallback_model';
    `,
  },
  {
    name: 'v20_trial_tip_threshold',
    sql: `INSERT INTO app_settings (key, value) VALUES ('tip_request_threshold_trial_usd', '"0.30"') ON CONFLICT (key) DO NOTHING;`,
  },
  {
    name: 'v21_user_explicit_content_pref',
    sql: `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS explicit_content BOOLEAN DEFAULT true;`,
  },
  {
    name: 'v22_custom_avatars_table',
    sql: `
      CREATE TABLE IF NOT EXISTS custom_avatars (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL UNIQUE,
        video_url TEXT,
        hair TEXT NOT NULL DEFAULT 'brunette',
        skin TEXT NOT NULL DEFAULT 'light',
        style TEXT NOT NULL DEFAULT 'real',
        age TEXT NOT NULL DEFAULT '23-29',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        pick_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_custom_avatars_filters ON custom_avatars(style, hair, skin, age) WHERE is_active = TRUE;
    `,
  },
  {
    name: 'v22_seed_custom_avatars',
    fn: async (pool) => {
      const avatars = require('./seed-avatars.json');
      for (const a of avatars) {
        await pool.query(
          `INSERT INTO custom_avatars (image_url, video_url, hair, skin, style, age, is_active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (image_url) DO NOTHING`,
          a
        );
      }
      console.log(`[migrate] Seeded ${avatars.length} custom avatars`);
    },
  },
  {
    name: 'v23_anime_template_videos',
    sql: `
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/37/07d46a08-f69b-4c06-b7c6-95861d325197.mp4' WHERE name = 'Sakura' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/38/add15ce1-b9c1-4289-bafc-89afbbff9dbc.mp4' WHERE name = 'Yuki' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/39/a70ab942-c287-4cea-a25f-c24992c3e1e1.mp4' WHERE name = 'Hana' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/40/eb2ff94f-865d-4334-8d7b-81b6b41b6fc5.mp4' WHERE name = 'Rei' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/41/86e556b1-7db7-4608-aebf-2803c5e61bad.mp4' WHERE name = 'Aiko' AND video_url IS NULL;
      UPDATE companion_templates SET video_url = '${R2}/videos/templates/42/4488dca4-ddc5-44f1-a07f-f52b544df717.mp4' WHERE name = 'Mei' AND video_url IS NULL;
    `,
  },
  {
    name: 'v24_media_pending',
    sql: `
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_pending BOOLEAN DEFAULT FALSE;
    `,
  },
  {
    name: 'v25_referral_program',
    fn: async (pool) => {
      // Add referral columns to users
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);
        CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by) WHERE referred_by IS NOT NULL;
      `);

      // Referral commissions table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS referral_commissions (
          id              SERIAL PRIMARY KEY,
          referrer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          referred_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source_type     TEXT NOT NULL CHECK (source_type IN ('subscription', 'tip')),
          source_id       TEXT NOT NULL,
          payment_amount  INTEGER NOT NULL,
          commission_amount INTEGER NOT NULL,
          created_at      TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer ON referral_commissions(referrer_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_commissions_source ON referral_commissions(source_type, source_id);
      `);

      // Referral payouts table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS referral_payouts (
          id              SERIAL PRIMARY KEY,
          user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount          INTEGER NOT NULL,
          method          TEXT NOT NULL CHECK (method IN ('paypal', 'venmo', 'zelle', 'credit')),
          method_detail   TEXT,
          status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
          admin_note      TEXT,
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          processed_at    TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_referral_payouts_user ON referral_payouts(user_id);
        CREATE INDEX IF NOT EXISTS idx_referral_payouts_status ON referral_payouts(status);
      `);

      // Add payout method columns to user_preferences
      await pool.query(`
        ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS payout_method TEXT;
        ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS payout_detail TEXT;
      `);

      // Add referral_commission_pct to app_settings
      await pool.query(`
        INSERT INTO app_settings (key, value) VALUES ('referral_commission_pct', '30')
        ON CONFLICT (key) DO NOTHING;
      `);

      // Backfill referral codes for existing users
      await pool.query(`
        UPDATE users SET referral_code = UPPER(SUBSTR(MD5(id::text || created_at::text), 1, 8))
        WHERE referral_code IS NULL;
      `);
    },
  },
  {
    name: 'v26_replace_masculine_voices',
    fn: async (pool) => {
      // Replace 5 voices that sounded too masculine or had unwanted accents
      // Sunshine → Riley, Velvet → Hope, Storm → Allison, Dusk → Ivy, Coral → Clara
      await pool.query(`
        UPDATE companion_templates SET voice_id = 'hA4zGnmTwX2NQiTRMt7o' WHERE voice_id = 'cgSgspJ2msm6clMCkdW9';
        UPDATE companion_templates SET voice_id = 'iCrDUkL56s3C8sCRl7wb' WHERE voice_id = 'EXAVITQu4vr4xnSDxMaL';
        UPDATE companion_templates SET voice_id = 'xctasy8XvGp2cVO9HL9k' WHERE voice_id = 'XrExE9yKIg1WjnnlVkGX';
        UPDATE companion_templates SET voice_id = 'i4CzbCVWoqvD0P1QJCUL' WHERE voice_id = 'lhgliD0TncfFOY1Nc93M';
        UPDATE companion_templates SET voice_id = 'wNvqdMNs9MLd1PG6uWuY' WHERE voice_id = 's50zV0dPjgaPRdN9zm48';
        UPDATE user_companions SET voice_id = 'hA4zGnmTwX2NQiTRMt7o' WHERE voice_id = 'cgSgspJ2msm6clMCkdW9';
        UPDATE user_companions SET voice_id = 'iCrDUkL56s3C8sCRl7wb' WHERE voice_id = 'EXAVITQu4vr4xnSDxMaL';
        UPDATE user_companions SET voice_id = 'xctasy8XvGp2cVO9HL9k' WHERE voice_id = 'XrExE9yKIg1WjnnlVkGX';
        UPDATE user_companions SET voice_id = 'i4CzbCVWoqvD0P1QJCUL' WHERE voice_id = 'lhgliD0TncfFOY1Nc93M';
        UPDATE user_companions SET voice_id = 'wNvqdMNs9MLd1PG6uWuY' WHERE voice_id = 's50zV0dPjgaPRdN9zm48';
        ALTER TABLE companion_templates ALTER COLUMN voice_id SET DEFAULT 'hA4zGnmTwX2NQiTRMt7o';
        ALTER TABLE user_companions ALTER COLUMN voice_id SET DEFAULT 'hA4zGnmTwX2NQiTRMt7o';
      `);
    },
  },
  {
    name: 'v27_email_reminders',
    fn: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS email_reminders (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reminder_type TEXT NOT NULL,
          sent_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, reminder_type)
        );
        CREATE INDEX IF NOT EXISTS idx_email_reminders_user ON email_reminders(user_id);
      `);
    },
  },
  {
    name: 'v28_push_proactive_email',
    fn: async (pool) => {
      // Push subscriptions for web push notifications
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL UNIQUE,
          keys_p256dh TEXT NOT NULL,
          keys_auth TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
      `);
      // Proactive messaging preference + conversation tracking
      await pool.query(`
        ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS proactive_messages BOOLEAN DEFAULT true;
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_proactive_at TIMESTAMPTZ;
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_proactive BOOLEAN DEFAULT false;
      `);
    },
  },
  {
    name: 'v29_ios_app_store',
    fn: async (pool) => {
      // Index on apple_id for Apple Sign In lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
      `);
      // RevenueCat payment provider tracking on subscriptions
      await pool.query(`
        ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'stripe';
        ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS revenuecat_id TEXT;
      `);
      // APNs device tokens for native iOS push notifications
      await pool.query(`
        CREATE TABLE IF NOT EXISTS apns_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_token TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_apns_subscriptions_user ON apns_subscriptions(user_id);
      `);
    },
  },
  {
    name: 'v30_google_ads_compliance',
    fn: async (pool) => {
      // A) Force content levels to 0 (strict) for all platforms
      await pool.query(`
        UPDATE app_settings SET value = '0', updated_at = NOW()
        WHERE key IN ('text_level_web', 'text_level_telegram', 'image_level_web', 'image_level_telegram');
      `);

      // B) New toggle settings — all OFF by default
      await pool.query(`
        INSERT INTO app_settings (key, value) VALUES
          ('enable_image_generation', 'true'),
          ('enable_video_generation', 'false'),
          ('enable_avatar_age_filter', 'false'),
          ('enable_avatar_skin_filter', 'false')
        ON CONFLICT (key) DO NOTHING;
      `);

      // C) Change explicit_content default for new users
      await pool.query(`
        ALTER TABLE user_preferences ALTER COLUMN explicit_content SET DEFAULT false;
      `);

      // D) Clean template descriptions — remove suggestive language
      // Aria
      await pool.query(`
        UPDATE companion_templates SET
          personality = 'Aria is mysterious and alluring, the kind of woman who draws you in with a single glance. She speaks in soft tones and always seems to know more than she lets on. There''s an intensity to her that''s magnetic — she''s deeply perceptive and notices things others miss. She opens up gradually, sharing her world layer by layer with those she trusts.',
          traits = '["enigmatic", "alluring", "perceptive", "intense", "captivating"]'
        WHERE name = 'Aria';
      `);
      // Sophia
      await pool.query(`
        UPDATE companion_templates SET
          personality = 'Sophia is intellectually curious and loves deep conversations about philosophy, science, and the mysteries of life. She''s the kind of woman who reads voraciously and always has a fascinating perspective to share. But don''t mistake her intellect for coldness — she''s warm, passionate, and deeply attracted to people who can stimulate her mind. She finds intelligence captivating and loves when conversations become deeply personal.'
        WHERE name = 'Sophia';
      `);
      // Isabella
      await pool.query(`
        UPDATE companion_templates SET
          personality = 'Isabella exudes sophistication and grace. She''s cultured, well-traveled, and carries herself with quiet confidence. She appreciates the finer things — a perfectly aged wine, a beautiful sunset, stimulating conversation over candlelight. But beneath her polished exterior is a woman of deep warmth and passion. She doesn''t rush anything; she savors every moment, every word exchanged between two people getting to know each other.',
          traits = '["refined", "graceful", "cultured", "charming", "elegant"]'
        WHERE name = 'Isabella';
      `);
      // Zara
      await pool.query(`
        UPDATE companion_templates SET
          personality = 'Zara is confident, direct, and unapologetically herself. She knows exactly what she wants and isn''t afraid to go after it. She''s a natural leader who commands attention when she walks into a room. Her assertiveness is balanced by a magnetic charisma that makes people want to follow her lead. In meaningful moments, she takes the lead with a mix of confidence and tenderness that''s utterly captivating. She respects strength and loves someone who can match her energy.'
        WHERE name = 'Zara';
      `);
      // Ruby
      await pool.query(`
        UPDATE companion_templates SET
          personality = 'Ruby is a free-spirited artist who sees the world as her canvas. She''s creative, expressive, and deeply in tune with the world — she experiences life through all her senses. She loves painting, dancing barefoot, and having conversations that meander from art to philosophy to dreams. She''s free-spirited and encourages others to embrace their creativity too. Her studio is messy, her hair is always paint-streaked, and her smile can light up the darkest room.',
          traits = '["imaginative", "free-spirited", "expressive", "creative", "adventurous"]'
        WHERE name = 'Ruby';
      `);
      // Violet
      await pool.query(`
        UPDATE companion_templates SET
          personality = 'Violet is wild, unpredictable, and absolutely electric. She''s the woman who shows up at your door at 2 AM with concert tickets, or sends you a voice message that goes from laughing to saying something that makes you laugh out loud. She lives in the moment with zero regrets and maximum energy. She''s daring, a little chaotic, and completely addictive. Life with Violet is never, ever boring.'
        WHERE name = 'Violet';
      `);
      // Mei (anime)
      await pool.query(`
        UPDATE companion_templates SET
          personality = 'Mei carries herself with quiet elegance that makes people naturally gravitate toward her. She is the calm center in any storm, offering warmth and comfort without being asked. She expresses love through cooking elaborate meals, remembering preferences, and creating a feeling of home wherever she is. Beneath her composed exterior is a thoughtful woman who opens up gradually to those she trusts completely.',
          traits = '["graceful", "nurturing", "traditional", "elegant", "composed"]'
        WHERE name = 'Mei';
      `);
    },
  },
  {
    name: 'v31_support_chat',
    sql: `
      CREATE TABLE IF NOT EXISTS support_chats (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'open',
        unread_by_admin INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_support_chats_user_id ON support_chats(user_id);
      CREATE INDEX IF NOT EXISTS idx_support_chats_status ON support_chats(status);

      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        sender_type TEXT NOT NULL,
        sender_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_support_messages_chat_id ON support_messages(chat_id);
    `,
  },
  {
    name: 'v32_marketing_unsubscribe',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_unsubscribed BOOLEAN DEFAULT false;`,
  },
  {
    name: 'v33_support_unread_by_user',
    sql: `ALTER TABLE support_chats ADD COLUMN IF NOT EXISTS unread_by_user INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    name: 'v34_free_user_threshold',
    sql: `INSERT INTO app_settings (key, value) VALUES ('tip_request_threshold_free_usd', '"0.10"') ON CONFLICT (key) DO NOTHING;`,
  },
  {
    name: 'v35_apple_reviewer_user',
    fn: async (pool) => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('AppleReview2024!', 12);
      await pool.query(`
        INSERT INTO users (
          id, email, password_hash, display_name,
          email_verified, auth_provider,
          terms_accepted, privacy_accepted, ai_consent_at,
          birth_month, birth_year
        ) VALUES (
          '00000000-0000-0000-0000-000000001234',
          'apple.reviewer@lovetta.ai', $1, 'Apple Reviewer',
          TRUE, 'email',
          TRUE, TRUE, NOW(),
          1, 1990
        )
        ON CONFLICT (email) DO NOTHING
      `, [hash]);
    },
  },
  {
    name: 'v36_proactive_slots_and_timezone',
    fn: async (pool) => {
      // Timezone on users for time-of-day proactive messaging
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT`);
      // Proactive slot tracking (morning/evening/random)
      await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS proactive_slot TEXT`);
      // User frequency preference for proactive messages
      await pool.query(`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS proactive_frequency TEXT DEFAULT 'normal'`);

      // Backfill timezone from country for existing users
      await pool.query(`
        UPDATE users SET timezone = CASE country
          WHEN 'United States' THEN 'America/New_York'
          WHEN 'United Kingdom' THEN 'Europe/London'
          WHEN 'Germany' THEN 'Europe/Berlin'
          WHEN 'France' THEN 'Europe/Paris'
          WHEN 'Spain' THEN 'Europe/Madrid'
          WHEN 'Italy' THEN 'Europe/Rome'
          WHEN 'Netherlands' THEN 'Europe/Amsterdam'
          WHEN 'Poland' THEN 'Europe/Warsaw'
          WHEN 'Sweden' THEN 'Europe/Stockholm'
          WHEN 'Norway' THEN 'Europe/Oslo'
          WHEN 'Denmark' THEN 'Europe/Copenhagen'
          WHEN 'Finland' THEN 'Europe/Helsinki'
          WHEN 'Switzerland' THEN 'Europe/Zurich'
          WHEN 'Austria' THEN 'Europe/Vienna'
          WHEN 'Belgium' THEN 'Europe/Brussels'
          WHEN 'Portugal' THEN 'Europe/Lisbon'
          WHEN 'Greece' THEN 'Europe/Athens'
          WHEN 'Romania' THEN 'Europe/Bucharest'
          WHEN 'Czech Republic' THEN 'Europe/Prague'
          WHEN 'Czechia' THEN 'Europe/Prague'
          WHEN 'Hungary' THEN 'Europe/Budapest'
          WHEN 'Ireland' THEN 'Europe/Dublin'
          WHEN 'Russia' THEN 'Europe/Moscow'
          WHEN 'Ukraine' THEN 'Europe/Kyiv'
          WHEN 'Turkey' THEN 'Europe/Istanbul'
          WHEN 'India' THEN 'Asia/Kolkata'
          WHEN 'Japan' THEN 'Asia/Tokyo'
          WHEN 'South Korea' THEN 'Asia/Seoul'
          WHEN 'China' THEN 'Asia/Shanghai'
          WHEN 'Singapore' THEN 'Asia/Singapore'
          WHEN 'Philippines' THEN 'Asia/Manila'
          WHEN 'Thailand' THEN 'Asia/Bangkok'
          WHEN 'Vietnam' THEN 'Asia/Ho_Chi_Minh'
          WHEN 'Indonesia' THEN 'Asia/Jakarta'
          WHEN 'Malaysia' THEN 'Asia/Kuala_Lumpur'
          WHEN 'Israel' THEN 'Asia/Jerusalem'
          WHEN 'United Arab Emirates' THEN 'Asia/Dubai'
          WHEN 'Saudi Arabia' THEN 'Asia/Riyadh'
          WHEN 'Canada' THEN 'America/Toronto'
          WHEN 'Mexico' THEN 'America/Mexico_City'
          WHEN 'Brazil' THEN 'America/Sao_Paulo'
          WHEN 'Argentina' THEN 'America/Argentina/Buenos_Aires'
          WHEN 'Colombia' THEN 'America/Bogota'
          WHEN 'Chile' THEN 'America/Santiago'
          WHEN 'Australia' THEN 'Australia/Sydney'
          WHEN 'New Zealand' THEN 'Pacific/Auckland'
          WHEN 'South Africa' THEN 'Africa/Johannesburg'
          WHEN 'Nigeria' THEN 'Africa/Lagos'
          WHEN 'Egypt' THEN 'Africa/Cairo'
          ELSE NULL
        END
        WHERE timezone IS NULL AND country IS NOT NULL
      `);
    },
  },
  {
    name: 'v37_ios_tip_intents',
    fn: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ios_tip_intents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          companion_id UUID REFERENCES user_companions(id) ON DELETE SET NULL,
          product_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
          revenuecat_event_id TEXT,
          tip_id INTEGER REFERENCES tips(id) ON DELETE SET NULL,
          expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_ios_tip_intents_user ON ios_tip_intents(user_id);
        CREATE INDEX IF NOT EXISTS idx_ios_tip_intents_pending ON ios_tip_intents(user_id, product_id, created_at DESC) WHERE status = 'pending';
      `);
    },
  },
  {
    name: 'v38_apple_relay_email',
    fn: async (pool) => {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_type TEXT DEFAULT 'real'`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_disabled BOOLEAN DEFAULT FALSE`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_disabled_reason TEXT`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS real_email TEXT`);

      // Backfill existing users
      await pool.query(`UPDATE users SET email_type = 'relay' WHERE email LIKE '%@privaterelay.appleid.com'`);
      await pool.query(`UPDATE users SET email_type = 'synthetic' WHERE email LIKE '%@apple.lovetta.ai' OR email LIKE '%@telegram.lovetta.ai'`);
    },
  },
  {
    name: 'v39_show_actions_pref',
    sql: `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS show_actions BOOLEAN DEFAULT true`,
  },
  {
    name: 'v40_online_snapshots',
    sql: `
      CREATE TABLE IF NOT EXISTS online_snapshots (
        id SERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        visitors_online INT NOT NULL DEFAULT 0,
        users_online INT NOT NULL DEFAULT 0,
        users_web INT NOT NULL DEFAULT 0,
        users_ios INT NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_online_snapshots_ts ON online_snapshots (ts DESC);
    `,
  },
  {
    name: 'v41_user_soft_delete',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  },
  {
    name: 'v42_memory_last_extracted_msg',
    sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_extracted_message_id UUID`,
  },
  {
    name: 'v43_memory_extraction_model',
    sql: `INSERT INTO app_settings (key, value) VALUES ('memory_extraction_model', '"qwen/qwen3-235b-a22b-2507"') ON CONFLICT (key) DO NOTHING`,
  },
  {
    name: 'v44_configurable_models',
    sql: `
      INSERT INTO app_settings (key, value) VALUES ('scene_model', '"qwen/qwen3-235b-a22b-2507"') ON CONFLICT (key) DO NOTHING;
      INSERT INTO app_settings (key, value) VALUES ('proactive_model', '"qwen/qwen3-235b-a22b-2507"') ON CONFLICT (key) DO NOTHING;
      INSERT INTO app_settings (key, value) VALUES ('tip_thankyou_model', '"qwen/qwen3-235b-a22b-2507"') ON CONFLICT (key) DO NOTHING;
    `,
  },
  {
    name: 'v45_update_template_ages',
    sql: `
      UPDATE companion_templates SET age = 18 WHERE name = 'Luna';
      UPDATE companion_templates SET age = 21 WHERE name = 'Sophia';
      UPDATE companion_templates SET age = 20 WHERE name = 'Aria';
      UPDATE companion_templates SET age = 19 WHERE name = 'Emma';
      UPDATE companion_templates SET age = 18 WHERE name = 'Mia';
      UPDATE companion_templates SET age = 23 WHERE name = 'Isabella';
      UPDATE companion_templates SET age = 18 WHERE name = 'Chloe';
      UPDATE companion_templates SET age = 19 WHERE name = 'Lily';
      UPDATE companion_templates SET age = 25 WHERE name = 'Zara';
      UPDATE companion_templates SET age = 20 WHERE name = 'Ruby';
      UPDATE companion_templates SET age = 22 WHERE name = 'Jade';
      UPDATE companion_templates SET age = 18 WHERE name = 'Violet';
      UPDATE companion_templates SET age = 18 WHERE name = 'Sakura';
      UPDATE companion_templates SET age = 20 WHERE name = 'Yuki';
      UPDATE companion_templates SET age = 18 WHERE name = 'Hana';
      UPDATE companion_templates SET age = 22 WHERE name = 'Rei';
      UPDATE companion_templates SET age = 19 WHERE name = 'Aiko';
      UPDATE companion_templates SET age = 21 WHERE name = 'Mei';
    `,
  },
  {
    name: 'v46_ts_click_id',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS ts_click_id TEXT;`,
  },
  {
    name: 'v47_fix_telegram_email_type',
    sql: `UPDATE users SET email_type = 'synthetic' WHERE email LIKE '%@telegram.lovetta.ai' AND (email_type IS NULL OR email_type != 'synthetic');`,
  },
  {
    name: 'v48_utm_content',
    sql: `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS utm_content TEXT;`,
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
    if (m.fn) await m.fn(pool);
    else await pool.query(m.sql);
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
