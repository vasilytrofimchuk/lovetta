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

**Platform defaults:** All platforms default to 0 (strict). Configurable via admin settings.

**User override:** Users can enable explicit content in Profile → "Content Preferences" toggle. When OFF (default for all platforms), forces level 0 for both text and image regardless of admin platform setting. Stored in `user_preferences.explicit_content`.

**Feature toggles (admin):** Media generation, avatar age filter, avatar skin filter — all OFF by default for Google Ads compliance.

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

---

## Responsive Two-Size Layout — DONE

### Goal
- Add a second large-screen layout mode for both the app and landing page.
- Keep the phone-first layout under 768px.
- Use full available width on tablet/iPad widths (768px-1023px).
- Use a centered 960px shell on desktop widths (1024px+).

### Execution Plan
- Update shared app shell width behavior and responsive layout variables.
- Remove phone-only width caps from content-heavy app pages and chat surfaces while keeping auth forms narrow.
- Expand create/chat/support/welcome surfaces to use the wider tablet/desktop shell.
- Update landing page container, carousel, signup card, and feature grid for tablet and desktop widths.
- Add responsive UI assertions for tablet and desktop layouts.
- Run the UI E2E bucket after the layout pass.

### Implementation Notes
- No API, DB, or copy changes.
- Large-screen behavior is based on viewport width only, not device detection.
- Shared app shell now stays full-width through tablet and caps at 960px on desktop.
- Content-heavy app surfaces now use shared responsive gutters; auth forms remain narrow.
- Landing page now uses full-width tablet layout, a 960px centered desktop container, and wider carousel/feature spacing.
- UI coverage now includes explicit tablet and desktop responsive assertions for landing, auth, companion list, and chat.
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
- iOS App Store app (Capacitor) — IN PROGRESS

## iOS App Store App (Capacitor) — IN PROGRESS

**Status:** Code complete. Needs external setup (Apple Developer, RevenueCat, APNs creds) and Xcode configuration.

**What's done:**
- Capacitor project scaffolded (ai.lovetta.app), iOS 16.0 target
- Platform detection utility (isCapacitor/isAppStore) throughout React app
- Sign in with Apple (server JWT verification + native Capacitor plugin)
- RevenueCat in-app purchases (subscriptions + tips, webhook sync)
- Native APNs push notifications (server + client)
- UI adjustments: referral hidden, explicit content hidden, Telegram login hidden, PWA banner hidden
- Content filtering already wired server-side (appstore = level 0)

**Manual TODOs:**
- Create RevenueCat project + App Store Connect products (lovetta_monthly, lovetta_yearly, tip consumables)
- Add credentials to .env/Heroku: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY, REVENUECAT_API_KEY, REVENUECAT_WEBHOOK_SECRET
- Replace REVENUECAT_API_KEY placeholder in web/src/lib/revenuecat.js
- Enable Xcode capabilities (Sign in with Apple, Push Notifications)
- Provisioning profiles, App Store screenshots, metadata

## Support Chat — DONE

Users can contact support from the Profile page. Admins view, reply, and resolve chats in the admin Support tab.

**DB:** `support_chats` (user_id, status: open/waiting/resolved, unread_by_admin) + `support_messages` (chat_id, content, sender_type: user/admin)
**User API:** `/api/support/chat` (GET auto-create + messages), `/api/support/chat/:id/messages` (POST send, GET poll)
**Admin API:** `/api/admin/support/stats`, `/api/admin/support/chats`, `/api/admin/support/chats/:id`, reply + status
**Frontend:** `web/src/components/SupportChat.jsx` (modal, 10s poll), Profile page "Contact Support" button
**Admin:** Support tab in admin.html — filter All/Open/Waiting/Resolved, chat list + detail + reply + resolve, 30s auto-refresh, unread badge

---

## Automated Emails — DONE
- [x] Admin notification on new registration (email/Google/Telegram) → vasilytrofimchuk@gmail.com
- [x] Abandoned payment reminder — next-day email for users who signed up but never subscribed
- [x] `email_reminders` table for dedup tracking
- [x] Hourly scheduler (setInterval) with 24-48h window query
- [x] Brand color fix: `#ec4899` → `#d6336c` in verification/reset email templates

## Phase N: Universal Subscription UX + Free Message Tier + iOS Onboarding — IN PROGRESS
- Universal PlanModal component (same look as iOS Pricing page, works as popup or full-screen)
- Free user cost threshold (tip_request_threshold_free_usd, default $0.10, same logic as trial threshold)
- Post-signup plan modal for web users
- iOS WelcomeScreen (rotator + features + Continue button)
- Chat error: PlanModal overlay instead of full-page replacement
- Admin setting for free user threshold

## iOS Chat Input / Keyboard Fix — DONE
- Prevent iOS auto-zoom in chat/support text inputs by using 16px editable text size
- Replace chat/support full-screen `100vh` sizing with app-shell-driven flex heights and internal scrolling
- Remove global body safe-area bottom padding; apply bottom safe-area spacing on chat/support composer bars instead
- Add Capacitor keyboard bootstrap for iOS: `@capacitor/keyboard`, resize mode `body`, WebView scroll disabled, reset scroll after keyboard hide
- Sync iOS project after keyboard plugin/config update and verify chat/support behavior with UI tests plus manual iPhone validation
- Added explicit back-button labels in create/profile/support flows and updated UI tests to use stable exact-name selectors
- Verification complete: `npm run build:ios` and `npm run test:e2e:ui`

## iOS Bottom Background Fix — DONE
- Root app surfaces (`html`, `body`, `#root`, desktop shell) now inherit the dark app background and use the shared live viewport height instead of relying on stale `100vh`
- Capacitor iOS background color is now `#0f0a1a`, so any temporary native exposure matches the app shell instead of showing white
- Verified with `npm run build:ios` and `npm run test:e2e:ui`

## iOS Keyboard Shift Follow-up — DONE
- Compared Lovetta with the local working patterns: `auto` contributes the Capacitor Keyboard `resize: body` approach, while `frendly` confirms the `visualViewport` resize signal is the right local source for live keyboard height tracking
- Removed the experimental `useIosViewportLock` body-fix hook from chat/support because it was leaving the screen offset after keyboard focus/blur
- Added a minimal iOS keyboard bootstrap in `web/src/lib/keyboard.js` that updates `--app-viewport-height`, disables WKWebView scroll while the app is active, resets scroll on `keyboardDidHide`, and sets resize mode to `body`
- Chat and support full-screen layouts now size from `var(--app-viewport-height)` instead of raw `100vh`, while safe-area bottom spacing stays local to the composer bars instead of inflating the global document
- Synced iOS and verified with `npm run build:ios` plus `npm run test:e2e:ui`; manual device/simulator validation is still required for final acceptance

