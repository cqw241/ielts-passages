/* Shared browser-local wordbook. Lesson progress keeps its original storage keys. */
(() => {
  'use strict';
  const KEY = 'passage-wordbook-v1';
  const lessons = window.COURSE_VOCABULARY || [];
  const clean = (value, max = 3000) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
  const term = value => clean(value, 100).trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/\s+/g, ' ');
  const normalize = value => term(value).toLocaleLowerCase('en');
  const kind = entry => entry.kind === 'sentence' ? 'sentence' : 'word';
  function sentenceText(value) {
    const text = clean(value, 3001).trim();
    if (!/[A-Za-z]/.test(text) || text.length > 3000) throw new Error('Select an English sentence of up to 3,000 characters.');
    return text;
  }
  const sentenceKey = value => sentenceText(value).replace(/\s+/g, ' ').toLocaleLowerCase('en');
  const matches = (entry, key, type) => entry.key === key && kind(entry) === type;
  const uid = () => window.crypto?.randomUUID?.() || 'word-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const blank = () => ({ version: 1, entries: [], migrated: [], cache: {} });
  let problem = '', active = new Map();
  const safeURL = value => {
    try { const u = new URL(value); return u.protocol === 'https:' && ['en.wiktionary.org', 'creativecommons.org', 'freedictionaryapi.com'].includes(u.hostname) ? u.href : ''; } catch { return ''; }
  };
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.migrated) || !data.cache || typeof data.cache !== 'object') throw new Error('Invalid wordbook');
      if (data.entries.some(e => !e || (e.kind !== undefined && !['word','sentence'].includes(e.kind)) || typeof e.id !== 'string' || typeof e.key !== 'string' || typeof e.term !== 'string' || !Array.isArray(e.sources) || !Array.isArray(e.candidates) || !e.edited || e.sources.some(s => !s || typeof s.folder !== 'string'))) throw new Error('Invalid entry');
      return data;
    } catch {
      problem = 'Your wordbook could not be read. Your existing records have been kept. Check browser storage access before trying again.';
      return blank();
    }
  }
  function syncBookmarks(data) {
    for (const lesson of lessons) {
      try {
        const old = JSON.parse(localStorage.getItem(lesson.storageKey) || '{}');
        const words = new Set(data.entries.filter(e => kind(e) === 'word' && e.sources.some(s => s.folder === lesson.folder)).flatMap(e => [e.key, ...e.sources.filter(s => s.folder === lesson.folder).map(s => normalize(s.selectedText))]));
        const saved = lesson.words.filter(w => words.has(normalize(w.word))).map(w => w.id);
        if (JSON.stringify(old.saved || []) !== JSON.stringify(saved)) localStorage.setItem(lesson.storageKey, JSON.stringify({ ...old, saved }));
      } catch { /* A broken lesson record must not be overwritten by migration. */ }
    }
  }
  function write(data) {
    if (problem) throw new Error(problem);
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { throw new Error('Your browser could not save the wordbook. Free some browser storage or export a backup before trying again.'); }
    syncBookmarks(data);
    window.dispatchEvent(new CustomEvent('wordbook-change'));
  }
  function change(fn) { const data = read(); const result = fn(data); write(data); return result; }
  function sourceKey(s, type) { const text = value => type === 'sentence' ? String(value).replace(/\s+/g, ' ').toLocaleLowerCase('en') : value; return [s.folder, s.location, text(s.quote), text(s.selectedText)].join('|'); }
  function validSource(s, type = 'word') {
    if (!s || !lessons.some(l => l.folder === s.folder)) return null;
    const lesson = lessons.find(l => l.folder === s.folder);
    const location = /^(overview|reading(?:-[A-J])?|vocabulary|grammar|exercises|writing|speaking|review|recall)$/.test(s.location) ? s.location : 'reading';
    return { folder: lesson.folder, lessonTitle: lesson.title, location, label: clean(s.label || 'Lesson context', 120), quote: clean(s.quote), selectedText: clean(s.selectedText, type === 'sentence' ? 3000 : 100) };
  }
  function combineSources(a, b, type = 'word') {
    const seen = new Set();
    return [...a, ...b].filter(s => { const k = sourceKey(s, type); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function create(value, type = 'word') {
    const text = type === 'sentence' ? sentenceText(value) : term(value);
    if (type === 'word' && (!text || !/[A-Za-z]/.test(text) || text.split(' ').length > 12)) throw new Error('Choose an English word or a short phrase of up to 12 words.');
    return { id: uid(), kind: type, key: type === 'sentence' ? sentenceKey(text) : normalize(text), term: text, definition: '', ipa: '', note: '', review: 'again', edited: {}, candidates: [], attribution: null, definitionAttribution: null, dictionaryStatus: type === 'sentence' ? 'not-applicable' : 'missing', sources: [], createdAt: Date.now(), updatedAt: Date.now() };
  }
  function addTo(data, value, source, prepared, type = 'word') {
    const fresh = create(value, type);
    let entry = data.entries.find(e => matches(e, fresh.key, type));
    if (!entry) { entry = fresh; data.entries.push(entry); }
    const valid = validSource(source, type);
    if (valid) entry.sources = combineSources(entry.sources, [valid], type);
    if (prepared && !entry.definition && !entry.edited.definition) {
      entry.definition = clean(prepared.definition);
      entry.ipa = clean(prepared.ipa, 200);
      entry.dictionaryStatus = 'ready';
      entry.candidates = [{ definition: entry.definition, partOfSpeech: 'Lesson vocabulary' }];
      entry.attribution = { label: 'Lesson vocabulary', url: '', license: null };
      entry.definitionAttribution = entry.attribution;
    }
    entry.updatedAt = Date.now();
    return entry.id;
  }
  function presetSource(lesson, word) {
    return { folder: lesson.folder, location: word.location, label: word.label, quote: word.article, selectedText: word.word };
  }
  function migrate() {
    const data = read();
    if (problem) return;
    let changed = false;
    for (const lesson of lessons) {
      if (data.migrated.includes(lesson.folder)) continue;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(lesson.storageKey) || '{}').saved || []; if (!Array.isArray(saved)) continue; } catch { continue; }
      for (const word of lesson.words.filter(w => saved.map(String).includes(String(w.id)))) {
        addTo(data, word.word, presetSource(lesson, word), { definition: word.definition, ipa: word.ipa });
      }
      data.migrated.push(lesson.folder); changed = true;
    }
    if (changed) { try { write(data); } catch (error) { problem = error.message; } }
  }
  function findPreset(value, folder) { return lessons.find(l => l.folder === folder)?.words.find(w => normalize(w.word) === normalize(value)); }
  function add(value, source) {
    const prepared = findPreset(value, source?.folder);
    const id = change(data => addTo(data, value, source, prepared && { definition: prepared.definition, ipa: prepared.ipa }));
    const entry = get(id);
    if (!entry.definition && !entry.candidates.length) lookup(id);
    return id;
  }
  function addSentence(value, source) { return change(data => addTo(data, value, source, null, 'sentence')); }
  const get = id => read().entries.find(e => e.id === id);
  function forLesson(folder) { return read().entries.filter(e => e.sources.some(s => s.folder === folder)); }
  function bookmarked(folder, value) { const k = normalize(value); return forLesson(folder).some(e => kind(e) === 'word' && (e.key === k || e.sources.some(s => s.folder === folder && normalize(s.selectedText) === k))); }
  function togglePreset(folder, wordId) {
    const lesson = lessons.find(l => l.folder === folder), word = lesson?.words.find(w => String(w.id) === String(wordId));
    if (!word) return false;
    const linked = bookmarked(folder, word.word);
    if (linked) change(data => { for (const e of data.entries.filter(e => kind(e) === 'word' && (e.key === normalize(word.word) || e.sources.some(s => s.folder === folder && normalize(s.selectedText) === normalize(word.word))))) { e.sources = e.sources.filter(s => s.folder !== folder); e.updatedAt = Date.now(); } });
    else change(data => addTo(data, word.word, presetSource(lesson, word), { definition: word.definition, ipa: word.ipa }));
    return !linked;
  }
  function mergeEntry(target, incoming) {
    target.sources = combineSources(target.sources, incoming.sources, kind(target));
    for (const field of ['definition', 'note', 'ipa']) if (!target[field] && !target.edited[field]) { target[field] = incoming[field]; if (field === 'definition') target.definitionAttribution = incoming.definitionAttribution; }
    if (!target.candidates.length) target.candidates = incoming.candidates;
    if (!target.attribution && incoming.attribution) target.attribution = incoming.attribution;
    target.dictionaryStatus = kind(target) === 'sentence' ? 'not-applicable' : target.definition || target.candidates.length ? 'ready' : 'missing';
    target.updatedAt = Date.now();
    return target;
  }
  function update(id, changes) {
    let result = id;
    change(data => {
      const e = data.entries.find(e => e.id === id); if (!e) throw new Error('This entry no longer exists.');
      if (changes.term !== undefined) {
        const fresh = create(changes.term, kind(e)), text = fresh.term, k = fresh.key;
        if (k !== e.key) { e.candidates = []; e.dictionaryStatus = fresh.dictionaryStatus; e.ipa = ''; }
        e.term = text; e.key = k; e.edited.term = true;
      }
      for (const field of ['definition', 'note']) if (changes[field] !== undefined) { e[field] = clean(changes[field]); e.edited[field] = true; }
      if (changes.definitionSource === 'dictionary') e.definitionAttribution = e.attribution;
      if (changes.review) e.review = changes.review === 'remembered' ? 'remembered' : 'again';
      if (changes.sense !== undefined) {
        const candidate = e.candidates[changes.sense]; if (candidate) { e.definition = candidate.definition; e.edited.definition = true; e.definitionAttribution = e.attribution; }
      }
      e.updatedAt = Date.now();
      const other = data.entries.find(x => x.id !== e.id && matches(x, e.key, kind(e)));
      if (other) { mergeEntry(e, other); data.entries = data.entries.filter(x => x.id !== other.id); }
      result = e.id;
    });
    return result;
  }
  function remove(id) { return change(data => { const e = data.entries.find(e => e.id === id); data.entries = data.entries.filter(e => e.id !== id); return e; }); }
  function restore(entry) { if (!entry) return; const id = change(data => { const other = data.entries.find(e => matches(e, entry.key, kind(entry))); if (other) { mergeEntry(other, entry); return other.id; } else { if (entry.dictionaryStatus === 'pending') entry.dictionaryStatus = 'missing'; data.entries.push(entry); return entry.id; } }); if (kind(get(id)) === 'word' && !get(id).definition && !get(id).candidates.length) lookup(id); }
  function attribution(raw) {
    return { label: clean(raw?.label || 'Wiktionary · FreeDictionaryAPI.com', 150), url: safeURL(raw?.url), license: raw?.license ? { name: clean(raw.license.name, 100), url: safeURL(raw.license.url) } : null };
  }
  function applyDictionary(id, k, result) {
    change(data => {
      const e = data.entries.find(e => e.id === id); if (!e || e.key !== k) return;
      e.candidates = result.candidates; e.ipa = result.ipa; e.attribution = result.attribution;
      e.dictionaryStatus = result.candidates.length ? 'ready' : 'missing';
      // Candidates are shown for choosing; a first dictionary sense is never declared the contextual meaning.
    });
  }
  async function lookup(id, retry = false) {
    const entry = get(id); if (!entry || kind(entry) === 'sentence') return;
    const k = entry.key;
    if (active.has(id)) {
      const current = active.get(id);
      if (current.key === k) return current.job;
      await current.job;
      return lookup(id, retry);
    }
    const job = (async () => {
      try {
        const cacheData = read().cache;
        const cache = Object.hasOwn(cacheData, k) ? cacheData[k] : null;
        if (cache && !retry) { applyDictionary(id, k, cache); return; }
        change(data => { const e = data.entries.find(e => e.id === id); if (e) e.dictionaryStatus = 'pending'; });
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
        let raw;
        try { const response = await fetch('https://freedictionaryapi.com/api/v1/entries/en/' + encodeURIComponent(entry.term) + '?translations=false', { signal: controller.signal }); if (!response.ok) throw new Error('Dictionary unavailable'); raw = await response.json(); }
        finally { clearTimeout(timeout); }
        const candidates = [];
        function collect(senses, pos) {
          for (const s of senses || []) {
            if (s.definition && candidates.length < 40) candidates.push({ definition: clean(s.definition), partOfSpeech: clean(pos, 120) });
            if (candidates.length < 40) collect(s.subsenses, pos);
          }
        }
        for (const item of raw.entries || []) if (item.language?.code === 'en' || item.language?.name === 'English') collect(item.senses, item.partOfSpeech);
        const ipa = (raw.entries || []).flatMap(e => e.pronunciations || []).filter(p => p.type === 'ipa').slice(0, 2).map(p => clean(p.text, 100)).join(' · ');
        const result = { candidates, ipa, attribution: attribution(raw.source), at: Date.now() };
        change(data => { data.cache[k] = result; });
        applyDictionary(id, k, result);
      } catch {
        try { change(data => { const e = data.entries.find(e => e.id === id); if (e && e.key === k) e.dictionaryStatus = 'error'; }); } catch { /* Storage error is surfaced by the UI. */ }
      } finally { active.delete(id); }
    })();
    active.set(id, { key: k, job }); return job;
  }
  function exportBackup() { const data = read(); if (problem) throw new Error(problem); return JSON.stringify({ format: 'passage-wordbook', version: 2, exportedAt: new Date().toISOString(), entries: data.entries }, null, 2); }
  function importBackup(raw) {
    if (clean(raw, 5000001).length > 5000000) throw new Error('Choose a wordbook backup smaller than 5 MB.');
    let backup; try { backup = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON. Choose a Passage wordbook backup.'); }
    if (backup.format !== 'passage-wordbook' || ![1,2].includes(backup.version) || !Array.isArray(backup.entries) || backup.entries.length > 10000) throw new Error('Choose a version 1 or 2 Passage wordbook backup.');
    // Validate the entire backup before changing any current records.
    const incoming = backup.entries.map(raw => {
      if (!raw || (raw.kind !== undefined && !['word','sentence'].includes(raw.kind)) || typeof raw.term !== 'string' || !Array.isArray(raw.sources)) throw new Error('This backup contains an invalid entry. No records were changed.');
      const e = create(raw.term, kind(raw));
      e.sources = combineSources([], raw.sources.map(s => validSource(s, kind(e))).filter(Boolean), kind(e));
      e.definition = clean(raw.definition); e.note = clean(raw.note); e.ipa = clean(raw.ipa, 200);
      e.review = raw.review === 'remembered' ? 'remembered' : 'again';
      e.edited = { term: !!raw.edited?.term, definition: !!raw.edited?.definition, note: !!raw.edited?.note };
      e.candidates = (Array.isArray(raw.candidates) ? raw.candidates : []).slice(0, 40).filter(c => typeof c?.definition === 'string').map(c => ({ definition: clean(c.definition), partOfSpeech: clean(c.partOfSpeech, 120) }));
      e.attribution = raw.attribution ? attribution(raw.attribution) : null;
      e.definitionAttribution = raw.definitionAttribution ? attribution(raw.definitionAttribution) : null;
      e.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
      e.dictionaryStatus = kind(e) === 'sentence' ? 'not-applicable' : e.definition || e.candidates.length ? 'ready' : 'missing';
      return e;
    });
    return change(data => {
      let added = 0, merged = 0;
      for (const e of incoming) {
        const existing = data.entries.find(x => matches(x, e.key, kind(e)));
        if (existing) { mergeEntry(existing, e); merged++; } else { data.entries.push(e); added++; }
      }
      return { added, merged };
    });
  }
  window.Wordbook = { normalize, term, kind, sentenceText, read, get, add, addSentence, update, remove, restore, lookup, migrate, forLesson, bookmarked, togglePreset, exportBackup, importBackup, lessons, get problem() { return problem; } };
  migrate();
  if (!problem) read().entries.filter(e => kind(e) === 'word' && e.dictionaryStatus === 'pending').forEach(e => lookup(e.id));
  window.addEventListener('storage', event => { if (event.key === KEY) window.dispatchEvent(new CustomEvent('wordbook-change')); });
})();
