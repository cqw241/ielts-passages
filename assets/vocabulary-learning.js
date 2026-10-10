/* Pure scheduling rules shared by the store, UI and deterministic tests. */
(() => {
  'use strict';
  const DAY = 86400000, INTERVALS = [1, 3, 7, 14, 30, 60];
  const statuses = ['active', 'recognition', 'known', 'skip', 'exposure'];
  const tracks = ['recognition', 'production'];
  const dateKey = time => { const d = new Date(time); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
  const emptyTrack = () => ({ level: -1, ease: 1, streak: 0, lapses: 0, interval: 0, due: null, lastAt: null, history: [] });
  const fresh = () => ({ status: 'exposure', startedAt: null, exposedAt: null, resetAt: null, recognition: emptyTrack(), production: emptyTrack() });
  function validate(raw) {
    if (!raw) return fresh();
    if (!statuses.includes(raw.status)) throw new Error('Invalid vocabulary status in backup.');
    const value = fresh(); value.status = raw.status;
    const timestamp = x => x === null || (Number.isFinite(x) && x >= 0 && x <= 8640000000000000);
    if (!timestamp(raw.startedAt)) throw new Error('Invalid learning date in backup.');
    value.startedAt = raw.startedAt;
    if (!timestamp(raw.exposedAt ?? null)) throw new Error('Invalid answer exposure date in backup.');
    value.exposedAt = raw.exposedAt ?? null;
    if (!timestamp(raw.resetAt ?? null)) throw new Error('Invalid learning reset date in backup.');
    value.resetAt = raw.resetAt ?? null;
    for (const name of tracks) {
      const t = raw[name];
      if (!t || !Number.isInteger(t.level) || t.level < -1 || t.level > 5 || !Number.isFinite(t.ease) || t.ease < .6 || t.ease > 1.5 || !Number.isInteger(t.streak) || t.streak < 0 || !Number.isInteger(t.lapses) || t.lapses < 0 || !Number.isFinite(t.interval) || t.interval < 0 || t.interval > 120 || !timestamp(t.due) || !timestamp(t.lastAt) || !Array.isArray(t.history) || t.history.length > 2000) throw new Error('Invalid review schedule in backup.');
      for (const h of t.history) if (!h || !timestamp(h.at) || h.at === null || !['again','hard','good','easy'].includes(h.rating) || !Number.isFinite(h.lateDays) || h.lateDays < 0 || !Number.isFinite(h.gapDays) || h.gapDays < 0 || typeof h.answer !== 'string' || h.answer.length > 3000 || !Number.isInteger(h.stage) || h.stage < 0 || h.stage > 3) throw new Error('Invalid review history in backup.');
      value[name] = { level:t.level, ease:t.ease, streak:t.streak, lapses:t.lapses, interval:t.interval, due:t.due, lastAt:t.lastAt, history: t.history.map(h => ({ at:h.at, rating:h.rating, lateDays:h.lateDays, gapDays:h.gapDays, answer:h.answer, stage:h.stage })) };
    }
    return value;
  }
  function enabled(learning, name) { return learning.status === 'active' || learning.status === 'recognition' && name === 'recognition'; }
  function schedule(track, rating, now = Date.now(), answer = '', stage = 0, name = 'recognition') {
    if (!['again','hard','good','easy'].includes(rating)) throw new Error('Choose a review rating.');
    const next = { ...track, history: [...track.history] };
    const lateDays = track.due === null ? 0 : Math.max(0, (now - track.due) / DAY);
    const gapDays = track.lastAt === null ? 0 : Math.max(0, (now - track.lastAt) / DAY);
    if (rating === 'again') {
      next.level = -1; next.streak = 0; next.lapses++; next.ease = Math.max(.6, track.ease - .15); next.interval = name === 'production' ? 1 : 10 / 1440;
    } else if (rating === 'hard') {
      next.level = Math.max(0, track.level); next.streak = 0; next.ease = Math.max(.6, track.ease - .1);
      next.interval = Math.max(1, Math.round((track.interval || 1) * .6));
    } else {
      next.level = Math.min(5, track.level + (rating === 'easy' ? 2 : 1)); next.streak++;
      next.ease = Math.min(1.5, track.ease + (rating === 'easy' ? .1 : 0));
      next.interval = Math.min(120, Math.max(1, Math.round(INTERVALS[next.level] * next.ease + Math.min(lateDays * .25, INTERVALS[next.level] * .25))));
    }
    next.due = now + next.interval * DAY; next.lastAt = now;
    next.history.push({ at: now, rating, lateDays, gapDays, answer: String(answer).slice(0,3000), stage });
    next.history = next.history.slice(-2000);
    return next;
  }
  const stage = track => Math.max(0, Math.min(3, track.level));
  function mastered(track, name) {
    const lastLapse = track.history.findLastIndex(h => h.rating === 'again');
    return track.interval >= 14 && track.streak >= 2 && (name !== 'production' || track.history.slice(lastLapse + 1).some(h => h.stage === 3 && ['good','easy'].includes(h.rating) && h.answer.trim()));
  }
  // Seeing a target or its reference cannot establish independent retrieval immediately afterwards.
  function availableAt(learning, name) {
    const exposure = Math.max(learning.exposedAt ?? 0, learning.recognition.lastAt ?? 0);
    return Math.max(learning[name].due ?? 0, name === 'production' && exposure ? exposure + DAY : 0);
  }
  function queue(entries, now = Date.now(), ignoreExposure = false) {
    const words = entries.filter(e => e.kind !== 'sentence' && e.definition && e.learning);
    const byId = new Map(words.map(e=>[e.id,e]));
    const due = [], waiting = [], deferred = [], startedToday = entries.filter(e => e.learning?.startedAt !== null && e.learning?.startedAt !== undefined && dateKey(e.learning.startedAt) === dateKey(now)).length;
    for (const entry of words) for (const name of tracks) {
      const learning = entry.learning, track = learning[name];
      if (!enabled(learning, name)) continue;
      const item = { id:entry.id, track:name, new:track.lastAt === null };
      if (!ignoreExposure && name === 'production' && availableAt(learning,name) > now && (track.due === null || track.due <= now)) { deferred.push({...item, availableAt:availableAt(learning,name)}); continue; }
      if (track.due !== null && track.due <= now || track.due === null && learning.startedAt !== null) due.push(item);
      else if (track.due === null) waiting.push(item);
    }
    const weakness = item => { const t = byId.get(item.id).learning[item.track]; return t.streak * 10 + t.level - Math.min(t.lapses,10); };
    due.sort((a,b) => weakness(a)-weakness(b) || (byId.get(a.id).learning[a.track].due||0)-(byId.get(b.id).learning[b.track].due||0) || a.track.localeCompare(b.track));
    const backlog = due.length + deferred.filter(i=>byId.get(i.id).learning.startedAt !== null).length;
    let allowance = backlog >= 20 ? 0 : Math.min(6 - startedToday, Math.floor((20-backlog)/2));
    allowance = Math.max(0, allowance);
    const allowed = new Set();
    for (const item of waiting) {
      const entry = byId.get(item.id);
      if (entry.learning.startedAt !== null) allowed.add(item.id);
      else if (!allowed.has(item.id) && allowance > 0) { allowed.add(item.id); allowance--; }
    }
    const items = [...due,...waiting.filter(i=>allowed.has(i.id))];
    const productionIds = new Set(items.filter(i=>i.track==='production').map(i=>i.id));
    // Preserve weakness/overdue order within groups, but do paired production before recognition.
    items.sort((a,b)=>Number(a.track==='recognition' && productionIds.has(a.id))-Number(b.track==='recognition' && productionIds.has(b.id)));
    return { items, due:due.length, waiting:waiting.length, deferred, paused:backlog>=20 || startedToday>=6, startedToday, blocked:waiting.filter(i=>!allowed.has(i.id)).length };
  }
  function stats(entries, now = Date.now()) {
    const counts = { recognition:0, production:0, recognitionTotal:0, productionTotal:0, latePassed:0, lateTotal:0, delayedPassed:0, delayedTotal:0 };
    for (const e of entries.filter(e=>e.kind!=='sentence' && e.learning)) for (const name of tracks) {
      const t=e.learning[name];
      if (enabled(e.learning,name)) { counts[name+'Total']++; if (mastered(t,name)) counts[name]++; }
      for (const h of t.history) { const passed=['good','easy'].includes(h.rating); if (h.lateDays>=1) { counts.lateTotal++; if(passed) counts.latePassed++; } if(h.gapDays>=7) { counts.delayedTotal++; if(passed) counts.delayedPassed++; } }
    }
    return { ...counts, ...queue(entries,now) };
  }
  window.VocabularyLearning = { DAY, INTERVALS, statuses, tracks, fresh, validate, enabled, schedule, stage, mastered, availableAt, queue, stats, dateKey };
})();