## iOS Native Chat API Routing Fix — DONE
- Trace the native chat/send path end-to-end and compare the shared API client base URL against raw `fetch()` usage in chat and voice input
- Replace native-relative `/api/...` streaming/upload calls with a shared absolute API URL helper so Capacitor requests hit the server instead of the local webview origin
- Extend the shared native fetch path with token refresh + HTTP error handling so expired auth does not look like a silent chat failure
- Verify the fix with the UI test bucket and a production build; note any remaining manual iOS push/chat validation still needed
- Verification complete: `npm run build:ios` and `npm run test:e2e:ui`
- Native chat/STT now share the same absolute API base and refresh-aware auth path; expired tokens surface a visible sign-in error instead of a silent no-response state

## iOS Global Scroll Regression Fix — DONE
- Trace the global iOS scroll lock path introduced by the keyboard bootstrap and confirm whether scrolling is being disabled at app startup
- Narrow any keyboard-related scroll locking to the keyboard-open window only so normal page scrolling works again across the app
- Rebuild iOS and rerun the UI test bucket after the keyboard helper change; manual simulator/device scrolling verification still required
- Root cause was the startup-time `Keyboard.setScroll({ isDisabled: true })` call in the iOS keyboard bootstrap, which blocked normal scrolling across the entire app
- The keyboard helper now toggles a temporary `ios-keyboard-open` document class only while the keyboard is visible, preserving normal page scrolling the rest of the time
- Verification complete: `npm run build:ios` and `npm run test:e2e:ui`

## Fix: Stop sending emails to test @example.com addresses — DONE
- Scheduler was sending real marketing emails (welcome, abandoned payment) to `@example.com` test users created by E2E tests, damaging domain sending reputation
- Added `NOT LIKE '%@example.com'` and `NOT LIKE '%@test.com'` filters to all 5 scheduler queries as safety net
- Changed all test files to use `conativer+tag@gmail.com` (Gmail plus-addressing) instead of `@example.com`
- Updated CLAUDE.md with mandatory test email rules

## iOS Welcome Carousel Parity — DONE
- Replaced the single-card fade rotator on `web/src/pages/WelcomeScreen.jsx` with a shared `WelcomeCarousel` component so the welcome page now shows a landing-style horizontal row of multiple cards.
- The new carousel mirrors the public landing behavior: it fetches `/api/companions/templates/preview`, shuffles templates once, tracks the card closest to the viewport center, scales/highlights the active card, autoplays only that card's video, and pauses auto-scroll for 5 seconds after touch or mouse interaction.
- Kept the rest of the iOS welcome page intact: logo, headline, feature list, CTA, and legal links are unchanged.
- Added `/my/welcome` UI coverage in `e2e/landing.test.js` to verify multi-card rendering, single active focus, and CTA/legal visibility.
- Verification complete: `npm -w web run build`, `npm run test:e2e:ui`, and `npm run build:ios`.

## iOS Chat Voice Button Restore — DONE
- Trace why the mic button disappears in the Capacitor iOS chat composer and compare the visibility gating against WebView media capability behavior
- Restore the left-side mic button for native iOS while keeping the actual recording capability check inside the click flow so missing APIs do not hide the control
- Add the required iOS microphone permission usage string to the native plist, then rebuild iOS and rerun the UI bucket
- Root cause was the composer hiding the mic behind a browser-style `navigator.mediaDevices` check; in Capacitor iOS that was too brittle and could remove the control entirely
- The chat composer now always renders the left-side mic button on native iOS, while the actual media API support check stays inside the click handler
- Added `NSMicrophoneUsageDescription` to `web/ios/App/App/Info.plist` so iOS can request microphone access for voice messages
- Verification complete: `npm run build:ios` and `npm run test:e2e:ui`

## iOS Welcome Carousel Motion Fix — IN PROGRESS
- Fix the welcome carousel auto-scroll so it visibly moves left on iOS instead of appearing static.
- Replace the per-frame `scrollLeft += 0.4` mutation with an accumulated scroll position ref so sub-pixel motion still advances on WebKit when the DOM property is rounded.
- Add UI coverage that asserts the welcome carousel viewport actually moves over time, not just that multiple cards render and one card is active.
- Re-run the UI bucket and rebuild the iOS bundle after the motion fix.

## iOS Native Voice Recording Fix — IN PROGRESS
- Replace the Capacitor iOS chat recorder path from browser `MediaRecorder` to a native voice recorder plugin so microphone permission is requested explicitly and audio capture is stable inside the WebView
- Keep the existing browser recording fallback for web, but route native iOS through a dedicated permission + start/stop flow with clear error handling
- Add the missing `NSMicrophoneUsageDescription` to the real iOS app plist so native permission requests do not abort the process on simulator or device
- Update STT upload handling to accept the native iOS audio MIME type/extension correctly, then rebuild iOS and rerun the UI bucket
- Current root cause confirmed locally: the synced iOS app plist was missing `NSMicrophoneUsageDescription`, which causes iOS to abort the app as soon as microphone access is requested.

## iOS Welcome Carousel Style Mixing Fix — IN PROGRESS
- Replace the pure random shuffle in the welcome carousel with style-aware interleaving so anime cards are distributed between real cards when both groups are present.
- Shuffle within each style bucket first, then merge the buckets in alternating order with real cards leading the sequence.
- Extend the welcome route UI coverage to verify the primary carousel sequence does not render adjacent anime cards for a mixed input fixture.

## Auth Button Polish — IN PROGRESS
- Normalize the login/signup auth CTAs so email sign-in, Apple, and Google buttons share the same height, corner radius, font weight, and spacing
- Keep the Apple button visually distinct but aligned with the other controls instead of looking oversized or mismatched
- Move the Apple button into the post-separator social-auth stack on login so it matches signup instead of sitting directly under the email submit button
- Verify with the UI bucket after the auth button style update

## Web Landing + Signup Flow Parity With iOS — DONE
- Replaced the public landing signup form with an iOS-style welcome layout: rotator, compact feature list, Continue CTA, and informational Free/Monthly/Yearly cards.
- Removed all public landing age/consent form logic and routed Continue directly to `/my/signup?from=landing`.
- Converted web signup to the same onboarding shape as iOS: consent + age, registration, then the full-screen plan chooser with Skip for now.
- Reused the onboarding-style plan chooser on `/my/pricing?onboarding=1`, and made onboarding mode render consistently even in test/dev where billing is forced active.
- Added shared onboarding storage so Google, Apple, and Telegram all keep age/consent data and post-auth routing aligned with the new flow.
- Updated landing, signup, and wizard UI coverage for the new landing and onboarding path, and verified with `npm run build` plus `npm run test:e2e:ui`.

## Landing Trial Emphasis — IN PROGRESS
- Increase the visual weight of the landing pricing section so the 3-day free trial is the first thing web users notice.
- Add a large trial badge / hero treatment above the informational pricing cards without changing the routing or signup flow.
- Keep the landing pricing section informational-only and preserve the existing CTA + card structure.
- Re-run the UI bucket after the landing emphasis pass.

## Web Landing Trial Timeline Removal — IN PROGRESS
- Remove the `Today / Day 3 / Day 4` trial timeline from the web landing pricing section.
- Keep the web-only trial badge and informational pricing cards intact.
- Re-run the UI bucket after the landing cleanup.

