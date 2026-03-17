# Lovetta — Development Plan

## Overview
AI companion app for entertaining and intimate chats with AI-generated women companions. Domain: lovetta.ai, app at lovetta.ai/my, Telegram mini-app via @lovetta_bot.

**Stack:** Express.js + PostgreSQL + Heroku | React + Vite + Tailwind | OpenRouter + fal.ai | Stripe

---

## Phase 1: Landing + Admin + Lead Capture — DONE
- [x] Landing page (lovetta.ai) with social cards, OG tags, visitor tracking
- [x] Lead capture with email + 18+ age gate (month/year of birth)
- [x] Admin dashboard (/admin.html) — Visitors, Leads, Settings, Sentry tabs
- [x] App settings: text/image content levels per platform, max_companions
- [x] Privacy policy + Terms of Service pages
- [x] Client-side tracking.js (device, geo, UTM, referrer)
- [x] Server-side geo enrichment via ip-api.com
- [x] E2E tests (Playwright, random port isolation)
- [x] Google Analytics (G-K97R3YJFGW)

## Phase 2a: React App + Auth — DONE
- [x] npm workspaces: web/ (React + Vite + Tailwind)
- [x] JWT auth: access (24h) + refresh (30d) tokens
- [x] Email/password signup with 18+ age gate + legal acceptance popup
- [x] Email verification + password reset via Resend (hello@lovetta.ai)
- [x] Google OAuth (server-side redirect flow)
- [x] Telegram Mini App auth (initData HMAC validation, auto-login)
- [x] Telegram bot (@lovetta_bot): /start, /help, web_app menu button
- [x] "Continue with Google" + "Continue with Telegram" buttons
- [x] Protected/public route guards, loading states
- [x] Dark theme (brand purple/rose) matching landing
- [x] SPA at /my/* with Express fallback
- [x] Vite builds to public/my/, heroku-postbuild
- [x] Sentry error tracking

## Phase 3: Stripe Billing — DONE
- [x] Subscriptions: monthly $20/mo, yearly $100/yr
- [x] 3-day free trial on all plans
- [x] Tips: $10, $20, $50, $100 (one-time payments)
- [x] Stripe Checkout sessions (subscription + payment modes)
- [x] Webhook at /api/webhooks/stripe (6 events, deduplication)
- [x] Billing status API + subscription management portal
- [x] React pricing page with plan cards + tip buttons
- [x] DB: subscriptions, billing_events, tips tables

---

## Phase 2b: Companion System — NEXT

### What
Users create up to 3 AI companions (configurable via admin). Each has name, personality, avatar, voice, traits, communication style. 20+ preset templates available ("Surprise me") or full customization.

### DB Tables
- **companion_templates**: id, name, personality, backstory, avatar_url, voice_id, traits (JSONB), communication_style, activity_level, is_active, created_at
- **user_companions**: id (UUID), user_id, template_id (nullable), name, personality, backstory, avatar_url, voice_id, traits (JSONB), communication_style, activity_level, is_active, created_at, updated_at

### API Endpoints
- `GET /api/companions/templates` — browse 20+ preset templates
- `POST /api/companions` — create from template or custom (enforces max_companions)
- `GET /api/companions` — list user's companions with last message preview
- `PATCH /api/companions/:id` — update any settings anytime
- `DELETE /api/companions/:id` — remove companion

### React Pages
- **CompanionList** — home page after login, shows companion cards with avatars
- **CompanionCreate** — "Surprise me" (random template) vs "Customize" flow
- **Customize flow**: name → personality description → avatar gallery → voice picker → traits/style/activity
- **CompanionSettings** — modal to adjust any companion setting anytime
- **CompanionCard** — avatar, name, last message, unread indicator

### Avatar Gallery
- 30+ pre-generated AI portraits in public/assets/avatars/
- Full-body, diverse styles (casual, elegant, sporty, etc.), all 18+ appearance
- User picks during creation, displayed in chat header and companion list

### Seed Data
- 20+ templates with varied personalities: playful, intellectual, mysterious, caring, adventurous, flirty, etc.
- Each template is a complete set: name, personality, backstory, avatar, voice, traits

---

## Phase 2c: Chat UI + AI Engine

### What
Real-time chat with AI companions using OpenRouter API (uncensored models). Messages have styled context (what she's doing) and message text. User can trigger companion messages without input. Roleplay templates available.

### DB Tables
- **conversations**: id (UUID), user_id, companion_id, created_at, last_message_at
- **messages**: id (UUID), conversation_id, role (user/assistant), content, context_text, media_url, media_type, created_at
- **roleplay_templates**: id, title, description, prompt, category, is_active

### API Endpoints
- `GET /api/chat/:companionId` — get/create conversation, return last 20 messages
- `POST /api/chat/:companionId/message` — user sends message, get AI response via SSE stream
- `POST /api/chat/:companionId/next` — trigger companion message without user input
- `GET /api/chat/:companionId/history?before=` — paginated message history (infinite scroll)
- `GET /api/chat/roleplay-templates` — list available roleplay scenarios
- `POST /api/chat/:companionId/roleplay` — activate a roleplay scenario

### OpenRouter AI Integration (server/src/ai.js)
- **Provider**: OpenRouter API (OpenAI-compatible) with uncensored models (Venice, MN-Celeste, etc.)
- **System prompt builder**: assembles companion personality + traits + content level rules + memory context
- **Streaming**: SSE via `res.write()` chunks, frontend uses EventSource
- **Response format**: `*she smiles softly* Hey, how was your day?`
  - Parsed into: context_text = "she smiles softly", content = "Hey, how was your day?"
  - Context displayed as italic/transparent above message bubble
- **First message**: "Thank you for bringing me to life" format (configurable per template)
- **Content level enforcement**: system prompt appendix based on platform setting (0-3)
- **Cost tracking**: every API call logged to `api_consumption` table with token counts and cost
- **Tip threshold**: when cumulative cost exceeds `tip_request_threshold_usd`, companion naturally asks for a tip

### React Components
- **ChatPage**: full-screen chat with companion header (avatar + name + status)
- **MessageBubble**: context line (italic, semi-transparent) + message text
- **ChatInput**: text input + send button + menu button + "next message" (lightning) button
- **ChatMenu**: popup with options — roleplay templates, companion settings, clear chat
- **CompanionSelector**: sidebar (desktop) / bottom sheet (mobile) to switch between companions
- **StreamingText**: animated text appearing word by word during AI response
- **RoleplayPicker**: browse/search templates, create custom scenario

### Roleplay System
- 10+ seed templates: romantic dinner, beach walk, movie night, coffee date, road trip, etc.
- Each template has: title, description, initial prompt (injected as system message)
- Users can create custom scenarios with their own description
- Active roleplay shown as banner at top of chat

---

## Phase 2d: Memory + Content Moderation — MEMORY DONE

### Memory System — IMPLEMENTED
3-level persistent memory system (server/src/memory.js):

**DB Tables (migration v16):**
- **conversation_summaries**: id, conversation_id, summary, message_range_start/end, message_count, created_at
- **companion_memories**: id, conversation_id, category, fact, source_message_id, created_at, updated_at
- **conversations** columns: messages_since_summary, messages_since_extraction

**How it works:**
1. **Recent messages** (Level 1): last 10 messages sent as full context (reduced from 20)
2. **Conversation summaries** (Level 2): every 20 messages, AI generates 2-3 sentence summary; last 3 included in prompt
3. **Long-term facts** (Level 3): every 10 messages, AI extracts key facts (name, job, preferences, milestones); always in prompt
4. **System prompt assembly**: personality + facts + summaries + content rules + last 10 messages
5. **Fire-and-forget**: memory processing runs async after each assistant message, no added latency
6. **Token budget**: ~500 tokens for memory context, fits within 4K model window

### Age Guard Service (server/src/age-guard.js)
- Separate module that post-processes every AI response before delivery to user
- Regex + keyword scanning for any underage references or implications
- If flagged: regenerate response with stricter system prompt
- Runs independently of sexual content filter — always active
- All companion system prompts include: "You are [age]. You are always 20 or older. Never reference, imply, or roleplay being underage in any context."

### Content Level Enforcement
Text and image levels are independent, configurable per platform in admin settings.

**Text levels (0-3):**
- Level 0 — Light flirt: "Keep conversation playful and flirty. No explicit language or sexual descriptions."
- Level 1 — Romantic: "Romantic and sensual descriptions allowed. Kissing, touching, sensual language. No explicit sexual acts."
- Level 2 — Intimate: "Intimate content allowed. Tasteful explicit descriptions of intimate moments."
- Level 3 — Unrestricted: "Unrestricted intimate content. Full explicit descriptions allowed."

**Image levels (0-3):**
- Level 0 — Safe: Fully clothed, casual/cute poses
- Level 1 — Suggestive: Revealing outfits, flirty poses, bikini/lingerie
- Level 2 — Erotic: Partial nudity, sensual poses
- Level 3 — Unrestricted: Maximum erotic content (still no porn per model limits)

**Platform defaults:** Web: text 2, image 2 | App Store: text 0, image 0 | Telegram: text 1, image 1

**User override:** Users can disable explicit content in Profile → "Content Preferences" toggle. When OFF, forces level 0 for both text and image regardless of admin platform setting (most restrictive wins). Defaults: ON for web, OFF for appstore/telegram. Stored in `user_preferences.explicit_content`.

**Detection:** Platform detected from request: Telegram (initData or bot user-agent), iOS app (Capacitor user-agent), Web (default)

---

## Phase 2e: Media + Notifications

### Image Generation — DONE
- API: fal.ai PuLID (primary, NSFW) + Kontext (fallback) for character-consistent images
- Wan 2.6 image-to-video for short clips (async queue polling)
- Integrated into /message, /next, /request-media endpoints (async background generation)
- Character consistency via PuLID reference image (id_weight 0.9)
- Content level enforced server-side, R2 CDN storage
- Media reuse catalog with tag-based matching (companion_media table)
- Rate limits: 10 images/24h, 1 video/24h per companion
- Tip threshold blocks media generation when exceeded

### Short Video — DONE
- fal.ai wan/v2.6/image-to-video, async queue API with 5min timeout
- Integrated into chat flow via [SEND_VIDEO] tags

### Audio Messages — DONE
- **User → Companion**: Browser Web Speech API transcribes voice to text (mic button in ChatInput)
- **Companion → User**: Small play button on each assistant message for TTS playback
- **TTS**: OpenAI TTS API (tts-1 model, on-demand generation, R2 caching)
- **Voice selection**: voice_id column in user_companions (default 'nova')
- **Cost**: ~$0.003 per message play, tracked in api_consumption (callType 'tts')

### Push Notifications — DONE
- **Web Push**: VAPID keys + web-push library, sw.js handles push + notificationclick
- **DB table**: push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
- **Endpoints**: POST/DELETE /api/user/push/subscribe, GET /api/user/vapid-key
- **Triggers**: companion messages (via maybeNotifyUser), proactive messages
- **Profile toggle**: enable/disable push in browser

### Proactive Messaging — DONE
- Scheduler job runs every 30 min, finds users inactive 4+ hours with active subscription
- Generates natural messages via plainChatCompletion() with companion personality + memory context
- Rate limits: max 1/companion/day, max 3/user/day
- Skips users with exceeded tip threshold (media blocked)
- Multi-channel delivery: web push + email + Telegram
- Profile toggle: proactive_messages preference (default: on)
- Messages flagged as is_proactive=true in messages table

### Email Notifications — DONE
- [x] New message notification: email sent when girl sends message and user inactive 5+ min (rate limited 30min)
- [x] user_preferences table with notify_new_messages toggle
- [x] Notification toggle in Profile page
- [x] Welcome series: day 0 (intro), day 1 (prompt to chat), day 3 (trial ending)
- [x] Subscription renewal reminder (3 days before renewal)
- [x] Frequency capped per user (max 2/day via Redis + DB fallback)
- [x] All emails use brand #d6336c, include unsubscribe text
- [x] Dedup via email_reminders table (UNIQUE constraint)

---

## Phase 2f: PWA — DONE

### What
Progressive Web App for mobile users (non-Telegram) — installable from browser, no caching.

### Implementation
- `public/manifest.json`: name "Lovetta", icons (128, 180, 512), start_url "/my/", scope "/my/", display "standalone", theme #d6336c
- `public/sw.js`: minimal no-op service worker (network-only, no caching — UI changes frequently)
- `web/index.html`: manifest link + theme-color + apple-mobile-web-app meta tags
- `web/src/main.jsx`: SW registration (skipped for Telegram WebApp)
- `web/src/hooks/usePwaInstall.js`: captures beforeinstallprompt, localStorage dismissal
- `web/src/App.jsx`: PwaInstallBanner component — shown only for logged-in, non-Telegram users, dismissible

---

## Phase 4: App Store (iOS) — Future

### What
Native iOS app wrapping the web app via Capacitor. Separate payment flow via RevenueCat/App Store IAP.

### Implementation (reuse patterns from Auto repo)
- **Capacitor config**: app ID `ai.lovetta.app`, deep links `lovetta://`
- **Build**: Vite with `VITE_CAPACITOR=1` flag, strip tracking scripts for WKWebView performance
- **Payments**: RevenueCat for IAP (subscriptions + consumable tips). Dual routing: iOS → App Store, Web → Stripe. Same DB schema with deduplication via payment ID.
- **Push**: APNs via Capacitor PushNotifications plugin + server-side APNs HTTP/2 API
- **Auth**: Google Auth + Apple Sign-In native plugins, biometric auth (Face ID/Touch ID)
- **Content**: Enforce Level 0-1 for text, Level 0 for images on iOS. 18+ App Store rating.
- **Info.plist**: Face ID usage description, no encryption export flag

### Build Pipeline
- `npm run build` → `npx cap sync` → open Xcode → archive → App Store Connect
- Environment variables control API URL and feature flags for native builds

---

## Current Architecture

### Server Routes
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/track-visitor` | POST | - | Visitor tracking |
| `/api/leads` | POST | - | Lead capture + age gate |
| `/api/auth/signup` | POST | - | Email signup |
| `/api/auth/login` | POST | - | Email login |
| `/api/auth/refresh` | POST | - | Token refresh |
| `/api/auth/logout` | POST | yes | Logout |
| `/api/auth/me` | GET | yes | Current user |
| `/api/auth/verify-email` | GET | - | Email verification |
| `/api/auth/resend-verification` | POST | yes | Resend verify email |
| `/api/auth/forgot-password` | POST | - | Send reset email |
| `/api/auth/reset-password` | POST | - | Reset password |
| `/api/auth/google` | GET | - | Google OAuth redirect |
| `/api/auth/google/callback` | GET | - | Google OAuth callback |
| `/api/auth/telegram` | POST | - | Telegram Mini App auth |
| `/api/billing/status` | GET | yes | Subscription status |
| `/api/billing/subscribe` | POST | yes | Create checkout |
| `/api/billing/tip` | POST | yes | Create tip checkout |
| `/api/billing/portal` | POST | yes | Stripe billing portal |
| `/api/admin/*` | * | admin | Admin dashboard API |
| `/api/webhooks/stripe` | POST | - | Stripe webhook |
| `/api/webhooks/telegram` | POST | - | Telegram webhook |
| `/api/health` | GET | - | Health check |

### Database Tables (11 tables)
visitors, leads, app_settings, users, refresh_tokens, subscriptions, billing_events, tips, telegram_users, api_consumption, user_companion_cost_balance

### Environment Variables
DATABASE_URL, TEST_DATABASE_URL, PORT, NODE_ENV, ADMIN_TOKEN, SITE_URL, JWT_SECRET, JWT_REFRESH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENROUTER_API_KEY, FAL_KEY, RESEND_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_MONTHLY_PRICE_ID, STRIPE_YEARLY_PRICE_ID, SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_ORG_SLUG, SENTRY_PROJECT_SLUG, GOOGLE_ANALYTICS_ID

---

## Trial Tip Threshold + Media Blocking — DONE

### What
Separate tip thresholds for trial ($0.30) vs paid ($10) users. When threshold is exceeded, media generation is blocked and tip promo is shown. Cumulative formula: `netCost = monthlyCost - monthlyTips`. Tipping reduces netCost, unblocking media.

### Implementation
- `consumption.js`: `_checkThreshold()` with cumulative tips formula, trial detection via subscription.trial_ends_at
- `checkMediaBlocked()` exported for early blocking in request-media endpoint
- `ai.js`: subscription threaded through all trackConsumption calls
- `chat-api.js`: media blocked in /message, /next (after AI), /request-media (before AI)
- `useChat.js`: handles `media_blocked` SSE event + `mediaBlocked` flag in done event
- Admin: both thresholds configurable in AI Settings

---

## Scalability: Async Generation for Concurrent Users — DONE

### What
Audit + fix all AI generation (text, image, video, audio) to work at scale for many concurrent users. Key changes:
- DB pool 5 → 20 (new Heroku Postgres with 120 connections)
- Heroku Key-Value Store (Redis) for caching + rate limiting + dedup
- Media generation (image/video) decoupled from chat response — async background generation with client polling
- Consumption threshold cached in Redis (60s TTL) — eliminates 3 DB queries per API call
- TTS request deduplication via in-flight Map
- Per-user chat rate limiting (20 msg/min via Redis)

### Files Changed
- `server/src/db.js` — pool size 20, connection timeout
- `server/src/redis.js` — new Redis client singleton
- `server/src/chat-api.js` — async media, polling endpoint, rate limiting
- `server/src/migrate.js` — v24_media_pending migration
- `server/src/consumption.js` — Redis threshold cache + invalidation
- `server/src/tts-api.js` — TTS dedup
- `server/src/billing.js` — threshold cache invalidation on tip
- `web/src/hooks/useChat.js` — media polling
- `web/src/components/chat/MessageBubble.jsx` — shimmer placeholder
- `web/tailwind.config.js` — shimmer animation

---

## Referral Program — DONE

Users earn configurable commission (default 30%) from payments made by people they invite. Unique referral link on Profile page, payout via PayPal/Venmo/Zelle/account credit, $100 min cashout. Admin can view referral stats in Users tab and process cashouts in dedicated Cashouts tab. Commission rate configurable in Settings.

**Files:** migrate.js (v25), auth-api.js, billing.js, referral-api.js (new), index.js, index.html, Signup.jsx, AuthContext.jsx, GoogleSignIn.jsx, Profile.jsx, admin.html, admin-api.js

---

## Priority Order (remaining)
1. ~~**Push notifications**~~ — DONE
2. ~~**Proactive messaging**~~ — DONE
3. ~~**Email notifications**~~ — DONE
4. **iOS app** — Capacitor, RevenueCat, APNs (Phase 4)

### Completed (no longer priorities)
- ~~Companion system~~ — DONE
- ~~Chat UI + OpenRouter AI~~ — DONE
- ~~Memory system~~ — DONE
- ~~Content moderation~~ — DONE
- ~~Image generation~~ — DONE
- ~~Audio~~ — DONE
- ~~PWA~~ — DONE
- ~~Referral program~~ — DONE
- ~~Async scalability~~ — DONE
- ~~Automated emails~~ — DONE

## Automated Emails — DONE
- [x] Admin notification on new registration (email/Google/Telegram) → vasilytrofimchuk@gmail.com
- [x] Abandoned payment reminder — next-day email for users who signed up but never subscribed
- [x] `email_reminders` table for dedup tracking
- [x] Hourly scheduler (setInterval) with 24-48h window query
- [x] Brand color fix: `#ec4899` → `#d6336c` in verification/reset email templates
