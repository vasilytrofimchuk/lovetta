# Claude Instructions for Lovetta.ai

AI companion app — entertaining and intimate chat with AI-generated women companions. Domain: lovetta.ai

Express.js server + PostgreSQL + monorepo (flat structure for Phase 1).

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

**Test Port Isolation**: Tests use a **random free port** per run — NOT port 3900.
- `e2e/global-setup.js` picks a random port, writes it to `e2e/.test-port`
- `e2e/helpers.js` reads `BASE` URL from that file (fallback: 3900)
- **Do NOT hardcode `localhost:3900`** in test files — always use `BASE` from `e2e/helpers.js`
- Port 3900 is reserved for `npm run dev` only

### Plan + Progress Tracking — MANDATORY

Shared tracking files exist in the project root:
- `plan.md`
- `PROGRESS.md`

**BEFORE writing ANY code**: Read both files, update with current task scope.
**DURING execution**: Keep both current, mark items as completed.
**AFTER execution**: Update both with final status.

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

### Git Setup

- Remote: `https://github.com/vasilytrofimchuk/lovetta.git`
- Push with: `git push origin main`

### Deployment

- **Heroku app**: `lovetta-ai` (TBD)
- Auto-deploys from GitHub on push to main
- Procfile: `web: node server/index.js`

### Ports

- **3900** — Dev server
- **3000** — NEVER use (occupied by another project)
- **3800** — NEVER use (occupied by KeyID)
