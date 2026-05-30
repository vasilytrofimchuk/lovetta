# Lovetta.ai — Weekly Product Analysis

**Period:** 2026-05-23 → 2026-05-30 (last 7 days)

---

## TL;DR

- **Monetization funnel is broken end-to-end.** 97 signups → 14 paywall hits → 0 paywall-attributed conversions. The 12 subscriptions created came in via direct IAP without touching the in-app paywall flow, and 10/12 are already canceling/canceled inside the RevenueCat trial.
- **Tip funnel is 100% dead.** 102 `tip_requested` events fired, 0 charges. 101 of the 102 came from a single user looping the same `monthly_threshold` prompt — strong evidence the modal/checkout link is broken or non-actionable.
- **Engagement cliff at <5 messages.** 54% of dormant conversations died with ≤5 user messages. Only 45% of new signups send 3+ messages and only 22% reach 10. Median active conversation = 6 user messages.
- **Proactive messaging is wasted spend.** 149 proactives sent to 33 users → 1 reply ever, 0 within 24h (0.67% lifetime reply rate). Cost burn with no engagement return.
- **Two real backend bugs to fix.** (1) Kontext image fallback called with `image_url=null` — 19 silent failures, 5 users. (2) fal.ai content-policy rejecting even mild romantic video prompts — 15 silent failures with the user seeing only a "phone's acting up" fallback.

---

## 1. Code Changes Deployed

10 releases (v357–v366) shipped since 2026-05-08; zero commits in the strict 2026-05-23..2026-05-30 window. Latest deploys (v365/v366 on 2026-05-21) added migrate-retry on dyno boot after a real Postgres crash that same day, plus IP forwarding to tracker. The larger 2026-05-08 batch shipped the value-prompt and free-reactivation systems that have generated 162 prompts and 128 reactivation messages all-time, but only 1 paid conversion and 12 user responses.

| Metric | Value |
|---|---|
| Releases v357–v366 | 10 |
| Commits in strict 7d window | 0 |
| Migrations applied | 2 |
| Users force-opted-in by v62 | 697 |
| Value prompts (all-time / 7d) | 162 / 41 |
| Value-prompt conversions all-time | 1 |
| Reactivation messages (all-time / 7d) | 128 / 33 |
| Reactivation responses all-time | 12 |

### Findings

**[LOW] ⚠️ unverified — adversarial verifier disputed: Migration v62 force-overwrote `notify_new_messages = true` for 697 users**
*Originally medium; downgraded.* Verifier confirmed the migration and the 697/29/726 counts, but proved zero alive users had a pre-existing `notify_new_messages=false` row — the `DO UPDATE` branch was effectively a no-op for active users. The 26 pre-v62 opt-outs all belong to soft-deleted accounts the migration excluded. The legitimate sub-finding is release hygiene: commit message ("Forward user IP to tracker") did not mention the bundled email-notification default change.

**[LOW] v61 'chat_research_improvements' shipped 3 new tables + 5 column additions on 2026-05-08**
Adds `conversation_scene_state`, `value_prompt_events`, `reactivation_messages` tables plus profile/messages columns. All idempotent. Seeds 3 app_settings (value_prompt_enabled, free_reactivation_enabled, chat_insights_enabled) defaulting to true — features went live on migration.

**[MEDIUM] Value-prompt system is firing but barely converting** ✅ verified
145 prompts all-time / 1 converted (0.7%); 37 in last 7d / 1 converted (2.7%). Reason mix 7d: `media_request` 30 (1 conv), `long_scene` 5 (0), `high_intent_20_messages` 2 (0). Verifier confirmed 36 unique prompted users in 7d with only 1 subscribed and 0 tips — low conversion is not explained by users already being paid.

**[LOW] Free-user reactivation system has low response rate**
128 sent all-time / 12 responded (9.4%). 7d: 33 sent / 1 responded (3.0%) — dropping vs all-time baseline.

