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
