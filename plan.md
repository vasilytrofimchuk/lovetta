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
