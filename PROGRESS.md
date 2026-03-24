# Lovetta — Progress

> Completed work is in the [Archive](#archive) section below.

## Apple App Review Fixes — v1.0 Resubmission
- [x] Update StoreKit tip descriptions (remove "AI girlfriend" → "support your chat")
- [x] Update Info.plist microphone usage (remove "girlfriend")
- [x] Add `DELETE /api/auth/account` endpoint (user-facing soft delete)
- [x] Add delete account UI to Profile page with confirmation modal
- [x] Add `deleteAccount()` to AuthContext
- [x] Run `npm run build:ios` for native changes
- [x] All 28 API tests pass
- [x] All 48 UI tests pass
- [ ] Manual: Update ASC description ("no limits" → "when it's personal")
- [ ] Manual: Add IAP review notes to App Store Connect
- [ ] Manual: Record account deletion screen recording for Apple
- [ ] Manual: Resubmit to App Review

## Update Template Ages to 18-25
- [x] Update all 12 realistic template ages (18-25, skewing toward 18)
- [x] Update all 6 anime template ages (18-22, skewing toward 18)
- [x] Add v45 migration to update ages in prod DB
- [x] Update AI prompt age references from "20+" to "18+"
- [x] Update age-guard regeneration prompt from "22" to "18"
- [x] Update default age from 22 to 18 (schema, companion-api, frontend)
- [x] Fix test assertion for new age rule text
- [x] All 97 AI tests pass

## Ad Banner Editor
- [x] Create `scripts/ads_editor.html` — canvas-based ad banner editor
- [x] 5 standard IAB sizes: 300×250, 336×280, 728×90, 160×600, 320×50
- [x] Girl card images cropped from App Store gallery screenshot
- [x] Image modes: single / 2 girls / 3 girls (fan) / 4 girls (grid)
- [x] Girl selection dropdowns (Lily, Zara, Emma, Rei)
- [x] Adaptive layout per aspect ratio (square, wide, tall, ultrawide)
- [x] Headline text with glow/shadow effects
- [x] CTA button with customizable text/color/radius
- [x] Logo overlay with position control
- [x] 5 presets (dark_brand, gradient_pink, minimal, neon, elegant)
- [x] PNG export per size or all at once (2x retina)

## All Payments Table in Economics Tab
- [x] Add `GET /api/admin/payments` paginated endpoint (tips + subscriptions union, period filter)
- [x] Add "All Payments" HTML section in Economics tab
- [x] Add `loadPayments()` JS with table rendering + pagination
- [x] Wire into `loadEconomics()` — auto-loads when Economics tab opens

## Image Dedup + Tip Reward Images
- [x] Fix `findReusableMedia` in media-chat.js — exclude images user already has in chat (per-user dedup)
- [x] Add reward image constants: 20 scene prompts, 8 flirty captions, image count mapping ($10→1, $20→2, $50→3, $100→4)
- [x] Implement `generateTipRewardImages` in billing.js — reuses unseen catalog images, generates new for rest
- [x] Extend `insertTipThankYou` to accept amountCents and trigger reward images
- [x] Update Stripe + RevenueCat webhook call sites to pass tip amount
- [x] Run `npm run test:e2e:api` — 28/28 passed
- [x] Run `npm run test:e2e:ai` — 97/97 passed

## Memory System Improvements
- [x] Add v42 migration: `last_extracted_message_id` column on conversations
- [x] Track last extracted message — no user message ever skipped between extractions
- [x] Filter to `role='user'` only in extraction input — skip assistant fluff
- [x] Chunk-based extraction: process messages in batches of 10 (3 chunks max)
- [x] Hybrid extraction: regex patterns (deterministic) + AI chunks (contextual)
- [x] Regex catches: name, age, birthday, location, job, pets, family, food, music, hobbies, allergies, coffee, learning, friends, night owl, cooking, dog breeds
- [x] Pass companion name to AI to prevent user/companion confusion
- [x] Fallback JSON parser for malformed model output
- [x] Replace per-category cap (5) with global cap (30 total facts)
- [x] Increase MAX_MEMORY_CHARS from 2000 to 3000 (~750 tokens)
- [x] Lower extraction threshold: 5 → 3 messages
- [x] Summary: skip template first message, focus on user details
- [x] Run tests: 97/97 AI, 28/28 API passed
- [x] Production test: 30 facts / 94% coverage (was 4 facts / 27%), all recall tests pass
- [x] Add configurable memory_extraction_model setting (default: gemini-2.0-flash-001)
- [x] Memory Model badge in admin Settings tab (editable like Primary/Fallback models)
- [x] Fix fact dedup: use subject+topic key instead of generic "user" key
- [x] Regex runs AFTER AI so deterministic facts override AI hallucinations
- [x] Add zodiac, book, coffee regex patterns
- [x] Benchmark 8 models: all scored 8/8 on 5-message test. Qwen3-235b cheapest at $0.00002/call
- [x] Switch to qwen/qwen3-235b-a22b-2507 — 3x cheaper than Gemini Flash, same quality
- [x] Final production test: 30 facts / 88% coverage at lowest cost

## Admin Chart: 1-Minute Bars (GA Realtime Style)
- [x] Backend: snapshot interval from 5 min to 1 min (scheduler.js)
- [x] Frontend: GA-style bars (full-width, no gaps, 100px height)
- [x] Frontend: 30 bars at 1-min intervals, "now" on right axis
- [x] Run `npm run test:e2e:ui` — 48/48 passed

## Fix iOS users not showing in admin stats chart
- [x] Update `updateActivity()` in auth-middleware.js to also update `user_agent` on each API call
- [x] Run `npm run test:e2e:api` — 28/28 passed
- [x] Fix online chart: show only last 30 min (not 24h), use users_online instead of visitors_online
- [x] Add web/ios breakdown and visitors count to summary cards
- [x] Run `npm run test:e2e:ui` — 48/48 passed
- [x] Add VisitorTracker component in App.jsx — tracks anonymous users in React app (pre-signup)
- [x] Run `npm run test:e2e:ui` — 48/48 passed (1 flaky retry)

## Show Actions Toggle in Profile Settings
- [x] Add `v39_show_actions_pref` migration — `show_actions BOOLEAN DEFAULT true` on `user_preferences`
- [x] Add `show_actions` to GET/PUT `/api/user/preferences` in `user-api.js`
- [x] Add `actionsEnabled` option to `buildCompanionSystemPrompt()` — prompt instructs AI to skip actions when disabled
- [x] Add server-side strip in all 3 chat routes — remove `*actions*`, `contextText`, `sceneText` after AI generation
- [x] Add `actionsEnabled` to `buildProactivePrompt()` + server-side strip in proactive.js
- [x] Add "Actions in messages" toggle in Profile.jsx Content Preferences section
- [ ] Run `npm run test:e2e:api`
- [ ] Run `npm run test:e2e:ui`

## RevenueCat Offerings Refactor
- [x] Add `getSubscriptionOfferings()` and `getTipOfferings()` to `revenuecat.js` with module-level caching
- [x] Add `FALLBACK_SUBSCRIPTION_PRICES` and `FALLBACK_TIP_AMOUNTS` constants for offline fallback
- [x] Refactor `PlanModal.jsx` — dynamic prices from offerings, `purchasePackage` instead of `purchaseStoreProduct`
- [x] Refactor `tipCheckout.js` — offerings-based purchase with `getProducts` fallback
- [x] Add `getTipAmountsWithPrices()` helper for localized tip price display
- [x] Update `TipPromoMessage.jsx` — localized `priceString` from offerings
- [x] Update `CompanionSheet.jsx` — localized `priceString` from offerings
- [x] Configure default offering in RevenueCat dashboard (subs only — tips use getProducts fallback)
- [x] Test on iOS device with StoreKit sandbox — both subs and tips use offerings path
- [ ] Verify experiments work end-to-end

## Admin Page Improvements
- [x] Breakdown tables in 4 columns layout
- [x] Tab badges smaller + compact tab padding
- [x] Online Now card — API: visitors + users (web/ios) with 5min window
- [x] Online Now card — frontend rendering with platform sub-text
- [x] Online chart — v40 migration: `online_snapshots` table
- [x] Online chart — scheduler: snapshot every 5 min, purge after 48h
- [x] Online chart — API: `GET /api/admin/online-history?hours=24`
- [x] Online chart — visual bar chart (visitors + web/ios stacked) with tooltips

## Admin: Delete User Button
- [x] v41 migration: `deleted_at` column on users table
- [x] DELETE `/api/admin/users/:id` — soft delete (null unique fields + set deleted_at)
- [x] Filter soft-deleted users from admin users listing
- [x] Delete button in Users tab with confirmation dialog
- [x] Auth guard: block deleted users from `/me` and token refresh

---

## Open Items (from older work)

### iOS App Store — Manual TODOs
- [ ] TODO (manual): Create RevenueCat project + App Store Connect products
- [ ] TODO (manual): Add Apple Developer credentials (APPLE_CLIENT_ID, APPLE_TEAM_ID, etc.) to .env and Heroku
- [ ] TODO (manual): Add APNs credentials (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY) to .env and Heroku
- [ ] TODO (manual): Add RevenueCat API key + webhook secret to .env and Heroku
- [ ] TODO (manual): Enable Sign in with Apple + Push Notifications capabilities in Xcode
- [ ] TODO (manual): Configure provisioning profiles and signing
- [ ] TODO (manual): Generate App Store screenshots and metadata
- [ ] TODO (manual): Replace REVENUECAT_API_KEY placeholder in web/src/lib/revenuecat.js

### iOS Keyboard — Top Shift Fix
- **CURRENT STATE (input WORKS, top BROKEN):** `KeyboardResize.None` + `baseHeight - keyboardHeight` — input fully visible above keyboard, but top header shifts down because keyboardHeight includes safe area bottom (~34px) that innerHeight doesn't
- [ ] Fix top shift (separate task — needs to account for safe area bottom difference between keyboardHeight and innerHeight)
- [ ] Run `npm run test:e2e:ui`
- [ ] Run `npm run build:ios` + manual device test

---

## Archive

## Phase 1: Landing + Admin + Lead Capture

### Project Scaffolding
- [x] Create directory structure
- [x] package.json
- [x] Procfile, .gitignore, .env
- [x] CLAUDE.md
- [x] plan.md + PROGRESS.md

### Server Foundation
- [x] db.js — PostgreSQL pool
- [x] geo.js — IP geolocation
- [x] migrate.js — migration runner + tables (visitors, leads, app_settings)
- [x] index.js — Express entry point

### Assets
- [x] Move logos to public/assets/brand/
- [x] Generate favicons (16, 32, 180, ico)
- [x] Generate OG image (1200x630)

### Tracking
- [x] tracking-api.js — server-side visitor tracking
- [x] tracking.js — client-side tracking IIFE

### Lead Capture
- [x] leads-api.js — POST /api/leads with 18+ age gate

### Landing Page
- [x] index.html — landing with signup form, OG tags, feature cards
- [x] style.css — dark/warm aesthetic, mobile-first

### Legal Pages
- [x] privacy.html
- [x] terms.html

### Admin Dashboard
- [x] admin-api.js — stats CTE query + paginated leads + settings CRUD
- [x] admin.html — auth gate, 3 tabs (Visitors, Leads, Settings)

### Dev Scripts
- [x] run-dev.js
- [x] kill-ports.js
- [x] kill-lovetta-runtime.js
- [x] generate-assets.js — favicon/OG image generation

### E2E Tests
- [x] Playwright config + global setup/teardown with random port isolation
- [x] Landing tests (5 tests)
- [x] Tracking tests (3 tests)
- [x] Lead capture tests (5 tests)
- [x] Admin tests (7 tests)
- [x] All 20 tests passing

## Phase 2a: React App Scaffold with Auth System

- [x] React SPA at /my/ with Vite build, Tailwind CSS, React Router
- [x] Auth system (signup, login, logout, JWT refresh tokens)
- [x] Email verification + password reset flows
- [x] Google Sign-In integration
- [x] Auth E2E tests (13 tests)
- [x] All 33 tests passing

## Brand & UI Polish

- [x] Crop logo.png and logo_text.png — remove whitespace padding
- [x] Crop favicon icons (icon-16, icon-32, icon-180) — remove whitespace
- [x] Update favicons to "L" icon on dark background (logo_l.png)
- [x] Fix header layout — icon + text logo inline (flexbox)
- [x] Make text logo bigger (160px → 200px)
- [x] Fix CSS specificity bug — success/error messages showing before form submit
- [x] Use text logo (logo_text.png) in React app pages (Login, Signup, Home)

## Google Analytics

- [x] Add gtag.js (G-K97R3YJFGW) to all 5 HTML pages (index, privacy, terms, admin, my/index)

## Demo Tests (Video Recording)

- [x] Add `demo` Playwright project with video: 'on' in playwright.config.js
- [x] Add `saveNamedDemoVideo()` helper in e2e/helpers.js
- [x] Create e2e/demo-landing.test.js (landing page + login page demos)
- [x] Add `test:e2e:demo` script to package.json
- [x] Update CLAUDE.md with demo test instructions

## Billing & Stripe Integration

- [x] Add stripe dependency
- [x] Pricing page component
- [x] Billing status API
- [x] Home page subscription management UI

## Deployment

- [x] Heroku auto-deploy from GitHub enabled

## Admin Dashboard Restructure (KeyID Pattern)

- [x] Backend: Add `GET /api/admin/visitors` — paginated individual visitor rows
- [x] Backend: Add `GET /api/admin/users` — paginated user list with subscription join
- [x] Backend: Add user_stats CTE to `GET /api/admin/stats`
- [x] Frontend: New Overview tab (default) — visitor/lead/user/economics stat cards + breakdowns
- [x] Frontend: Visitors tab — full paginated table with device emoji, OS icons, country codes
- [x] Frontend: Users tab — search + paginated table with subscription status
- [x] Frontend: Helper functions (deviceEmoji, osIcon, parseOS, shortCountry, timeAgo, fmtDate)
- [x] Frontend: Generic renderPagination() for all paginated tabs
- [x] Frontend: Tabs flex-wrap for responsive layout
- [x] Docs: CLAUDE.md — admin dashboard section with tab pattern docs

## App Store Compliance: Privacy, Terms & Report Feature

- [x] Privacy policy: third-party AI processing disclosure, image generation, consent language, content safety
- [x] Terms of service: AI consent, content moderation, reporting sections
- [x] DB migration: `ai_consent_at` column on users, `content_reports` table
- [x] AI consent checkbox in signup LegalPopup (required for all new users)
- [x] `ai_consent_at` stored for email, Google, and Telegram signups
- [x] Companion bottom sheet: tap avatar/name in ChatHeader → profile + actions
- [x] Report modal: reason selector + details → `POST /api/chat/:companionId/report`
- [x] Admin Reports tab: paginated table, status badges, Review/Resolve/Dismiss actions
- [x] Admin API: `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`
- [x] Reports badge on admin dashboard tab

## Template Video Previews

- [x] DB migration: add `video_url` column to `companion_templates`
- [x] Video generation script (`scripts/generate-template-videos.js`) — fal.ai wan-2.6
- [x] Frontend: template grid shows `<video>` with autoplay/muted/loop/playsInline
- [x] Frontend: confirm screen shows video if available
- [x] Generate videos for all 12 templates via script ($3.00 total)
- [x] Update seed migration with generated video URLs
- [x] Fix fal.ai video model ID: `wan/v2.6/image-to-video` (was `fal-ai/wan-2.6`)
- [x] Add duration/resolution params to generateVideo()

## Chat UI Fixes

- [x] Add max-w-lg centered constraint to ChatPage for desktop
- [x] Auto-scroll to bottom on user send, AI response, and triggerNext
- [x] Move lightning bolt "let her message" button to floating FAB in message list area
- [x] Remove lightning button from ChatInput (cleaner input bar)
- [x] Admin Settings tab: model badges showing current openrouter_model and fallback with inline edit

## UI Redesign: Header, Profile, Tips, Notifications, Bigger Cards

- [x] DB migration: user_preferences table (notify_new_messages, last_notification_at)
- [x] DB migration: tips.companion_id column
- [x] User preferences API: GET/PUT /api/user/preferences (server/src/user-api.js)
- [x] Header redesign: replace gear+signout with "+" and profile icon buttons
- [x] Remove "Awaken a new girlfriend" bottom button and floating FAB
- [x] New Profile page (/profile): user info, subscription, notification toggle, sign out
- [x] Notification system: email notification when girl sends message and user is away (5min inactive, 30min rate limit)
- [x] Move tips from Pricing page to CompanionSheet (girl's profile) with companionId
- [x] Tip banner in chat opens CompanionSheet instead of /pricing
- [x] Tip thank-you: girl responds with varied grateful messages after tip payment
- [x] Bigger companion cards: larger avatar (w-16 h-16), bigger padding, text-lg name, 2-line message preview
- [x] Remove tip section from Pricing.jsx
- [x] Companion email addresses: {name}.{shortid}@lovetta.email (deterministic from companion UUID)
- [x] Notification emails sent FROM companion email (plain text, just the message)
- [x] Email reply handling: inbound webhook routes @lovetta.email replies to companion chat
- [x] Reply flow: parse reply text → insert as user message → AI response → send back as companion email
- [x] Email threading via Message-ID / In-Reply-To headers (conversations.last_email_message_id)
- [x] Profile page: full subscription details (status, plan, trial end, renewal date)

## Audio Messages: TTS Playback + Voice Input

- [x] DB migration v7: voice_id column on companion_templates and user_companions (default 'nova')
- [x] Server: generateSpeech() in ai.js — OpenAI TTS API (tts-1 model, raw HTTPS)
- [x] Server: tts-api.js — POST /api/chat/tts endpoint (auth, R2 cache, consumption tracking)
- [x] Server: mount tts-api in index.js
- [x] Server: mp3 MIME type in r2.js
- [x] Frontend: useTTS hook — Audio playback with idle/loading/playing/paused states
- [x] Frontend: MessageBubble play button — speaker icon on assistant messages
- [x] Frontend: ChatInput mic button — Web Speech API voice-to-text (Chrome/Edge/Safari)
- [x] OPENAI_API_KEY added to .env

## Anime Companion Templates
- [x] Migration v9: Add `style` column to companion_templates and user_companions
- [x] Migration v10: Seed 6 anime templates (Sakura, Yuki, Hana, Rei, Aiko, Mei)
- [x] companion-api.js: Propagate `style` field when creating from template
- [x] CompanionCreate.jsx: Section template grid into "Realistic" and "Anime" groups
- [x] CompanionCreate.jsx: Remove 6 anime avatar URLs used for templates from CUSTOM_AVATARS

## Tip Promotion: In-Chat Message with Buttons
- [x] Create shared tipCheckout.js helper (TIP_AMOUNTS + startTipCheckout)
- [x] Export formatActions from MessageBubble for reuse
- [x] Add romantic TIP_PROMO_MESSAGES templates in useChat.js
- [x] Add tipPromoMessage state and generation on threshold hit
- [x] Create TipPromoMessage component with inline tip buttons
- [x] Integrate TipPromoMessage into MessageList
- [x] Remove old tip banner from ChatPage, pass new props
- [x] Refactor CompanionSheet to use shared tipCheckout helper
- [x] Migration v13: Change tip threshold default from $2 to $10
- [x] Move AI settings from Economics tab to Settings tab in admin
- [x] Change threshold to $10/month across ALL companions (not per-companion)
- [x] Check monthly cost from api_consumption + tips table (no more user_companion_cost_balance for threshold)

## Multi-Level Companion Memory System
- [x] Migration v16: conversation_summaries + companion_memories tables + conversation counters
- [x] New server/src/memory.js: buildMemoryContext(), processMemory(), extractFacts(), generateSummary()
- [x] ai.js: plainChatCompletion() — lightweight AI call without age guard/content rules for memory tasks
- [x] chat-api.js: inject memory context into system prompt (both /message and /next)
- [x] chat-api.js: fire-and-forget processMemory() after each assistant message
- [x] chat-api.js: reduce recent message window from 20 to 10 (room for memory context)
- [x] Fix: missing WHERE clause in processMemory counter UPDATE
- [x] Fix: use 70B fallback model for memory tasks (12B roleplay model can't do structured extraction)
- [x] Fix: strip roleplay formatting (*actions*) from messages before sending to memory AI
- [x] Fix: better JSON parsing with regex fallback for prose-wrapped JSON
- [x] Fix: validate fact categories against whitelist (identity/preferences/life/relationship/emotional)
- [x] Fix: summary sentence truncation (take first 3 sentences, ignore roleplay leakage)
- [x] Verified: 11 facts extracted correctly (name, birthday, job, dog, hobbies, food, pet name)
- [x] Verified: summary generated — clean 3-sentence recap of 30 messages
- [x] Verified: full memory context ~227 tokens, well within 500-token budget

## Media Messages in Chat (Images & Videos)
- [x] Migration v18: companion_media table for reuse catalog
- [x] ai.js: generateCharacterImage() using fal.ai Instant Character (full body reference)
- [x] New server/src/media-chat.js: parseMediaTags(), extractTags(), findReusableMedia(), generateOrReuseMedia()
- [x] chat-api.js: system prompt with MEDIA MESSAGES instructions
- [x] chat-api.js: media detection + generation in /message and /next handlers
- [x] chat-api.js: new /request-media endpoint for camera button
- [x] useChat.js: media_loading SSE event, mediaLoading state, messagesSinceLastMedia counter, showMediaButton, requestMedia()
- [x] MessageBubble.jsx: render images and videos above text in chat bubbles
- [x] StreamingMessage.jsx: media loading indicator with spinner
- [x] MessageList.jsx: camera button (image icon) above bolt button, hidden after media for 5-15 messages
- [x] ChatPage.jsx: wire up media props from useChat to MessageList
- [x] Verify media generation + reuse in dev (code complete: PuLID + Kontext fallback, async generation, R2 storage, reuse catalog)
- [x] Verify video generation flow (code complete: wan/v2.6, async queue polling, 5min timeout)
- [x] Fix cross-companion media reuse: companions sharing the same avatar_url now share media catalog
- [x] media-chat.js: findReusableMedia() joins through user_companions.avatar_url (same girl = reuse)
- [x] media-chat.js: import ai module as object (not destructured) for testability
- [x] E2E tests: extractTags (6), parseMediaTags (4), findReusableMedia (9), generateOrReuseMedia (5), cross-companion reuse stats (1) — 25 new tests
- [x] Cross-companion reuse test: 5 companions, 10 scenes, 30% reuse rate (3/10 reused across companions)

## Landing Page Overhaul + Structured Signup

### Remove Waitlist/Leads Infrastructure
- [x] Delete server/src/leads-api.js
- [x] Remove leads route from server/index.js
- [x] Remove leads endpoint and stats from admin-api.js
- [x] Remove Leads tab/section/functions from admin.html
- [x] Delete e2e/leads.test.js, remove from playwright.config.js
- [x] Remove leads from e2e/global-teardown.js
- [x] Remove leads-related admin test cases
- [x] Add migration v18_drop_leads to drop table

### Landing Page Updates
- [x] Replace "Join Waitlist" with "Start Free Trial"
- [x] Update hero text (remove "3 girlfriends" limit)
- [x] Add template carousel with auto-scroll animation
- [x] Update "Generated Images" feature to "Photos & Videos"
- [x] Add 3 checkboxes (Terms, Privacy, AI consent) instead of 1
- [x] Save form data to localStorage, redirect to /my/signup
- [x] Add carousel CSS styles

### Public Template Preview API
- [x] Add GET /api/companions/templates/preview (no auth required)

### Structured Signup Flow
- [x] Signup.jsx reads pre-filled data from localStorage (from=landing)
- [x] Skip LegalPopup when consents already given on landing
- [x] GoogleSignIn passes age/consent via base64 state param
- [x] Signup.jsx passes birthData to GoogleSignIn

### Fix OAuth Age/Consent Bypass
- [x] Google OAuth: forward state param, decode in callback, use real birth date

## Responsive Two-Size Layout

- [x] Update `plan.md` and `PROGRESS.md` for the responsive layout task
- [x] Update shared app shell and responsive width rules for tablet and desktop
- [x] Remove phone-only width caps from main app pages and chat surfaces while keeping auth forms narrow
- [x] Update landing page container, carousel, signup card, and feature grid for tablet and desktop widths
- [x] Add tablet and desktop responsive assertions to UI E2E tests
- [x] Run `npm run test:e2e:ui`
- [x] Google OAuth: redirect new users without age data to /my/signup
- [x] Telegram auth: accept birthMonth/birthYear/consents in POST body
- [x] Telegram auth: require age/consent for new users (return age_consent_required)
- [x] AuthContext: pass landing data with Telegram initData
- [x] AuthContext: handle age_consent_required error → redirect to signup

### Demo Test Update
- [x] Update demo-landing.test.js for 3 checkboxes

### Trial Tip Threshold + Media Blocking
- [x] Migration v20: seed `tip_request_threshold_trial_usd` setting (default $0.30)
- [x] consumption.js: cumulative tips formula `netCost = monthlyCost - monthlyTips`, trial vs paid threshold
- [x] consumption.js: `checkMediaBlocked()` helper for early request-media blocking
- [x] ai.js: thread `subscription` object through all 7 trackConsumption calls
- [x] chat-api.js `/message`: block media generation when threshold exceeded, send `mediaBlocked` in done event
- [x] chat-api.js `/next`: same media blocking logic
- [x] chat-api.js `/request-media`: early exit with `media_blocked` SSE event before LLM call
- [x] useChat.js: handle `media_blocked` SSE event type → show tip promo
- [x] admin.html: add Trial Tip Threshold setting in AI Settings section

### User Explicit Content Toggle
- [x] Migration v21: add `explicit_content` BOOLEAN column to `user_preferences` (default true)
- [x] user-api.js: extend GET/PUT `/api/user/preferences` with `explicit_content` field + platform-aware defaults (web=ON, appstore/telegram=OFF)
- [x] content-levels.js: add `getUserExplicitPref()`, `getEffectiveTextLevel()`, `getEffectiveImageLevel()` — user toggle overrides admin level to 0 when disabled
- [x] ai.js: pass `userId` through `buildSystemPrompt()`, `chatCompletion()`, `streamChat()`, `generateImage()` to content level functions
- [x] Profile.jsx: add "Content Preferences" card with "Explicit content" toggle

### Landing Page: Remove Email from Trial Form
- [x] Remove email field from landing page signup form (users pick auth method on signup page)
- [x] Update form JS validation to not require email
- [x] Remove email from localStorage landing data
- [x] Clean up Signup.jsx pre-fill (no more email from landing data)

### Scalability: Async Generation for Concurrent Users
- [x] Install ioredis + create Redis client singleton (server/src/redis.js)
- [x] Increase DB pool size 5 → 20 with connectionTimeoutMillis
- [x] Add v24_media_pending migration (media_pending column on messages)
- [x] Decouple media generation from chat response (background generation in /message, /next, /request-media)
- [x] Add media polling endpoint GET /api/chat/message/:messageId/media
- [x] Frontend: poll for pending media in useChat + shimmer placeholder in MessageBubble
- [x] Cache consumption threshold in Redis (60s TTL) with invalidation on tip payment
- [x] TTS request deduplication via in-flight Map (prevents duplicate ElevenLabs calls)
- [x] Redis-based per-user chat rate limiting (20 msg/min)

### Landing Page: Apple-compliant Trial Section
- [x] Prominent pricing: $19.99/mo and $99.99/yr displayed large with "save 58%" badge
- [x] Trial timeline: Today → Day 3 (trial ends) → Day 4 (first charge) visual
- [x] Subscription features list: unlimited messages, personality & memory, voice & photos
- [x] Auto-renewal disclosure: "3-day free trial, then auto-renews. Cancel anytime"
- [x] Terms & Privacy links already present in form checkboxes

### Referral Program
- [x] Database migration v25: referral_code + referred_by columns on users, referral_commissions table, referral_payouts table, payout_method/payout_detail on user_preferences, referral_commission_pct app setting, backfill existing users with codes
- [x] Auth: generate referral_code on signup (email, Google OAuth, Telegram), resolve referred_by from referral code
- [x] Landing page: capture ?ref= param to localStorage
- [x] Signup flow: pass referralCode from localStorage through all signup paths
- [x] Billing: credit referral commission (configurable %) on subscription, tip, and renewal payments
- [x] Referral API: GET /api/referral/stats, PUT /api/referral/payout-method, POST /api/referral/cashout
- [x] Profile page: referral link + copy, invited count, earned balance, payout method selector, cash out button ($100 min)
- [x] Admin Users tab: added Refs and Ref $ columns
- [x] Admin Settings: added referral_commission_pct to AI Settings section
- [x] Admin Cashouts tab: paginated cashout requests with status filter, approve/mark paid/reject actions, pending count badge

### PWA (Mobile, Non-Telegram)
- [x] public/manifest.json: app name, icons (128/180/512), standalone display, theme #d6336c, scope /my/
- [x] public/sw.js: minimal no-op service worker (network-only, zero caching)
- [x] web/index.html: manifest link, theme-color meta, apple-mobile-web-app-capable/status-bar-style
- [x] web/src/main.jsx: SW registration (skipped for Telegram WebApp)
- [x] web/src/hooks/usePwaInstall.js: beforeinstallprompt capture, localStorage dismiss, standalone detection
- [x] web/src/App.jsx: PwaInstallBanner — fixed bottom banner for logged-in non-Telegram users, Install + dismiss buttons

## Automated Emails
- [x] `sendNewRegistrationNotification()` in email.js — admin email on new signup
- [x] Added to all 3 signup paths in auth-api.js (email, Google, Telegram)
- [x] `sendAbandonedPaymentReminder()` in email.js — next-day reminder for unpaid users
- [x] v27_email_reminders migration — `email_reminders` table with UNIQUE(user_id, reminder_type)
- [x] scheduler.js — hourly setInterval, queries users 24-48h old with no subscription
- [x] Wired startScheduler() in server/index.js app.listen callback
- [x] Fixed brand color #ec4899 → #d6336c in verification and reset email templates

## Web Push Notifications
- [x] Migration v28: push_subscriptions table, proactive_messages pref, last_proactive_at, is_proactive flag
- [x] Install web-push npm package
- [x] New server/src/push.js: sendPushNotification() with VAPID, auto-cleanup of expired subscriptions
- [x] Updated public/sw.js: push event handler (showNotification) + notificationclick (focus/open window)
- [x] New endpoints: GET /api/user/vapid-key, POST /api/user/push/subscribe, DELETE /api/user/push/unsubscribe
- [x] Updated chat-api.js maybeNotifyUser(): sends web push alongside email (fire-and-forget)
- [x] Profile.jsx: push notification toggle (requests browser permission, subscribes to push manager)
- [x] VAPID keys generated and added to .env

## Proactive Companion Messaging
- [x] New server/src/proactive.js: runProactiveMessages() scheduled every 30 min
- [x] Finds inactive users (4+ hours) with active subscription and proactive_messages=true
- [x] Generates natural messages via plainChatCompletion() with companion personality + memory context
- [x] Rate limits: max 1/companion/day, max 3/user/day
- [x] Skips users with exceeded tip threshold (checkMediaBlocked)
- [x] Multi-channel delivery: web push + companion email + Telegram bot message
- [x] Messages flagged as is_proactive=true in messages table
- [x] Updated scheduler.js with 30-min interval
- [x] Profile.jsx: proactive messages toggle ("Let her reach out when she's thinking of you")

## Email Notification Enhancements
- [x] Welcome series: sendWelcomeDay0 (intro), sendWelcomeDay1 (prompt to chat), sendWelcomeDay3 (trial ending)
- [x] Subscription renewal reminder: sendRenewalReminder (3 days before renewal date)
- [x] All 4 templates in email.js with brand #d6336c and unsubscribe text
- [x] scheduler.js: runWelcomeEmailSeries() hourly — day 0/1/3 with dedup via email_reminders
- [x] scheduler.js: runRenewalReminders() hourly — 71-73h window before renewal
- [x] Email frequency cap: checkEmailFrequencyCap() — max 2/user/day via Redis (DB fallback)
- [x] All jobs skip Telegram-only users (no real email)
- [x] proactive_messages added to user-api.js GET/PUT preferences

## Load Testing
- [x] Created e2e/load-test.js — standalone Node.js load test script
- [x] Phase 1: 30 concurrent chat messages via SSE streaming (OpenRouter)
- [x] Phase 2: 30 concurrent media requests (fal.ai async generation)
- [x] Phase 3: Media polling until generation completes
- [x] Metrics: TTFB, total response time, p50/p95/max, error breakdown
- [x] CLI flags: --url, --users, --skip-media, --rounds
- [x] Added npm run test:load script

## iOS App Store App (Capacitor)

### Phase 1: Capacitor Setup + Platform Detection
- [x] Created `web/src/lib/platform.js` — isCapacitor(), isIOS(), isAppStore() utilities
- [x] Created `web/capacitor.config.json` — appId ai.lovetta.app, remote server URL, Capacitor lovetta-ios user-agent
- [x] Installed @capacitor/core, @capacitor/ios, @capacitor/cli in web workspace
- [x] Installed @capacitor/push-notifications, @revenuecat/purchases-capacitor, @capacitor-community/apple-sign-in
- [x] Installed @parse/node-apn for server-side APNs push
- [x] Added build:ios and open:ios npm scripts to root package.json
- [x] Updated main.jsx — skip service worker registration in Capacitor
- [x] Scaffolded ios/ Xcode project via `npx cap add ios`, synced with `npx cap sync ios`
- [x] Updated Podfile deployment target to iOS 16.0

### Phase 2: Sign in with Apple
- [x] Server: POST /api/auth/apple in auth-api.js — verifies Apple identity token JWT against Apple public keys, find/create user by apple_id or email, supports age/consent flow
- [x] Migration v29: apple_id index, RevenueCat columns on subscriptions, apns_subscriptions table
- [x] Client: web/src/components/AppleSignIn.jsx — native Sign in with Apple via @capacitor-community/apple-sign-in, only renders in Capacitor
- [x] Wired AppleSignIn into Login.jsx and Signup.jsx (shown in Capacitor, Telegram login hidden)

### Phase 3: RevenueCat In-App Purchases
- [x] Created web/src/lib/revenuecat.js — initRevenueCat, getOfferings, purchasePackage, purchaseProduct, restorePurchases, getCustomerInfo
- [x] Server: handleRevenueCatWebhook() in billing.js — handles INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, NON_RENEWING_PURCHASE events
- [x] Added POST /api/webhooks/revenuecat endpoint in server/index.js
- [x] Updated Pricing.jsx — uses RevenueCat native purchase in Capacitor, Stripe checkout on web, Restore Purchases button
- [x] Updated tipCheckout.js — uses RevenueCat purchaseProduct for tips in Capacitor
- [x] AuthContext.jsx — initializes RevenueCat after user auth when in Capacitor

### Phase 4: Native Push Notifications (APNs)
- [x] Created web/src/lib/push-native.js — registerNativePush, unregisterNativePush, setupPushListeners
- [x] Created server/src/push-apns.js — APNs HTTP/2 via @parse/node-apn, sendApnsPush, sendApnsPushToUser
- [x] Added POST /api/user/push/subscribe-apns and DELETE /api/user/push/unsubscribe-apns endpoints in user-api.js
- [x] Extended push.js sendPushNotification() — sends both web push and APNs to all user devices

### Phase 5: UI Adjustments for App Store
- [x] Profile.jsx: hide referral section when isAppStore()
- [x] Profile.jsx: hide explicit content toggle when isAppStore() (server enforces level 0)
- [x] Profile.jsx: push notification toggle uses native Capacitor flow when isCapacitor()
- [x] Profile.jsx: Manage Subscription links to iOS Settings in Capacitor
- [x] App.jsx: PWA install banner hidden when isCapacitor()
- [x] Login.jsx / Signup.jsx: Telegram login hidden, Apple Sign In shown when isCapacitor()

### Phase 6: Build Pipeline
- [x] Verified web build succeeds with all new imports
- [x] iOS project synced with all 3 Capacitor plugins (apple-sign-in, push-notifications, purchases-capacitor)
- [x] Added ios build artifacts to .gitignore (Pods/, public/, DerivedData/)

## Google Ads Compliance — Safe-by-Default
- [x] Migration v30: force all content levels to 0 (strict), new toggle settings, template cleanup, explicit_content default false
- [x] content-levels.js: change hardcoded fallbacks from 2 to 0, add getMediaEnabled() and getAvatarFilterSettings()
- [x] New GET /api/app-config public endpoint for frontend feature flags
- [x] chat-api.js: conditional MEDIA MESSAGES in system prompt, guard media detection regex, guard request-media endpoint
- [x] user-api.js: explicit_content default changed to false for all platforms
- [x] admin.html: add Feature Toggles section with 3 toggle switches (media generation, avatar age filter, avatar skin filter)
- [x] CompanionCreate.jsx: conditionally show age/skin filters based on admin settings
- [x] useChat.js: check mediaEnabled from app-config, hide photo button when disabled
- [x] Clean up tip promo messages — remove references to photos/videos/pics
- [x] Simplify tip cards — remove labels, remove "Tips unlock images & videos" footer
- [x] email.js: neutralize "photos and videos" in welcome email
- [x] Profile.jsx: change toggle description to "Allow mature content"
- [x] Template descriptions cleaned: Aria, Sophia, Isabella, Zara, Ruby, Violet, Mei — removed suggestive language and traits

## iOS Auth Fixes (Session 3)
- [x] GoogleSignIn.jsx: add GoogleAuth.initialize() call before signIn() — fixes crash (matching auto repo pattern)
- [x] AppleSignIn.jsx: add clientId ('ai.lovetta.app') and redirectURI ('https://lovetta.ai') to authorize() call
- [x] Info.plist: fix CFBundleURLName to use full reversed client ID (matching auto repo)
- [x] capacitor.config.json: add packageClassList for explicit native plugin registration
- [x] Signup.jsx: add Step 2 plan selection screen in native flow (consent → plan → account creation)
- [x] Rebuilt ios-dist bundle and synced Xcode project

## Support Chat System
- [x] server/src/migrate.js: v31_support_chat migration — support_chats + support_messages tables
- [x] server/src/support-api.js: user API (GET /chat auto-create, POST messages, GET messages?after= poll)
- [x] server/index.js: mount supportApi at /api/support
- [x] server/src/admin-api.js: admin routes — GET /support/stats, GET /support/chats, GET /support/chats/:id, POST /support/chats/:id/reply, PATCH /support/chats/:id
- [x] web/src/components/SupportChat.jsx: in-app modal panel, brand-themed, 10s poll, auto-scroll
- [x] web/src/pages/Profile.jsx: Contact Support button + SupportChat modal
- [x] public/admin.html: Support tab — filter buttons, chat list, detail with reply + resolve, 30s auto-refresh, badge with unread count

## Universal Subscription UX + Free Message Tier + iOS Onboarding
- [x] server/src/consumption.js: add checkFreeLimit(userId) — checks monthly cost vs tip_request_threshold_free_usd
- [x] server/src/chat-api.js: pre-subscription check at 2 spots (chat + proactive) — free_limit_reached error code; media always requires subscription
- [x] server/src/migrate.js: v34_free_user_threshold migration — seeds tip_request_threshold_free_usd = "0.10"
- [x] public/admin.html: add Free User Threshold (USD) input to AI Settings
- [x] web/src/components/PlanModal.jsx: NEW — universal plan selection modal (exact iOS UI, fullScreen prop for page use)
- [x] web/src/pages/WelcomeScreen.jsx: NEW — iOS pre-signup rotator (fetches /api/companions/templates/preview, features list, Continue button)
- [x] web/src/App.jsx: add /welcome route (PublicRoute); ProtectedRoute iOS redirect → /welcome
- [x] web/src/pages/Signup.jsx: after web signup success, navigate('/?newUser=true')
- [x] web/src/pages/CompanionList.jsx: auto-show PlanModal on ?newUser=true or first visit; smarter subscription banner with View Plans button
- [x] web/src/pages/Pricing.jsx: iOS branch replaced with <PlanModal fullScreen />; web branch unchanged
- [x] web/src/hooks/useChat.js: handle free_limit_reached error; add clearError()
- [x] web/src/components/chat/ChatPage.jsx: remove full-page subscription_required screen; add PlanModal overlay for subscription_required + free_limit_reached
- [x] e2e/companion-chat.test.js + wizard-nav.test.js: fix signupViaUI() to use custom dropdown buttons instead of native <select> (AgeGate uses CustomSelect component)

## iOS Chat Input / Keyboard Fix
- [x] Update plan.md with task scope and implementation notes
- [x] Add Capacitor keyboard plugin + iOS keyboard bootstrap for body resize and scroll reset
- [x] Refactor app shell/root sizing for internal full-screen scrolling without body bottom padding
- [x] Update chat and support input layouts for iOS-safe font sizing and bottom safe-area handling
- [x] Sync iOS native project after Capacitor keyboard config changes
- [x] Run `npm run test:e2e:ui`
- [x] Add explicit Back labels to create/profile/support headers and switch UI tests to exact-name back button selectors
- [x] Update plan.md and PROGRESS.md with final status and notes

## iOS Bottom Background Fix
- [x] Update plan.md with task scope and implementation notes
- [x] Make the root/html background match the dark app shell so iOS bottom inset never shows white
- [x] Run `npm run test:e2e:ui`
- [x] Update plan.md and PROGRESS.md with final status and notes

## iOS Keyboard Shift Follow-up
- [x] Update plan.md with the repo comparison and follow-up scope
- [x] Compare local iOS viewport/keyboard patterns (`auto`, `frendly`, other repos) against Lovetta's current chat shell
- [x] Remove the iOS body-lock viewport workaround from chat/support
- [x] Move native safe-area handling off the global document and onto the affected chat/support layouts
- [x] Reapply the Capacitor Keyboard `resize: body` pattern from `auto` with a minimal iOS bootstrap
- [x] Sync the iOS native project and rebuild the web bundle
- [x] Run `npm run test:e2e:ui`
- [x] Update plan.md and PROGRESS.md with final status and notes

## iOS Native Chat API Routing Fix
- [x] Update plan.md with the native chat routing scope
- [x] Trace native chat/STT requests and compare shared axios base routing against raw fetch usage
- [x] Replace native-relative chat/STT fetch paths with a shared absolute API URL helper
- [x] Add refresh-aware shared fetch handling for chat/STT and surface HTTP auth failures instead of failing silently
- [x] Run `npm run test:e2e:ui`
- [x] Update plan.md and PROGRESS.md with final status and notes

## iOS Global Scroll Regression Fix
- [x] Update plan.md with the global scroll regression scope
- [x] Trace the keyboard bootstrap and confirm where iOS scrolling is being disabled globally
- [x] Restrict keyboard scroll locking to active keyboard sessions without blocking normal page scrolling
- [x] Run `npm run test:e2e:ui`
- [x] Update plan.md and PROGRESS.md with final status and notes

## Fix: Stop sending emails to test @example.com addresses
- [x] Add `@example.com` and `@test.com` exclusion filters to all 5 scheduler queries
- [x] Replace `@example.com` with `conativer+tag@gmail.com` in all E2E test files (11 files)
- [x] Update `sendNewRegistrationNotification` filter to match new `conativer+` pattern
- [x] Update CLAUDE.md with test email rules

## iOS Welcome Carousel Parity
- [x] Update `plan.md` with the welcome carousel scope and implementation notes
- [x] Create a reusable React welcome carousel component that mirrors the landing carousel behavior
- [x] Replace the single-card rotator in `web/src/pages/WelcomeScreen.jsx` with the shared carousel
- [x] Add `/my/welcome` UI coverage for multi-card rendering, active-card focus, and CTA/legal visibility
- [x] Run `npm run test:e2e:ui`
- [x] Run `npm run build:ios`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS Chat Voice Button Restore
- [x] Update `plan.md` with the iOS mic-button restore scope
- [x] Trace the native mic button visibility/permission path in the chat composer
- [x] Restore the left-side mic button for Capacitor iOS without hiding it behind a brittle browser capability check
- [x] Add the required microphone usage description in the iOS plist
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS Welcome Carousel Motion Fix
- [x] Update `plan.md` with the iOS carousel motion fix scope
- [x] Change the welcome carousel auto-scroll to use an accumulated scroll position that advances reliably on iOS
- [x] Extend `/my/welcome` UI coverage to assert the carousel viewport actually moves left over time
- [ ] Run `npm run test:e2e:ui`
- [ ] Run `npm run build:ios`
- [ ] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS Native Voice Recording Fix
- [x] Update `plan.md` with the native voice recording scope
- [x] Replace the iOS WebView `MediaRecorder` path with a native Capacitor voice recorder flow
- [x] Add explicit native microphone permission request/error handling in chat input
- [x] Add the missing `NSMicrophoneUsageDescription` to the actual iOS `Info.plist` so mic requests do not crash the app
- [x] Accept native iOS AAC audio correctly in the STT upload path
- [x] Run `npm run build:ios`
- [ ] Run `npm run test:e2e:ui`
- [ ] Update `plan.md` and `PROGRESS.md` with final status and notes

## Auth Button Polish
- [x] Update `plan.md` with the auth-button polish scope
- [ ] Move the Apple button below the auth separator on login and keep social button spacing controlled by the page layout
- [ ] Normalize login/signup button sizing and spacing across email, Apple, and Google CTAs
- [ ] Run `npm run test:e2e:ui`
- [ ] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS Welcome Carousel Style Mixing Fix
- [x] Update `plan.md` with the style-mixing scope
- [x] Change the welcome carousel ordering to interleave anime and real templates instead of using a pure random shuffle
- [x] Extend `/my/welcome` UI coverage to verify anime cards are not adjacent when mixed styles are available
- [ ] Run `npm run test:e2e:ui`
- [ ] Run `npm run build:ios`
- [ ] Update `plan.md` and `PROGRESS.md` with final status and notes

## Web Landing + Signup Flow Parity With iOS
- [x] Update `plan.md` and `PROGRESS.md` for the web landing/onboarding task
- [x] Replace the public landing signup form with a welcome-style layout and informational pricing cards
- [x] Convert web signup to a 3-step consent → registration → plan flow and remove the web LegalPopup path
- [x] Reuse the onboarding-style plan chooser on `/my/pricing?onboarding=1` with Skip for now
- [x] Update landing and onboarding UI tests for the new web flow
- [x] Run `npm run test:e2e:ui`

## Landing Trial Emphasis
- [x] Update `plan.md` and `PROGRESS.md` for the landing trial-emphasis pass
- [ ] Add a large free-trial-first badge/treatment to the landing pricing section
- [ ] Keep the pricing section informational-only while making the trial message more prominent
- [ ] Run `npm run test:e2e:ui`

## Web Landing Trial Timeline Removal
- [ ] Update `plan.md` and `PROGRESS.md` for the web landing timeline-removal pass
- [ ] Remove the landing `Today / Day 3 / Day 4` timeline block for web
- [ ] Keep the web-only trial badge and pricing cards intact
- [ ] Run `npm run test:e2e:ui`

## Landing Pricing Subtitle Removal
- [x] Update `plan.md` and `PROGRESS.md` for the landing pricing subtitle removal
- [x] Remove the explanatory pricing subtitle from the web landing page
- [x] Skip tests because this is a copy-only change

## Landing Cancel Anytime Emphasis
- [x] Update `plan.md` and `PROGRESS.md` for the landing cancel-anytime emphasis change
- [x] Replace the landing pricing note with a larger `Cancel anytime` emphasis
- [x] Skip tests because this is a copy/presentation-only landing change

## iPad Full-Width Shell Fix
- [x] Update `plan.md` and `PROGRESS.md` for the iPad shell-width fix
- [x] Keep the app and landing shells full-width on iPad landscape instead of applying the desktop frame
- [x] Add iPad landscape UI assertions for `/` and `/my/welcome`
- [x] Run `npm run test:e2e:ui`

## Apple Sign-In Debug Removal
- [x] Update `plan.md` and `PROGRESS.md` for the Apple Sign-In debug cleanup
- [x] Remove the temporary Apple Sign-In debug alert and verbose logging
- [x] Run `npm run build`

## Apple Sign-In Cancel Error Suppression
- [x] Update `plan.md` and `PROGRESS.md` for the Apple cancel-error suppression fix
- [x] Suppress the native Apple authorization error that represents user-cancel on iOS
- [x] Run `npm run build`

## iPad Signup Consent Width Fix
- [x] Update `plan.md` and `PROGRESS.md` for the iPad signup consent-width fix
- [x] Make the signup consent step wider on iPad/tablet without widening the regular auth forms
- [x] Add UI coverage for the tablet/iPad consent-step width
- [ ] Run `npm run test:e2e:ui`

## iPad Auth Screen Width Consistency
- [x] Update `plan.md` and `PROGRESS.md` for the broader iPad auth-width pass
- [x] Make all full-screen auth pages wider on iPad while keeping desktop behavior unchanged
- [x] Update UI coverage for the iPad login and consent widths
- [ ] Run `npm run test:e2e:ui`

## Plan Modal Button Spacing
- [x] Update `plan.md` and `PROGRESS.md` for the plan-modal spacing tweak
- [x] Increase the vertical spacing between the pricing modal action buttons
- [x] Run `npm run build`

## Three-Type Proactive Messages: Morning, Evening & Random
- [x] Add migration v36: users.timezone, messages.proactive_slot, user_preferences.proactive_frequency + country backfill
- [x] Add timezone to geo.js IP lookup (ip-api.com timezone field)
- [x] Save timezone on user registration in auth-api.js (all 6 INSERT statements)
- [x] Add proactive_frequency to preferences API GET/PUT in user-api.js
- [x] Rewrite proactive.js: timezone-aware slots (morning/evening/random), frequency config (low/normal/high), slot-specific prompts
- [x] Add frequency selector (segmented control) to Profile page below proactive toggle
- [ ] Run tests

## Real-Device iOS Billing Test Coverage
- [x] Update `plan.md` and `PROGRESS.md` for the iOS billing test-coverage task
- [x] Fix RevenueCat subscription handling and webhook idempotency
- [x] Add native iOS tip-intent persistence and billing API endpoints
- [x] Update native subscription/tip UI flows to wait for backend sync and use provider-aware management
- [x] Add Playwright API coverage for RevenueCat and native tip intents
- [x] Add iOS `AppUITests` target for billing entry-point coverage
- [x] Add manual sandbox validation runbook for production iOS billing
- [x] Run `npm run test:e2e:api`
- [x] Run native iOS test/build verification
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Fix AI Hallucination — Discovery Mode
- [x] Add `temperature: 0.7` to OpenRouter chat requests (ai.js)
- [x] Lower memory extraction threshold from 10 to 5 (memory.js)
- [x] Add anti-hallucination baseline to system prompt (chat-api.js)
- [x] Add discovery mode logic when no memories exist — `/message` endpoint (chat-api.js)
- [x] Add discovery mode logic when no memories exist — `/next` endpoint (chat-api.js)
- [x] Add anti-hallucination constraint to proactive messages (proactive.js)
- [x] All 70 AI tests pass
- [x] Real conversation test: 5 companions (Luna, Sophia, Emma, Chloe, Jade), 40 messages — 0 hallucinations
- [x] Fix scene generation cleanup: strip character names, labels, extra text (chat-api.js + companion-api.js)
- [x] Scene test: all generated scenes are clean (setting+mood only, no character names/actions)
- [x] Fix scene generation root cause: `max_tokens: 25` + `plainChatCompletion` + simplified prompt (ai.js, chat-api.js, companion-api.js)
- [x] Scene quality: 100% clean (11/11) vs 23% before — no heavy regex cleanup needed
- [x] New E2E test suite: `e2e/chat-scenarios.test.js` — 20 tests (18 pass, 2 skip)

## iOS Sandbox Setup Hardening
- [x] Update `plan.md` and `PROGRESS.md` for the iOS sandbox setup follow-up
- [x] Add explicit Xcode capability metadata for In-App Purchase on the `App` target
- [x] Add a Lovetta-specific iOS sandbox setup guide for Xcode, App Store Connect, device login, and reset flows
- [x] Re-run native iOS build verification after the Xcode project change
- [x] Update `plan.md` and `PROGRESS.md` with final sandbox-setup status and notes

## iOS Subscribe Tap Debugging
- [x] Update `plan.md` and `PROGRESS.md` for the subscribe-tap debugging follow-up
- [x] Remove the native subscribe offering race from `PlanModal`
- [x] Add visible logging/error state for native subscribe failures
- [x] Re-run relevant iOS verification after the paywall handler change
- [x] Update `plan.md` and `PROGRESS.md` with final subscribe-debugging status and notes

## iOS StoreKit Product Probe
- [x] Update `plan.md` and `PROGRESS.md` for the native StoreKit probe follow-up
- [x] Add a temporary direct StoreKit product fetch on iOS launch for Lovetta subscription/tip product IDs
- [x] Rebuild the iOS app after adding the native StoreKit probe
- [x] Update `plan.md` and `PROGRESS.md` with final StoreKit-probe status and notes

## RevenueCat Apple Key Swap
- [x] Update `plan.md` and `PROGRESS.md` for the RevenueCat Apple key swap
- [x] Replace the local iOS RevenueCat public key with the real Apple `appl_...` key
- [x] Rebuild the iOS app after the RevenueCat key change
- [x] Update `plan.md` and `PROGRESS.md` with final key-swap status and notes

## RevenueCat Apple Key Heroku Sync
- [x] Update `plan.md` and `PROGRESS.md` for the Heroku RevenueCat key sync
- [x] Set `VITE_REVENUECAT_IOS_KEY` on the active Heroku app for this repo
- [x] Verify the Heroku config value is updated
- [x] Update `plan.md` and `PROGRESS.md` with final Heroku-sync status and notes

## RevenueCat Local Env Source Fix
- [x] Update `plan.md` and `PROGRESS.md` for the local-build RevenueCat key fix
- [x] Update `web/.env` to the Apple `appl_...` RevenueCat key used by local iOS builds
- [x] Remove the first-call RevenueCat configure race from the Capacitor client
- [x] Expand the temporary StoreKit probe to check both possible subscription ID sets
- [x] Rebuild iOS and verify the generated bundle no longer contains the old Test Store key
- [x] Update `plan.md` and `PROGRESS.md` with final local-build fix status and notes

## Local StoreKit Config Like Auto
- [x] Update `plan.md` and `PROGRESS.md` for the local StoreKit config task
- [x] Add a Lovetta `.storekit` catalog with local subscription and tip products
- [x] Attach the local StoreKit catalog to the shared `App` Xcode scheme
- [x] Update the native StoreKit debug messaging for local StoreKit mode
- [x] Rebuild iOS and verify the app scheme still builds
- [x] Update `plan.md` and `PROGRESS.md` with final local StoreKit status and notes

## RevenueCat Offerings Race Fix
- [x] Update `plan.md` and `PROGRESS.md` for the RevenueCat offerings bugfix
- [x] Remove the duplicate RevenueCat configure race during auth + paywall startup
- [x] Fix `getOfferings()` to handle the Capacitor plugin response shape correctly
- [x] Re-run the relevant frontend/iOS verification
- [x] Update `plan.md` and `PROGRESS.md` with final offerings-fix status and notes

## Final iOS Billing Fix via Auto-Style Direct Products
- [x] Update `plan.md` and `PROGRESS.md` for the final direct-product subscription fix
- [x] Replace the iOS subscription path with direct RevenueCat store-product fetch + `purchaseStoreProduct`
- [x] Move native RevenueCat initialization to a single top-level initializer and remove auth-context duplication
- [x] Improve native billing logging and inline error reporting for direct-product failures
- [x] Run `npm run build:ios`
- [x] Run `npm run test:e2e:ui`
- [x] Run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS Subscription Timeout Root-Cause Fix
- [x] Update `plan.md` and `PROGRESS.md` for the iOS subscription-timeout follow-up
- [x] Remove the blocking `getProducts()` dependency from the fixed iOS subscription purchase path
- [x] Configure RevenueCat with `appUserID` during startup when available to avoid the anonymous-to-logIn bootstrap roundtrip
- [x] Re-run `npm run build:ios`
- [ ] Re-run `npm run test:e2e:ui`
- [x] Re-run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS RevenueCat Init Serialization Fix
- [x] Update `plan.md` and `PROGRESS.md` for the RevenueCat init-serialization follow-up
- [x] Remove the remaining `getAppUserID` / purchase race from the iOS RevenueCat wrapper
- [x] Make subscription, tip, and restore calls wait for the shared RevenueCat init promise
- [x] Add narrow boundary logs around the direct `purchaseStoreProduct` call
- [x] Re-run `npm run build:ios`
- [x] Re-run `npm run test:e2e:ui`
- [x] Re-run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS Profile App Icon Picker
- [x] Update `plan.md` and `PROGRESS.md` for the iOS app-icon picker task
- [x] Extend the icon export pipeline for neutral `Black`, `Ivory`, and `Silver` iOS icon sets plus Profile preview PNGs
- [x] Replace the primary iOS icon with `Black` and add `Ivory` / `Silver` alternate icon asset catalogs
- [x] Add the native Capacitor app-icon plugin and Xcode alternate-icon configuration
- [x] Add the iOS-only Profile app-icon picker UI and JS wrapper
- [x] Run `npm run build:ios`
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS App Icon Variant Refresh
- [x] Update `plan.md` and `PROGRESS.md` for the icon-variant refresh follow-up
- [x] Restore the primary app icon to the default brand icon and remove the `Ivory` alternate
- [x] Replace the third icon with a simpler-font alternate `L` in a different color
- [x] Update the native icon mappings and iOS Profile picker labels/options
- [x] Run `node scripts/export_logos.js`
- [x] Run `npm run build:ios`
- [x] Run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Simplify iOS Billing to Auto-Style Direct Plugin Calls
- [x] Update `plan.md` and `PROGRESS.md` for the direct-plugin iOS billing follow-up
- [x] Remove the custom RevenueCat wrapper from the iOS purchase critical path
- [x] Configure RevenueCat directly in the app shell and log in the authenticated user with direct plugin calls
- [x] Replace the iOS paywall subscribe/restore flow with direct `Purchases.getProducts()` and `purchaseStoreProduct()` / `restorePurchases()`
- [x] Replace the iOS tip purchase flow with direct `getProducts()` and `purchaseStoreProduct()` while keeping the existing tip-intent sync
- [x] Trim `web/src/lib/revenuecat.js` down to stateless helpers only
- [x] Run `npm run build:ios`
- [x] Run `npm run test:e2e:ui`
- [x] Run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS App Icon Variant Correction
- [x] Update `plan.md` and `PROGRESS.md` for the icon-correction follow-up
- [x] Change `Black` to the default Lovetta-style script icon in black
- [x] Replace `Blue` with the single simple `Silver` icon variant
- [x] Update the native icon mappings, preview assets, and iOS Profile picker labels/options
- [x] Run `node scripts/export_logos.js`
- [x] Run `npm run build:ios`
- [x] Run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS App Icon Selected Badge Layout
- [x] Update `plan.md` and `PROGRESS.md` for the app-icon layout follow-up
- [x] Fix the selected-state badge layout so it does not overlap the icon label on mobile
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Profile Page App Icon Crash Guard
- [x] Update `plan.md` and `PROGRESS.md` for the Profile crash follow-up
- [x] Remove the eager native app-icon lookup from Profile page load
- [x] Guard the app-icon picker behind plugin availability and local fallback state
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Restore iOS App Icon Picker Visibility
- [x] Update `plan.md` and `PROGRESS.md` for the visibility follow-up
- [x] Remove the overly strict app-icon visibility gate from Profile
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Restore App Icon Placement In Profile
- [x] Update `plan.md` and `PROGRESS.md` for the placement follow-up
- [x] Move the relay email prompt lower so the app-icon picker stays near the top of Profile
- [ ] Run `npm run test:e2e:ui`
- [ ] Update `plan.md` and `PROGRESS.md` with final status and notes

## Payment Restructure Completion
- [x] Inspect the current iOS billing code path and remove paywall-local RevenueCat bootstrap calls
- [x] Remove tip-checkout RevenueCat bootstrap calls while preserving tip-intent sync
- [x] Keep the shared RevenueCat helper file stateless-only
- [x] Clarify `AGENTS.md` so non-destructive escalated local build/test prompts default to yes
- [x] Run `npm run build:ios`
- [x] Run `npm run test:e2e:ui`
- [x] Run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Apple Private Relay Email Handling
- [x] Add v38 migration: email_type, email_disabled, email_disabled_reason, real_email columns + backfill
- [x] Add classifyEmail() helper and set email_type at Apple sign-in (new user, synthetic, account-link paths)
- [x] Expose email_type and real_email in sanitizeUser()
- [x] Add email_disabled + synthetic @apple.lovetta.ai exclusions to all 5 scheduler queries
- [x] Add COALESCE(real_email, email) to scheduler queries for real-email preference
- [x] Update proactive.js: add email_disabled/email_type to query, guard email send for disabled/synthetic
- [x] Add /api/email-events bounce webhook endpoint with Svix signature verification
- [x] Add PUT /api/user/real-email endpoint in user-api.js
- [x] Create RealEmailPrompt component for relay/synthetic users on Profile page
- [x] Update plan.md and PROGRESS.md
- [ ] Run tests (npm run test:e2e:api)

## Global Permission Preference Instruction
- [x] Update `plan.md` and `PROGRESS.md` for the global permission-preference task
- [x] Update `AGENTS.md` with explicit default-yes permission wording
- [x] Populate `/Users/vasily/.codex/AGENTS.md` with the same global operator preference
- [x] Skip tests because this is instruction-only work
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Restore App Icon Placement In Profile
- [x] Update `plan.md` and `PROGRESS.md` for the placement follow-up
- [x] Move the relay email prompt lower so the app-icon picker stays near the top of Profile
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Restore App Icon Picker Runtime Wiring
- [x] Update `plan.md` and `PROGRESS.md` for the runtime-wiring follow-up
- [x] Register the local `AppIconPlugin` with the Capacitor bridge
- [x] Replace the fragile iOS render gate with a more reliable native-iPhone check
- [x] Run `npm run build:ios`
- [x] Run `xcodebuild -workspace web/ios/App/App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`

## iOS Tip Thank-You Sync Fix
- [x] Add `thankYouReady` to the private iOS tip-intent status response
- [x] Wait for `thankYouReady` in the iOS RevenueCat tip poller before resolving tip success
- [x] Extend API billing coverage for companion-bound and non-companion iOS tip intent readiness
- [x] Add Stripe webhook coverage for the web companion tip thank-you path
- [x] Run `npm run test:e2e:api`
- [x] Run `npm run test:e2e:ui`
- [x] Run `npm run build:ios`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes
- [x] Run `npm run test:e2e:ui`
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## Remove App Icon Helper Copy
- [x] Update `plan.md` and `PROGRESS.md` for the Profile copy cleanup
- [x] Remove the `Saved on this iPhone only.` helper line from the app-icon card
- [x] Skip tests because this is a copy-only UI change
- [x] Update `plan.md` and `PROGRESS.md` with final status and notes

## iOS Keyboard Covering Input Bars + Header Shift
- Problem: (1) keyboard covers input bars on chat/support/add-email, (2) header shifts down after keyboard closes
- FAILED: scrollIntoView on focus — broke screen size
- FAILED: textarea rows=1 SupportChat pattern — broke scrollable Profile page
- FAILED: Remove all manual tracking (match auto no-op) — 100vh doesn't work with resize:body, input disappeared
- FAILED: Restore tracking, remove scroll lock/reset only — input still covered
- FAILED: Subtract 44px when keyboard open — condition `nextHeight < window.innerHeight` NEVER TRUE because resize:body shrinks both values together
- FAILED: Delayed scrollTo(0,0) on keyboardDidHide — header shift not fixed
- Root cause: `KeyboardResize.Body` makes Capacitor resize the WKWebView body, so both `window.innerHeight` and `visualViewport.height` shrink equally. Manual viewport tracking has no effect.
- [x] Switch to `KeyboardResize.None` so body stays full-size — visualViewport doesn't update with None either
- [x] Change capacitor.config.json `resize: "none"` + `style: "dark"`
- FAILED: KeyboardResize.None + visualViewport.height — vv.height doesn't shrink with None, input stays covered
- FAILED: KeyboardResize.None + keyboardHeight from event — input works but top shifts (keyboardHeight includes safe area bottom that innerHeight doesn't)
- FAILED: KeyboardResize.None + min(vv.height, baseHeight - kbHeight) — input ok, top shifts (kbHeight wins and overshoots)
- FAILED: KeyboardResize.None + only vv.height on keyboardDidShow — vv.height doesn't shrink, both break
- FAILED: KeyboardResize.None + kbHeight - measured safeAreaBottom — measurement off, both still broken
- FAILED: KeyboardResize.None + vv.height with resize listener — causes jumping during animation
- **CURRENT STATE (input WORKS, top BROKEN):** `KeyboardResize.None` + `baseHeight - keyboardHeight` — input fully visible above keyboard, but top header shifts down because keyboardHeight includes safe area bottom (~34px) that innerHeight doesn't

## iOS Keyboard Offset Refactor (Chat, Support, Add Email)
- [x] Update `plan.md` and `PROGRESS.md` with the shared keyboard-offset refactor scope before code changes
- [x] Refactor `web/src/lib/keyboard.js` to keep a stable viewport height and a separate `--app-keyboard-offset` value
- [x] Apply the bottom-offset-only layout fix to chat, support, and add-email without moving the header/top area
- [x] Add or tighten iOS-testable labels/identifiers on the affected headers and inputs
- [x] Extend `web/ios/App/AppUITests/AppUITests.swift` with native keyboard regression coverage for chat, support, and add-email
- [x] Run `npm run test:e2e:ui`
- [x] Run `npm run build:ios`
- [x] Run `xcodebuild -workspace /Users/vasily/projects/lovetta/web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Update `plan.md` and `PROGRESS.md` with final status, what worked, and what failed

## iOS Companion List Overscroll Clamp
- [x] Update `plan.md` and `PROGRESS.md` with the companion-list overscroll follow-up before code changes
- [x] Replace the companion-list root `min-h-screen` shell with a safe-area-adjusted fixed-height layout
- [x] Keep list scrolling inside the page content instead of the outer document so the screen cannot be dragged down slightly
- [x] Run `npm run test:e2e:ui`
- [x] Run `npm run build:ios`
- [x] Commit only the task-related files

## Global iOS Pull-Down Clamp
- [x] Update `plan.md` and `PROGRESS.md` with the global iOS shell-clamp scope before code changes
- [x] Add a shared native iOS shell class in `App.jsx` / `index.css` that clamps the outer document and app shell height
- [x] Add a shared page-height helper and switch the remaining full-screen routes away from raw `min-h-screen`
- [x] Keep long-page scrolling inside route-owned `flex-1 min-h-0 overflow-y-auto` regions instead of document scroll
- [x] Align existing iOS fixed-height pages and `PlanModal` full-screen mode with the same shell contract
- [x] Extend UI regression coverage for the shared shell contract
- [x] Extend `web/ios/App/AppUITests/AppUITests.swift` with non-keyboard pull-down regression coverage
- [x] Run `npm run test:e2e:ui`
- [x] Run `npm run build:ios`
- [x] Run `xcodebuild -workspace /Users/vasily/projects/lovetta/web/ios/App/App.xcworkspace -scheme AppUITests -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.1' CODE_SIGNING_ALLOWED=NO build`
- [x] Update `plan.md` and `PROGRESS.md` with final status, root cause, and verification notes
