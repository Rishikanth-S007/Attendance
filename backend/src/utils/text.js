/** Escape user text so it can be embedded in a RegExp literally (prevents regex injection / ReDoS). */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
