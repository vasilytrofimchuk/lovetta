# Lovetta — Progress

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
- [ ] TODO (manual): Create RevenueCat project + App Store Connect products
- [ ] TODO (manual): Add Apple Developer credentials (APPLE_CLIENT_ID, APPLE_TEAM_ID, etc.) to .env and Heroku
- [ ] TODO (manual): Add APNs credentials (APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY) to .env and Heroku
- [ ] TODO (manual): Add RevenueCat API key + webhook secret to .env and Heroku
- [ ] TODO (manual): Enable Sign in with Apple + Push Notifications capabilities in Xcode
- [ ] TODO (manual): Configure provisioning profiles and signing
- [ ] TODO (manual): Generate App Store screenshots and metadata
- [ ] TODO (manual): Replace REVENUECAT_API_KEY placeholder in web/src/lib/revenuecat.js

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
