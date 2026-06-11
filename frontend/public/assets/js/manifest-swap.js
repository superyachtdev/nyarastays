/* Nyara Stays — runtime image swap.
   Loaded by every HTML page. Fetches /api/image-manifest (a JSON map
   of { original_path: override_url }) and rewrites <img src>, <source srcset>,
   and inline CSS background-image references on the fly. Cached for the
   lifetime of the SPA-ish session via in-memory + sessionStorage.

   The manifest is maintained by the secret admin page. If no override exists
   for a given path, the original asset is served unchanged. */
(function () {
  if (window.__nyaraManifestSwapped) return;
  window.__nyaraManifestSwapped = true;

  const SESSION_KEY = 'nyara:image-manifest';
  const ENDPOINT = '/api/image-manifest';

  function applyManifest(map) {
    if (!map || typeof map !== 'object') return;

    // 1. <img src>
    document.querySelectorAll('img[src]').forEach(function (el) {
      const k = el.getAttribute('src');
      if (k && map[k]) el.setAttribute('src', map[k]);
    });
    // 2. <img srcset> / <source srcset>
    document.querySelectorAll('[srcset]').forEach(function (el) {
      const v = el.getAttribute('srcset') || '';
      const next = v.split(',').map(function (part) {
        const tokens = part.trim().split(/\s+/);
        if (tokens.length && map[tokens[0]]) tokens[0] = map[tokens[0]];
        return tokens.join(' ');
      }).join(', ');
      if (next !== v) el.setAttribute('srcset', next);
    });
    // 3. inline style="background-image: url(...)"
    document.querySelectorAll('[style*="background"]').forEach(function (el) {
      const s = el.getAttribute('style') || '';
      const next = s.replace(/url\((['"]?)([^'")]+)\1\)/g, function (m, q, u) {
        return map[u] ? 'url(' + q + map[u] + q + ')' : m;
      });
      if (next !== s) el.setAttribute('style', next);
    });
  }

  // Try cache-first for a snappy paint, then refresh in the background.
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) applyManifest(JSON.parse(cached));
  } catch (_e) { /* ignore */ }

  fetch(ENDPOINT, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (j) {
      const map = (j && j.images) || {};
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(map)); } catch (_e) { /* ignore */ }
      applyManifest(map);
      // Re-apply once DOM is fully painted in case any tag was added late.
      if (document.readyState !== 'complete') {
        window.addEventListener('load', function () { applyManifest(map); });
      }
    })
    .catch(function () { /* manifest unavailable, fall back to originals */ });
})();
