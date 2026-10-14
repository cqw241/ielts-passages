/* Optional Supabase Auth + versioned snapshots. No SDK or server is required. */
(() => {
  'use strict';
  const C = window.PassageSyncCore, W = window.Wordbook;
  const config = window.PASSAGE_SYNC_CONFIG || {};
  const META = 'passage-cloud-base-v1', SESSION = 'passage-cloud-session-v1';
  const JOURNAL = 'passage-cloud-apply-v1', ARCHIVE = 'passage-cloud-recovery-v1';
  const WORDS = 'passage-wordbook-v1';
  const keys = new Set([WORDS, ...W.lessons.map(l => l.storageKey)]);
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') && !!config.publishableKey;
  const url = (config.url || '').replace(/\/$/, '');
  let status = configured ? 'Sign in to sync. Local saving is active.' : 'Local only · Cloud sync is not configured.';
  let busy = false, inFlight, timer, pending = null, resolution = null, fatal = false;
  const parse = key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; };
  function validate(s) {
    if (!s || s.schema !== 1 || !C.object(s.entries) || !C.object(s.lessonProgress)) throw new Error('Unsupported cloud snapshot. Local records were kept.');
    const entries = Object.values(s.entries);
    if (entries.some(e => !e || typeof e.id !== 'string' || !e.id || s.entries[e.id] !== e || typeof e.key !== 'string' || typeof e.term !== 'string' || typeof e.definition !== 'string' || typeof e.note !== 'string' || !Array.isArray(e.candidates) || !C.object(e.edited) || !Array.isArray(e.sources) || e.sources.some(src => !src || typeof src.folder !== 'string' || !W.lessons.some(l => l.folder === src.folder)))) throw new Error('Invalid cloud word identity.');
    const identities = new Set();
    for (const e of entries) {
      const identity = [e.kind || 'word', e.key].join(':');
      if (identities.has(identity)) throw new Error('Duplicate cloud word identity.');
      identities.add(identity);
      if (e.kind !== 'sentence') window.VocabularyLearning.validate(e.learning);
    }
    // Reuse the existing all-or-nothing JSON validator without importing/merging.
    W.prepareBackup(JSON.stringify({ format: 'passage-wordbook', version: 3, entries, lessonProgress: s.lessonProgress }));
    for (const folder of Object.keys(s.lessonProgress)) if (!W.lessons.some(l => l.folder === folder)) throw new Error('This device needs a newer lesson library before syncing.');
    return s;
  }
  function capture() {
    const data = W.read();
    if (W.problem) throw new Error(W.problem);
    const s = C.empty();
    for (const e of data.entries) {
      if (s.entries[e.id]) throw new Error('Duplicate local word id.');
      // Pending dictionary requests are device-local and never block another device.
      s.entries[e.id] = e.dictionaryStatus === 'pending' ? { ...e, dictionaryStatus: 'missing' } : e;
    }
    for (const l of W.lessons) {
      if (localStorage.getItem(l.storageKey) === null) continue;
      const raw = parse(l.storageKey);
      if (!C.object(raw)) throw new Error('Lesson progress could not be read. Local records were kept; export a backup before retrying.');
      if (raw) s.lessonProgress[l.folder] = Object.fromEntries(['read','answers','practice','writing','challenge','speaking','submitted'].filter(k => Object.hasOwn(raw, k)).map(k => [k, raw[k]]));
    }
    return validate(s);
  }
  function recover() {
    const j = parse(JOURNAL);
    if (!j) return;
    for (const [key, value] of Object.entries(j.before)) value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    j.meta === null ? localStorage.removeItem(META) : localStorage.setItem(META, j.meta);
    localStorage.removeItem(JOURNAL);
  }
  function apply(s, meta) {
    validate(s);
    const current = W.read(), writes = {};
    writes[WORDS] = JSON.stringify({ ...current, version: 1, entries: Object.values(s.entries), migrated: W.lessons.map(l => l.folder) });
    for (const l of W.lessons) {
      const progress = s.lessonProgress[l.folder];
      const words = Object.values(s.entries).filter(e => e.kind !== 'sentence' && e.sources.some(src => src.folder === l.folder));
      const names = new Set(words.flatMap(e => [e.key, ...e.sources.filter(src => src.folder === l.folder).map(src => W.normalize(src.selectedText))]));
      const saved = l.words.filter(w => names.has(W.normalize(w.word))).map(w => w.id);
      writes[l.storageKey] = progress || saved.length ? JSON.stringify({ ...progress, saved }) : null;
    }
    const before = Object.fromEntries(Object.keys(writes).map(k => [k, localStorage.getItem(k)]));
    // The journal is durable before any multi-key writes. Startup rolls back an
    // interrupted apply, including its base/version, and retries the cloud read.
    localStorage.setItem(JOURNAL, JSON.stringify({ before, meta: localStorage.getItem(META) }));
    try {
      for (const [key, value] of Object.entries(writes)) value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
      localStorage.setItem(META, JSON.stringify(meta));
      localStorage.removeItem(JOURNAL);
    } catch (e) {
      try {
    const interrupted = !!localStorage.getItem(JOURNAL); recover();
    if (interrupted) { window.dispatchEvent(new CustomEvent('wordbook-change')); window.dispatchEvent(new CustomEvent('passage-cloud-applied')); }
  } catch { fatal = true; }
      throw new Error('Browser storage is full or unavailable. Sync paused; export a backup, free storage, then reload.');
    }
    window.dispatchEvent(new CustomEvent('wordbook-change'));
    window.dispatchEvent(new CustomEvent('passage-cloud-applied'));
  }
  function archive(value) {
    // One key per conflict, never prune silently. Quota failure stops resolution.
    const key = ARCHIVE + '-' + crypto.randomUUID();
    localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), ...value }));
    return key;
  }
  function setStatus(text) {
    status = text;
    const el = document.querySelector('#sync-status');
    if (el) el.textContent = text;
  }
  async function request(path, body, token) {
    const response = await fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { apikey: config.publishableKey, ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const e = new Error(path.startsWith('/auth/v1/token') && [400, 422].includes(response.status) ? 'Sign-in or session renewal failed. Check your email and password; sign out and sign in again if needed. Local changes are kept.' : response.status === 401 ? 'Session expired. Sign in again; local changes are kept.' : response.status === 403 ? 'Account is not allowed. Check Supabase account configuration.' : 'Cloud request failed. Check your connection and Supabase setup, then retry.');
      e.code = response.status; throw e;
    }
    return data;
  }
  function storeSession(s) {
    if (!s?.user?.id || !s.access_token || !s.refresh_token) throw new Error('Invalid sign-in response.');
    const expires = Number.isFinite(s.expires_at) ? s.expires_at : Math.floor(Date.now() / 1000) + s.expires_in;
    if (!Number.isFinite(expires)) throw new Error('Invalid session expiry.');
    const value = { ...s, expires_at: expires, project: url };
    localStorage.setItem(SESSION, JSON.stringify(value));
    return value;
  }
  async function session() {
    let s = parse(SESSION);
    if (!s) return null;
    if (s.project !== url) throw new Error('Cloud project changed. Export local data before changing configuration.');
    if (s.expires_at * 1000 < Date.now() + 60000) {
      const next = await request('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      s = storeSession(next);
    }
    return s;
  }
  const lock = fn => navigator.locks ? navigator.locks.request('passage-cloud-sync', fn) : Promise.reject(new Error('Cloud sync requires a browser with Web Locks (current Chrome, Firefox or Safari). Local saving remains active.'));
  async function readCloud(s) {
    const rows = await request('/rest/v1/passage_snapshots?select=version,snapshot,seed_hash&user_id=eq.' + encodeURIComponent(s.user.id), undefined, s.access_token);
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid cloud response.');
    const row = rows[0];
    if (row) {
      if (row.seed_hash !== C.SEED_HASH || !Number.isSafeInteger(row.version) || row.version < 1) throw new Error('Cloud migration is not verified. Local records were kept.');
      validate(row.snapshot);
    }
    return row;
  }
  function checkAccount(s, meta) {
    if (meta && (meta.userId !== s.user.id || meta.project !== url)) throw new Error('This browser is linked to another account or project. Export its records before changing accounts.');
  }
  function showConflicts(base, local, row, result) {
    if (!pending || !C.equal(pending.local, local) || pending.row.version !== row.version) {
      archive({ reason: 'conflict', base, local, cloud: row.snapshot, version: row.version });
      pending = { base, local, row, conflicts: result.conflicts }; renderConflicts();
    }
    setStatus('Conflict · Automatic upload paused. Review both copies below.');
    document.querySelector('#sync-panel').open = true;
  }
  async function syncUnlocked() {
    const s = await session();
    if (!s) return;
    const meta = parse(META); checkAccount(s, meta);
    setStatus(navigator.onLine ? 'Checking cloud…' : 'Offline · Changes are saved here and will retry.');
    if (!navigator.onLine) return;
    const row = await readCloud(s);
    if (!row) { setStatus('Waiting for first migration · Upload passage-wordbook-2026-10-14.json below. No device data has been uploaded or downloaded.'); return; }
    const local = capture(), base = meta?.base || (C.meaningful(local) ? C.empty() : local);
    const choices = resolution && resolution.version === row.version && C.equal(resolution.local, local) ? resolution.choices : {};
    const result = C.merge(base, local, row.snapshot, choices, { firstDevice: !meta && C.meaningful(local) });
    if (result.conflicts.length) { showConflicts(base, local, row, result); return; }
    let version = row.version;
    if (!C.equal(result.snapshot, row.snapshot)) {
      setStatus('Uploading changes…');
      const saved = await request('/rest/v1/rpc/passage_save', { p_expected_version: row.version, p_snapshot: result.snapshot }, s.access_token);
      if (!saved?.ok) { resolution = null; setStatus('Another device saved first · Checking again…'); schedule(100); return; }
      if (!Number.isSafeInteger(saved.version) || saved.version !== row.version + 1) throw new Error('Cloud version was not verified. Local records were kept.');
      version = saved.version;
      // User edits may arrive while fetch is pending. Never apply an older capture.
      const latest = capture();
      if (!C.equal(latest, local)) {
        const advanced = C.merge(local, latest, result.snapshot);
        if (!advanced.conflicts.length) {
          if (!meta && C.meaningful(latest)) archive({ reason: 'first-device-merge', local: latest, cloud: row.snapshot });
          apply(advanced.snapshot, { userId: s.user.id, project: url, version, base: result.snapshot });
          pending = null; renderConflicts();
        }
        resolution = null; setStatus('Saved locally · Uploading your latest edits next.'); schedule(100); return;
      }
    }
    if (!meta && C.meaningful(local)) archive({ reason: 'first-device-merge', local, cloud: row.snapshot });
    if (!meta || meta.version !== version || !C.equal(local, result.snapshot) || !C.equal(meta.base, result.snapshot))
      apply(result.snapshot, { userId: s.user.id, project: url, version, base: result.snapshot });
    pending = null; resolution = null; renderConflicts();
    setStatus('Synced · ' + new Date().toLocaleTimeString('en-GB') + ' · Version ' + version);
  }
  function sync() {
    if (!configured || fatal) return Promise.resolve();
    if (busy) return inFlight || Promise.resolve();
    busy = true;
    inFlight = (async () => {
      try { await lock(syncUnlocked); }
      catch (e) { setStatus(e.message || 'Sync failed. Local data is kept. Retry when online.'); }
      finally { busy = false; }
    })();
    return inFlight;
  }
  function schedule(delay = 900) {
    if (fatal) return;
    clearTimeout(timer); timer = setTimeout(sync, delay);
  }
  async function signIn(email, password) {
    await lock(async () => {
      const s = await request('/auth/v1/token?grant_type=password', { email, password });
      if (!s?.user?.id || !s.access_token || !s.refresh_token) throw new Error('Invalid sign-in response.');
      checkAccount(s, parse(META));
      storeSession(s);
    });
    renderAuth(); await sync();
  }
  async function migrationFile(file) {
    if (file.name !== 'passage-wordbook-2026-10-14.json' || file.size > 5000000) throw new Error('Choose passage-wordbook-2026-10-14.json.');
    const bytes = await file.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== C.SEED_HASH) throw new Error('This file differs from the approved migration backup. No records were changed.');
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    W.prepareBackup(raw);
    const data = JSON.parse(raw), words = data.entries.filter(e => e.kind !== 'sentence');
    const histories = track => words.reduce((sum,e) => sum + (e.learning?.[track]?.history?.length || 0), 0);
    return { raw, summary: `${words.length} words, ${data.entries.length - words.length} sentences, ${histories('recognition')} Recognition reviews, ${histories('production')} Production reviews, ${Object.keys(data.lessonProgress || {}).length} lessons. SHA-256: ${hash}` };
  }
  async function initialize(file, confirmed = false) {
    if (confirmed !== true) throw new Error('Confirm that the approved backup contains the latest records you want to migrate.');
    if (busy) throw new Error('Wait for the current sync to finish, then retry.');
    busy = true;
    try {
      await lock(async () => {
        const s = await session(); if (!s) throw new Error('Sign in before uploading the migration backup.');
        checkAccount(s, parse(META));
        const { raw } = await migrationFile(file);
        setStatus('Uploading migration backup… Local records will change only after cloud read-back succeeds.');
        await request('/rest/v1/rpc/passage_initialize', { p_backup: raw }, s.access_token);
        const verified = await readCloud(s);
        if (!verified) throw new Error('Migration upload has not been verified. Local records were kept. Retry.');
        setStatus('Migration confirmed in Supabase. Downloading verified records…');
      });
    } finally { busy = false; }
    await sync();
  }
  function download(value, name) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob), a = document.createElement('a'); a.href = href; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  function renderAuth() {
    const signed = !!parse(SESSION);
    document.querySelector('#sync-login').hidden = signed;
    document.querySelector('#sync-account').hidden = !signed;
    document.querySelector('#sync-email-display').textContent = parse(SESSION)?.user?.email || '';
  }
  function renderConflicts() {
    const host = document.querySelector('#sync-conflicts'); if (!host) return;
    host.replaceChildren();
    if (!pending) return;
    const p = document.createElement('p'); p.textContent = 'Both copies have been saved in recovery copies. Choose each result; other edits will be merged. A deletion is shown as [Deleted].'; host.append(p);
    for (const conflict of pending.conflicts) {
      const field = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = conflict.local?.term || conflict.remote?.term || conflict.path.join(' / '); field.append(legend);
      for (const [value, label, data] of [['local', 'This device', conflict.local], ['remote', 'Cloud', conflict.remote]]) {
        const option = document.createElement('label'), input = document.createElement('input'), pre = document.createElement('pre');
        input.type = 'radio'; input.name = conflict.key; input.value = value; input.required = true;
        option.append(input, ' Use ' + label); pre.textContent = data === undefined ? '[Deleted]' : JSON.stringify(data, null, 2); field.append(option, pre);
      }
      host.append(field);
    }
    const button = document.createElement('button'); button.className = 'button primary'; button.textContent = 'Save selected results'; button.type = 'submit'; host.append(button);
  }
  function mount() {
    const section = document.createElement('section'); section.className = 'passage-sync'; section.setAttribute('aria-label', 'Cloud sync');
    section.innerHTML = `<details id="sync-panel"><summary>Cloud sync <span id="sync-status" role="status" aria-live="polite"></span></summary>
      <div class="sync-content"><p>Keep learning on your computers. Local saving and JSON backups remain available offline.</p>
      <form id="sync-login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="button primary" type="submit">Sign in</button></form>
      <div id="sync-account" hidden><p>Signed in as <span id="sync-email-display"></span></p><button class="button secondary" id="sync-now">Sync now</button> <button class="text-button" id="sync-signout">Sign out</button>
      <label class="sync-migration">First migration only: passage-wordbook-2026-10-14.json<input id="sync-migrate" type="file" accept=".json,application/json"></label><p>The exact approved backup is uploaded first. This device downloads only after Supabase confirms it.</p><p id="sync-migration-summary"></p><label><input id="sync-migration-confirm" type="checkbox">I have checked this original backup against my Windows records. It contains the latest records I want to migrate.</label><button class="button primary" id="sync-migration-upload" disabled>Upload confirmed backup</button></div>
      <button class="text-button" id="sync-recovery">Export recovery copies</button><p id="sync-error" role="alert"></p><form id="sync-conflicts"></form></div></details>`;
    const main = document.querySelector('main');
    if (main?.id === 'main') main.before(section);
    else (main || document.body).prepend(section);
    setStatus(status); renderAuth();
    section.querySelector('#sync-login button').disabled = !configured;
    async function action(fn) {
      const error = section.querySelector('#sync-error'); error.textContent = '';
      try { await fn(); } catch (e) { error.textContent = e.message; setStatus(e.message); }
    }
    section.querySelector('#sync-login').addEventListener('submit', e => {
      e.preventDefault(); const form = e.currentTarget, values = new FormData(form), button = form.querySelector('button'); button.disabled = true;
      action(() => signIn(values.get('email'), values.get('password'))).finally(() => { form.elements.password.value = ''; button.disabled = !configured; });
    });
    section.querySelector('#sync-now').addEventListener('click', sync);
    section.querySelector('#sync-signout').addEventListener('click', () => action(async () => {
      await lock(async () => {
        const s = parse(SESSION);
        // Local sign-out works offline; saved data and its base stay on this device.
        localStorage.removeItem(SESSION); pending = null; resolution = null;
        if (s) request('/auth/v1/logout?scope=local', {}, s.access_token).catch(() => {});
      });
      renderAuth(); renderConflicts(); setStatus('Signed out · Changes remain saved in this browser.');
    }));
    let migration;
    const upload = section.querySelector('#sync-migration-upload'), confirmation = section.querySelector('#sync-migration-confirm');
    section.querySelector('#sync-migrate').addEventListener('change', e => {
      const file = e.target.files[0]; migration = null; confirmation.checked = false; upload.disabled = true;
      section.querySelector('#sync-migration-summary').textContent = '';
      if (file) action(async () => {
        const checked = await migrationFile(file);
        if (e.target.files[0] !== file) return;
        migration = file; section.querySelector('#sync-migration-summary').textContent = checked.summary;
        upload.disabled = !confirmation.checked;
      });
    });
    confirmation.addEventListener('change', () => { upload.disabled = !migration || !confirmation.checked; });
    upload.addEventListener('click', () => {
      if (!migration || !confirmation.checked) return;
      upload.disabled = true;
      action(() => initialize(migration, true)).finally(() => { upload.disabled = !migration || !confirmation.checked; });
    });
    section.querySelector('#sync-recovery').addEventListener('click', () => action(() => {
      const copies = {};
      for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key.startsWith(ARCHIVE + '-')) copies[key] = parse(key); }
      download({ format: 'passage-sync-recovery', copies }, 'passage-sync-recovery.json');
    }));
    section.querySelector('#sync-conflicts').addEventListener('submit', e => {
      e.preventDefault(); if (!pending) return;
      resolution = { version: pending.row.version, local: pending.local, choices: Object.fromEntries(new FormData(e.currentTarget)) };
      sync();
    });
  }
  mount();
  try {
    const interrupted = !!localStorage.getItem(JOURNAL); recover();
    if (interrupted) { window.dispatchEvent(new CustomEvent('wordbook-change')); window.dispatchEvent(new CustomEvent('passage-cloud-applied')); }
  } catch { fatal = true; setStatus('Interrupted storage update. Sync paused; export browser data before retrying.'); }
  // Apply/cross-tab notifications never mark a snapshot dirty. Actual local writes
  // schedule uploads; periodic reads pick up changes made on another computer.
  function changed() {
    setStatus(!configured ? 'Saved locally · Cloud sync is not configured.' : !navigator.onLine ? 'Offline · Changes are saved here and will retry.' : parse(SESSION) ? 'Saved locally · Waiting to sync.' : 'Saved locally · Sign in to sync.');
    schedule();
  }
  window.addEventListener('wordbook-change', () => { if (!busy) changed(); });
  window.addEventListener('passage-local-change', changed);
  window.addEventListener('storage', e => {
    if (e.key === SESSION) { renderAuth(); schedule(); }
    else if (keys.has(e.key) || e.key === null) schedule();
  });
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('offline', () => setStatus('Offline · Changes are saved here and will retry.'));
  window.addEventListener('focus', () => schedule(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
  setInterval(() => { if (!document.hidden) sync(); }, 15000);
  window.PassageSync = { sync, signIn, initialize, capture, validate, get status() { return status; } };
  schedule(0);
})();
