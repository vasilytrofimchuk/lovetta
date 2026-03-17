# Claude Instructions for Lovetta.ai

AI girlfriend app — entertaining and intimate chat with AI-generated women. Domain: lovetta.ai

Express.js server + PostgreSQL + monorepo (flat structure for Phase 1).

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

Run E2E tests **only when changes could break functionality**:
- Server code, routes, API, auth, database → **always test**
- HTML structure changes → **test**
- CSS changes → **test**
- **Text/copy-only changes** → **skip tests**

When tests are needed:
1. Run relevant Playwright tests (`npm run test:e2e`)
2. All tests must pass before marking task complete

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

### Plan + Progress Tracking — MANDATORY

Shared tracking files exist in the project root:
- `plan.md`
- `PROGRESS.md`

#### BEFORE writing ANY code:
1. **Read `plan.md` and `PROGRESS.md`** — check what's done, avoid duplicating work
2. **Update `plan.md`** with the current task scope and planned execution steps
3. **Add a new section header** for your task in `PROGRESS.md`
4. **List ALL planned tasks** as unchecked `- [ ]` items in `PROGRESS.md` BEFORE executing

#### DURING execution:
- Keep `plan.md` current if scope or execution order changes
- Mark each task in `PROGRESS.md` as `[x]` immediately after completing it
- Add new sub-tasks as discovered to both files

#### AFTER execution:
1. **Update `plan.md`** with final status and implementation notes
2. **Update `PROGRESS.md`** by marking completed items and noting remaining follow-ups
3. Do NOT mark the task complete until both files are updated

#### Rules:
- Do NOT remove existing items. Only append and update statuses.
- ALL work gets logged in both files — no exceptions.

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
| `npm run kill:dev` | Kill port 3900 + all lovetta runtime processes |
| `npm run kill:ports -- 3900` | Free a specific port |
| `npm run test:e2e` | Run E2E tests (no video) |
| `npm run test:e2e:demo` | Run demo tests with video recording |

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

- **Heroku app**: `lovetta-ai`
- Auto-deploys from GitHub on push to main
- Procfile: `web: node server/index.js`
- Migrations run automatically on server start (`migrate()` in `server/index.js`)

### DB Sync: Dev ↔ Prod

**All DB changes MUST go through migrations** so prod gets them on deploy:
- Schema changes → add migration in `MIGRATIONS` array in `migrate.js`
- Template data (avatar_url, video_url, new templates) → add UPDATE/INSERT in a migration
- App settings fixes → add UPDATE in a migration (settings use `ON CONFLICT DO NOTHING` so seed won't fix bad values)
- **NEVER** rely on manual DB queries or one-off scripts for prod data — always use migrations
- Media files (images, videos) are stored in **Cloudflare R2** (public CDN) — same URLs work in dev and prod
- Custom avatar URLs are hardcoded in `web/src/pages/CompanionCreate.jsx` — no DB dependency

### Ports

- **3900** — Dev server
- **3000** — NEVER use (occupied by another project)
- **3800** — NEVER use (occupied by KeyID)