## Landing Pricing Subtitle Removal — DONE
- Removed the explanatory subtitle under the landing pricing heading on the web landing page.
- Kept the pricing header, trial badge, and pricing cards intact.
- Skipped tests because this was a copy-only removal.

## Landing Cancel Anytime Emphasis — DONE
- Replaced the small landing pricing note with a stronger `Cancel anytime` emphasis on the web landing page.
- Kept the message within the existing trial note area instead of changing the pricing card structure.
- Skipped tests because the change stayed limited to copy and presentation in the landing note.

## iPad Full-Width Shell Fix — DONE
- Replaced the desktop-frame media heuristic with an explicit `wide-tablet-shell` class on both the public landing and the React app entry HTML so iPad keeps the wide layout even when WebKit reports desktop-like pointer support.
- Updated the app shell and landing frame CSS to apply the 960px centered desktop frame only when that iPad/tablet class is absent.
- Tightened the landing UI test to verify the iPad wide-shell class, full-width `/my/welcome` shell, and wider welcome CTA on iPad landscape.
- Verified with `npm run build`, `npm run test:e2e:ui`, and `npm run build:ios` so the synced iOS bundle also includes the fix.

## Apple Sign-In Debug Removal — DONE
- Removed the temporary Apple Sign-In debug popup and verbose bridge logging from the Capacitor login flow in the shared React component.
- Kept the existing user-cancel handling and normal user-facing error messaging intact.
- Verified with `npm run build` to catch syntax regressions without running a broader UI suite.

## Apple Sign-In Cancel Error Suppression — DONE
- Treated the native Apple authorization error shown when the user backs out of the sheet as a silent cancel instead of a visible form error.
- Kept real Apple sign-in failures user-visible while widening the cancel detection for the Capacitor plugin's iOS error variants, including the `AuthorizationError error 1000` case seen on device.
- Verified with `npm run build`; no browser UI test covers the native Apple sheet path.

## iPad Signup Consent Width Fix — IN PROGRESS
- Expand the signup consent step on iPad/tablet so it no longer sits in the narrow phone-width auth wrapper while keeping login and registration forms compact.
- Add explicit UI coverage for the iPad/tablet consent-step width alongside the existing shell-width assertions.
- Implemented via a shared auth-shell pass; the targeted iPad auth assertions now pass.
- Full `npm run test:e2e:ui` reruns still hit unrelated existing timeouts in companion/chat navigation tests, so the bucket is not fully green yet.

## iPad Auth Screen Width Consistency — IN PROGRESS
- Expand all full-screen auth pages on iPad so login, signup, forgot/reset password, and verify email no longer render as phone-width cards while desktop can keep the narrower auth presentation.
- Reuse one shared auth-shell class so the iPad-specific width behavior stays consistent across these screens.
- Added shared `app-auth-shell` sizing for the auth screens while preserving the narrower desktop auth layout.
- Updated UI coverage to check iPad login and signup consent widths in a real iPad device context.
- Full `npm run test:e2e:ui` reruns still hit unrelated existing timeouts in companion/chat navigation tests, so the bucket is not fully green yet.

## Plan Modal Button Spacing — DONE
- Increase the vertical spacing between the primary CTA, restore purchases action, and skip action in the pricing/onboarding plan modal.
- Keep the existing button order, copy, and behavior unchanged.
- Increased the spacing above the button stack and between the stacked actions so the separation is larger on all resolutions.
- Verified with `npm run build`.

## Three-Type Proactive Messages — IN PROGRESS
- Changed proactive messaging from 1 message/day to 3 timezone-aware slots: morning (8–11 AM), evening (7–10 PM), random (11 AM–7 PM). No messages at night.
- Added user-configurable frequency setting (low/normal/high) in Profile page with segmented control.
- Frequency controls max messages per companion per day: low=1, normal=2, high=3.
- Added timezone capture via ip-api.com on registration and country-based backfill for existing users.
- Files: migrate.js (v36), geo.js, auth-api.js, user-api.js, proactive.js, Profile.jsx.

## Real-Device iOS Billing Test Coverage — DONE
- Log the task in `plan.md` and `PROGRESS.md` before code changes and keep both files current through completion.
- Fix RevenueCat backend parity for iOS billing: replace the broken subscription upsert path, add webhook idempotency, and add native tip-intent persistence so iOS tips can carry `companion_id`.
- Extend billing APIs with native iOS tip-intent create/poll endpoints and expose `paymentProvider` in billing status so the app can differentiate RevenueCat from Stripe.
- Update the native iOS subscription and tip flows to wait for backend sync before dismissing the paywall or tip state, and make "Manage Subscription" provider-aware inside the app.
- Add dedicated Playwright API coverage for RevenueCat webhooks and iOS tip-intent flows in the `api` bucket.
- Add an iOS `AppUITests` target for real-device navigation coverage of pricing, restore purchases, chat tip promo, companion sheet tips, and profile subscription state.
- Add a manual sandbox runbook for real-device App Store validation on production, including subscription lifecycle checks, all four tip SKUs, and cleanup guidance for test data.
- Implementation notes:
- Added `ios_tip_intents` persistence, RevenueCat webhook idempotency via `billing_events` `rc:` event ids, and explicit RevenueCat subscription update-or-insert handling.
- Extended billing APIs with `paymentProvider`, native iOS tip-intent create/poll endpoints, and native sync polling so subscription/tip UI waits for backend confirmation.
- Added `e2e/ios-billing.test.js`, `docs/ios-billing-sandbox.md`, and an iOS `AppUITests` target plus shared schemes for simulator/real-device billing entry-point coverage.
- Verification:
- `npm run test:e2e:api` passed.
- `xcodebuild build-for-testing -workspace web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO` passed.
- `xcodebuild test-without-building -workspace web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO` passed with 8 tests executed, 3 skipped because `UITEST_EMAIL` and `UITEST_PASSWORD` were not configured.

## Fix AI Hallucination — Discovery Mode — DONE
- Added temperature: 0.7 to constrain model randomness
- Lowered memory extraction threshold from 10→5 assistant messages for faster grounding
- Added discovery mode: when no memories exist, AI asks genuine questions instead of inventing details
- Applied to /message, /next, and proactive endpoints
- Added anti-hallucination baseline instruction to system prompt
- Root cause: Euryale model had no temperature set + no grounding logic for new conversations
- Files: ai.js, memory.js, chat-api.js, proactive.js

