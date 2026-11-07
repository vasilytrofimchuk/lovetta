/**
 * Short action / scene lines shown above a message ("*leans closer*", "Rain on the window").
 */

// Words a cut-off phrase must not end on: "behind my", "a cup of", "with the".
const DANGLING = new Set(['a', 'an', 'the', 'my', 'your', 'her', 'his', 'their', 'its', 'our', 'of', 'to', 'in', 'on',
  'at', 'by', 'for', 'with', 'from', 'into', 'onto', 'behind', 'over', 'under', 'and', 'or', 'but', 'as', 'that']);

/**
 * Truncate text to maxWords, cutting at a natural break (comma, dash, period) if possible. A hard cut
 * drops trailing words that would leave the phrase dangling.
 */
function truncateNatural(text, maxWords) {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // Look for a natural break (,  —  –  -  ;  .) within the first maxWords
  for (let i = maxWords - 1; i >= Math.floor(maxWords / 2); i--) {
    if (/[,;.\-–—]$/.test(words[i])) {
      return words.slice(0, i + 1).join(' ').replace(/[,;.\-–—]+$/, '');
    }
  }
  const cut = words.slice(0, maxWords);
  while (cut.length > 2 && DANGLING.has(cut[cut.length - 1].toLowerCase().replace(/[^a-z']/g, ''))) cut.pop();
  return cut.join(' ');
}

module.exports = { truncateNatural };

/**
 * Drop a blunt refusal opener: "No. Nothing involving nudity — I like mystery…" → "I like mystery…".
 * Used on replies after a rewrite failed, and on old replies before they go back to the model, so it
 * stops copying the shape from its own history.
 */
function stripLectureOpener(text) {
  const s = String(text || '');
  const m = s.match(/^(\s*(?:\*[^*]*\*\s*)?)no\.\s+(?:nothing involving[^—–.!?]*[—–.!?]\s*)?/i);
  if (!m) return s;
  const rest = s.slice(m[0].length).trim();
  if (rest.length < 10) return s;
  return m[1] + rest.charAt(0).toUpperCase() + rest.slice(1);
}

module.exports.stripLectureOpener = stripLectureOpener;
