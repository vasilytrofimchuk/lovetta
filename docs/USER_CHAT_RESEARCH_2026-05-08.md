# User Chat Research + Logic Improvement Audit — 2026-05-08

Scope: research-only audit of what Lovetta users discuss with AI girlfriends and what chat logic should improve next. Findings use aggregate production counts and anonymized patterns only. No private transcript excerpts are included here.

## Sources Used

- Existing Lovetta report: `docs/CHAT_ANALYSIS_2026-05-07.md`
- Current logic: `server/src/chat-api.js`, `server/src/ai.js`, `server/src/memory.js`, `server/src/content-levels.js`, `server/src/proactive.js`, `server/src/consumption.js`, `web/src/hooks/useChat.js`
- Read-only production aggregate SQL, run 2026-05-08
- Public research:
  - Hanson & Bolthouse, 2024, on Replika erotic roleplay removal and user backlash: https://journals.sagepub.com/doi/10.1177/23780231241259627
  - Liu, Pataranutaporn, Turkle, Maes, 2024/2025, companion chatbot usage and loneliness: https://arxiv.org/abs/2410.21596
  - Liu, Pataranutaporn, Maes, AIES 2025 version: https://ojs.aaai.org/index.php/AIES/article/view/36658
  - Folk, Heine, Dunn, 2025, anthropomorphism and social connection: https://www.nature.com/articles/s41598-025-19212-2
  - Döring et al. review, 2024, AI and human sexuality: https://link.springer.com/article/10.1007/s11930-024-00397-y
  - OpenAI + MIT Media Lab affective-use study, 2025: https://openai.com/index/affective-use-study/

## Production Snapshot

Filtered production cohort:

- 521 real users in the May 7 report; 318 had sent at least one message.
- Updated aggregate SQL on May 8 found 320 users with user messages, 572 conversations, and 15,729 user messages.
- User message length is short: avg 48 chars, median 30, p90 94.
- Assistant output is much longer: avg 380 chars, median 228, p90 847.
- 21 users sent 100+ messages each. They average 507.8 user messages, meaning roughly 6.6% of chatting users produce about two thirds of user-message volume.
- Dormant conversations mostly end after the assistant talks: 526 dormant conversations ended on assistant last message vs 16 on user last message. The last assistant message averaged 301 chars and 61.6% had a question mark, so simply asking questions is not enough to retain.

## What Users Discuss

Regex categories are overlapping and conservative; they undercount non-English and slang, but are useful directionally.

| Category | Users | Conversations | User messages | Share of user msgs |
| --- | ---: | ---: | ---: | ---: |
| Explicit sexual chat | 199 | 348 | 3,363 | 21.4% |
| Romance / affection / possessiveness | 164 | 301 | 2,282 | 14.5% |
| Family/taboo roleplay markers | 67 | 142 | 1,704 | 10.8% |
| Roleplay / scene control / continuation | 121 | 219 | 1,264 | 8.0% |
| Media requests | 149 | 267 | 1,153 | 7.3% |
| Short control replies | 83 | 148 | 417 | 2.7% |
| Identity / life facts | 85 | 152 | 320 | 2.0% |
| Emotional support / advice language | 30 | 49 | 88 | 0.6% |

Core read: Lovetta is being used primarily for erotic roleplay, romantic possession/affection, scene continuation, and photo/video proof. Emotional support is a small side use, not the main product behavior.

The May 7 report reinforces this:

- Paywall was not the obvious churn cause: 0 of 311 dormant users had `paywall_blocked` near their last chat and 0 had `tip_requested` near their last chat.
- Only 1 user had ever hit `paywall_blocked`; 0 continued chatting, subscribed, or tipped after that paywall.
- Custom companions dominate among engaged users: custom companions had 78 engaged users and 21,214 total messages, averaging 285.3 messages per engaged user.
- Anime is smaller but can be high-retention for the right persona; Yuki had only 8 engaged users but the highest listed average messages per user.

## Public Research Cross-Check

The external literature fits Lovetta's data:

- Sexual and romantic intimacy is not an edge case for this product category. The Replika ERP removal study found users treated emotional and sexual relationships as crucial to the model experience.
- AI companion effects are heterogeneous. The AIES/MIT work argues one-size-fits-all companion design is ethically and product-wise weak: some users gain social confidence, others risk isolation or problematic dependence.
- Anthropomorphism matters. Users who readily treat AI as socially real feel more connected after chatbot interaction; consistency, memory, and immersion breaks matter more for those users.
- The sexuality review identifies romantic/sexual intimacy with companion chatbots as a major GenAI use case, while also flagging emotional dependence risk.
- OpenAI/MIT's affective-use work is a good analytics pattern: use automated aggregate classification and avoid human transcript review wherever possible.

## Logic Gaps

1. Reply pacing is mismatched to usage.
Users often send short commands, confirmations, and scene-control cues, while the assistant often replies with long narrative blocks. Long output can be good for power users, but the median user input is 30 chars; defaulting to long monologues likely causes skimming and fade-out.

2. The model needs stronger scene state, not just recent messages.
Roleplay users drive scenes with "then", "again", "more", and time jumps. Current memory stores facts and summaries, but there is no first-class scene state: current frame, active roles, accepted continuity, last beat, and next natural beat.

3. Media is central, but failure rate is still visible.
There were 59 media failures in the last 30 days. Stuck pending is fixed at 0, which is good, but the product promise is still fragile because users often ask for proof/photo/video during high-intent moments.