## iOS Sandbox Setup Hardening — DONE
- Log this follow-up task in `plan.md` and `PROGRESS.md` before changing files.
- Add explicit Xcode capability metadata for the `App` target so In-App Purchase shows up consistently in Signing & Capabilities alongside the existing Apple Sign-In/push setup.
- Add a Lovetta-specific step-by-step sandbox setup doc covering Xcode, Apple Developer/App Store Connect, real-device sandbox login, purchase/restore flows, and reset steps for repeated testing.
- Re-verify the iOS workspace builds after the Xcode project metadata change.
- Implementation notes:
- Added `SystemCapabilities` metadata for `com.apple.InAppPurchase`, `com.apple.Push`, and `com.apple.SignInWithApple` on the `App` target in the Xcode project so the capability state is explicit in source control.
- Added `docs/ios-sandbox-setup.md` with the exact Lovetta sandbox setup flow, including the local Xcode settings, the required Apple-side toggles, device login steps, and reset guidance.
- Verification:
- `xcodebuild build-for-testing -workspace web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO` passed after the Xcode project change.

## iOS Subscribe Tap Debugging — DONE
- Log this follow-up debugging task in `plan.md` and `PROGRESS.md` before changing files.
- Remove the stale/pending offering race from the native subscribe button by resolving the latest offering inside the tap handler itself.
- Add explicit RevenueCat subscribe logging and visible inline errors so failed native purchase starts are diagnosable on-device without relying on `alert()`.
- Re-run the relevant iOS verification after the paywall handler change.
- Implementation notes:
- Updated the paywall button to follow the working `auto` repo pattern: resolve offerings directly inside the subscribe action, log the selected package identifier before starting the native purchase, and render any failure inline in the modal.
- Hardened the RevenueCat wrapper so every purchase/read path self-checks configuration, reconfigures if startup init was skipped, and errors clearly when `VITE_REVENUECAT_IOS_KEY` is missing.
- Verification:
- `npm run test:e2e:ui` passed.
- `npm run build:ios` passed.

## iOS StoreKit Product Probe — DONE
- Log this follow-up native debugging task in `plan.md` and `PROGRESS.md` before changing files.
- Add a temporary direct StoreKit product fetch on iOS launch for the known Lovetta product IDs so device logs clearly show whether Apple can resolve the subscription and tip products outside RevenueCat.
- Rebuild the iOS app after the native debug probe is added.
- Implementation notes:
- Added a temporary DEBUG-only direct StoreKit product fetch in `AppDelegate.swift` for `lovetta_monthly`, `lovetta_yearly`, and all four tip products so Xcode logs now show whether Apple can resolve the products independently of RevenueCat.
- Verification:
- `npm run build:ios` passed after the native StoreKit debug probe was added.

## RevenueCat Apple Key Swap — DONE
- Log this follow-up configuration task in `plan.md` and `PROGRESS.md` before changing files.
- Replace the local iOS RevenueCat Test Store public key with the real Apple `appl_...` public SDK key provided by the user.
- Rebuild the iOS app so the fresh Xcode install uses the real Apple RevenueCat project instead of the Test Store.
- Implementation notes:
- Updated the local `VITE_REVENUECAT_IOS_KEY` from the RevenueCat Test Store key to the Apple `appl_...` key provided by the user.
- Verification:
- `npm run build:ios` passed after the RevenueCat Apple key swap.

## RevenueCat Apple Key Heroku Sync — DONE
- Log this follow-up deployment-config task in `plan.md` and `PROGRESS.md` before changing anything.
- Set `VITE_REVENUECAT_IOS_KEY` on the active Heroku app for this repo to the same Apple `appl_...` public SDK key used locally.
- Verify the Heroku config now holds the updated iOS RevenueCat key.
- Implementation notes:
- The repo's Heroku remote points to app `lovetta`, so the key was synced there after `lovetta-ai` returned `not_found`.
- Verification:
- `heroku config:set VITE_REVENUECAT_IOS_KEY=... -a lovetta` succeeded and restarted the app on release `v116`.
- `heroku config:get VITE_REVENUECAT_IOS_KEY -a lovetta` matched the expected Apple RevenueCat key.

## RevenueCat Local Env Source Fix — DONE
- Log this follow-up local-build configuration task in `plan.md` and `PROGRESS.md` before changing files.
- Update the tracked `web/.env` iOS RevenueCat key so local `npm run build:ios` picks up the same Apple `appl_...` key used in the root env and Heroku config.
- Remove the first-call RevenueCat configure race so app launch does not call `getCustomerInfo()` before the SDK is configured.
- Expand the temporary native StoreKit product probe to test both the `lovetta_*` subscription IDs and the bare `monthly` / `yearly` IDs RevenueCat is currently requesting.
- Rebuild iOS and verify the generated bundle no longer contains the old RevenueCat Test Store key.
- Implementation notes:
- Updated `web/.env` to the Apple `appl_...` RevenueCat key so local Capacitor/Vite builds stop embedding the stale Test Store key.
- Changed the RevenueCat Capacitor client to configure immediately on first use instead of intentionally calling `getCustomerInfo()` before configuration.
- Expanded the native StoreKit debug probe to check both `lovetta_*` IDs and bare `monthly` / `yearly` IDs so on-device logs now distinguish a code issue from an App Store Connect catalog issue.
- Verification:
- `npm run build:ios` passed.
- The synced iOS bundle in `web/ios/App/App/public/assets/` now contains the Apple `appl_...` key and no longer contains the old `test_...` key.
- `npm run test:e2e:ui` passed (`47` tests).