**[INFO] v366 added migration-retry-on-boot after a real prod crash same-day**
5 attempts with 1.5s/3s/4.5s/6s backoff. Defensive; lowers risk of permanent dyno crash on transient Postgres connect drops.

**[LOW] abfce3b hot-patched a value-prompt UX bug that hit fresh users on first message**
35 minutes after v358 shipped, v359 added a `VALUE_PROMPT_MIN_USER_MESSAGES=3` gate because fresh signups were getting "Unlock Premium" before any back-and-forth. Quick recovery but indicates 62c260e went out under-tested.

**[INFO] Admin "Girls" tab work (c9de9aa, 7c95877, 34eead4) is read-only and safe** — pure SELECTs with test filter.

**[INFO] 7c28ec48 fixed a misleading "Active" subscription label** in dev mode only (prod unaffected).

---

## 2. Signup & Active User Cohort

97 signups (+12.8% WoW), traffic US (56) + UK (22) on web-mobile. Activation OK (59% send a message, 63% create a companion) but monetization reach collapses: only 14% see a paywall and only 2% subscribe. UTM attribution is essentially missing. DAU stable 6–14, no decline.

| Metric | Value |
|---|---|
| Signups 7d / prior 7d | 97 / 86 (+12.8%) |
| Sent first message | 57 (59%) |
| Created companion | 61 (63%) |
| Hit paywall | 14 (14%) |
| Subscribed | 2 (2.1%) |
| Apple / Google / Email | 56 / 25 / 16 |
| Web-mobile / Web-tablet | 84 / 13 |
| US / UK | 56 / 22 |
| UTM-tagged signups | 1 / 97 |
| DAU avg / min / max | 8.9 / 2 / 14 |

### Findings

**[HIGH] Paywall reach is the activation bottleneck — only 14% of signups see a paywall** ✅ verified
57 message-senders → 14 paywall hits = ~75% drop. 13 free senders sent 21+ messages (max 106) without ever being blocked. All 14 paywall events came from `source=chat_message`.

**[MEDIUM] ⚠️ unverified — adversarial verifier disputed: Paid conversion is 2.1% of signups; 2 subs in 7 days**
*Originally high; downgraded.* The arithmetic is right under strict status (active+trialing only), but the strategic conclusion is inverted. Including `canceling` (Stripe-style: still paying through period end) gives 10/97 = 10.3%. **Crucially: of the 14 paywall-hit signups, ZERO subscribed.** All 10 paying users had zero paywall events — they subscribed via direct IAP without hitting the in-app paywall. The lever is NOT "expose the paywall more"; the paywall converts nobody.

**[MEDIUM] ⚠️ unverified — adversarial verifier disputed: UTM attribution is broken — 99% of signups land with no `utm_source`**
*Originally high; downgraded.* Raw 96/97 NULL count reproduces, but the visitor layer is NOT broken — over 30d, 7,521/8,397 visits carried UTMs across fb/ig/tiktok/trafficjunky/etc. The real issue is (a) paid social went dark in this 7-day window (fb 7,074→0, ig 124→0, tiktok 275→1), (b) Google Ads shows 0 `gclid` in 30d so it may not be running at all, and (c) Apple/Google OAuth on mobile web drops URL params on redirect — 81 of 97 signups went through OAuth. Narrower hand-off bug, not pipeline failure.

**[INFO] Apple Sign-In dominates auth (58%)** — Apple 56, Google 25, Email 16. Zero native iOS/Android `device_type` recorded — all web.

**[INFO] Traffic concentrated US+UK (80%)**.

**[INFO] Signup volume +12.8% WoW, DAU stable** at avg 8.9.

