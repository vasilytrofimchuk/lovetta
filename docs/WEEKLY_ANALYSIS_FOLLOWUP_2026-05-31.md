# 24h Post-Deploy Funnel Analysis — Lovetta.ai

**Window:** 2026-05-31 ~00:25Z → 2026-06-01 ~22:30Z (post v369/v370 deploy at 2026-05-30 20:25 EDT)
**Sample:** 7 non-test signups in 24h (18 across the 48h post-flip window). **Severely underpowered for any quantitative A/B claim.** Most findings are lead-indicator / artifact-validation, not effect-size estimates.

---

## 1. TL;DR

- **Debounce + funnel-SQL fixes: WORKING.** The 60s minute-multiple peaks and the 0-2s zero-tail are gone (19/97 → 0/7 exact-minute hits; 27/97 → 0/7 in 0-2s bucket). p10 dt jumped 0.10s → 134.25s. Last week's "30% ghosters" / "19/19 privaterelay zero-action" was a measurement artifact — true ghoster rate in the 18-user post-deploy cohort is **2/18 = 11%**, not ~60%.
- **Sentinels firing 1.0 per signup.** signup_response_sent = 7/7, welcome_flow_assigned = 7/7, first_authenticated_request = 7/7 (subsecond). The +2 FAR overage (14:7) is pre-existing users hitting /me once post-deploy — will settle within a week.
- **OLD "returned" metric was off by 17-28pp absolute.** On 18 post-deploy signups, OLD=50% returned vs NEW=78% returned (38.9% false-negative rate). Replaying NEW on last week's 111-user cohort: OLD said 60% ghosted, reality is ≤43% ghosted (probably 22-35%).
- **CRITICAL — Welcome Flow B is silently 100% broken.** `autoProvisionFirstCompanion` throws `invalid input syntax for type json` on every B user (onboarding.js:114-125 passes JS array to jsonb column without JSON.stringify). 0/8 B users got the auto-provisioned companion. The try/catch swallows the error and falls back to A's flow. **We are running A vs (silently-degraded A), not A vs B.** Fix this before any conclusion is drawn.
- **Paywall_closed_without_subscribe is working but mis-named as "decline" signal.** 7/7 A_control first-session users dismiss the cold paywall in **2-8s (median ~3s)** — reflexive close, not evaluation. 5/6 still go on to chat afterwards, so the paywall is friction, not the killer. One B user also fired close with path=/my/pricing — B's "skip pricing" routing has a leak (likely a consequence of the auto-provision bug above).

---

## 2. Before / After Table

