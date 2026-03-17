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
