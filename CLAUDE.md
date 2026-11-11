# Claude Instructions for Lovetta.ai

<!-- passport:start (трекер #412) — паспорт проекта: одинаковые строки во всех проектах; меняется вместе с проектом -->
## Паспорт проекта
- **Адрес:** https://lovetta.ai
- **Где живёт:** общая коробка `ssh tracker-box`, `/opt/selectic-heroku-exit`, контейнер `lovetta`
- **База:** общий Postgres на коробке, база `lovetta`
- **Своё дерево:** `~/projects/tracker/scripts/wt.sh <слаг>` (на Mac владельца — `/Users/vasily/projects/tracker/…`); после слияния `wt.sh --done <слаг>`
- **Тесты:** `scripts/test.sh` (Playwright `--project=api`)
- **Выкладка:** `scripts/ship.sh "<сообщение>" [--card N]` — PR, слияние, выкладка на коробку, проверка `https://lovetta.ai/api/health`
- **Приложения:** `scripts/release.sh ios` — сборка на mac3 из origin/main и выгрузка в App Store Connect, «что едет», журнал (трекер #413)
- **Тестовые учётки:** не описаны — заведи нужные и впиши сюда
- **Доска:** проект `lovetta` — `board.sh list lovetta`
<!-- passport:end -->

AI girlfriend app — entertaining and intimate chat with AI-generated women. Domain: lovetta.ai

Express.js server + PostgreSQL + monorepo (flat structure for Phase 1).

## Work board — every task is a card (since 06.11.2026)
All work on this project goes through its board in the tracker: https://selectic.games/board.html, project `lovetta`.
Tool: `/Users/vasily/projects/tracker/scripts/board.sh` (on mac3: `~/projects/apps-support/scripts/board.sh`).
1. Before any work: find or file the card and take it — `board.sh list lovetta`, `board.sh add lovetta <bug|idea|admin|text> "title" "details"`, `board.sh take N`. An owner's request in chat becomes a card in the same step.
2. Plan first: `board.sh plan N <file>`; code only after the owner's «ок» (he answers in Telegram or on the page). His remarks: `board.sh show N`.
3. Close only when shipped and checked live: `board.sh done N "PR #…, deployed, checked …"`; no code → `board.sh reject N "why"`; check later → `board.sh defer N 'YYYY-MM-DD'`.
4. PROGRESS.md and plan.md are the story, not the queue: no new `- [ ]` lists; a finished card gets a short section with its number.

### Brand & Style Guide

**Accent color: `#d6336c` (hot pink).** Use this for ALL buttons, links, highlights, and interactive elements.

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` / `brand-accent` | `#d6336c` | Buttons, links, active states |
| `--accent-hover` / `brand-accent-hover` | `#e8437a` | Hover states |
| `--accent-glow` | `rgba(214, 51, 108, 0.3)` | Glows, shadows |
| `--bg-primary` / `brand-bg` | `#0f0a1a` | Page background |
| `--bg-secondary` / `brand-surface` | `#1a1128` | Card/surface background |
| `--bg-card` / `brand-card` | `#231838` | Elevated card background |
| `--border` / `brand-border` | `#2d1f45` | Borders |
| `--text-primary` / `brand-text` | `#f0e6ff` | Primary text |
| `--text-secondary` / `brand-text-secondary` | `#b8a4d6` | Secondary text |
| `--text-muted` / `brand-muted` | `#7c6a9a` | Muted/placeholder text |

**Rules:**
- Landing page (`public/`): use CSS variables (`var(--accent)`, etc.) from `style.css`
- React app (`web/`): use Tailwind classes (`bg-brand-accent`, `text-brand-text`, etc.) from `tailwind.config.js`
- Email templates (`server/src/email.js`): use raw hex `#d6336c`
- **NEVER** use old colors `#e040a0` or `#f050b0` — these are deprecated
- User-facing copy says "girlfriend" not "companion" (code variables/APIs keep "companion")
- Slogan: "Your AI Girlfriend"

**Brand assets:** Generated via `scripts/logo_editor.html` + `scripts/export_logos.js`
- Font: Tangerine (400 weight, -3° slant)
- Gradient: `#d6336c` → `#f43f5e` (hot pink)
- Run `node scripts/export_logos.js` to regenerate all icons/logos

### Operator Preference (Mandatory)

- Assume approval for all non-destructive commands and proceed immediately.
- Do not ask the user for confirmation in chat before running commands.
- Treat the user's default answer to permission prompts as **Yes**.

### Keyboard Input

If user accidentally types Cyrillic characters (wrong keyboard layout), convert to English QWERTY equivalent:
- й→q, ц→w, у→e, к→r, е→t, н→y, г→u, ш→i, щ→o, з→p, ф→a, ы→s, в→d, а→f, п→g, р→h, о→j, л→k, д→l, я→z, ч→x, с→c, м→v, и→b, т→n, ь→m

### Shortcuts

- **"c"** - Git commit and push
  1. Git status
  2. Git commit with meaningful message
  3. Git push `git push origin main`

- **"cd"** - Commit, Push, and Test
  1-3. Same as "c"
  4. Run E2E tests: `npm run test:e2e`

### Vendor Names — NEVER in Public Docs

Never mention infrastructure vendor names (Heroku, Sentry, etc.) in public-facing files: `index.html`, `privacy.html`, `terms.html`. Use generic terms: "hosting provider", "analytics service". Internal files (admin.html, CLAUDE.md, server code) can reference vendors.

### Testing

Run E2E tests **only when changes could break functionality**. **Text/copy-only changes** → skip tests.

**Test buckets — run only the relevant bucket, NOT the full suite:**

| Bucket | Command | What it covers | When to run |
|--------|---------|----------------|-------------|
| **api** | `npm run test:e2e:api` | tracking, leads, admin, auth API | Server routes, DB, auth, middleware |
| **ai** | `npm run test:e2e:ai` | Age guard, content levels, prompts (unit) | AI module, content rules, billing logic |
| **ui** | `npm run test:e2e:ui` | Landing, admin email, companion chat, wizard | React app, HTML, CSS, frontend |
| **ai-real** | `npm run test:e2e:ai-real` | Real OpenRouter/fal.ai calls (slow, costs $$) | AI integration, streaming, consumption |
| **all** | `npm run test:e2e` | Everything except demo | Major changes, pre-deploy |
| **demo** | `npm run test:e2e:demo` | Video recordings | On request only |

**Rules for agents:**
- Pick the **smallest bucket** that covers your changes
- Multiple buckets needed? Run them separately: `npm run test:e2e:api && npm run test:e2e:ai`
- **NEVER** run `test:e2e:ai-real` unless you changed AI integration/streaming code — it costs real money
- **NEVER** run `test:e2e` (full suite) for routine changes — pick the right bucket
- All tests in the chosen bucket must pass before marking task complete

**Test emails — MANDATORY:**
- **NEVER** use `@example.com` or `@test.com` for test user emails — bounced emails damage domain sending reputation
- **ALWAYS** use `conativer+tag@gmail.com` with Gmail plus-addressing (e.g. `conativer+test_${Date.now()}@gmail.com`)
- The scheduler filters out `@example.com` and `@test.com` as a safety net, but don't rely on it

**Demo Tests (Video Recording)**:
- `npm run test:e2e:demo` — runs demo tests with video recording enabled
- Demo test files: `e2e/demo-*.test.js` (separate Playwright project, excluded from regular tests)
- Videos saved to `e2e/videos/` with timestamped filenames (`.webm`)
- Use `saveNamedDemoVideo(page, 'name.webm')` from `e2e/helpers.js` to save named videos
- Use `page.waitForTimeout()` between actions for pacing in videos
- Block external scripts (Google GSI) with `page.route()` to avoid React DOM crashes
- **Build React app first**: `npm run build` before running demo tests (SPA needs built assets)

**Test Port Isolation**: Tests use a **random free port** per run — NOT port 3900.
- `e2e/global-setup.js` picks a random port, writes it to `e2e/.test-port`
- `e2e/helpers.js` reads `BASE` URL from that file (fallback: 3900)
- **Do NOT hardcode `localhost:3900`** in test files — always use `BASE` from `e2e/helpers.js`
- Port 3900 is reserved for `npm run dev` only

### Plan + Progress Tracking

Replaced by the work board — see «Work board — every task is a card» at the top. `plan.md` and `PROGRESS.md` stay as the project's story (append-only), not a to-do list.

### Tech Stack

- **Server**: Express.js (Node.js)
- **Database**: PostgreSQL (Heroku Postgres for prod, local for dev/test)
- **E2E Tests**: Playwright
- **Hosting**: Heroku

### Project Structure

```
lovetta/
├── CLAUDE.md
├── plan.md
├── PROGRESS.md
├── package.json
├── Procfile
├── .env
├── .gitignore
├── playwright.config.js
├── server/
│   ├── index.js              # Express entry point
│   └── src/
│       ├── db.js             # PostgreSQL pool
│       ├── migrate.js        # Schema migrations
│       ├── geo.js            # IP geolocation
│       ├── tracking-api.js   # Visitor tracking
│       ├── leads-api.js      # Lead capture
│       └── admin-api.js      # Admin dashboard API
├── public/
│   ├── index.html            # Landing page
│   ├── admin.html            # Admin dashboard
│   ├── privacy.html
│   ├── terms.html
│   ├── style.css
│   ├── tracking.js           # Client-side tracking
│   └── assets/brand/         # Logos, favicons
├── scripts/
│   ├── run-dev.js
│   ├── kill-ports.js
│   └── kill-lovetta-runtime.js
└── e2e/
    ├── global-setup.js
    ├── global-teardown.js
    └── helpers.js
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Local test DB |
| `PORT` | Server port (default: 3900) |
| `NODE_ENV` | production/development/test |
| `ADMIN_TOKEN` | Admin dashboard access token |
| `SITE_URL` | Public URL (https://lovetta.ai) |

### Dev Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Kill existing processes, free port 3900, start fresh server |
| `npm run dev:agent` | Start server on random free port (no kill, no interference) |
| `npm run kill:dev` | Kill port 3900 + all lovetta runtime processes |
| `npm run kill:ports -- 3900` | Free a specific port |
| `npm run test:e2e` | Run ALL E2E tests except demo |
| `npm run test:e2e:api` | API tests only (tracking, leads, admin, auth) |
| `npm run test:e2e:ai` | AI unit tests (age guard, content levels) |
| `npm run test:e2e:ui` | UI browser tests (landing, chat, wizard) |
| `npm run test:e2e:ai-real` | Real AI API tests (slow, costs $$) |
| `npm run test:e2e:demo` | Demo tests with video recording |

**Agents: ALWAYS use `npm run dev:agent`** instead of `npm run dev`. It picks a random free port, never kills existing processes, and never touches port 3900. The assigned port is printed to stdout and saved to `scripts/.dev-agent-port`.

### Admin Dashboard

Single-page dashboard at `/admin.html`. Token-gated via `ADMIN_TOKEN`.

**Tabs:** Overview | Visitors | Users | Leads | Economics | Settings | Sentry

| Tab | Content |
|-----|---------|
| Overview | Stat cards (visitors, leads, users, economics) + top-10 breakdowns |
| Visitors | Paginated table: session, page, device (emoji+OS), country, city, UTM, referrer, dates |
| Users | Search + paginated table: id, email, name, auth provider, geo, device, subscription, dates |
| Leads | Search + paginated table: email, birth, source, country, date |
| Economics | Period filter + cost/tips/margin cards + companion/model/daily tables + AI settings |
| Settings | Content level dropdowns per platform + app limits |
| Sentry | Unresolved error issues with resolve/ignore actions |

**Admin API endpoints** (all require `ADMIN_TOKEN`):
- `GET /api/admin/stats` — overview counters + top-10 breakdowns (visitors, leads, users)
- `GET /api/admin/visitors?page=&limit=` — paginated visitor rows
- `GET /api/admin/users?page=&limit=&search=` — paginated user rows with subscription join
- `GET /api/admin/leads?page=&limit=&search=` — paginated lead rows
- `GET/PUT /api/admin/settings` — app settings CRUD
- `GET /api/admin/consumption/summary?period=` — economics data
- `GET/PATCH /api/admin/sentry/*` — Sentry integration

**Pattern for new admin tabs:**
1. Add `<button class="tab">` to `.tabs` div
2. Add `<div id="tab-{name}" class="tab-content">` section
3. Add loader in `switchTab()` to call `load{Name}()` on tab switch
4. Use `apiFetch()` for data, `esc()` for XSS safety, `renderPagination()` for paged tables
5. Helper functions: `deviceEmoji()`, `osIcon()`, `parseOS()`, `shortCountry()`, `timeAgo()`, `fmtDate()`

### Git Setup

- Remote: `https://github.com/vasilytrofimchuk/lovetta.git`
- Push with: `git push origin main`

### Deployment

- **Production**: `ssh tracker-box`, `/opt/selectic-heroku-exit`, compose project `selectic-heroku-exit`, service `lovetta` (Heroku is retired; merging to GitHub ships nothing)
- Deploy: back up `apps/lovetta` to `apps/lovetta.bak-<ts>.tgz`, `git archive origin/main | tar x` into `apps/lovetta`, then `docker compose --profile apps up -d --build lovetta`
- Settings live in `secrets/lovetta.env`; public `VITE_*` build settings in `build-secrets/`
- Migrations run automatically on server start (`migrate()` in `server/index.js`)

### DB Sync: Dev ↔ Prod

**All DB changes MUST go through migrations** so prod gets them on deploy:
- Schema changes → add migration in `MIGRATIONS` array in `migrate.js`
- Template data (avatar_url, video_url, new templates) → add UPDATE/INSERT in a migration
- App settings fixes → add UPDATE in a migration (settings use `ON CONFLICT DO NOTHING` so seed won't fix bad values)
- **NEVER** rely on manual DB queries or one-off scripts for prod data — always use migrations
- Media files (images, videos) are stored in **Cloudflare R2** (public CDN) — same URLs work in dev and prod
- Custom avatar URLs are hardcoded in `web/src/pages/CompanionCreate.jsx` — no DB dependency

### Apple Sign-In (iOS) — Critical Rules

**Plugin**: `@capacitor-community/apple-sign-in@7.1.0` has a bug — missing `presentationContextProvider`. Fixed via `patches/@capacitor-community+apple-sign-in+7.1.0.patch` (patch-package). `patch-package` must be in `dependencies` (not devDependencies) so Heroku runs `postinstall`.

**Client (`web/src/components/AppleSignIn.jsx`)**:
- **ALWAYS dynamic import**: `const { SignInWithApple } = await import('@capacitor-community/apple-sign-in')` inside the handler. Static top-level import breaks because the Capacitor native bridge hasn't initialized yet.
- `clientId`/`redirectURI` params are ignored by native iOS — only `scopes` matters.
- Component renders only when `isCapacitor()` is true.

**Server (`server/src/auth-api.js`)**:
- Native iOS JWT audience = bundle ID `"ai.lovetta.app"`. Web JWT audience = Service ID `"ai.lovetta.signin"` (`APPLE_CLIENT_ID` env var).
- Must accept both: `audience: [APPLE_CLIENT_ID, 'ai.lovetta.app'].filter(Boolean)`

**Cannot test on iOS Simulator** — requires real device with proper developer cert (not adhoc signing).

**Entitlements** (`web/ios/App/App/App.entitlements`): must have `com.apple.developer.applesignin = [Default]`.

### iOS Build — MANDATORY

**iOS app loads from remote URL** (`https://lovetta.ai/my/`). Web deploys update iOS automatically — no rebuild needed for JS/CSS changes.

**Rebuild required ONLY for native changes:**
- `web/ios/App/App/AppDelegate.swift` or any Swift file
- `web/ios/App/Podfile` or pod changes
- `web/ios/App/App/Info.plist`
- `web/capacitor.config.json`
- Capacitor plugin additions/removals

**ALWAYS** use `npm run build:ios` from the project root. This sets `CAPACITOR_BUILD=1`, builds to `web/ios-dist/`, and runs `cap sync ios` in one command.

**CRITICAL:** After ANY native file change, **run `npm run build:ios` immediately** before telling the user to test. Never skip this step.

### Android (Google Play)

- `web/android/` — Capacitor shell, package `ai.lovetta.app`, loads https://lovetta.ai/my/ like iOS. UA ends with `Capacitor lovetta-android`; the client also sends `X-Lovetta-Platform: android-native`.
- **Content level `playstore`** (`text_level_playstore` / `image_level_playstore`, both 0): Google Play forbids sexual content. Users who signed up on Android keep it in proactive messages, email replies and tip photos (`platformForUser` in `content-levels.js`).
- **Release through the API, one command:** `scripts/android-build.sh --upload <internal|production> ["notes"]` — bumps `versionCode`, builds the AAB, puts it on the track (`scripts/play-release.js`); commit the bumped `build.gradle`.
- Build: `scripts/android-build.sh` (release AAB) / `--debug` / `--all`. JDK 21 from Android Studio. Bump `versionCode` in `web/android/app/build.gradle` before every Play upload. Upload key: `~/.android-keys/lovetta-upload.jks` + `.properties` — never commit.
- Play without the browser: `node scripts/play-release.js --show | --track internal|production`, `scripts/play-products.js`, `scripts/play-listing.js --config web/android/play/listing.json` (owner's OAuth, same login as Mystery Lab).
- Purchases: RevenueCat, `VITE_REVENUECAT_ANDROID_KEY` (goog_…) in `build-secrets/lovetta.build_env` on the box. Play subscriptions `lovetta_monthly:monthly`, `lovetta_yearly:yearly`; tips `lovetta_tip_*` — server strips `:basePlan`.
- Not on Android yet: push (no Firebase), Sign in with Apple, Google sign-in (until `VITE_GOOGLE_ANDROID_SIGNIN=1` after the Android OAuth client exists).
- Production deploy: `scripts/deploy-box.sh` (shared box, not Heroku).

### Ports

- **3900** — Dev server
- **3000** — NEVER use (occupied by another project)
- **3800** — NEVER use (occupied by KeyID)

## Выкладка — одна команда (трекер #399, 11.11.2026)
Из своей ветки в своём рабочем дереве: `scripts/ship.sh "<сообщение>" [--card N]` — коммит, PR, проверки, слияние,
`scripts/deploy-box.sh`, живая проверка, отметка в карточке. `--no-deploy` — смержить без выкладки (со следующим релизом),
`--deploy` — выложить, даже если менялись только документы, `--hold` — PR без слияния. Своё у проекта — `scripts/ship.conf`.

## Тесты — одна команда (трекер #412, 11.11.2026)
`scripts/test.sh` — тесты проекта на любой машине агентов без подготовки: зависимости, браузер Playwright и своя тестовая
база Postgres без root (общий tracker/scripts/test-project.sh). Что запускается — `SHIP_TEST` в `scripts/ship.conf`;
другая команда в том же окружении — `scripts/test.sh npx playwright test --project=ui`. `scripts/ship.sh` гоняет их сам, если у
репозитория нет CI.