## Local StoreKit Config Like Auto — DONE
- Log this follow-up local iOS testing task in `plan.md` and `PROGRESS.md` before changing files.
- Add a Lovetta `.storekit` file with local subscription and tip products so Xcode runs can use StoreKit local testing like the `auto` repo.
- Attach the local StoreKit catalog to the shared `App` scheme so running from Xcode uses the local fake store instead of waiting on App Store Connect product approval.
- Update the native StoreKit debug messaging to mention the local scheme configuration path when products are unavailable.
- Rebuild iOS and verify the app scheme still builds after the local StoreKit catalog is attached.
- Implementation notes:
- Added `web/ios/App/App/Lovetta.storekit` with local Lovetta monthly/yearly subscriptions plus all four tip consumables, including the 3-day free-trial metadata for subscriptions.
- Attached `Lovetta.storekit` to the shared `App` launch scheme so local Xcode runs now use the same StoreKit local-testing pattern as the `auto` repo.
- Added the `Lovetta.storekit` file reference and resource build entry to `project.pbxproj`, matching the `auto` repo setup so Xcode no longer shows the StoreKit catalog in red.
- Updated the temporary native StoreKit probe copy so it points at the scheme-level StoreKit config first when products are unavailable during local runs.
- Verification:
- `python3 -m json.tool web/ios/App/App/Lovetta.storekit` passed.
- `npm run build:ios` passed after adding the StoreKit catalog.
- `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.

## RevenueCat Offerings Race Fix — DONE
- Log this follow-up iOS billing bugfix in `plan.md` and `PROGRESS.md` before changing files.
- Compare Lovetta against the working `auto` RevenueCat startup flow and remove the duplicate-configure race between app auth initialization and paywall offering preload.
- Fix the Lovetta RevenueCat offerings wrapper to handle the actual Capacitor response shape returned by `Purchases.getOfferings()`.
- Re-run the relevant frontend/iOS verification after the RevenueCat wrapper changes.
- Implementation notes:
- Added an in-flight configure promise in the RevenueCat wrapper so auth initialization and paywall preload no longer race each other into duplicate `Purchases.configure()` calls.
- Fixed `getOfferings()` to unwrap the actual Capacitor response shape (`{ current, all }`) instead of assuming a nested `{ offerings }` object, with a fallback to `all.default`.
- These were the remaining material code differences from `auto` after the local StoreKit scheme setup was matched.
- Verification:
- `npm run build:ios` passed after the RevenueCat wrapper fix.
- `npm run test:e2e:ui` passed (`47` tests).

## Final iOS Billing Fix via Auto-Style Direct Products — DONE
- Log this final iOS subscription fix in `plan.md` and `PROGRESS.md` before changing files.
- Replace the iOS subscription purchase path with exact `lovetta_monthly` / `lovetta_yearly` product fetches plus `purchaseStoreProduct`, matching the working `auto` repo pattern.
- Move native RevenueCat startup into a single top-level initializer so auth bootstrap and paywall preload cannot race into duplicate configure/login calls.
- Improve native billing diagnostics by logging exact fetched product IDs, selected purchase IDs, and serialized RevenueCat/Capacitor errors.
- Re-run the relevant frontend and iOS verification after the direct-product subscription path is in place.
- Implementation notes:
- Refactored `web/src/lib/revenuecat.js` to use plugin-truth initialization (`Purchases.isConfigured()` + `getAppUserID()`), a single in-flight configure guard, direct subscription product fetches for `lovetta_monthly` / `lovetta_yearly`, and structured native error serialization.
- Replaced the iOS paywall path in `web/src/components/PlanModal.jsx` so preload and subscribe both use direct store products instead of RevenueCat offerings/packages, with improved inline error copy for both local StoreKit and real Apple sandbox modes.
- Moved native RevenueCat startup into a single top-level initializer in `web/src/App.jsx` and removed the duplicate auth-context side effect from `web/src/contexts/AuthContext.jsx`.
- Verification:
- `npm run build:ios` passed.
- `npm run test:e2e:ui` passed (`47` tests).
- `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.

## iOS Subscription Timeout Root-Cause Fix — IN PROGRESS
- Log this follow-up iOS billing timeout fix in `plan.md` and `PROGRESS.md` before changing files.
- Remove the user-facing dependency on `Purchases.getProducts()` for fixed subscription SKUs, since the iOS Capacitor plugin purchase path only requires the product identifier.
- Configure RevenueCat with the authenticated `appUserID` at startup when available, avoiding the anonymous-user bootstrap plus immediate `logIn()` roundtrip seen in device logs.
- Keep logging around direct subscription purchase IDs and error serialization, then re-run the relevant frontend and iOS verification.
- Implementation notes:
- The device logs showed the purchase flow hanging before `purchaseStoreProduct`, immediately after a second `setLogLevel` call. That pointed to the wrapper waiting on an in-flight configure promise even though the native SDK was already configured.
- Updated the subscription path to stop preloading/fetching products for fixed SKUs and instead call `purchaseStoreProduct` directly with `{ identifier: 'lovetta_monthly' | 'lovetta_yearly' }`, matching what the iOS plugin actually reads at runtime.
- Updated RevenueCat startup to pass `appUserID` directly into the first `configure(...)` call when available, and changed `ensureConfigured()` to trust the plugin's current `isConfigured()` state before falling back to any pending configure promise.
- Verification:
- `npm run build:ios` passed after the stale-configure bypass and direct identifier purchase path.
- `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.
- `npm run test:e2e:ui` was rerun twice, but both runs failed on unrelated flaky navigation/signup waits in `wizard-nav.test.js` / `companion-chat.test.js`, not in billing code.

## iOS RevenueCat Init Serialization Fix — DONE
- Log this follow-up iOS purchase-stall fix in `plan.md` and `PROGRESS.md` before changing files.
- Compare the current Lovetta RevenueCat init flow against the `auto` repo and remove the remaining purchase-time race with `getAppUserID` / `logIn`.
- Serialize RevenueCat startup behind a single ready promise, cache the Capacitor Purchases client, and make subscription/tip/restore calls wait for init completion instead of running concurrently with it.
- Remove the unnecessary plugin `getAppUserID()` read during the normal authenticated startup path and rely on session-local user tracking, matching `auto` more closely.
- Add narrow boundary logs around the direct subscription purchase call, then re-run the relevant frontend and iOS verification.
- Implementation notes:
- Cached the Capacitor `Purchases` client and debug log-level setup so the iOS wrapper no longer re-imports and reconfigures the bridge on every billing call.
- Added a shared RevenueCat init promise that serializes authenticated startup, removes the purchase-time `getAppUserID()` lookup, and tracks the active app user locally for the current app session.
- Updated all iOS billing entry points (`purchaseSubscriptionProductById`, tips, restore, customer info, offering diagnostics) to wait for the shared ready promise instead of racing init.
- Added direct boundary logs around `purchaseStoreProduct` so the next device run will clearly show whether the native purchase call is invoked, submitted to the Capacitor bridge, and resolved.
- Verification:
- `npm run build:ios` passed.
- `npm run test:e2e:ui` passed (`47` tests).
- `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.