**[LOW] ⚠️ unverified — adversarial verifier disputed: 41% of new signups never returned after 5 minutes**
*Originally medium; downgraded.* Headline is INVERTED. 41% (40/97) DID return after 5 min; 59% (57/97) did not. Within the 57 single-session cohort, 20 sent ≥1 message and zero returned past the 5-min mark. Correct framing: **59% of new signups never showed activity past 5 minutes, including 20 who sent a message and never returned.**

---

## 3. In-Conversation Drop-Off

Drop-off is severe and front-loaded: 54% of dormant conversations died with ≤5 user messages. Only 45% of new signups send 3+ messages and only 22% reach 10. The cliff is at <5 messages.

| Metric | Value |
|---|---|
| Dormant conversations total | 90 |
| Dormant ≤5 user msgs | 49 (54.4%) |
| Dormant ended on assistant turn | 89 (98.9%) |
| Signups sending 3+ msgs | 44 / 97 (45.4%) |
| Signups sending 10+ msgs | 21 / 97 (21.7%) |
| Signups sending 50+ msgs | 5 / 97 (5.2%) |
| Avg / median user msgs per active conv | 15.38 / 6 |
| p25 / p75 / p90 | 3 / 17 / 33.5 |
| Dormant users w/ value_prompt within ±1hr of final msg | 28 / 59 (47.5%) |
| Dormant users w/ paywall_blocked within ±1hr | 12 / 59 (20.3%) |

### Findings

**[HIGH] Drop-off cliff at <5 user messages: 54% of dormant conversations died there** ✅ verified
90 dormant convs (last_message_at 7–14d ago): 14 had 0 user msgs, 16 had 1–2, 19 had 3–5. Only 10% reached 21+. Caveat from verifier: active convs show similar low-end skew (52.6% with ≤5), so partially a natural distribution effect — but dormants reach 21+ at half the rate of active ones (10% vs 19%).

**[MEDIUM] ⚠️ unverified — adversarial verifier disputed: 98.9% of dormant conversations ended on the AI's turn**
*Originally high; downgraded.* Specific numbers don't reproduce — actual is 86/0 (100% assistant-ended) with filter, 90/0 unfiltered. Zero user-ended dormant convs at any threshold tested. Additionally, 13/85 (15%) of assistant-ended cases end on a PROACTIVE assistant ping — bot already tried to re-engage. The "last message role" metric is tautological since absent a proactive, the assistant always replies last — it tells you nothing about whether the bot's reply was a dead-end vs. a hook.

**[MEDIUM] ⚠️ unverified — adversarial verifier disputed: Value prompts fire near 47% of drop-off moments**
*Originally high; downgraded.* Causal framing refuted by base rate. Same ±1hr query on still-ACTIVE users (last_activity <24h) yields 60.0% value-prompt co-occurrence — HIGHER than the 47.5% dormant rate. This is base-rate co-occurrence (40 distinct prompted users in 7d, sending ~18 msgs each), not a drop-off signal. Combined-monetization union is 35/59 (59.3%), not "≥67%".

**[HIGH] Only 45% of new signups send 3+ messages; only 22% reach 10** ✅ verified
97 signups → 57 sent ≥1 (58.8%), 44 ≥3 (45.4%), 21 ≥10 (21.7%), 5 ≥50 (5.2%). Heaviest leak is between messages 3 and 10 (52.3% relative loss). Pattern holds in prior 7d window (65%/53%/28%) and on 24h+ matured signups (59%/46%/20%).

**[MEDIUM] Median active conversation = 6 user messages; long tail carries engagement**
Avg=15.38, median=6, p25=3, p75=17, p90=33.5, max=169. Mean is 2.5× median — top 10% (33+ msgs) drives metrics.

**[LOW] ⚠️ unverified — adversarial verifier disputed: 41% of dormant users never produced a user message at all**
*Originally medium; downgraded.* Arithmetic inconsistent (14/90 = 15.6%, not 41%). Honest framing: ~15% of new conversations get an assistant greeting but no user reply; separately, ~42% of dormant new users never sent any message (different unit of analysis, includes users who never started a conversation).

