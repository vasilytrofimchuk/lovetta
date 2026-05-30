# Welcome Flow Decision Report — 2026-05-30

**Audience:** Vasily (founder/operator)
**Problem:** 60% of new signups ghost within 5 minutes; only 22% reach 10 messages.
**Window analyzed:** 7 days ending 2026-05-30 (97-100 signups, 60 ghosters).

---

## 1. TL;DR

- **Ship Approach B (Direct-to-Chat with Lily) behind flag `welcome_flow_B_skip_create`** — 50/50 split, target +10-15pp 5-min retention in week 1.
- The headline "paywall is the killer" narrative is **wrong**: live SQL shows **0 of 40 ghosters hit `paywall_blocked`** and **only 4/40 created a companion**. The dominant failure is users finishing OAuth and never making a second request.
- The single highest-leverage fix is **rewriting the first AI message prompt** to end with a concrete question (9/10 sampled openers had no `?`). Ship this as a stand-alone migration ALONGSIDE Approach B, not bundled inside it — so we can attribute wins cleanly.
- **Defer Pricing modal to message ≥3** in the same release. It is cheap, reversible, and only 10% of ghosters ever see it today, so downside is bounded.
- **Do not ship Approaches A, C, D, or E.** All three have either App Store rejection risk on an 18+ app, unauthenticated LLM cost-explosion vectors, or schema-level blockers (UUID vs INT FK, 117 server touchpoints assuming non-null `user_id`).

---

## 2. Diagnosis — What We Actually Know

### Funnel reality (last 7 days)
| Stage | Count | % of signups |
|---|---|---|
| Signups | 97-100 | 100% |
| Made a companion | 64 | 64-66% |
| Sent ≥1 message | 60 | 60-62% |
| Sent ≥3 messages | 44 | 45% |
| Sent ≥10 messages | 21 | 22% |
| Returned past 5 min | 40 | 41% |

### The 60 ghosters split three ways
- **33 (55%) = zero-action.** `last_activity = created_at` to the second. Median 0.1s alive. They never made a second request. 20/33 are Apple, 19/19 of those on `privaterelay.appleid.com`.
- **4 (7%) = made companion, no message.**
- **23 (38%) = sent 3.7 user msgs / 5.3 AI msgs in a 1-3 min burst, then left.** Median 67s from first message to bounce.

### What is NOT broken
- **Chat latency.** Ghosters p50 = 2.75s, retainers p50 = 2.95s. Effectively identical.
- **Paywall.** 0/40 7-day ghosters fired `paywall_blocked`. Only 6/60 in the wider cohort ever hit one, all at ~3.5 min — well past the bounce window.
- **Geo.** US 59%, UK 68%, CA 50% — all within noise.
- **Device.** Web-mobile 60%, web-tablet 64% — non-predictive.

### What IS broken
- **Apple Sign-In on relay**: 19/19 zero-action ghosters used `privaterelay.appleid.com`. Smells like OAuth-callback session loss or token-not-persisted on iOS Safari. **This is the dominant single signal in the data.**
- **First-message prompt**: hardcoded system prompt at `companion-api.js:207` asks the LLM to "express gratitude for being given life." 9/10 sampled openers contain no `?`. Users have no obvious next move. This is the #1 single-line fix in the codebase.
- **Companion creation blocks for 3-12s** (`companion-api.js:200-247`) on two sequential LLM calls. The 5 users who hit the 12s ceiling all still messaged — so this is anxiety, not a hard stop, but worth removing.
- **Custom-companion creators retain at 51% vs 3% for template-pickers among ghosters.** Customization is the strongest behavioral retention signal in the dataset.
- **Auto-photo at `useChat.js:62-67`** fires 1.5s after first message load, burning free budget on an image nobody requested.

### What 89% "AI-ended" really means
It's a tautology — AI always replies last. Stop using this number. The real lever is: at message 3-5 (the median bounce point), the conversation flatlines. The fix is **a better first message and a better mid-conversation hook**, not "make the AI not reply."

---

## 3. The Five Approaches

