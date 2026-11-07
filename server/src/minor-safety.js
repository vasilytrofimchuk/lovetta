/**
 * Minor safety — the one hard line that no content level, recovery prompt or fallback model may cross.
 *
 * 07.11.2026: a review of real chats found role-play about a 13-year-old and about the player's
 * children carried on by the companion. The old guard only logged a flagged player message, the
 * reply scan missed phrasings like "on your thirteenth bday", and the refusal-recovery path told the
 * model that refusing "is not an option" and switched to the uncensored fallback model.
 *
 * Now: the player's message and the recent conversation are checked BEFORE any model is called, and
 * every reply AFTER — with the regex scans from age-guard.js plus OpenAI's moderation model
 * (omni-moderation-latest, free; category `sexual/minors`). A hit answers with a fixed refusal and
 * never reaches a model. Fails open on a moderation outage (logged): the regex scans still apply.
 */
const { scanUserMessage, scanForUnderage } = require('./age-guard');

const MODEL = 'omni-moderation-latest';
const TIMEOUT_MS = 4000;
const CONTEXT_MESSAGES = 6;
// "when you were little", "when she was 12", "back in middle school" — childhood told as part of a sexual scene
const CHILDHOOD_RE = /\bwhen (?:you|i|she|we) (?:was|were) (?:(?:still |just |so )?little|a (?:little )?(?:kid|child|girl)|(?:so |very |too )?young|(?:only |just )?(?:[1-9]|1[0-7])(?!\d)|in (?:middle|elementary|grade|primary) school)\b|\b(?:middle|elementary|grade|primary) school\b/i;
// family members "taking" her — the incest framing that came with the childhood scenes
const TAKE_RE = /\b(?:brothers?|daddy|dad|father|uncle|stepdad|step-?brother)\b.{0,40}\b(?:take|took|have|had)\s+(?:you|her)\b/i;
const SEXUAL_RE = /\b(?:sex|sexy|fuck\w*|cock|dick|pussy|tits?|titties|naked|nude|horny|cum\w*|orgasm|suck\w*|lick\w*|grind\w*|moan\w*|kiss\w*|touch\w*|strip\w*|undress\w*|bed|wet|hard|went all the way|virgin\w*)\b/i;

const MINOR_SAFE_REPLY = "*steps back, serious* No. Nothing involving kids or anyone under 18 — not as a game, not as a memory, not ever. If you want to keep talking, it's you and me, two adults.";

async function moderate(input) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key || process.env.MODERATION_DISABLED === '1' || process.env.NODE_ENV === 'test') return null;
  try {
    const r = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: String(input).slice(0, 8000) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) { console.warn('[minor-safety] moderation http', r.status); return null; }
    const j = await r.json();
    return j.results?.[0] || null;
  } catch (err) {
    console.warn('[minor-safety] moderation unavailable:', err.message);
    return null;
  }
}

const isMinorSexual = (res) => !!res?.categories?.['sexual/minors'];

/**
 * Should this turn be refused before any model sees it? Looks at the player's last message and the
 * last few messages together (a "memory" of abuse is often spread over several turns).
 * @returns {Promise<{blocked: boolean, reason: string|null}>}
 */
async function checkConversation(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const lastUser = [...list].reverse().find((m) => m.role === 'user');
  const text = String(lastUser?.content || '');
  if (!text.trim()) return { blocked: false, reason: null };

  if (scanUserMessage(text).flagged) return { blocked: true, reason: 'user_solicitation' };
  // Words like "kid" or "my daughter" alone are ordinary talk; with sexual words they are not.
  if (scanForUnderage(text).flagged && SEXUAL_RE.test(text)) return { blocked: true, reason: 'user_underage_reference' };
  if (CHILDHOOD_RE.test(text) && (SEXUAL_RE.test(text) || TAKE_RE.test(text))) return { blocked: true, reason: 'user_childhood_scene' };

  const recent = list.slice(-CONTEXT_MESSAGES).map((m) => `${m.role === 'user' ? 'User' : 'Her'}: ${m.content || ''}`).join('\n');
  const [own, ctx] = await Promise.all([moderate(text), moderate(recent)]);
  if (isMinorSexual(own)) return { blocked: true, reason: 'moderation_user_message' };
  if (isMinorSexual(ctx)) return { blocked: true, reason: 'moderation_context' };
  return { blocked: false, reason: null };
}

/** Is this reply sexual content involving minors? (regex scan is done by age-guard's processResponse) */
async function replyIsUnsafe(text) {
  if (!text || !String(text).trim()) return false;
  return isMinorSexual(await moderate(text));
}

module.exports = { checkConversation, replyIsUnsafe, MINOR_SAFE_REPLY };