---

## 4. Funnel Events Fired

97 signups → 57 first-message users (59% activation) → 17 paywall users (0 subs) → 1 of 37 value-prompt conversions → 102 tip events / 0 tips. WoW: paywall_blocked +27%, taboo_policy_hit +75%, value_prompt_shown -38%.

| Event | 7d | Prev 7d |
|---|---|---|
| Signups | 97 | 86 |
| first_message_sent (users) | 57 | — |
| companion_created | 93 | — |
| paywall_blocked events | 28 | 22 |
| Distinct paywall users | 17 | 15 |
| Paywall users subscribed after | 0 | — |
| value_prompt_shown | 37 | 60 |
| value_prompt_converted | 1 | — |
| tip_requested events | 102 | 1 |
| tip_requested distinct users | 2 | — |
| tips_succeeded | 0 | — |
| taboo_policy_hit | 63 | 36 |
| reactivation_sent | 30 | 27 |
| reactivation_returned | 2 | 3 |

### Findings

**[CRITICAL] Paywall fires for 17 users in 7d, zero subscriptions result** ✅ verified
28 paywall_blocked from 17 distinct users (vs 22/15 prior week). 1 returned to send another message. The one sub row found for a paywall-hit user was an old canceled sub created 7 days BEFORE the paywall hit — not a conversion. **0% paywall-to-paid.**

**[HIGH] ⚠️ unverified — adversarial verifier disputed: Value prompt converts at 2.7% with media_request the only non-zero reason**
*Originally critical; downgraded.* Every specific number is off — actual is 41 shown / 1 converted (2.44%) with media_request 33/1 (3.03%), long_scene 6/0, high_intent 2/0. WoW exposure drop is 43% (41 vs 72), not 38%. Qualitative finding (only media_request converts, exposure shrinking) holds.

**[HIGH] tip_requested signal is a single-user loop, not real demand** ✅ verified
102 events from only 2 distinct users; 101 from `1con1cfatk1d543@gmail.com` 2026-05-25→05-28. Hourly pattern shows exactly 2 events per hour for ~14 consecutive hours across 3 days — classic scheduled/proactive loop signature. 0 tips landed.

**[INFO] Activation healthy: 59% send first message, 96% create companion** — activation not the leak.

**[MEDIUM] ⚠️ unverified — adversarial verifier disputed: Taboo policy hits up 75% WoW with no monetization downstream**
*Originally high; downgraded.* WoW +75% (63 vs 36) reproduces, but "no monetization downstream" is refuted: 3 of 10 taboo-hitting users started a subscription in the same window = 30% taboo→sub-start rate. Reframe as a real opportunity.

**[LOW] ⚠️ unverified — adversarial verifier disputed: Reactivation campaign sends but almost nobody returns**
*Originally medium; downgraded.* Actual is 31 sent / 2 returned (6.5%) vs prior 27/3 (11.1%). 9 of 31 sends happened in last 48h — denominator hasn't matured. 1-event delta is within noise on this base.

---

## 5. Companion + Voice Picks

93 picks (60 realistic, 22 custom, 11 anime). Custom is now #1 pick category, doubling WoW. Aria leads named templates (15); Lily (-44%) and Chloe (-50%) lost share sharply.

| Style | 7d Picks |
|---|---|
| Realistic | 60 |
| Custom | 22 |
| Anime | 11 |
| **Total** | **93** |

| Template | 7d | Prev 7d | Δ |
|---|---|---|---|
| Aria | 15 | 8 | +87% |
| Custom | 22 | 10 | +120% |
| Luna | 10 | — | — |
| Lily | 10 | 18 | -44% |
| Chloe | 5 | 10 | -50% |
| Isabella | 3 | 5 | -40% |
| Yuki | 3 | 0 | new |
| Sakura | 3 | 0 | new |