4. Taboo/family-roleplay needs a clear product policy.
This is a material share of usage. The code has age and refusal recovery, but product policy should explicitly decide what is allowed by platform and what must be redirected. Without that, prompts and model fallback behavior will drift.

5. Churn is quality/novelty more than paywall.
Dormant users usually leave after assistant replies, not after paywalls. Asking a question at the end is common and still not enough. Repetition, weak scene progression, overly generic intimacy, and unfulfilled media are more plausible churn drivers.

6. Monetization is late and weakly coupled to value moments.
The paywall almost never fires, and when it did, it converted nobody. Tip prompts also were not near churn. Current monetization logic is cost-threshold driven rather than value-moment driven.

7. Proactive messaging mostly misses free heavy users.
Proactive messaging is subscription-gated. That is safe for cost, but it means most non-paying engaged users get no lifecycle reactivation inside the chat loop.

8. Localization and slang detection are underbuilt.
Some heavy usage is non-English or romanized non-English. Content classification, memory extraction, and media-intent detection are mostly English regex/prompt based.

## Recommended Improvements

### P0 — Conversation Pacing + Anti-Repetition

- Add adaptive response-length guidance:
  - Short user input or control word: 1-3 tight sentences, advance one beat.
  - User asks for "more", "continue", "story", or sends long input: allow longer narrative.
  - If the last assistant response was >700 chars, bias next response shorter.
- Track a per-user `typical_message_length` and `preferred_narrative_depth` in `user_profile`.
- Add output similarity checks against the last 3 assistant messages; regenerate or rewrite when repeated phrases/themes exceed a threshold.
- Consider adding mild `frequency_penalty` / `presence_penalty` to chat requests if OpenRouter model support is acceptable.

### P0 — Scene-State Memory

- Add a compact `conversation_scene_state` concept, either as a table or structured memory row:
  - current scenario/frame
  - user's role/persona
  - companion role/persona
  - last beat
  - unresolved next beat
  - platform/content-level constraints
- Update this every 5-10 turns for active roleplay conversations.
- Inject it above long-term facts so the assistant progresses the scene instead of restarting or asking generic questions.

### P0 — Media Reliability at High-Intent Moments

- Split media intent into explicit request, proof request, romantic selfie, and scene-continuation visual.
- For explicit media requests, ensure the assistant text never implies "here it is" unless `media_pending=true` was actually created.
- Add admin breakdown for `media_error` by reason and model, not just count.
- Use existing/reused media more aggressively when generation is capped, but label it naturally in character.
- Add a post-media follow-up prompt: after media is delivered, the next assistant message should reference it naturally if the user responds.

### P1 — Platform-Aware Taboo Policy

- Define an internal taxonomy for taboo/family-roleplay requests and map each category by platform/content level.
- Web level 2/3 can follow the chosen adult-only policy; App Store level should gracefully redirect where needed.
- Add aggregate admin counters for taboo policy hits, redirects, and user continuation after redirect.
- Keep final user-facing refusals in-character and short; never fall back to generic safety language.

### P1 — Value-Moment Monetization

- Replace purely cost-threshold monetization with value-moment triggers:
  - after first satisfying long scene
  - after first successful photo/video
  - after a user reaches 20-30 messages in a session
  - when a custom companion reaches high usage
- Keep the first prompt soft and transparent. Do not use guilt or fear-of-loss copy.
- Test "premium preserves deeper memory + more media + longer sessions" rather than just "unlimited messages."
- Add tracking: prompt reason, stage, user response, subscribe/tip within 24h, chat continuation after prompt.

### P1 — Free-User Reactivation Without Manipulative Copy

- Add one ethical reactivation path for promising free users:
  - after 24h inactivity from a 20+ message session
  - no guilt, no "I am lonely", no dependency framing
  - message should reference the unfinished scene or companion personality
- Limit to one per several days unless user opts in.
- Track return-to-chat and conversion.

### P1 — Custom Companion Flywheel

- Custom companions are the strongest engaged segment.
- Add "make another like her" and "save this style" affordances after high-use chats.
- Infer and persist style preferences: realistic/anime, tone, roleplay pace, visual preference, language.
- Recommend templates based on actual usage, not just static companion popularity.

### P2 — Localization + Slang Support

- Add language detection per conversation and store `conversation.language`.
- Include romanized Bengali/Hindi and common non-English intimate terms in media intent and content classifier tests.
- Tell the model explicitly to stay in the user's language or mixed-language style unless the user switches.
- Add multilingual memory extraction tests for identity, relationship names, and recurring roleplay themes.

### P2 — Privacy-Preserving Chat Insights Dashboard

- Promote the useful parts of this audit into admin analytics:
  - topic buckets by day/week
  - power-user share
  - assistant/user length mismatch
  - dormant-last-message diagnostics
  - media failure reasons
  - refusal recovered/blocked counts
  - monetization prompt outcomes
- Prefer automated aggregate classifiers and counters over manual transcript reading.

## Suggested Execution Order

1. Implement adaptive pacing + anti-repetition.
2. Add scene-state memory for roleplay continuity.
3. Tighten media intent/failure logic and admin reason breakdowns.
4. Define platform-aware taboo policy and counters.
5. Rework monetization around value moments.
6. Add free-user reactivation and custom-companion flywheel.
7. Add localization/slang coverage.
8. Build the admin chat-insights dashboard.

## Verification Notes

No runtime code was changed for this audit. Tests were skipped intentionally.
