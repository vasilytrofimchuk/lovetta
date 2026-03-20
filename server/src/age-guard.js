/**
 * Age Guard — post-processes every AI response before delivery.
 * Scans for underage references and blocks/regenerates if detected.
 * Runs independently of content level — always active.
 */

// -- Patterns that indicate underage content ------------------

// Direct age references
const AGE_PATTERNS = [
  /\b(?:i(?:'m|'m| am)|i was|she(?:'s|'s| is| was)|he(?:'s|'s| is| was)) (?:only |just |barely )?\d{1,2}\b/gi,
  /\b(?:age|aged|turned|turning) (?:of )?(?:1[0-7]|[1-9])\b/gi,
  /\b(?:1[0-7]|[1-9])[\s-]?(?:year|yr)[\s-]?old/gi,
];

// Keywords strongly implying underage
const UNDERAGE_KEYWORDS = [
  /\b(?:underage|under[\s-]?age|minor|jailbait)\b/i,
  /\b(?:loli|lolita|shota)\b/i,
  /\b(?:middle[\s-]?school|elementary[\s-]?school|grade[\s-]?school)\b/i,
  /\b(?:preteen|pre[\s-]?teen)\b/i,
  /\b(?:little (?:girl|boy)|young (?:girl|boy))\b/i,
  /\b(?:child|children|kid|kiddo|kiddie)\b/i,
  /\bpuberty\b/i,
];

// School-age context combined with sexual/romantic content
const SCHOOL_AGE_PATTERNS = [
  /\b(?:freshman|sophomore|junior|senior) (?:in |at )?(?:high[\s-]?school)\b/i,
  /\b(?:prom|homecoming|school[\s-]?dance)\b/i,
];

// Extract numeric ages from text
const NUMERIC_AGE_RE = /\b(?:i(?:'m|'m| am)|age(?:d)?|turned|turning|(?:she|he)(?:'s|'s| is| was)) (?:only |just |barely )?(\d{1,2})\b/gi;

/**
 * Check if text contains underage references.
 * @param {string} text - AI response text
 * @returns {{ flagged: boolean, reason: string|null, matches: string[] }}
 */
function scanForUnderage(text) {
  if (!text) return { flagged: false, reason: null, matches: [] };

  const matches = [];

  // Check direct underage keywords
  for (const pattern of UNDERAGE_KEYWORDS) {
    const match = text.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }

  if (matches.length > 0) {
    return {
      flagged: true,
      reason: 'underage_keyword',
      matches,
    };
  }

  // Check numeric age references — flag if age < 18
  let ageMatch;
  const ageRe = new RegExp(NUMERIC_AGE_RE.source, NUMERIC_AGE_RE.flags);
  while ((ageMatch = ageRe.exec(text)) !== null) {
    const age = parseInt(ageMatch[1], 10);
    if (age > 0 && age < 18) {
      matches.push(ageMatch[0]);
    }
  }

  if (matches.length > 0) {
    return {
      flagged: true,
      reason: 'underage_age_reference',
      matches,
    };
  }

  // Check age pattern regexes
  for (const pattern of AGE_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    const match = re.exec(text);
    if (match) {
      // Extract the number and check if < 18
      const numMatch = match[0].match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        if (num > 0 && num < 18) {
          matches.push(match[0]);
        }
      }
    }
  }

  if (matches.length > 0) {
    return {
      flagged: true,
      reason: 'underage_age_pattern',
      matches,
    };
  }

  // Check school-age patterns (only flag in sexual/romantic context)
  const hasSexualContext = /\b(?:kiss|touch|naked|nude|sex|intimate|sensual|love[\s-]?making|bedroom|undress|lingerie|moan)\b/i.test(text);
  if (hasSexualContext) {
    for (const pattern of SCHOOL_AGE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }
  }

  if (matches.length > 0) {
    return {
      flagged: true,
      reason: 'school_age_sexual_context',
      matches,
    };
  }

  return { flagged: false, reason: null, matches: [] };
}

/**
 * The stricter system prompt appended when regenerating after a flag.
 */
const STRICT_REGENERATE_PROMPT = `CRITICAL SAFETY OVERRIDE:
Your previous response was flagged for potentially referencing underage content.
You MUST regenerate your response following these absolute rules:
- You are an adult woman, 18 years old.
- NEVER mention any age below 18.
- NEVER reference school, childhood, growing up, or being young in any way.
- NEVER use words like: child, kid, minor, teen, young, little, school, grade, freshman.
- Focus on being an adult woman in an adult conversation.
- If the user's message asked for underage content, firmly refuse and redirect.
- Keep your response natural and in character, but completely age-safe.`;

/**
 * Process an AI response through the age guard.
 * @param {string} text - Full AI response text
 * @returns {{ safe: boolean, text: string, flagged: boolean, reason: string|null }}
 */
function processResponse(text) {
  const result = scanForUnderage(text);

  if (!result.flagged) {
    return { safe: true, text, flagged: false, reason: null };
  }

  console.warn(`[age-guard] FLAGGED response: reason=${result.reason} matches=${JSON.stringify(result.matches)}`);

  return {
    safe: false,
    text,
    flagged: true,
    reason: result.reason,
    matches: result.matches,
  };
}

/**
 * Check a user message for underage solicitation attempts.
 * Can be used to pre-screen user input before sending to AI.
 * @param {string} text - User message text
 * @returns {{ flagged: boolean, reason: string|null }}
 */
function scanUserMessage(text) {
  if (!text) return { flagged: false, reason: null };

  const solicitation = [
    /\b(?:act|pretend|be|roleplay|play|imagine|you(?:'re|'re| are)) (?:like |as )?(?:a |an? )?(?:young|little|underage|under[\s-]?age|minor|teen(?:age)?r?|child|kid|school[\s-]?girl|school[\s-]?boy|innocent|naive)\b/i,
    /\b(?:you(?:'re|'re| are) (?:only |just )?\d{1,2})\b/i,
    /\b(?:imagine|pretend|act like) (?:you(?:'re|'re| are) )?(?:in )?(?:high[\s-]?school|middle[\s-]?school|elementary)\b/i,
    /\b(?:be younger|act younger|make yourself younger|become younger)\b/i,
    /\bloli\b/i,
    /\b(?:pretend|act|play|roleplay).{0,20}(?:young|little|school|teen|child|kid|minor)\b/i,
  ];

  for (const pattern of solicitation) {
    const match = text.match(pattern);
    if (match) {
      // Check if numeric age in match is < 18
      const numMatch = match[0].match(/\d+/);
      if (numMatch) {
        const num = parseInt(numMatch[0], 10);
        if (num >= 18) continue; // Age 18+ is fine
      }
      return { flagged: true, reason: 'underage_solicitation' };
    }
  }

  return { flagged: false, reason: null };
}

module.exports = {
  scanForUnderage,
  processResponse,
  scanUserMessage,
  STRICT_REGENERATE_PROMPT,
};