## iOS Profile App Icon Picker — DONE
- Log this iOS personalization task in `plan.md` and `PROGRESS.md` before changing files.
- Add an iOS-only `App Icon` section in Profile with three device-local choices: `Black`, `Ivory`, and `Silver`.
- Replace the primary iOS app icon with the neutral `Black` simple-`L` icon and add `Ivory` / `Silver` alternate icon sets in the iOS asset catalog.
- Extend the logo export pipeline so the neutral iOS icon sets and Profile preview PNGs can be regenerated from the shared brand editor.
- Add a small native Capacitor bridge for `getCurrentIcon()` / `setIcon()` and wire the React Profile screen to it on iOS only.
- Re-run the relevant frontend and iOS verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Added neutral `neutral_black`, `neutral_ivory`, and `neutral_silver` presets to the shared logo editor and extended `scripts/export_logos.js` so one command now regenerates the primary black iOS icon set, the two alternate icon sets, and the iOS Profile preview PNGs under `web/public/assets/app-icons/ios/`.
- Replaced the primary `AppIcon` catalog output with the black simple-`L` variant, added `AppIconIvory` and `AppIconSilver`, and removed the stale unassigned `AppIcon-512@2x.png` file that was generating asset-catalog warnings.
- Added a local Capacitor bridge in `web/ios/App/App/AppIconPlugin.swift`, wired it into the Xcode target, and enabled alternate icon names in `project.pbxproj`.
- Added `web/src/lib/app-icon.js` plus an iOS-only `App Icon` section in `web/src/pages/Profile.jsx` that reads the current native icon, lets the user switch between `Black`, `Ivory`, and `Silver`, and keeps the choice device-local.
- Added a web regression assertion in `e2e/companion-chat.test.js` so the `App Icon` section must stay hidden outside iOS.
- Verification:
- `node scripts/export_logos.js` passed after the neutral icon pipeline changes.
- `npm run build:ios` passed.
- `npm run build` passed.
- `npm run test:e2e:ui` passed (`47` tests). The earlier failed run was a setup flake that rendered `App not built yet`; rerunning after a clean web build produced a full pass.
- `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed after the final asset-catalog cleanup.

## iOS App Icon Variant Refresh — DONE
- Log this icon-variant follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Change the iOS icon picker from `Black` / `Ivory` / `Silver` to `Default` / `Black` / one new non-feminine colored option.
- Restore the primary `AppIcon` set to the original brand-default icon so it represents the default app look again.
- Remove the `Ivory` option and replace `Silver` with a simpler-font alternate `L` in a different color.
- Regenerate the icon asset catalogs, preview PNGs, native icon mappings, and Profile labels to match the new three-option set.
- Re-run the relevant frontend and iOS verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Restored the primary `AppIcon` output to the original Lovetta brand icon and changed the iOS picker to `Default`, `Black`, and `Blue`.
- Removed the `Ivory` and `Silver` variants from the export pipeline, preview assets, native mappings, and Xcode alternate-icon configuration.
- Reworked the two alternates as simpler, less feminine `L` marks using `Arial` bold, with dark `Black` and colored `Blue` backgrounds.
- Updated `scripts/logo_editor.html` and `scripts/export_logos.js` so the shared asset pipeline now regenerates `AppIcon`, `AppIconBlack`, `AppIconBlue`, plus `default.png`, `black.png`, and `blue.png` preview images.
- Updated the iOS bridge and Profile screen so `default` maps to the primary icon, while `black` and `blue` map to the two alternates device-locally.
- Verification:
- `node scripts/export_logos.js` passed.
- `npm run build:ios` passed.
- `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.
- `npm run test:e2e:ui` passed (`47` tests).

## Simplify iOS Billing to Auto-Style Direct Plugin Calls — DONE
- Log this direct-plugin iOS billing follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Remove the custom RevenueCat wrapper from the iOS purchase critical path and match the working `auto` repo pattern: direct Capacitor `Purchases` calls in the app shell, paywall, restore flow, and tip flow.
- Keep RevenueCat in the overall system because Lovetta’s server still depends on RevenueCat webhooks for subscription and tip reconciliation; only the client-side orchestration changes.
- Update app startup to configure RevenueCat directly once in the shell, then log in the authenticated user directly with the plugin.
- Update the paywall to fetch `lovetta_monthly` / `lovetta_yearly` products directly, show immediate zero-product errors, and purchase via `Purchases.purchaseStoreProduct({ product })`.
- Update the tip checkout helper and both tip entry points to use direct product fetch plus `purchaseStoreProduct({ product })`, while preserving the existing iOS tip-intent backend flow.
- Trim `web/src/lib/revenuecat.js` down to stateless helpers only: fixed product ID constants, error serialization/cancel detection, and backend sync polling.
- Re-run the relevant frontend and iOS verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Moved RevenueCat ownership fully into the app shell so `web/src/App.jsx` performs the one-time native `Purchases.configure({ apiKey })` call and logs in the current authenticated user directly.
- Removed the remaining purchase-path bootstrap from `web/src/components/PlanModal.jsx` and `web/src/lib/tipCheckout.js`, leaving the paywall and tip flow as direct `getProducts()` / `purchaseStoreProduct()` / `restorePurchases()` callers plus backend sync polling.
- Kept `web/src/lib/revenuecat.js` stateless-only with fixed iOS product IDs, RevenueCat error helpers, and backend polling helpers for subscription/tip reconciliation.
- Verification:
- `npm run build:ios` passed.
- `npm run test:e2e:ui` passed (`47` tests).
- `xcodebuild -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed from `web/ios/App`.

## iOS App Icon Variant Correction — DONE
- Log this icon-correction follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Keep `Default` as the original Lovetta icon, change `Black` to the same Lovetta script style in black, and make `Silver` the only simple icon variant.
- Remove the temporary `Blue` variant from the export pipeline, preview assets, native mappings, and Xcode alternate-icon configuration.
- Regenerate the iOS icon asset catalogs and Profile preview PNGs, then re-run the relevant frontend and iOS verification.
- Update `plan.md` and `PROGRESS.md` with the final corrected icon set and verification notes.
- Implementation notes:
- Kept `Default` as the original hot-pink Lovetta icon, changed `Black` to the same script-style `L` on a black background, and made `Silver` the only simple block-`L` variant.
- Replaced the temporary `Blue` variant with `Silver` across the shared asset pipeline, preview images, native Capacitor mapping, and Xcode alternate-icon configuration.
- Regenerated the shipped iOS assets so the catalog now contains `AppIcon`, `AppIconBlack`, and `AppIconSilver`, with matching Profile previews `default.png`, `black.png`, and `silver.png`.
- Verification:
- `node scripts/export_logos.js` passed.
- `npm run build:ios` passed.
- `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.
- `npm run test:e2e:ui` passed (`47` tests).

## iOS App Icon Selected Badge Layout — DONE
- Log this iOS icon-picker layout follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Fix the selected-state layout in the Profile app-icon tiles so the `Selected` badge does not collide with the icon label on narrow iPhone widths.
- Keep the existing icon choices and native behavior unchanged; only adjust the Profile tile layout and status badge styling.
- Re-run the relevant frontend verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Changed the app-icon tile footer from a one-line label/status row to a stacked label plus badge pill so `Selected` no longer collides with the icon name on narrow iPhone widths.
- Verification:
- `npm run test:e2e:ui` passed (`47` tests).

## Profile Page App Icon Crash Guard — DONE
- Log this Profile crash follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Remove the eager native app-icon lookup from Profile page load so the page can render even if the iOS app-icon plugin is missing or unstable on a device build.
- Make the app-icon picker fail closed: render it only when the native plugin is available, persist the last chosen icon locally for UI state, and keep the rest of Profile usable if app-icon integration is unavailable.
- Re-run the relevant frontend verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Removed the eager `getCurrentIcon()` native call from Profile page load and switched the picker to local fallback state backed by `localStorage`.
- Guarded the picker behind `Capacitor.isPluginAvailable('AppIcon')` and delayed `registerPlugin('AppIcon')` usage until a user action or explicit helper call, so Profile can render even when the native plugin path is unavailable.
- Verification:
- `npm run build:ios` passed.
- `npm run test:e2e:ui` passed (`47` tests).

## Restore iOS App Icon Picker Visibility — DONE
- Log this follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Remove the overly strict runtime visibility gate so the app-icon picker shows on iOS again.
- Keep the crash guard that removed the eager native app-icon lookup from Profile page load.
- Re-run the relevant frontend verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Removed the `Capacitor.isPluginAvailable('AppIcon')` render gate, which was hiding the picker for this local native plugin even though the bridge still exists when invoked from iOS.
- Kept the safer Profile-load behavior: no eager native app-icon lookup on mount, local fallback state for the selected option, and native calls only when the user taps an icon tile.
- Verification:
- `npm run test:e2e:ui` passed (`47` tests).

