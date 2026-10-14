/* Pure snapshot comparison. Missing keys are deletions relative to the saved base.
   A word (meaning + schedules + histories) is atomic; never splice schedules. */
(() => {
  'use strict';
  const SEED_HASH = '8039b22a5425a868fb8b29340f3a54998548eb28a9fd2b1507d51d13efbc9a2e';
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const canonical = x => JSON.stringify(x, function (k, v) {
    return object(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v;
  });
  const equal = (a, b) => canonical(a) === canonical(b);
  const empty = () => ({ schema: 1, entries: {}, lessonProgress: {} });
  const content = v => Array.isArray(v) ? v.length > 0 : object(v) ? Object.values(v).some(content) : !!v;
  const meaningful = s => Object.keys(s.entries).length > 0 || Object.values(s.lessonProgress).some(p =>
    Object.entries(p).some(([k, v]) => k !== 'saved' && content(v)));
  function merge(base, local, remote, choices = {}, options = {}) {
    const conflicts = [];
    // Legacy imports and independent additions allocate new ids. Match new local
    // entries to existing cloud identities; established ids stay stable.
    {
      local = structuredClone(local);
      for (const [id, e] of Object.entries(local.entries)) {
        if (base.entries[id] || remote.entries[id]) continue;
        const pair = Object.entries(remote.entries).find(([, r]) => r.key === e.key && (r.kind || 'word') === (e.kind || 'word'));
        if (pair && pair[0] !== id) {
          if (local.entries[pair[0]]) throw new Error('Duplicate local word identity. Export a backup before continuing.');
          delete local.entries[id]; local.entries[pair[0]] = { ...e, id: pair[0] };
        }
      }
    }
    function walk(b, l, r, path) {
      // Without a common base, a local-only record might be an old cloud
      // deletion. Ask explicitly before reintroducing it on a new device.
      if (options.firstDevice && b === undefined && r === undefined && l !== undefined &&
          (path[0] === 'entries' && path.length === 2 || path[0] === 'lessonProgress' && path.length >= 2 && content(l))) {
        return decide(b, l, r, path);
      }
      if (equal(l, r)) return l;
      if (equal(l, b)) return r;
      if (equal(r, b) && !(options.firstDevice && object(l) && object(r))) return l;
      const atomicEntry = path.length === 2 && path[0] === 'entries';
      if (!atomicEntry && object(l) && object(r) && (object(b) || b === undefined)) {
        const out = {};
        for (const k of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
          const v = walk(b?.[k], l[k], r[k], [...path, k]);
          if (v !== undefined) out[k] = v;
        }
        return out;
      }
      return decide(b, l, r, path);
    }
    function decide(b, l, r, path) {
      const key = JSON.stringify(path);
      if (choices[key] === 'local') return l;
      if (choices[key] === 'remote') return r;
      conflicts.push({ key, path, base: b, local: l, remote: r });
      return l;
    }
    const snapshot = walk(base, local, remote, []);
    // Concurrent additions with the same term but different ids need explicit review.
    const seen = new Set();
    for (const e of Object.values(snapshot.entries)) {
      const k = [e.kind || 'word', e.key].join(':');
      if (seen.has(k)) throw new Error('Duplicate word identity. Export both copies and reconcile them in Wordbook before retrying.');
      seen.add(k);
    }
    return { snapshot, conflicts };
  }
  window.PassageSyncCore = { SEED_HASH, canonical, equal, empty, meaningful, merge, object };
})();