| Metric | Before (last week, 7d) | After (last 24h / 48h post-flip) | Delta | Notes |
|---|---|---|---|---|
| Signups | 95-97 / 7d (~13.6/day) | 7 / 24h, 18 / 48h | Underpowered | Scout's "11" included test users |
| "Returned" by OLD def (`last_activity > created+5m`) | 39.6% (44/111) | 50.0% (9/18) | +10pp | OLD is broken; ignore |
| "Returned" by NEW def (sentinel OR msg>5s) | n/a | 77.8% (14/18) | +28pp vs OLD | True signal |
| True ghoster rate | 60.4% reported / ≤43% real | 11.1% (2/18) | -32pp vs reported | Measurement artifact gone |
| Legacy "zero-action" applied to new cohort | 30.5% (29/95) | 14.3% (1/7) — and that 1 user was demonstrably live | Artifact confirmed | Single legacy-ghoster had 5 events + 55min activity |
| Privaterelay "zero-action" | 23.1% (12/52) | 0% true ghosters (0/5); 1/5 didn't message but was active 55min | Artifact confirmed | 19/19 narrative was wrong |
| last_activity histogram, exact 60s multiples | 19/97 (19.6%) | 0/7 (0%) | Eliminated | Under H0, p(0/7) ≈ 1% |
| last_activity histogram, 0-2s bucket | 27/97 (27.8%) | 0/7 (0%) | Eliminated | GREATEST() + 5s debounce working |
| p10 (last_activity − created) | 0.10s | 134.25s | +134s | Real engagement registers |
| Median (last_activity − created) | 180.3s (on artifact peak) | 158.8s | -22s | Median similar; shape is now real |
| Apple users classified as `ios` device | 9/57 (15.8%) | 5/5 (100%) | +84pp | X-Lovetta-Platform header working |
| paywall_closed_without_subscribe (24h) | not instrumented | 8 events / 8 users / 7 first-session | New signal | Median close = ~3s after signup |
| Auto-provisioned companions | n/a (feature didn't exist) | 0 / 8 B-assignments | **BROKEN** | jsonb serialization bug |
| Sentry unresolved issues | unknown | 0 | Quiet | No new errors introduced |
| Subscriptions / Tips | 2 subs, 0 tips / 7d | 0 / 0 in 48h | No signal | Need ~50+ users for 1 expected sub |

---

## 3. Section per Dimension

### 3.1 Debounce / `last_activity` histogram
**Verdict: artifact eliminated.** Pre-fix 7d cohort (n=97) had **27 users (28%) at dt∈[0,2s]** and **19 users (20%) at exact minute multiples** (60/120/180/240/300s). Post-fix 24h cohort (n=7): **zero in both buckets**. Raw dt values [133, 144, 159, 135, 311, 446, 3315] cluster in the 91-300s range — engagement-shaped. p10 moved from 0.10s to 134.25s; that alone kills the "instant ghoster" narrative.

Caveat: p90 looks like it collapsed (39209s → 1594s) but that's window-truncation — a 24h cohort can't contain multi-day return tails. Don't report p90 as an improvement.

Under H0 of unchanged artifact rate (~48% combined), observing 0/7 has p ≈ 0.52^7 ≈ 1% — directionally conclusive, statistically only suggestive.

### 3.2 OLD vs NEW "returned" metric
**Verdict: OLD was systematically lying.** On 18 post-deploy signups, OLD said 50% returned, NEW said 77.8% — **7/18 (38.9%) were false-negative ghosters under OLD**. Replaying NEW on last week's 111-user pre-deploy cohort: OLD said 60.4% ghosted, but 24 of those 67 OLD-ghosters actually sent a user message, so the true ghoster ceiling is 43.2%. If we also count the 35 users with la_gap∈[0,5s] (never-debounced returners) as returners, the real ghoster rate is probably in the **22-35% range** — half what we were reporting.

OLD=Y is high-precision (88.6% of those users actually messaged). OLD=N is the broken half (35.8% of them actually messaged). **Audit every admin query for `+ INTERVAL '5 minutes'`** — anything still using OLD will keep biasing decisions.

### 3.3 Sentinel event health
**Verdict: working as designed.** Per-signup ratios in the 24h non-test cohort: signup_response_sent = 7/7 (1.0), welcome_flow_assigned = 7/7 (1.0), first_authenticated_request = 7/7 (subsecond gap for all 7). The +2 FAR overage that scout flagged (14:7) is pre-existing users emitting FAR on first /me post-deploy — backfill, expected to settle within a week.

`POST /api/user/events` endpoint: 100% 200 responses across 6000 log lines, no whitelist rejections, no double-fires. paywall_closed_without_subscribe payload is consistent (surface=plan_modal, first_session=true, path=/my/pricing on 8/8 events).

### 3.4 Paywall close behavior
**Verdict: signal works, interpretation needs revision.** 8 paywall_closed_without_subscribe events from 8 distinct users in 24h (scout's "11 events / 11 signups" was inflated by test users + earlier wall-clock window). Of the 8: 6 A_control first-session, 1 B (leak — see §3.5), 1 returning ghoster (hollbert2412 from 2026-05-26 finally came back).

A_control dismissal timing: seconds_after_signup = [8, 3, 3, 3, 4, 2]. **Median ~3s — nobody is reading the plans.** But 5/6 still go on to create a companion and chat (2-17 messages each). The cold paywall is friction, not a deal-killer at the top of the funnel.

This event should **NOT** be used as a "declined subscription" signal — it's mechanical. Consider adding a "closed after >30s" variant if you want a real decline signal.

### 3.5 Welcome Flow A/B — non-functional
**Verdict: CRITICAL silent regression.** Heroku log at 2026-06-01T22:16:51: `[onboarding] autoProvisionFirstCompanion failed: invalid input syntax for type json`.

Root cause: `server/src/onboarding.js:114-125` selects jsonb `traits` from companion_templates (returned by node-pg as a JS array like `["tender","dreamy",...]`) and re-INSERTs it directly as `$7` into `user_companions.traits` (jsonb). node-pg serializes the JS array as a Postgres array literal `{tender,dreamy,...}`, which fails the jsonb cast. `companion-api.js:183` does `JSON.stringify(traits)` — onboarding.js does not.

The try/catch on line 161-164 swallows the error and returns `{ variant: 'A_control', error: true }`. Client `postSignupNav.js` sees variant=A_control and routes to /pricing?onboarding=1 — identical to A.

Evidence: 8 welcome_flow_assigned variant=B across 48h, **0** welcome_flow_auto_provisioned events, **0** user_companions rows with auto_provisioned=TRUE. 2/8 B users ghosted with zero companions ever created (kkhckhmgsn@privaterelay, 6r76wwr8b8@privaterelay) — these are users B was specifically designed to save.

**Fix:** `JSON.stringify(t.traits)` in the parameter array OR cast `$7::jsonb` in the SQL. Re-deploy. Re-baseline from zero.

### 3.6 Apple / privaterelay
**Verdict: device fix clean, engagement narrative needs caution.** Pre-deploy: 9/57 Apple users (15.8%) had device_type='ios'; 74% misclassified as web-mobile. Post-deploy: **5/5 (100%) ios**. The `X-Lovetta-Platform` header is doing its job.

19/19 privaterelay zero-action narrative confirmed as artifact. Post-deploy 5/5 privaterelay users hit FAR, 4/5 sent messages (3, 4, 6, 17), the one no-msg user spent 55 minutes in the app and hit FAR + paywall_closed within 2s — they're real, they just didn't pick a girl. That's behavioral, not measurement.

Don't extrapolate "19/19 → 0/5" as a fix-induced lift; the underlying message-send rate moved 58% → 80% with n=5 (Wilson CI ~28-99%). Wait for 7d of post-fix data.

### 3.7 Errors & infrastructure
**Verdict: clean except for the B-flow bug.** Sentry unresolved: 0. Kontext null bug: 9/wk → 0/24h. content_policy errors: ~1.86/day baseline → 1/24h (in noise). One H27 client-interrupt on an 80s chat stream after a paywall block — benign (user backgrounded the app). No dyno restarts, no R-codes, no migration errors. v370 has been live and stable for ~30h.

---

## 4. Fix-by-Fix Verdict

| Fix | Verdict | Evidence |
|---|---|---|
| **`last_activity` debounce 60s → 5s + GREATEST()** | **WORKING** | Exact-minute multiples: 19/97 → 0/7. 0-2s bucket: 27/97 → 0/7. p10: 0.10s → 134.25s. Histogram is now engagement-shaped. |
| **"Returned" funnel SQL reads real activity** | **WORKING** | NEW returned = 77.8% vs OLD = 50% on same 18-user cohort. 7/18 false-negatives caught. NEW is verifiable case-by-case against user_events + messages. |
| **AuthContext.refreshUser only clears on 401** | **NO DIRECT SIGNAL YET** | Indirect signal positive: 7/7 FAR fires subsecond, no client survival concerns. No log evidence of bad token clears, no Sentry. Need 7d of stable behavior to call this fully verified. |
| **Capacitor `X-Lovetta-Platform` header** | **WORKING** | Apple users classified as ios: 15.8% → 100% (5/5). Privaterelay specifically: 8/52 ios pre → 5/5 ios post. Header is being sent and read. |
| **3 new sentinel events** (signup_response_sent, first_authenticated_request, paywall_closed_without_subscribe) | **WORKING; interpretation caveat on paywall_closed** | All 3 fire at 1.0 per signup (signup_response_sent, welcome_flow_assigned), or 100% within 5min (FAR). paywall_closed payload is consistent (8/8 with full metadata). But paywall_closed median-time-to-close = 3s → mechanical reflex, not a "declined subscription" signal. Re-frame in the dashboard. |
| **(bonus) Welcome Flow B_skip_create implementation** | **REGRESSED — CRITICAL** | 0/8 B users got the auto-provisioned companion. jsonb serialization bug in onboarding.js:114-125. Silent fallback to A. The A/B test is invalid until this ships. |

---

## 5. Welcome Flow B Status

**Status: invalid — fix the bug, re-baseline from zero.**

Even setting the bug aside, the sample is underpowered:

| Variant | 24h signups | 48h signups | reached_1msg | reached_3msg | reached_10msg | median user msgs |
|---|---|---|---|---|---|---|
| A_control | 6 | 11 | 8/11 (73%) | 6/11 (55%) | 2/11 (18%) | 3 |
| B_skip_create | 1 | 7 | 5/7 (71%) | 5/7 (71%) | 1/7 (14%) | 4 |
| Pre-flip 7d (A only) | — | 100 | 60/100 (60%) | 47/100 (47%) | 20/100 (20%) | 9.1 |

**Surface differences (B avg_minutes_active 196.4 vs A 18.4; B 2/7 still active past 6h vs A 0/11) are driven by 1-2 outlier users and the fact that B happened to draw a UK-Apple user with a multi-hour session.** Wilson 95% CI for B reached_3msg with 5/7 is [35.9%, 89.1%] — too wide to claim anything.

**n < 30 per arm. Do not make product decisions from this data.**

Bucket split is currently 11A / 7B (39% B vs 50% target), Wilson 95% CI [19.5%, 61.5%] — within noise for n=18. Hash assignment itself is fine.

**Watch list after the bug is fixed:**
- D1: `welcome_flow_auto_provisioned` event count = `welcome_flow_assigned` B count (ratio should be 1.0)
- D3: B's reached_1msg vs A's reached_1msg, with n≥30/arm minimum
- D7: B's reached_3msg, day-1 return, and subscription-attempt rate
- D14: subscription conversion (need ~50/arm for any subscription signal at 2% baseline)

---

## 6. Open Questions / Re-check Schedule

### Immediate (today / tomorrow)
- **SHIP THE FIX:** `JSON.stringify(t.traits)` in onboarding.js:114-125. Verify with one synthetic B signup that `welcome_flow_auto_provisioned` fires and `user_companions.auto_provisioned=TRUE`.
- **Audit every admin query** for `+ INTERVAL '5 minutes'` and replace with NEW sentinel-based "returned" definition. Anything still on OLD will keep biasing dashboards.
- **Re-frame `paywall_closed_without_subscribe`** in the admin UI as "plan modal dismissed" not "subscription declined." Consider adding a "closed after >30s" event for a real decline signal.
- **Check why 4 of 11 signups had no `welcome_flow_assigned` tag** (3 fresh signups + 1 returning user). The returning user is expected; the other 3 need a trace through the 6 signup branches.

### 3 days (recheck 2026-06-03)
- Sentinel-based "returned" rate with n≥40 — does it stabilize around the 77.8% / 22% true-ghoster figure?
- Day-1 return rate: with 3 more days of post-deploy signups, last_activity > signup+24h should be measurable across both arms.
- FAR ratio: should drop from 14:7 (overage from pre-existing users) toward 1.0 as the backfill completes.
- After the B-flow fix ships, verify auto-provision rate = 100% of B assignments and zero `[onboarding] autoProvision...failed` log lines.

### 7 days (recheck 2026-06-07)
- **Full re-baseline.** With ~95 signups and working sentinels, re-estimate: true ghoster rate, day-1 return, day-3 return, reached_3msg, reached_10msg.
- Re-evaluate the last_activity histogram distribution shape (median, p90) — only meaningful with a 7d window so the 86400s truncation doesn't bias p90.
- Privaterelay engagement: is the 80% message-send rate (vs 58% pre) durable, or sample noise?
- A/B (assuming B is fixed by now): n should be ~50/arm — still underpowered for subscription, but reached_1msg / reached_3msg should have CI ~±14pp.

### 2 weeks (recheck 2026-06-14)
- **A/B subscription signal.** ~100/arm gets us to detect ~5-7pp absolute lift on the 2.1% baseline subscription rate, which is still marginal — be honest about whether the effect we're hunting is realistic to detect at this traffic.
- Cohort retention curves with the proper sentinel-based "returned" metric.
- Welcome flow finalist decision: only if (a) the bug has been fixed for ≥10 days and (b) we have n≥80/arm with clean data.

### Standing questions
- The "33 zero-action ghosters" / "59% never returned" narrative is now demonstrably wrong. Any decisions, runbooks, or growth strategies that were built on those numbers need a fresh look — particularly anything about Apple users being "low-quality."
- Subscription conversion at 2.1% baseline with current traffic (~95 signups/7d = ~14/day) makes any A/B test underpowered for monetization signal within reasonable timeframes. Consider whether the right north-star metric is reached_3msg or D1 return rather than subscription, given the sample-size reality.

---

**Files referenced (absolute paths):**
- `/Users/vasily/projects/lovetta/server/src/onboarding.js` (bug at lines 114-125)
- `/Users/vasily/projects/lovetta/server/src/companion-api.js` (correct pattern at line 183)
- `/Users/vasily/projects/lovetta/server/src/auth-middleware.js` (debounce fix)
- `/Users/vasily/projects/lovetta/server/src/admin-api.js` (funnel SQL fix at line 472; audit for remaining `INTERVAL '5 minutes'`)
- `/Users/vasily/projects/lovetta/web/src/contexts/AuthContext.jsx` (refreshUser fix)
- `/Users/vasily/projects/lovetta/web/src/lib/postSignupNav.js` (variant routing)
