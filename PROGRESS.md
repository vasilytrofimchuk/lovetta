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