## Restore App Icon Placement In Profile — IN PROGRESS
- Log this follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Move the Apple relay `RealEmailPrompt` lower in the Profile screen so the iOS app-icon picker stays near the top, in the same area users expect.
- Keep the existing app-icon behavior unchanged; this is a placement fix only.
- Re-run the relevant frontend verification, then update `plan.md` and `PROGRESS.md` with final notes.

## Payment Restructure Completion — DONE
- Check the current working-tree iOS billing code directly instead of relying on stale checklist state from the interrupted run.
- Remove the remaining RevenueCat `configure()` / `logIn()` calls from the iOS paywall subscribe/restore handlers so the purchase path relies on the app-shell initializer only.
- Remove the remaining RevenueCat `configure()` / `logIn()` calls from the iOS tip checkout flow while keeping the fixed product fetch, `purchaseStoreProduct()`, and backend tip-intent sync flow intact.
- Keep `web/src/lib/revenuecat.js` limited to stateless product IDs, error helpers, and backend sync polling helpers.
- Re-run `npm run build:ios`, `npm run test:e2e:ui`, and `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`, then update `plan.md` and `PROGRESS.md` with final notes.
- Clarified `AGENTS.md` so non-destructive escalated local build/test prompts are explicitly treated as default-Yes too.
- Verification:
- `npm run build:ios` passed.
- `npm run test:e2e:ui` passed (`47` tests).
- `xcodebuild -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed from `web/ios/App`.

## Apple Private Relay Email Handling — IN PROGRESS
- Detect and classify Apple relay/synthetic emails at sign-in time (email_type column)
- Add email_disabled flag for bounce handling via Resend outbound webhooks
- Exclude synthetic and disabled emails from all scheduler and proactive email sends
- Add /api/email-events bounce webhook endpoint
- Add /api/user/real-email endpoint for relay/synthetic users to provide their real email
- Add RealEmailPrompt component on Profile page for relay/synthetic users
- Files: migrate.js, auth-api.js, user-api.js, scheduler.js, proactive.js, index.js, RealEmailPrompt.jsx, Profile.jsx

## Global Permission Preference Instruction — DONE
- Log this instruction-only task in `plan.md` and `PROGRESS.md` before editing any instruction files.
- Update the repo-local `AGENTS.md` operator-preference section so it explicitly says to skip pre-confirmation chat and treat permission/escalation prompts as default-Yes.
- Populate the global Codex instruction file at `/Users/vasily/.codex/AGENTS.md` with the same default-Yes operator preference so future sessions inherit it when supported.
- Skip tests because this task changes instructions only, not app behavior.
- Update `plan.md` and `PROGRESS.md` with final status and implementation notes after the instruction files are updated.
- Implementation notes:
- Added two explicit operator-preference bullets to the repo-local `AGENTS.md` so Codex should send required approval requests directly and keep default-Yes handling for non-destructive local tooling.
- Populated `/Users/vasily/.codex/AGENTS.md` with a global operator-preference block that mirrors the same behavior for future sessions when the app loads that file.
- Verification:
- No tests run because this task only updates instruction files and does not change runtime behavior.

## Restore App Icon Placement In Profile — DONE
- Log this follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Move the Apple relay `RealEmailPrompt` lower in the Profile screen so the iOS app-icon picker stays near the top, in the same area users expect.
- Keep the existing app-icon behavior unchanged; this is a placement fix only.
- Re-run the relevant frontend verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Moved `RealEmailPrompt` below the app-icon section so the icon picker stays directly under the user card again, matching the earlier Profile layout.
- Verification:
- `npm run test:e2e:ui` passed (`47` tests).

## Restore App Icon Picker Runtime Wiring — IN PROGRESS
- Log this follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Register the local `AppIconPlugin` with Capacitor’s native bridge so the iOS app-icon picker has a real runtime plugin behind it.
- Replace the fragile `isIOS()` render gate with a more reliable native-iPhone detection path so the icon section still appears in the shipped iOS build.
- Re-run the relevant iOS and frontend verification, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Added `/web/ios/App/App/AppViewController.swift` as a `CAPBridgeViewController` subclass and registered `AppIconPlugin()` in `capacitorDidLoad()`, then pointed `Main.storyboard` at that custom bridge controller.
- Hardened platform detection so the Profile page treats native iOS correctly even if `isNativePlatform()` is not the signal that wins at runtime; the app-icon section now relies on a more reliable native-iOS check.
- Restored the current-icon load on Profile mount now that the plugin is actually registered, while keeping the selected icon cached locally and the updated badge layout in place.
- Verification:
- `npm run build:ios` passed.
- `xcodebuild -workspace /Users/vasily/projects/lovetta/web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.
- `npm run test:e2e:ui` passed (`47` tests) after one rerun to clear an unrelated flaky companion-creation timeout.