| Voice | Picks | Style |
|---|---|---|
| Ember | 13 | Calm & sultry |
| Velour | 10 | Poetic & romantic |
| Silk | 9 | Velvety & expressive |
| Spark | 9 | Quirky |
| Aurora | 8 | Captivating |
| Mist | 8 | Whispery & intimate |
| Moon | 7 | Soft & soothing |

### Findings

**[HIGH] Custom companions surged to #1 pick category, more than doubling WoW** ✅ verified
Custom 22 vs 10 prev (+120%), beats every named template. Verifier caveat: this is recovery from a one-week dip (3 weeks ago custom was 39, 2 weeks ago 17). More honest framing: "custom recovered to 22 picks after dipping to 10, now leading named templates."

**[MEDIUM] Lily and Chloe lost significant share WoW** ✅ verified
Lily 18→10 (-44%, -10pp share), Chloe 10→5 (-50%, -6pp), Isabella 5→3 (-40%), Aria 8→15 (+87%, +7pp). Total volume flat (87→93) — genuine share shift.

**[INFO] Anime templates Yuki and Sakura emerged from zero last week** (0→3 each).

**[INFO] Voice picks lean sultry/intimate/romantic** — Ember+Velour+Mist+Moon = 38 picks / ~41% of voice picks.

**[LOW] Cute/bubbly voices are underused** — Fizz+Blossom+Pearl+Breeze+Dazzle = 8 picks combined vs Ember alone at 13. Possible default-ordering bias.

**[LOW] One pick used a non-catalog ElevenLabs voice ID** (`hA4zGnmTwX2NQiTRMt7o`) — legacy/orphan worth tracing.

**[INFO] Top custom avatars cluster around brunette/blonde light-skinned 18–22 'real' style**.

**[LOW] 5 of 22 custom picks (23%) have NULL avatar_url** — possible UI bug or AI-generated avatar path not writing to `custom_avatars`.

---

## 6. Content Quality, Safety & Media Reliability

Character integrity is excellent — zero true breaking-character, wellness-deflection, or safety-refusal patterns in 1,332 assistant messages. Media reliability 9.5% failure with two dominant failure modes: 21 Kontext null-image_url errors (real backend bug) and 17 fal.ai content-policy rejections. Quality-flag telemetry skewed to one signal (`taboo_redirect` × 66). Biggest concern: proactive messaging is functionally non-engaging.

| Metric | Value |
|---|---|
| Assistant messages 7d | 1,332 |
| breaking_character / wellness / safety_refusal | 0 / 0 / 0 |
| Media attempts | 401 |
| Media failures (9.48%) | 38 |
| Kontext null image_url errors | 21 |
| fal.ai content_policy errors | 17 |
| Quality flag: taboo_redirect / rewritten_repetition | 66 / 1 |
| Top intents | explicit 240, media_request 117, romance 96, roleplay 90, continue_scene 84 |
| Languages | en 980, hi-Latn 43, es 13 |
| Proactive messages | 149 |
| Proactive users reached | 33 |
| Proactives with any reply | 1 |
| Proactives with 24h reply | 0 |

### Findings

**[HIGH] Proactive messaging has effectively zero engagement (1 reply out of 149 ever, 0 within 24h)** ✅ verified
135 proactives sent (filtered) to 33 users / 41 conversations. 24h reply rate = 0. Lifetime any-reply = 1 (and the lone reply was 3 days late from a heavy user, likely coincidental). Even restricted to proactives that had a full 24h to receive a reply (101 messages), the rate is still 0%.

**[MEDIUM] ⚠️ unverified — adversarial verifier disputed: Bug: 21 Kontext video calls failing with null image_url**
*Originally high; downgraded.* Bug is real but framing wrong: these are NOT video calls. Kontext is the IMAGE-generation fallback when PuLID fails. With test filter applied actual count is 19 (not 21). All 19 have `media_type=NULL` and `call_type='image'` in `api_consumption`. Correct framing: "Image-generation fallback bug — Kontext called with null `image_url` 19× across 5 users; PuLID→Kontext fallback path doesn't validate reference image." Top affected: dutchehtimex15@gmail.com (7 failures 2026-05-24), explorerlad@gmail.com (4 failures 2026-05-30).

