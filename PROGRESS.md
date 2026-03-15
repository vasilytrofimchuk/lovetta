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
