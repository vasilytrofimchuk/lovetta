# Language Tutor App — Technical Fork Plan

## Product Vision

An AI-powered English conversation tutor for the Japanese market, built by forking the Lovetta.ai codebase. The core insight: Japanese learners have **the worst TOEFL speaking score in the world** despite years of study, and suffer from **英会話恐怖症** (English conversation phobia) — deep shame around speaking English to humans. An AI character that is patient, encouraging, and remembers your progress solves this perfectly.

Japan is the ideal market because:
- **$8.76B** English learning market, no dominant AI conversation app yet
- **60% of global VTuber market** — deepest cultural affinity for character-based interaction
- **$1.7B AI companion market** (projected $7.2B by 2030), zero stigma around AI characters
- **65-70% iOS market share** — highest monetization platform
- Online eikaiwa (conversation schools) charge ¥5,000-13,000/mo for human teachers — AI at ¥1,980 is a steal

### The Gap No One Fills

Character.ai proves people want to practice languages with characters they bond with. Speak ($100M revenue, mostly Korea) proves AI conversation tutoring works. **Nobody combines emotional character attachment with actual language pedagogy.** Lovetta's memory system, character creation, and proactive messaging are the exact mechanics needed.

### Target Users

| Segment | Size | Motivation | Current Spend |
|---------|------|------------|--------------|
| Young professionals (23-35) | ~4-5M | Career/TOEIC advancement | ¥5,000-15,000/mo |
| University students (18-22) | ~2.8M | TOEIC for job hunting (shukatsu) | Low-medium |
| Mid-career professionals (35-50) | ~2-3M | Global roles, promotions | Highest |
| Hobby/travel learners (30-60) | ~3-4M | Travel, media consumption | ¥1,000-3,000/mo |

### Competitive Landscape

| Competitor | Revenue (Japan) | Type | Weakness |
|-----------|----------------|------|----------|
| DMM英会話 | ~$150-200M | Human 1-on-1 (Filipino teachers) | Expensive, scheduling |
| NativeCamp | ~$80-100M | Unlimited human lessons | Still requires booking |
| スタディサプリ | ~$80-100M | TOEIC video lectures | Not conversational |
| Duolingo | ~$40-50M | Gamified learning | No real conversation practice |
| Speak | ~$15-25M | AI conversation | No character personality, no memory |
| Rarejob | ~$58M | Human 1-on-1, B2B | Traditional format |

### Pricing

| Tier | Price | What's included |
|------|-------|----------------|
| Free | ¥0 | 3-5 conversations/day, 1 tutor character |
| Premium | ¥1,980/mo (~$13.50) | Unlimited conversation, all characters, progress tracking, SRS vocab |
| Annual | ¥19,800/yr (¥1,650/mo) | Same as premium, 17% discount |
| B2B | ¥5,000-10,000/seat/mo | Corporate English training |

Target: 50-100K paid subscribers in 2-3 years → **¥1.2-2.4B ($8-16M ARR)**

### Marketing (Japan-specific)