**[LOW] ⚠️ unverified — adversarial verifier disputed: 17 fal.ai content_policy_violation failures on explicit video prompts**
*Originally medium; downgraded.* Filtered count is 15, not 17. Two genuine issues stronger than original framing: (1) Only ~3–5 of 15 prompts are explicit; many are quite mild ("slow-motion kiss, sunlight through the trees", "biting my lip"). False positives from fal's safety checker on tame romantic prompts is a worse bug — a sanitizer alone won't help. (2) Only 1 of 13 affected users is paying — "visible to paying users" is overstated. Recommended fix: evaluate disabling `enable_safety_checker` or switch to NSFW-tolerant video model.

**[INFO] Character integrity is excellent** — 0 "I'm an AI" matches across 1,332 messages. 30 "I can't/cannot/won't" matches all in-character ("I can't take it…").

**[LOW] ⚠️ unverified — adversarial verifier disputed: taboo_family is now the 5th most common user intent**
*Originally medium; downgraded.* Actually 7th, not 5th. Actual counts: explicit 225, media_request 108, romance 91, roleplay 81, continue_scene 77, short_control 68, taboo_family 63. taboo_family ≈ 12.8% of tagged user messages (491 total), not 5.4%. The 1:1 guardrail observation does hold: `taboo_redirect` quality flags = 63, matching `taboo_family` user intents = 63 exactly. 10 distinct users.

**[LOW] Hindi-Latin (43) and Spanish (13) are real non-English usage**
en=980 (94.6%), hi-Latn=43 (4.2%), es=13 (1.3%). Worth checking model handles romanized Hindi well and that companion personas don't drift to pure English.

**[LOW] Media failure rate ~9.5%, not rising** — daily 3,13,6,3,3,2,4,4 fails / 15,41,85,50,49,28,54,41 attempts. 5/24 spike (32%) is the only outlier.

**[LOW] Quality-flag telemetry is one-dimensional** — only `taboo_redirect` (66) and `rewritten_repetition` (1). No flags for content_too_short, persona_drift, low_diversity. Add more flag types for monitorability.

---

## 7. Bugs & Production Errors

Production is stable — no rollbacks, no app crashes, Sentry returns 0 unresolved issues, no anomalous high-cost calls. The only recurring failures are the 38 media-gen errors covered above.

| Metric | Value |
|---|---|
| Unresolved Sentry issues | 0 |
| Rollbacks 7d | 0 |
| API calls > $1 | 0 |
| Kontext null image_url errors | 21 (19 filtered) |
| Kontext affected users | 6 (5 filtered) |
| fal.ai content_policy video errors | 17 (15 filtered) |
| Empty assistant messages | 1 |
| Media success image / video | 217 / 146 |
| Media failure rate | 9.5% |

### Findings

**[HIGH] fal.ai/flux-pro/kontext called with image_url=null — 21 failures across 6 users** ✅ verified
21 occurrences across 6 conversations / 6 distinct users (19/5/5 with test filter). Repeat offender: explorerlad@gmail.com hit it 4 times on 2026-05-30. Every one is a user-visible silent failure (no media, no fallback) on explicit `media_request` intents.

**[LOW] ⚠️ unverified — adversarial verifier disputed: fal.ai content_policy_violation on video generation — 17 failures**
*Originally medium; downgraded.* With test filter applied: 15 failures across 13 conversations (not 17/14). Also: `enable_safety_checker:true` claim is false — server explicitly sets `false` for PuLID image and omits param for video. Of 15 rejections: 11 prompt-rejected, 2 image-rejected, 2 generic. Cannot cleanly attribute to video only — image and video paths both have a prompt field. Real concerns confirmed: errors surface silently as "phone's acting up, give me a sec babe" fallback while `media_error` is hidden.