### A. Chat-First Anonymous Welcome Flow
- **Pitch:** Visitor lands in a streaming chat with a default girlfriend; no signup until message #3.
- **Journey:** Land → tap "Say Hi to Maya" → anon chat → after 3 msgs, soft signup sheet → claim conversation into account.
- **Impact claim:** +20-30pp 5-min retention.
- **Biggest risk:** Schema-impossible (`anon_users.claimed_user_id INT REFERENCES users(id)` but `users.id` is UUID); 117 server touchpoints assume non-null `user_id`; UK Online Safety Act blocks the flow in 23% of traffic; Apple IAP cannot fire on anon users — iOS gets carved out.

### B. Direct-to-Chat (Lily) — RECOMMENDED
- **Pitch:** Signup transaction auto-creates Lily + her conversation + a pre-baked opener row; user lands inside the chat, never sees Pricing or CompanionList on the cold path.
- **Journey:** Signup → server inserts user + Lily + first message in same txn → client routes to `/chat/{id}?firstSession=1` → input is auto-focused, voice/message already on screen.
- **Impact claim:** +10-15pp 5-min retention (adjusted down from the proposal's +18-25pp).
- **Biggest risk:** The diagnosis cited to justify it (paywall is the killer) is empirically wrong — 0/40 ghosters hit paywall. Real risk is that the win comes from the bundled prompt rewrite, not the auto-provisioning. Mitigation: ship both, attribute via secondary metric (msgs/signup).

### C. Try-Before-You-Sign Public Demo
- **Pitch:** Landing page IS the chat; visitor exchanges 3 turns with Luna pre-signup; convo is preserved at signup.
- **Journey:** Land on lovetta.ai → chat 3 turns → "save chat" sheet → OAuth → land in same chat.
- **Impact claim:** +20-30pp 5-min retention.
- **Biggest risk:** Pre-signup sexually-suggestive AI output without age affirmation violates UK OSA Part 5, Texas HB 1181, Stripe AUP. Also: moving the signup event 30-90s later kills TrafficStars/Google Ads bid signal within 24-48h, throttling the traffic source that produces 100% of current web signups. Plus an unauthenticated LLM endpoint is a CSAM-bait honeypot.

### D. Anonymous-First, Identity-on-Demand
- **Pitch:** Signup is just age-gate + "Meet her"; email/auth deferred until message ≥3 or paywall hit.
- **Journey:** Age gate → anon user created with recovery code → into companion picker → chat → upgrade banner at msg 3.
- **Impact claim:** +18-25pp 5-min retention.
- **Biggest risk:** App Store Guideline 5.1.1(v) + 1.2 on 18+ apps requires real identifier at account creation; recovery via 6-word BIP39 is fantasy (crypto wallets see 30-50% seed loss for users with $$$ at stake); synthetic `@anon.lovetta.ai` emails poison Resend deliverability. Trades a measurable retention problem for two existential risks.

### E. Magic Moment First 30 Seconds
- **Pitch:** Pre-warm first message + TTS while OAuth is round-tripping; auto-voice plays on first chat load.
- **Journey:** Pick template on welcome → tap auth → server pre-warms LLM+TTS in parallel → auth returns → voice plays automatically.
- **Impact claim:** +14-21pp 5-min retention.
- **Biggest risk:** iOS WKWebView blocks autoplay without an in-WebView user gesture; the OAuth round-trip consumes the gesture token. The "magic moment" premise (auto-voice) silently fails on iOS — which is the entire pitch. Also: unauthenticated `/api/welcome/prewarm` is a cost-explosion vector. Forcing template pick at T-0 herds users into the 3%-retention path while degrading the 51%-retention custom-creator path.

---

## 4. Scoring Table

Weights: Retention Lift (1.5x), Conversion Preservation (1.0x), Impl Speed (1.2x), Risk-Adjusted (1.5x — higher = lower risk), Evidence Alignment (1.3x), A/B Testability (1.0x). Max raw 60, max weighted 75.

| Approach | Retention (x1.5) | Conv Pres (x1.0) | Speed (x1.2) | Risk-Adj (x1.5) | Evidence (x1.3) | A/B (x1.0) | Raw | **Weighted** |
|---|---|---|---|---|---|---|---|---|
| **B. Direct-to-Chat (Lily)** | 6 → 9.0 | 7 → 7.0 | 8 → 9.6 | 7 → 10.5 | 5 → 6.5 | 8 → 8.0 | 41 | **50.6** |
| E. Magic Moment 30s | 5 → 7.5 | 6 → 6.0 | 3 → 3.6 | 4 → 6.0 | 6 → 7.8 | 5 → 5.0 | 29 | **35.9** |
| A. Chat-First Anonymous | 6 → 9.0 | 4 → 4.0 | 2 → 2.4 | 3 → 4.5 | 4 → 5.2 | 5 → 5.0 | 24 | **30.1** |
| D. Anon-first, Identity-on-Demand | 5 → 7.5 | 3 → 3.0 | 4 → 4.8 | 2 → 3.0 | 4 → 5.2 | 4 → 4.0 | 22 | **27.5** |
| C. Try-Before-You-Sign Demo | 4 → 6.0 | 2 → 2.0 | 2 → 2.4 | 1 → 1.5 | 4 → 5.2 | 4 → 4.0 | 17 | **21.1** |

**B wins by 14.7 weighted points over the runner-up.**

---

## 5. Recommendation

### Ship Approach B with two grafted ideas, behind feature flag `welcome_flow_B_skip_create`.

**Why B:**
- **Reversible.** Flag-gated, additive schema column (`user_companions.auto_provisioned BOOLEAN`), no FK destruction.
- **Compatible with iOS IAP and Apple App Store** — user identity exists at first chat, so RevenueCat, Apple Sign-In, IAP receipts, age-gate consent, and ToS records all behave exactly as today.
- **Shippable in 2-3 days** of focused work, including the prompt rewrite graft.
- **The retention lift may come more from the prompt rewrite than the auto-provisioning** — that's fine. Both fixes ship together; we measure both via msgs/signup and 5-min retention.

**Grafts from runners-up:**

1. **From C and D: the bundled-consent line under social auth buttons.** Replace the standalone Step-1 age+3-checkbox screen with a single line beneath Apple/Google: "By continuing you confirm you are 18+ and agree to Terms · Privacy." Email path keeps the explicit DOB form (we need typed birth date for that path). **This alone removes 5 interactions from the cold path** per the audit.

2. **From E: rewrite the first-message system prompt to end with a question.** Pull `companion-api.js:207` ("express gratitude for being given life") into `app_settings.first_message_style = 'casual_question_v1'` and ship the new copy. 9/10 sampled openers had no `?` — this is the single highest-leverage one-line code change in the entire diagnosis.

3. **From A and D: defer PlanModal to message ≥3.** Don't fire PlanModal on signup or first CompanionList visit. Show it inline as a soft chip after message 3, blocking modal only when the user hits `media_request` or `paywall_blocked` server-side. Cheap, reversible, 0/40 ghosters hit paywall today so downside is bounded.

**Explicitly NOT shipping in B v1:**
- Anonymous chat (App Store + schema risk).
- Auto-voice on first load (iOS autoplay policy blocker).
- Pre-warm fire-and-forget endpoint (unauthenticated LLM = cost-explosion).
- Forced template pick at welcome (degrades 51%-retention custom-creator cohort).

**Parallel workstream (separate PR, not part of B):**
- **Apple-relay OAuth investigation.** 19/19 zero-action ghosters using `privaterelay.appleid.com` is the single strongest signal in the data and Approach B does not fix it. Pull Sentry traces + Heroku logs for Apple Sign-In callbacks in the past 7 days, check for token-loss or session-not-restored on iOS Safari. This is likely worth more retention than Approach B itself.

---

## 6. Implementation Plan (2-3 days)

### Day 1 — Schema, settings, server

**New migration `MIGRATIONS[N]` in `server/src/migrate.js`:**
```sql
-- Welcome flow B: auto-provisioning
ALTER TABLE user_companions ADD COLUMN IF NOT EXISTS auto_provisioned BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_user_companions_auto ON user_companions(user_id, auto_provisioned) WHERE auto_provisioned = TRUE;

-- Pre-baked openers per template (Lily first; expand later)
ALTER TABLE companion_templates ADD COLUMN IF NOT EXISTS opener_line TEXT;
ALTER TABLE companion_templates ADD COLUMN IF NOT EXISTS opener_context TEXT;
ALTER TABLE companion_templates ADD COLUMN IF NOT EXISTS opener_scene TEXT;

UPDATE companion_templates
SET opener_line = 'Hey :) you''re new here, right? What should I call you?',
    opener_context = 'glances up, half-smiling',
    opener_scene = 'Soft afternoon light'
WHERE name = 'Lily';

-- Feature flag + config
INSERT INTO app_settings (key, value) VALUES
  ('welcome_flow_B_skip_create', 'false'),
  ('welcome_flow_B_variant_pct', '50'),
  ('welcome_flow_B_template_name', '"Lily"'),
  ('welcome_flow_B_defer_paywall_until_msgs', '3'),
  ('first_message_style', '"casual_question_v1"'),
  ('plan_modal_defer_msgs', '3')
ON CONFLICT (key) DO NOTHING;
```

**New file `server/src/onboarding.js`** — single function `autoProvisionFirstCompanion(userId, client)`:
- Reads `welcome_flow_B_skip_create` + `welcome_flow_B_variant_pct`.
- Hashes `userId` mod 100 → variant decision.
- If A_control: return `{ variant: 'A_control' }`.
- If B_skip_create (in transaction `client`):
  - SELECT template by `welcome_flow_B_template_name`.
  - INSERT `user_companions` with `auto_provisioned = TRUE`.
  - INSERT `conversations`.
  - INSERT one `messages` row: role='assistant', content=opener_line, context_text=opener_context, media_url=template.video_url (matches existing companion-api logic byte-for-byte — critical per critic), scene_text=opener_scene.
  - Log `user_events` event 'welcome_flow_auto_provisioned' with `{ variant, template_name }`.
  - Return `{ variant: 'B_skip_create', companionId, conversationId, templateName }`.
- Wrap in try/catch; on failure, log Sentry warning and return `{ variant: 'A_control', error: true }` — never throw to caller.

**Modify `server/src/auth-api.js`** — call `autoProvisionFirstCompanion` at the END of the signup transaction in ALL FOUR signup branches (critic flagged this — easy to miss):
- POST `/signup` (email/password) ~line 119
- GET `/google/callback` (web) ~line 568/616
- POST `/google/token` (native) ~line 674
- POST `/apple` ~line 817 AND `/apple` (synthetic-email branch) ~line 854/873

Each branch adds `onboarding` field to response JSON:
```js
res.json({ ...sanitizedUser, accessToken, refreshToken,
  onboarding: { variant, companionId, conversationId, templateName } });
```

For Apple existing-user-relink branch (~line 789): `onboarding = { variant: 'A_control', skip: true }` — idempotency guard.

**Pin Apple reviewer user (`APPLE_REVIEWER_ID` at `auth-api.js:22`) to `A_control` always.** Critic-flagged risk.

**Modify `server/src/companion-api.js:207`** — read `first_message_style` setting; when `casual_question_v1`, replace the existing "gratitude for being given life" system prompt with: "You are meeting them for the first time. In 1-2 short sentences, start with an action in *asterisks* (one short action), then ask ONE concrete question they can answer in 5 words or fewer. Be casual, low-key, playful. Never use words like 'creator', 'breath', 'life', 'soul', 'starlight'."

This benefits **both** A_control and B users — it is the cleanest single-line win in the diagnosis and we want it on the control too.

**Modify `server/src/chat-api.js`** — after assistant reply, if `user_id` has `welcome_flow_variant = 'B_skip_create'` and `message_count_user == 3`, include `{ suggestPlanDrawer: true }` in SSE done event.

### Day 2 — Client

**New file `web/src/lib/postSignupNav.js`:**
```js
export function resolvePostSignupPath(signupResponse) {
  const o = signupResponse?.onboarding;
  if (o?.variant === 'B_skip_create' && o.companionId) {
    return `/chat/${o.companionId}?firstSession=1`;
  }
  return '/pricing?onboarding=1';
}
```

**Modify `web/src/pages/Signup.jsx:42`** — replace hardcoded `postSignupPath` with `resolvePostSignupPath(response)`. Apply to `handleSubmit` (line 175), AppleSignIn onSuccess, GoogleSignIn onSuccess — all three.

**Modify `web/src/pages/Signup.jsx:193-281`** — bundled-consent graft: when `provider === 'social'` (Apple or Google), skip Step 1 entirely. Render only the social buttons with one line beneath: "By continuing you confirm you are 18+ and agree to [Terms](/) · [Privacy](/)". Email path keeps Step 1.

**Modify `web/src/hooks/useChat.js:62-67`** — if URL contains `?firstSession=1`, skip the 1.5s auto-photo call entirely. Critic-flagged: this MUST be a hard guard, not a config.

**Modify `web/src/pages/ChatPage.jsx`** — when `?firstSession=1`:
- Auto-focus input on mount.
- Render dismissible chip "Tap her avatar to explore other girlfriends".
- Render `suggestPlanDrawer` chip when SSE returns it (after msg 3).

**Modify `web/src/pages/CompanionList.jsx:40-44`** — guard `setShowPlanModal(true)` to require `messageCount >= 3`. Read `plan_modal_defer_msgs` from `/api/app-config`.

**Modify `web/src/pages/Pricing.jsx:63-77`** — set `lovetta-plan-skipped = '1'` in localStorage on mount (silent dismiss), not only on Skip click. Eliminates the double-paywall stack per Diagnosis C finding #7.

### Day 3 — Test, deploy, instrument

- Local: verify both variants (force flag on for own user) using `npm run dev:agent`.
- E2E: `npm run test:e2e:api` and `npm run test:e2e:ui` (B's surface is signup + chat).
- Apple Sign-In: cannot test on simulator (per memory note) — TestFlight smoke on personal iOS device.
- iOS build: `npm run build:ios` after any `Signup.jsx` change (per CLAUDE.md mandate).
- Deploy: merge to main → Heroku auto-deploy → flip `welcome_flow_B_skip_create = 'true'` in admin Settings → variant_pct stays at 50.

### Files touched (final list)
**Modified (9):**
- `server/src/migrate.js`
- `server/src/auth-api.js`
- `server/src/companion-api.js`
- `server/src/chat-api.js`
- `web/src/pages/Signup.jsx`
- `web/src/pages/Pricing.jsx`
- `web/src/pages/CompanionList.jsx`
- `web/src/pages/ChatPage.jsx`
- `web/src/hooks/useChat.js`

**New (2):**
- `server/src/onboarding.js`
- `web/src/lib/postSignupNav.js`

**Feature flag:** `welcome_flow_B_skip_create` (server-side, app_settings table, read on each signup).

---

## 7. A/B Test Design

**Hypothesis:** Users routed directly into a chat with Lily (B) return at 5 min at a higher rate than users routed through the current Pricing → CompanionList flow (A).

**Variant assignment:** Hash `users.id` mod 100. <50 → B, ≥50 → A_control. Stored at signup-time in `user_events` as `welcome_flow_assigned` with `{ variant }`. Stable per user across sessions (critic-flagged: session_id is unstable, user.id is the right key).

**Sample size:**
- Current signup rate: 97/week = ~14/day.
- 50/50 split: ~49/week per arm.
- Control 5-min retention baseline: 41%.
- Detectable effect at α=0.05, power=0.80 for two-proportion z-test: requires **~360 per arm** to detect +10pp absolute lift (41% → 51%).
- **Run for ~4 weeks** (~400 per arm) to call the result. Read interim at 2 weeks for a directional signal but don't decide.

**Primary metric:** 5-min retention (`last_activity - created_at > 5 min`), test-email-filtered.

**Secondary metrics (in priority order):**
- Messages per signup (median + p75).
- % reaching 3 messages.
- % reaching 10 messages.
- 24-hour return rate.
- Paid conversion at day 7.
- Apple-relay-specific cohort: 5-min retention for `email LIKE '%@privaterelay.appleid.com%'`.

**Guardrails (kill the experiment if):**
- Paid conversion in B drops > 20% vs A at 7-day mark.
- Crash/error rate in B's chat surface > 1.5x A.
- Cost per signup (LLM + image + TTS in first session) in B > 1.5x A.
- Apple App Store rejection on any submission referencing B.

**Stopping rule:** If B wins by ≥10pp at week 2 with p<0.05, ramp to 80/20. If B is flat or worse at week 4, kill the flag (set to `false`), keep the prompt-rewrite graft, ship the bundled-consent graft, ship the deferred-paywall graft as the new control. We get value from the grafts even if B loses.

---

## 8. Metrics to Watch — Week 1 Daily

Pull these in admin dashboard or via the prod-DB pattern. Filter test emails.

| Metric | Today's baseline | Watch threshold |
|---|---|---|
| Signups (B variant) | ~7/day | warn if <4 |
| 5-min retention (B) | 41% (control) | want ≥51%; alarm <38% |
| 5-min retention (A control) | 41% | alarm if drifts ≥5pp from baseline |
| Median msgs/signup (B) | ~2.0 | want ≥3.0 |
| % reaching 3 msgs (B) | 45% | want ≥55% |
| `welcome_flow_auto_provisioned` event fires / signup (B) | n/a | want 1.0 (100%); <0.95 means a signup branch is missed |
| Auto-provision DB error rate | 0% | alarm >2% |
| Apple-relay 5-min retention (B) | ~25% (in zero-action cohort) | want ≥40% |
| Paywall views per signup (B) | ~6% | should rise (paywall fires later, on more engaged users) — want ≥15% |
| Paid conversions day-7 (B) | n/a yet | alarm if <80% of A's rate |
| Mean cost per first session (LLM+img+TTS) | $0.05 baseline | alarm >$0.10 |
| Sentry errors tagged `welcome_flow_B` | 0 | alarm >5/day |

**Daily standup query — run every morning at 09:00 UTC:**
```sql
SELECT
  ue.metadata->>'variant' AS variant,
  COUNT(*) AS signups,
  COUNT(*) FILTER (WHERE u.last_activity > u.created_at + INTERVAL '5 minutes') AS returned_5min,
  ROUND(100.0 * COUNT(*) FILTER (WHERE u.last_activity > u.created_at + INTERVAL '5 minutes') / COUNT(*), 1) AS retention_pct,
  ROUND(AVG((SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = u.id AND m.role = 'user')), 2) AS avg_user_msgs
FROM user_events ue
JOIN users u ON u.id = ue.user_id
WHERE ue.event_type = 'welcome_flow_assigned'
  AND ue.created_at > NOW() - INTERVAL '24 hours'
  AND u.deleted_at IS NULL
  AND u.email NOT ILIKE '%@example.com'
  AND u.email NOT ILIKE '%@test.com'
  AND u.email NOT ILIKE 'conativer+%@gmail.com'
  AND u.email <> 'conativer@gmail.com'
GROUP BY ue.metadata->>'variant'
ORDER BY variant;
```

---

## Closing

The biggest risk in this whole exercise is **shipping a bundle and not knowing what worked.** The prompt rewrite alone could account for most of the lift; the auto-provisioning alone might add nothing; the bundled-consent alone might be the real win. Ship Approach B with the three grafts as ONE coordinated release because they are cheap and mutually reinforcing — but instrument the secondary metrics so we can attribute. If 5-min retention moves and msgs/signup doesn't, the win is auto-provisioning. If msgs/signup moves and 5-min retention doesn't, the win is the prompt. Both moving = ship at 100% in week 5.

And regardless of B's outcome: **start the Apple-relay OAuth investigation in parallel today.** 19/19 zero-action ghosters on `privaterelay.appleid.com` is the single sharpest signal in the entire dataset and none of the five proposed welcome flows actually addresses it.
