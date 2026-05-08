# Follow-up: Proactive Reach + Paywall Threshold — 2026-05-08

Validates the two action items from `CHAT_ANALYSIS_2026-05-07.md` against prod data.

## § A. Proactive-message reach

### A1. Proactive messages ever sent

| Total | Conversations reached | First sent | Last sent |
| --- | --- | --- | --- |
| 185 | 46 | 2026-03-30 16:19:40 | 2026-05-08 14:32:59 |

### A2. Proactive eligibility (the system gates on active subscription)

From `proactive.js:117-119` — only users with `subscriptions.status IN (active, canceling, trialing)` AND `user_preferences.proactive_messages = true` are eligible.

| Real users | Subscribed | Eligible (subscribed + opted-in) |
| --- | --- | --- |
| 527 | 8 | 3 |

### A3. Did proactive messages revive dormant users?

Each proactive bucketed by how long the user had been silent in that conversation when the proactive was sent. "Dormant" = ≥24 h since last user message in that thread.

| Sent to | Proactive msgs | User replied within 7d | User replied within 24h |
| --- | --- | --- | --- |
| no_prior_user_msg | 16 | 0 | 0 |
| sent_to_active | 67 | 5 | 3 |
| sent_to_dormant | 102 | 2 | 2 |

### A4. Coverage: how many dormant users got *any* proactive?

Cohort: users (with ≥1 prior user msg) whose last activity was 7–60 days ago — i.e. the ones we lost.

| Dormant users | Dormant + subscribed | Dormant who got a proactive | Total proactives to dormant |
| --- | --- | --- | --- |
| 268 | 3 | 12 | 91 |

## § B. Why heavy non-payers bypass the paywall

### B1. The free-tier paywall is a *weekly cost* threshold, not a message count

From `consumption.js:127-146` — `checkFreeLimit()` blocks only when `weekly_cost ≥ tip_request_threshold_free_usd`. There is no per-message, per-day, or lifetime cap anywhere in the chat-send path.

| Setting key | Value |
| --- | --- |
| tip_request_threshold_free_usd | 1 |
| tip_request_threshold_trial_usd | 2 |
| tip_request_threshold_usd | 3 |

### B2. Free users' actual weekly cost (current ISO week) vs $0.10 threshold

| Weekly cost bucket | Free users |
| --- | --- |
| $0.00 (no activity this week) | 479 |
| <$0.01 | 22 |
| $0.01 - $0.05 | 6 |
| $0.05 - $0.10 (about to block) | 3 |
| ≥$0.10 (would block) | 9 |

### B3. Top 10 active users — lifetime cost, peak week cost, $/msg

Compare `peak_week_cost` against the $0.10 weekly threshold. If peak week is below $0.10, the paywall *never could have fired* for that user under the current setting.

| Email | User msgs | Sub | Lifetime $ | Last 30d $ | Peak week $ | $/user msg |
| --- | --- | --- | --- | --- | --- | --- |
| narindervirdi285@gmail.com | 5483 | no | 7.2816 | 7.2816 | 2.2579 | 0.001328 |
| anindyachowdhury61@gmail.com | 882 | no | 2.7730 | 0.2493 | 1.9604 | 0.003144 |
| kumaranil.076060@gmail.com | 648 | no | 0.9122 | 0.0000 | 0.9122 | 0.001408 |
| mzdcdp5658@privaterelay.appleid.com | 497 | no | 3.1621 | 0.0000 | 3.1621 | 0.006362 |
| apple_000243.b59d1@apple.lovetta.ai | 414 | no | 2.3590 | 1.5450 | 1.3090 | 0.005698 |
| hdsjy8kgrp@privaterelay.appleid.com | 332 | no | 1.4881 | 0.0000 | 1.4881 | 0.004482 |
| vsd9xwqdh4@privaterelay.appleid.com | 310 | no | 1.3134 | 0.0263 | 1.2872 | 0.004237 |
| 228b8xqm5h@privaterelay.appleid.com | 305 | no | 1.1616 | 1.1616 | 1.1616 | 0.003809 |
| marcusbott@live.com | 236 | no | 2.0500 | 2.0500 | 1.0618 | 0.008686 |
| x27p2jrrjz@privaterelay.appleid.com | 189 | no | 2.0415 | 0.0000 | 2.0415 | 0.010802 |

### B4. Across history: how many free users ever had a week that would have hit the paywall?

| Free users w/ msgs | Ever ≥ $0.10 (paywall-eligible) | Ever ≥ $0.05 | Ever ≥ $0.01 | Avg peak week $ | Max peak week $ |
| --- | --- | --- | --- | --- | --- |
| 313 | 104 | 141 | 205 | 0.2053 | 3.1621 |

### B5. Spend on never-paying users (lifetime)

| Spent on never-payers | Total API spend |
| --- | --- |
| 73.6579 | 87.0276 |

**85% of all API spend went to users who never paid.**

### B6. Why so few paywall_blocked events fired — threshold history

| What | Value |
| --- | --- |
| `paywall_blocked` events ever logged | **8** total, from only **3** distinct users |
| First event | 2026-05-02 |
| Last event | 2026-05-08 |
| Funnel event instrumentation went live | 2026-04-29 (commit `9434f3e`) |
| `tip_request_threshold_free_usd` raised from `"0.10"` → `"1"` | **2026-05-04 16:28 UTC** |
| `tip_request_threshold_trial_usd` raised from `"0.30"` → `"2"` | 2026-05-04 16:28 UTC |
| `tip_request_threshold_usd` raised from `"10.00"` → `"3"` | 2026-05-04 16:28 UTC |

The free-tier threshold was a 10× increase 4 days ago. Combined with the funnel instrumentation only going live on 2026-04-29, the window when paywall events could fire under the *original* $0.10 threshold was just 5 days (2026-04-29 → 2026-05-04). After 2026-05-04, a free user can spend up to $0.99/week before the paywall fires — and 104 of 313 free users have had at least one historical week below that ceiling, so they're effectively "above the new threshold's reach" only when they exceed $1/week (rarer).

For the top 10 users in §B3, **8 of 10 have a peak week above $1**, meaning they would have been blocked under the new $1 threshold *if* they were active during that peak week with events logging. Most peak weeks fell before the instrumentation/threshold change.

---

_Generated 2026-05-08T14:33:52.823Z by `scripts/chat-analysis-followup.js`._