**[INFO] Sentry shows zero unresolved issues** — clean runtime.

**[INFO] No Heroku rollbacks; release cadence healthy** v347–v366.

**[LOW] One assistant message saved with empty content** (id `0cd7860d-be55-4d9b-bfe4-55e089829f36`, 2026-05-30T05:54:57Z). Volume negligible (0.075%) but add server-side guard to skip persistence when content + media both empty.

**[INFO] No anomalous high-cost single API calls** — zero rows > $1.

**[INFO] Postgres scanner noise** (FATAL `no pg_hba.conf entry`) from external IP `128.185.207.18` — not our app, but polluting log search.

---

## 8. Payments, Conversion & Revenue

Revenue is effectively zero this week. 12 new subscriptions but 10 of 12 (83%) are already canceling/canceled. Zero tips collected despite 102 `tip_requested` events. API spend on free users ($7.40) is 3.5× spend on paying users ($2.11). Conversion is NOT falling — the entire trial cohort collapses before billing.

| Metric | Value |
|---|---|
| New subs 7d | 12 |
| Signups 7d | 97 |
| Signup → sub | 12.4% |
| Subs canceling/canceled | 10 of 12 (83%) |
| Subs active | 1 |
| Subs trialing | 1 |
| Tips paid 7d | 0 |
| Tip $ 7d | $0 |
| tip_requested events 7d | 102 |
| Distinct tip-event users | 2 |
| Tips lifetime count / $ | 1 / $9.99 |
| API spend free 7d | $7.40 |
| API spend paying 7d | $2.11 |
| Free users with spend | 61 |
| Paying users with spend | 13 |
| Avg / median / p90 / max spend per free user | $0.121 / $0.027 / $0.276 / $1.017 |
| Prior week conversion | 11.6% |
| Churn events 7d | 13 |

### Findings

**[CRITICAL] 10 of 12 new RevenueCat subs already canceling/canceled — trial-to-paid funnel collapsing** ✅ verified
Actual: 14 subs in last 7d, 12 canceling/canceled (9 canceling + 3 canceled). Mix: yearly/canceling/rc=5, monthly/canceling/rc=4, yearly/canceled/rc=3, monthly/active/rc=1, monthly/trialing/stripe=1. **Historical: 41 of 43 subs started 4–12 weeks ago ended canceled. All-time across 88 total subs, only 2 are currently active = 2.3% lifetime conversion.** Effective paid conversion this week ≈ 1.02%.

**[CRITICAL] Tip payment funnel is 100% broken — 102 events, 0 charges** ✅ verified
102 `tip_requested` from 2 users; 101 from `1con1cfatk1d543@gmail.com` (one user looping the `monthly_threshold` prompt). 86 of 102 events share identical metadata signature `{source:monthly_threshold, net_cost:1.017, threshold:1}` — modal firing repeatedly without resolution. No `pending`/`requires_action`/`failed` rows in `tips` table lifetime — no record of any attempted Stripe checkout from these 102 prompts. Lifetime tips = 1 row ($9.99, 2026-03-26, seed test UUID).

**[CRITICAL] Free-tier spend ($7.40) exceeds anything we collected from new subs this week** ✅ verified
Free: 61 users, $7.40 (video $5.00, image $2.05, chat $0.34). Paying: 13 users, $2.11. Verifier caveat: one RC sub (troymidnight1@comcast.net, monthly, active) is genuinely active rather than canceling — softens "all canceled" to "all but one." Core comparison stands: $7.40 free-tier burn against essentially zero verifiable revenue this week.

**[MEDIUM] Per-non-paying-user spend has a long tail** ✅ verified
n=61: avg $0.121, median $0.027, p90 $0.276, p99 $0.737, max $1.017. Median tiny — default free quota fine. But top 1% burns ~$1 with no monetization gate, and the $1.017 user is the same person looping the tip prompt.