| Channel | Why | Est. Cost |
|---------|-----|-----------|
| Twitter/X | Japan's #2 market, huge English study community (勉強垢) | CPI ~$2-5 |
| YouTube | English learning YouTubers (Kevin's English Room 2M, Bilingirl 1.5M) | ¥300K-2M per collab |
| LINE Official Account | 96M users in Japan, daily vocab push, lesson reminders | ¥5K-15K/mo |
| TikTok | 28M users, short-form English tips | CPI ~$2-4 |
| VTuber collabs | Perfect brand fit for character-based tutor | ¥500K-2M per stream |
| Comparison blogs (比較サイト) | Japanese consumers rely heavily on these | Affiliate/SEO |

---

## Technical Architecture

### What Stays As-Is (~60% of codebase)

| Module | Notes |
|--------|-------|
| Auth system (email/Google/Apple/Telegram) | Zero changes needed |
| JWT tokens, refresh flow | Zero changes |
| Database pool + migrations framework | Add new migrations on top |
| Stripe billing + RevenueCat iOS | Change plan names/prices |
| Consumption tracking (api_consumption) | Same cost tracking logic |
| Admin dashboard | Add "Learning Stats" tab |
| Email system (Resend) | Change templates to learning-focused |
| Push notifications (FCM + APNS) | Zero changes |
| Telegram Mini App integration | Zero changes |
| Capacitor iOS shell | Change app name/bundle ID |
| React routing + auth context | Rename routes |
| Express middleware + API architecture | Zero changes |
| Cloudflare R2 uploads | Zero changes |
| Redis caching | Zero changes |

### What Gets Modified (~25% of codebase)

| Module | Current (Lovetta) | Language Tutor Version |
|--------|-------------------|----------------------|
| **companion_templates** | Girlfriend personas (Luna, Sophia, Aria) | Tutor characters: Yuki (patient teacher), Hana (casual friend), Ken (business coach) |
| **user_companions** table | name, personality, backstory, traits | + target_language, native_language, cefr_level, teaching_style |
| **Content levels (0-3)** | Intimacy levels (PG → explicit) | CEFR levels: A1/A2/B1/B2/C1/C2 — controls vocab and grammar complexity |
| **Memory system** | Facts about user (birthday, coffee) | Learning memory: words learned, grammar errors, pronunciation issues |
| **Proactive messaging** | "Thinking of you" affectionate check-in | "Time to practice!" vocab review, streak reminder, scenario suggestion |
| **Chat UI** | Message bubbles + media | + inline corrections, post-session summary, vocab extraction panel |
| **Tip system** | "Support her!" at cost threshold | "Unlock Premium" at free conversation limit |
| **Companion emails** | Flirty companion messages | "Your weekly progress report from Yuki" |

### What Gets Built New (~15% of codebase)

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| Language system prompt | P0 | 2-3 days | New prompt: target language, CEFR level, correction style, grammar focus |
| Inline correction engine | P0 | 3-5 days | Detect grammar/vocab errors, return corrections with Japanese explanations |
| Vocabulary tracker | P0 | 2-3 days | SRS-based word tracking: word, reading, meaning, times_seen, next_review_at |
| Post-session summary | P1 | 2-3 days | After each conversation: new words, grammar points, errors, CEFR progress |
| Streak/gamification | P1 | 2-3 days | Streaks, XP, levels, daily goal tracking |
| Scenario library | P1 | 2-3 days | Structured starters: "At a coffee shop", "Job interview", with objectives |
| Japanese localization | P0 | 5-7 days | Full UI + App Store listing + onboarding in Japanese |
| TOEIC score estimator | P2 | 1-2 days | Vocab/grammar level → estimated TOEIC score range |
| Pronunciation feedback | P2 | 3-5 days | Whisper STT → compare to expected → score + feedback |
| Spaced repetition (SM-2) | P2 | 2-3 days | Surface vocabulary in future conversations + push notifications |
| Progress dashboard | P2 | 2-3 days | Vocab growth chart, error trends, streak calendar, CEFR visualization |

### New Database Tables

```sql
learned_vocabulary (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  companion_id UUID,
  word TEXT NOT NULL,
  reading TEXT,                    -- phonetic: "həˈloʊ"
  meaning_ja TEXT,                 -- Japanese translation
  example_sentence TEXT,
  times_seen INT DEFAULT 1,
  times_correct INT DEFAULT 0,
  ease_factor FLOAT DEFAULT 2.5,  -- SM-2 spaced repetition
  next_review_at TIMESTAMPTZ,
  cefr_level TEXT,                 -- A1/A2/B1/B2/C1/C2
  created_at TIMESTAMPTZ DEFAULT NOW()
);

grammar_errors (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  conversation_id UUID,
  error_type TEXT,                 -- "tense", "article", "preposition"
  user_text TEXT,                  -- what they wrote
  corrected_text TEXT,             -- correct version
  explanation_ja TEXT,             -- explanation in Japanese
  created_at TIMESTAMPTZ DEFAULT NOW()
);

user_learning_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  native_language TEXT DEFAULT 'ja',
  target_language TEXT DEFAULT 'en',
  cefr_level TEXT DEFAULT 'A2',
  daily_goal_minutes INT DEFAULT 15,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  xp INT DEFAULT 0,
  total_words_learned INT DEFAULT 0,
  total_conversations INT DEFAULT 0,
  estimated_toeic_score INT,
  streak_updated_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

conversation_reports (
  id UUID PRIMARY KEY,
  conversation_id UUID,
  user_id UUID REFERENCES users(id),
  duration_minutes INT,
  new_words TEXT[],
  grammar_errors_count INT,
  pronunciation_score FLOAT,
  summary_ja TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

scenarios (
  id UUID PRIMARY KEY,
  title_ja TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ja TEXT,
  cefr_level TEXT,
  category TEXT,                   -- "travel", "business", "daily", "culture"
  objectives TEXT[],               -- ["Order a drink", "Ask for the bill"]
  starter_prompt TEXT,
  sort_order INT DEFAULT 0
);
```

### System Prompt Architecture

```
[BASE TUTOR PROMPT]
You are {name}, an English conversation tutor.
Personality: {personality}
Teaching style: {teaching_style}

[LEARNER CONTEXT]
Native language: Japanese
CEFR level: {cefr_level}
Known vocabulary: {vocab_count} words
Recurring errors: {error_patterns}
Interests: {from memory}

[CONVERSATION RULES]
- Speak English at {cefr_level} level
- Use vocabulary appropriate for {cefr_level}
- When the user makes a grammar error, correct inline:
  ✏️ "I go to store yesterday" → "I went to the store yesterday"
     (past tense: go → went)
- Introduce 2-3 new words per conversation naturally
- Mark new vocabulary with 📝 emoji
- If user is stuck, offer hints in Japanese
- Never switch fully to Japanese unless user explicitly asks
- End conversations with a brief summary

[SCENARIO: {if active}]
Setting: {scenario description}
Objectives: {scenario objectives}
Guide the conversation toward completing these objectives.

[MEMORY CONTEXT]
{conversation summaries}
{learned facts about user}
{recent vocabulary to reinforce}
```

### Cost Per User

| Component | Cost/user/month | Notes |
|-----------|----------------|-------|
| LLM (conversation + corrections) | $1-3 | Qwen 235B via OpenRouter |
| Memory extraction | $0.10-0.30 | Same as Lovetta |
| TTS (voice mode, P2) | $0.30-1.00 | ElevenLabs |
| STT (pronunciation, P2) | $0.50-1.50 | Whisper API |
| Hosting | $0.10-0.20 | Heroku |
| **Total (text only)** | **$1.50-3.50** | |
| **Total (with voice)** | **$2.50-6.00** | |

At ¥1,980/mo (~$13.50) → **65-80% gross margin** (text), **55-70%** (with voice).

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| **Phase 0: Fork** | 1 day | Clone repo, new Heroku app, new domain, new Stripe account |
| **Phase 1: Core swap** | 1-2 weeks | Tutor characters, new system prompts, CEFR content levels, basic inline corrections |
| **Phase 2: Learning features** | 2-3 weeks | Vocabulary tracker, grammar error tracking, post-session summary, streak system |
| **Phase 3: Japanese localization** | 1-2 weeks | Full UI translation, App Store listing, Japanese onboarding flow |
| **Phase 4: Polish** | 1-2 weeks | Scenario library, progress dashboard, TOEIC estimator, pronunciation feedback |
| **Phase 5: Launch** | 1 week | Japan App Store submission, LINE Official Account, initial marketing |

**Total: ~6-8 weeks to MVP launch in Japan App Store.**

---

## Key Technical Decisions

1. **Same AI provider (OpenRouter)** — Qwen 235B works for pedagogy. May add grammar-checking model later
2. **Same image gen (fal.ai)** — repurpose for scene illustrations ("You're at a Tokyo coffee shop") instead of companion portraits
3. **Keep ElevenLabs** — good English voices for the tutor speaking English
4. **Keep Telegram** — but add **LINE** as primary channel for Japan (96M users)
5. **Keep 3-level memory** — adapt categories: grammar struggles, vocabulary level, interests for conversation topics
6. **Anime-style avatars** — Live2D style fits Japan's VTuber culture perfectly
7. **Japanese-first UX** — not a translated Western app, designed for Japanese sensibilities (information density, thorough onboarding, kawaii elements)

## Key Risks

1. **Speak has $47M+ funding** and expanding in Japan — first-mover in AI conversation
2. **Japanese localization must be perfect** — bad Japanese = instant uninstall
3. **Voice quality critical** — seiyuu (voice actor) culture means Japanese are extremely discerning
4. **Need native Japanese involvement** — for localization, marketing copy, cultural nuance
5. **LINE integration** is table stakes for Japan but adds development scope