## iOS Tip Thank-You Sync Fix — DONE
- Log this follow-up in `plan.md` and `PROGRESS.md` before changing files.
- Keep the existing thank-you message generation path unchanged, but make the private iOS tip-intent status API expose a `thankYouReady` signal that stays false until the companion thank-you message is actually visible in chat.
- For companion-bound iOS tips, compute `thankYouReady` from the presence of a new assistant message in the matching conversation at or after the tip intent completion timestamp; for non-companion tips, mark `thankYouReady` true immediately once the intent is completed.
- Update the iOS RevenueCat tip poller so `startTipCheckout()` does not resolve until both tip persistence and thank-you visibility are ready, keeping the existing `onTipSuccess={loadChat}` wiring unchanged for the chat promo and companion sheet.
- Extend API billing coverage for the companion-bound and non-companion iOS tip cases, add Stripe webhook coverage for the web thank-you path, then run `npm run test:e2e:api`, `npm run test:e2e:ui`, and `npm run build:ios` before updating `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- Added `isIosTipThankYouReady()` in `server/src/billing.js` so companion-bound iOS tip intents only report ready after the matching conversation has a new assistant thank-you message created at or after `completed_at`, while non-companion intents flip ready immediately once completed.
- Extended `GET /api/billing/ios/tip-intents/:id` in `server/src/billing-api.js` to return `thankYouReady`, and updated the client poller in `web/src/lib/revenuecat.js` to wait for that signal before resolving iOS tip success.
- Added API coverage in `e2e/ios-billing.test.js` for companion-bound and non-companion iOS tip readiness plus the web Stripe companion-tip webhook path that inserts the assistant thank-you message.
- Verification:
- `npm run test:e2e:api` passed (`28` tests).
- `npm run test:e2e:ui` passed (`47` tests).
- `npm run build:ios` passed.

## Remove App Icon Helper Copy — DONE
- Log this small Profile copy cleanup in `plan.md` and `PROGRESS.md` before changing files.
- Remove the `Saved on this iPhone only.` helper line from the iOS app-icon card in Profile.
- Skip tests because this is a copy-only UI change.
- Implementation notes:
- Removed the helper/status line below the app-icon choices in `Profile.jsx`, including the transient `Updating icon...` text that shared the same slot.
- Verification:
- No tests run because this was a copy-only UI change.

## iOS Keyboard Offset Refactor — DONE
- Log this follow-up in `plan.md` and `PROGRESS.md` before changing code.
- Keep `KeyboardResize.None`, but stop shrinking `--app-viewport-height` while the keyboard is visible.
- Refactor `web/src/lib/keyboard.js` to keep a stable app viewport height plus a separate `--app-keyboard-offset` CSS var derived from `keyboardHeight - safeAreaBottom`.
- Apply the shared bottom-offset pattern to chat, support, and add-email so the header stays anchored while the composer lifts above the keyboard.
- Add stable labels needed for iOS UI coverage, then extend the native UI test suite to verify header position + input visibility through focus/blur on all three surfaces.
- Re-run `npm run test:e2e:ui` and `npm run build:ios`, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- `web/src/lib/keyboard.js` now keeps `--app-viewport-height` stable, measures the iPhone bottom safe area with a hidden env-backed probe, and applies only `--app-keyboard-offset = keyboardHeight - safeAreaBottom` while the keyboard is visible.
- The helper now toggles both the temporary DOM scroll lock and native `Keyboard.setScroll({ isDisabled: true })` only during the active keyboard session, then fully clears the offset and scroll lock on hide.
- Chat, support, and add-email no longer resize the whole page for keyboard avoidance; each page keeps a stable height and lifts only the bottom composer/form padding with `var(--app-keyboard-offset)`.
- Added accessibility labels needed for native iOS keyboard regression coverage, including chat/support/add-email inputs and the relevant back buttons.
- Extended `web/ios/App/AppUITests/AppUITests.swift` with native checks for chat and support plus relay-account coverage for add-email when `UITEST_RELAY_EMAIL` / `UITEST_RELAY_PASSWORD` are configured.
- Verification:
- `npm run test:e2e:ui` passed (`47` tests).
- `npm run build:ios` passed.
- `xcodebuild -workspace /Users/vasily/projects/lovetta/web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.
- Manual real-iPhone verification is still pending for the exact focus/blur behavior on chat, support, and add-email.

## iOS Companion List Overscroll Clamp — DONE
- Log this small follow-up in `plan.md` and `PROGRESS.md` before changing code.
- Keep the recent keyboard changes intact; only fix the companion-list root layout so the page cannot be dragged down slightly on iPhone.
- Replace the raw `min-h-screen` list shell with the same safe-area-adjusted viewport sizing used on the keyboard-fixed pages, and keep scrolling inside the page content instead of the outer document.
- Re-run the relevant UI and iOS build verification, then commit only the task-related files without including unrelated server/admin work already present in the tree.
- Implementation notes:
- `web/src/pages/CompanionList.jsx` now uses a safe-area-adjusted fixed-height shell on Capacitor iOS instead of raw `min-h-screen`, matching the chat/support/add-email layout model.
- The companion list content now scrolls inside a `flex-1 min-h-0 overflow-y-auto` region, while the outer page is `overflow-hidden`, which removes the small downward drag on short lists.
- Verification:
- `npm run test:e2e:ui` passed (`47` tests).
- `npm run build:ios` passed.

## Global iOS Pull-Down Clamp — DONE
- Log this broader follow-up in `plan.md` and `PROGRESS.md` before changing code.
- Keep the recent keyboard-offset behavior intact; this task only removes the remaining document-level pull-down/rubber-band on native iPhone screens.
- Add a shared native iOS shell class in `web/src/App.jsx` / `web/src/index.css` so `html`, `body`, `#root`, and the desktop shell are clamped to `var(--app-viewport-height)` with `overflow: hidden`.
- Add one shared page-height helper in `web/src/lib/layout.js`, then convert the remaining routed full-screen pages away from raw `min-h-screen` so each page owns its own inner scroll region instead of relying on document scroll.
- Apply the fixed-height shell pattern to auth/onboarding/loading, Profile, CompanionCreate, Pricing, and `PlanModal` full-screen mode while keeping Chat, Support, Add Email, and Companion List aligned with the same helper.
- Extend UI coverage for the shared shell contract and native `AppUITests` coverage for pull-down regression behavior on one public screen and one protected screen.
- Re-run `npm run test:e2e:ui`, `npm run build:ios`, and `xcodebuild -workspace /Users/vasily/projects/lovetta/web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`, then update `plan.md` and `PROGRESS.md` with final notes.
- Implementation notes:
- The companion-list-only fix was incomplete because the native document shell itself still had room to move; clamping only one routed page did not stop pull-down on the rest of the app.
- `web/src/App.jsx` now toggles a dedicated `ios-native-shell` class, while `web/src/index.css` clamps `html`, `body`, `#root`, and the app shell to `var(--app-viewport-height)` with `overflow: hidden`.
- Added `web/src/lib/layout.js` so routed full-screen screens share one `getAppPageHeight()` contract instead of repeating ad hoc `min-h-screen` or inline viewport math.
- Auth, onboarding, pricing, profile, create, welcome, and the loading state now use fixed-height shells with inner `app-scroll-region` containers; existing chat/support/add-email/list pages were aligned with the same helper without changing keyboard-offset behavior.
- `PlanModal` full-screen mode now uses the same fixed-height shell, and UI/native regression coverage was extended for both the shared shell contract and non-keyboard pull-down behavior.
- Verification:
- `npm run test:e2e:ui` passed (`48` tests).
- `npm run build:ios` passed.
- `xcodebuild -workspace /Users/vasily/projects/lovetta/web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build` passed.
- Manual real-iPhone verification is still pending for the actual pull-down gesture across welcome, auth, list, profile, create, pricing, chat, support, and add-email.

## Show Actions Toggle — DONE
- New `show_actions` preference (default `true`) in `user_preferences` table.
- When disabled: AI is prompted not to use `*actions*`, and server strips any that slip through.
- Scenes are also suppressed when actions are off.
- Toggle in Profile > Content Preferences.
- Affects chat, opener, media-request, and proactive message routes.

## RevenueCat Offerings Refactor — IN PROGRESS
- Switch iOS IAP from hardcoded product IDs (`getProducts`) to RevenueCat Offerings API (`getOfferings`).
- Enables RevenueCat Experiments (A/B pricing tests), localized prices, dashboard-controlled products.
- Prerequisite: configure default offering in RevenueCat dashboard (subs only — tips use getProducts fallback).
- Client-side only — no server changes needed (webhook handler already generic).
- Files: `revenuecat.js`, `PlanModal.jsx`, `tipCheckout.js`, `TipPromoMessage.jsx`, `CompanionSheet.jsx`.
- Fallback: if offerings API fails, falls back to existing `getProducts` flow with hardcoded prices.