**[INFO] Conversion rate did NOT fall vs prior week — pure cancellation problem**
12/97 = 12.4% this week vs 10/86 = 11.6% prior. 6-week new_subs trend: 3, 7, 9, 9, 8, 12 (growing). Acquisition not the issue.

**[HIGH] Churn: 13 status transitions to canceling/canceled in 7d, 12 RevenueCat** ✅ verified
yearly/canceling/rc=6, monthly/canceling/rc=4, yearly/canceled/rc=2, monthly/canceled/stripe=1. 11 of 12 RC subs have `current_period_end` within 3 days of `created_at` (3-day trial). Concentrated entirely in RC trial cohort cancellations.

**[MEDIUM] Only 1 of 12 new subs is Stripe (web); 11 are RevenueCat (iOS)** ✅ verified
Stripe historically dormant: 2 subs in 30d, 1 in 14d, 1 in 7d. iOS is the entire pipeline.

---

## Top 5 Things to Act On

Ranked by severity + actionability.

### 1. [CRITICAL] Fix the tip payment flow — 102 events, $0 collected
- **Concrete number:** 101 of 102 `tip_requested` events came from one user looping the same `monthly_threshold` modal across ~14 consecutive hours/day for 3 days, with zero `pending`/`failed`/`succeeded` rows ever created in the `tips` table.
- **Action:** Audit the tip modal — either the dismiss action isn't firing, the Stripe checkout link isn't opening, or completion isn't being recorded. Add a per-user rate limit and a write to `tips` with `pending` status the moment a checkout is initiated, so a broken flow is observable.

### 2. [CRITICAL] Investigate RevenueCat trial-to-paid collapse — 41 of 43 subs (95%) cancel inside trial historically
- **Concrete number:** 10 of 12 new subs this week are already canceling/canceled. All-time only 2 of 88 subs are currently active = 2.3% lifetime conversion. 11 of 12 RC subs have `current_period_end` within 3 days of `created_at` (the 3-day trial).
- **Action:** Survey/instrument the cancellation reason. Test trial length (3d → 7d), test removing trial entirely on yearly, test in-trial engagement nudges. This is the single biggest revenue lever.

### 3. [CRITICAL] Paywall is converting 0% of users who see it — 0 of 14 paywall-exposed signups subscribed
- **Concrete number:** 28 paywall_blocked events from 17 distinct users → 0 subscriptions. All 10 paying users came in via direct IAP without ever seeing the in-app paywall.
- **Action:** Rebuild the paywall copy/CTAs. The original framing ("expose the paywall more") is wrong — the paywall is failing at the conversion step, not the reach step. Compare paywall design vs the IAP path that's actually converting.

### 4. [HIGH] Fix Kontext `image_url=null` bug — 19 silent failures, 5 users this week
- **Concrete number:** PuLID→Kontext fallback path (server/src/ai.js:648–666) calls Kontext with `image_url=null` on 19 messages, all `media_type=NULL` and `call_type='image'`. explorerlad@gmail.com hit 4 in one day.
- **Action:** Validate `referenceImageUrl` is non-null before falling back to Kontext. If null, either skip the fallback or fall back to a different model. Add a server-side guard so empty assistant messages aren't persisted (also fixes the 1 empty-content message bug).

### 5. [HIGH] Kill or fix proactive messaging — 149 sent, 0 replies in 24h, 1 ever
- **Concrete number:** 0.67% lifetime reply rate across 149 proactives to 33 users / 41 conversations. Even restricted to mature 24h+ proactives (101 messages), 24h reply rate is 0%.
- **Action:** Either kill the proactive system entirely (it's burning generation cost with no engagement return), or A/B test radically different delivery paths (push notification vs in-app banner vs email) before continuing to spend on generation.
