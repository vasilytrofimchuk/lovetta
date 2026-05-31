# Apple "Ghost Signup" Investigation — Decision Report

## TL;DR

- **The "60 of 97 / 33 zero-action / 19 of 20 privaterelay" signal is mostly a measurement artifact**, not an Apple OAuth bug. A 60s debounce on `last_activity` in `server/src/auth-middleware.js:8-27` combined with `api_consumption` only tracking *AI/billing* calls (not `/me`) makes engaged users look identical to true ghosters in the weekly funnel.
- **Smoking gun:** for ghoster `shhrdvsh72@privaterelay.appleid.com`, Heroku logs show `/api/auth/me`, `/api/billing/status`, `/api/companions`, `/api/support/unread` all 200 within 7s of signup, yet DB `last_activity = created_at + 0.328s`. The "no follow-up authenticated request" premise is false.
- **The bucket histogram of (last_activity − created_at) spikes at exact multiples of 60s** (0-20s:29, 60-80s:11, 120-140s:6, 180-200s:9) — mathematically impossible from real user behavior, dispositive proof of the debounce artifact.
- **However, a residual real-ghoster cohort exists:** ~14 of 16 zero-action privaterelay users in 7d also have zero `companion_created`, zero `first_message_sent`, zero messages. These are real drop-offs, but the rate (~28-31%) is **provider-agnostic** (Apple 22.5% / Google 23.1% / Email 15.8% over 30d) — the privaterelay correlation is a base-rate artifact (91% of Apple uses relay).
- **Real conversion bottleneck for the residual cohort:** the post-signup forced-paywall (`/pricing?onboarding=1` → `<PlanModal fullScreen>` with only a small muted "Skip for now" link), which `welcome_flow_B_skip_create` (flipped on at 2026-05-30 23:33 UTC, 14 min before analysis, no signups since) is designed to mitigate.

## Evidence Summary

| Signal | Confidence | Source |
|---|---|---|
| ACTIVITY_DEBOUNCE = 60_000ms exists and is observable | **certain** | `server/src/auth-middleware.js:8-27`; histogram spikes at 60/120/180/240/300s |
| Ghoster `72266e0b` made 6+ authed calls but shows active_seconds=0.328 | **certain** | Heroku router logs, IP `174.179.164.121`, 20:29:16-20:29:23 |
| `api_consumption` only logs AI/billable calls — bad proxy for "did user return" | **certain** | `server/src/consumption.js:36-45` |
| Zero-action rate is provider-agnostic (Apple 22.5% / Google 23.1%) | **certain** | Prod SQL, 30d n=326 |
| Privaterelay correlation is base-rate (91% of Apple = relay) | **certain** | Prod SQL, 52/57 |
| Apple JWT verification path is healthy (1 non-200/5000 logs, legitimate `age_consent_required`) | **certain** | Heroku logs grep |
| Refresh token rows exist for 16/16 ghosters within 30ms of signup | **certain** | Prod SQL on `refresh_tokens` |
| `appendUserAgent: "Capacitor lovetta-ios"` reaches 0/862 users in 90d, despite 83 RevenueCat subs (= unambiguously native iOS) | **certain** | Prod SQL on `users.user_agent` |
| 14 of 16 zero-action ghosters ALSO have zero companion_created/messages | **high** | Prod SQL cross-check on `user_events` |
| `AuthContext.refreshUser` unconditionally clears tokens on any /me error | **certain (code)** but **unverified as cause** | `web/src/contexts/AuthContext.jsx:37-40` |
| Post-signup destination is `/pricing?onboarding=1` → `<PlanModal fullScreen>` | **certain** | `web/src/pages/Signup.jsx:43`; `web/src/pages/Pricing.jsx:74-88` |
| `welcome_flow_B_skip_create` flipped on at 2026-05-30T23:33:54Z, 0 signups since | **certain** | Prod SQL on `app_settings` |

## Ranked Hypotheses

