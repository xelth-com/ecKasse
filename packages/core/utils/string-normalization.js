const { transliterate } = require('transliteration');

function normalizeString(str) {
  if (!str) return '';

  // Using a library for transliteration and then Unicode normalization
  return transliterate(str)
    .normalize('NFD') // Decompose characters into base + diacritic
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]/gi, ' ') // Remove non-alphanumeric characters
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .toLowerCase();
}

function calculateLevenshteinFast(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let v0 = new Array(b.length + 1);
  let v1 = new Array(b.length + 1);

  for (let i = 0; i <= b.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(
        v1[j] + 1,      // insertion
        v0[j + 1] + 1,  // deletion
        v0[j] + cost    // substitution
      );
    }
    let tmp = v0;
    v0 = v1;
    v1 = tmp;
  }

  return v0[b.length];
}

module.exports = {
    normalizeString,
    calculateLevenshteinFast
};