| # | Hypothesis | Confidence | Verified? | Reason |
|---|---|---|---|---|
| 1 | **Measurement artifact: `last_activity` 60s debounce + `api_consumption` AI-only logging** corrupts the "ghoster" metric. Most of the headline number is fake. | **very high** | YES (debounce confirmed, histogram dispositive, real user with 6 calls shows 0.328s) | Surviving root cause for the *headline number* |
| 2 | **Residual cohort drops off at the forced post-signup paywall** (`PlanModal fullScreen`); provider-agnostic ~25% rate; partially mitigated by Welcome Flow B (just enabled, untested in prod) | high | partial (code path confirmed; can't measure paywall_close events because no instrumentation exists) | Surviving root cause for the *real* drop-offs |
| 3 | **Capacitor `appendUserAgent` not reaching server** → device_type misclassified, native-iOS users look like "web-mobile" | high | YES (0/862 UA matches, 83 RevenueCat subs) | Real bug, but **unrelated** to ghosting; affects analytics only |
| 4 | `AuthContext.refreshUser` unconditionally clears tokens on any /me failure | medium (code defect) | **refuted as cause** | Real latent footgun for *returning* users on transient outages, but ghosters' /me returned 200 — not their failure mode |
| 5 | Login.jsx `<AppleSignIn>` missing `onSuccess` strands users | low | **refuted as cause** | First-time Apple users get `age_consent_required` and hard-redirect to /signup before completing on Login — they go through Signup.jsx onSuccess path |
| 6 | iOS WKWebView JS suspension during ASAuthorizationController sheet kills response delivery | low | not verified, evidence thin | Plausible but no Sentry/log signal; native-app users are likely a small fraction anyway |
| 7 | Welcome Flow B will halve the ghost rate | medium | **untestable** (0 post-flag signups) | Will help paywall-bouncers; won't help the (small) refreshUser-clears-tokens cohort |

## Recommended Fix

This is fundamentally **"instrument + observe"** plus three small surgical code fixes. We cannot ship one diff that "solves" the ghosting because the headline number was largely fictional.

### Fix 1 — Stop corrupting `last_activity` (high leverage, low risk)

**File:** `/Users/vasily/projects/lovetta/server/src/auth-middleware.js:8-27`

Make the activity write monotonic and either shorten or remove the debounce for new users:

```js
// Either remove debounce entirely (preferred — Postgres can handle ~10 writes/req)
// OR keep debounce but guard against rewinds and remove for first 5 min after signup
const ACTIVITY_DEBOUNCE = 5_000;  // was 60_000
// In the UPDATE: use GREATEST(last_activity, NOW()) so fire-and-forget can never rewind
pool.query(
  'UPDATE users SET last_activity = GREATEST(last_activity, NOW()) WHERE id = $1',
  [userId]
);
```

**File:** `/Users/vasily/projects/lovetta/server/src/auth-api.js:923` (and the equivalents in google callback line ~534, google token ~673, telegram ~1039)

Either await the inline `UPDATE users SET last_activity = NOW()` before `res.json()`, or remove it entirely and let the next `/api/auth/me` middleware hit do it. Currently it races the middleware UPDATE and can land second.

### Fix 2 — Fix the funnel metric

**File:** `/Users/vasily/projects/lovetta/server/src/admin-api.js:472`

Replace:
```sql
(SELECT COUNT(*) FROM cohort WHERE last_activity > created_at + INTERVAL '5 minutes') AS returned
```
with a real activity signal:
```sql
(SELECT COUNT(*) FROM cohort c WHERE EXISTS (
   SELECT 1 FROM user_events e
   WHERE e.user_id = c.id
     AND e.created_at > c.created_at + INTERVAL '5 minutes'
) OR EXISTS (
   SELECT 1 FROM messages m
   JOIN conversations cv ON cv.id = m.conversation_id
   WHERE cv.user_id = c.id AND m.role = 'user'
)) AS returned
```

### Fix 3 — Don't clear tokens on transient errors (latent footgun)

**File:** `/Users/vasily/projects/lovetta/web/src/contexts/AuthContext.jsx:27-44`

Only clear tokens on 401 from `/me`. On network errors / 5xx, keep tokens, set user=null, let `api.js` interceptor handle 401-refresh on next request:

```js
} catch (err) {
  setUser(null);
  if (err?.response?.status === 401) {
    localStorage.removeItem('lovetta-token');
    localStorage.removeItem('lovetta-refresh-token');
  }
  // Otherwise keep tokens — next request will either succeed or 401-refresh
}
```

### Fix 4 — Defer post-signup paywall (real drop-off mitigation)

Either crank `welcome_flow_B_variant_pct` to 100, OR make the A_control path also defer the `<PlanModal fullScreen>` until the user has sent N messages. Mirror the pattern from commit `2754226` that already defers the in-list PlanModal in `CompanionList.jsx:42-53`.

**File:** `/Users/vasily/projects/lovetta/web/src/pages/Pricing.jsx:74-88` — when `?onboarding=1` and user has zero companions and zero messages, navigate to `/` instead of rendering `<PlanModal>`.

### Fix 5 — Server-side device classification (orthogonal cleanup)

**File:** `/Users/vasily/projects/lovetta/server/src/device.js:10-26`

Add fallback: if UA matches `/iPhone|iPad/` AND lacks `Safari/`, return `'ios'`. Mirrors commit `e153d71`. Better: send explicit `X-Lovetta-Platform: ios-native` header from `web/src/lib/api.js` when `isCapacitor()`, and read it server-side.

## Parallel Safety Net (ship NOW, helps even if root cause re-shuffles)

1. **Server-issued sentinel observability** — in `/api/auth/apple` (and google/email), emit a `user_events` row with `event_type='signup_response_sent'` AND a separate row `event_type='first_authenticated_request'` from `auth-middleware.js` on each user's *very first* `/api/auth/me` hit (regardless of debounce). This decisively isolates "client never returned" from "client returned but bounced off Pricing."
2. **Sentry breadcrumb in `AuthContext.refreshUser`** on any caught error — log `err.code`, `err.response?.status`, online state. We need to see whether the catch block ever actually fires for new users in the wild.
3. **Sentry breadcrumb on `PlanModal` close-without-subscribe** with `firstSession=true` flag — quantifies paywall abandonment per provider.
4. **Log `User-Agent` of every `/api/auth/apple` call for 24h** — confirms whether `appendUserAgent` is reaching production from the live App Store IPA.

## Rollout / Test Plan

| Fix | How to verify it worked |
|---|---|
| Fix 1 (debounce/race) | Re-run histogram of `last_activity − created_at` for 24h post-deploy; spikes at 60/120/180s should disappear. The "no_return_5min" rate should drop substantially. |
| Fix 2 (funnel metric) | Re-run weekly analysis; "60/97 didn't return" should restate around the **real** drop-off rate (~25% based on companion/message signals). |
| Fix 3 (refreshUser) | Sentry-instrument first; if real instances detected post-deploy, monitor weekly returning-user retention. Test locally by killing network mid-`/me`. |
| Fix 4 (paywall defer) | A/B compare `welcome_flow_B` vs A_control cohort `companion_created` rate over 1 week (need ≥100 signups per arm). Expected delta: 5-15pp. |
| Fix 5 (device classify) | After deploy: `SELECT device_type, COUNT(*) FROM users WHERE created_at > NOW()-1d` should show non-zero `'ios'` count consistent with RevenueCat signup volume. |

Real iOS device test required only for Fix 5 (UA inspection via Safari Web Inspector against TestFlight build) and to confirm the `appendUserAgent` puzzle. Everything else is server/web-only and verifiable from prod metrics within 24-48h.

## Rollback

| Fix | Rollback |
|---|---|
| 1 | Restore `ACTIVITY_DEBOUNCE = 60_000` and re-add fire-and-forget UPDATE — pure revert |
| 2 | Revert admin-api.js:472 SQL — pure revert, no schema change |
| 3 | Revert AuthContext catch block — pure revert; behavior was the old stranding, no data loss |
| 4 | Flip `welcome_flow_B_variant_pct` back to 50 (or 0) via admin app_settings — no code revert needed |
| 5 | Revert device.js heuristic — `device_type` is recorded per-row, no historical pollution |

All five fixes are independently revertible. Suggested ship order: Fix 1 + Fix 2 together (decisive observability), then Fix 3 + Safety Net 1-3 (instrument before patching the real conversion bug), then Fix 4 after one week of clean data, Fix 5 anytime.

## Key Files Referenced

- `/Users/vasily/projects/lovetta/server/src/auth-middleware.js` (lines 8-27, debounce)
- `/Users/vasily/projects/lovetta/server/src/auth-api.js` (line 923, inline last_activity UPDATE; lines 816-875 Apple email branch; line 869 signup event)
- `/Users/vasily/projects/lovetta/server/src/admin-api.js` (line 472, "returned" SQL)
- `/Users/vasily/projects/lovetta/server/src/consumption.js` (lines 36-45, AI-only logging — bad proxy)
- `/Users/vasily/projects/lovetta/server/src/device.js` (lines 10-26, classifyDevice)
- `/Users/vasily/projects/lovetta/web/src/contexts/AuthContext.jsx` (lines 27-44, refreshUser catch)
- `/Users/vasily/projects/lovetta/web/src/components/AppleSignIn.jsx` (line 23 isCapacitor gate, lines 60-68 token+refreshUser+onSuccess)
- `/Users/vasily/projects/lovetta/web/src/pages/Signup.jsx` (line 43 postSignupPath, line 375 AppleSignIn wired, line 194 handleSocialSuccess)
- `/Users/vasily/projects/lovetta/web/src/pages/Login.jsx` (line 167 AppleSignIn no onSuccess — investigated but refuted as cause)
- `/Users/vasily/projects/lovetta/web/src/pages/Pricing.jsx` (lines 74-88 onboarding PlanModal; line 128 isAppStore PlanModal)
- `/Users/vasily/projects/lovetta/web/src/components/PlanModal.jsx` (lines 291-295 muted Skip-for-now button)
- `/Users/vasily/projects/lovetta/web/capacitor.config.json` (line 7 appendUserAgent — not reaching prod)
- `/Users/vasily/projects/lovetta/web/src/lib/postSignupNav.js` (lines 11-17 fallback to /pricing?onboarding=1)
