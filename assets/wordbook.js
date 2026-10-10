(() => {
  'use strict';
  const W = window.Wordbook;
  const root = document.querySelector('#wordbook-main');
  const base = window.LESSON ? '../' : '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const sound = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
  let editing = null, undo = null, selection = null, lastFocus;
  let collectionType = location.hash === '#sentences' ? 'sentence' : 'word';
  document.body.insertAdjacentHTML('beforeend', `<dialog id="wb-dialog" aria-labelledby="wb-dialog-title"><div class="dialog-top"><span id="wb-dialog-title"></span><button class="icon-button" data-wb="close" aria-label="Close wordbook dialog">✕</button></div><div id="wb-dialog-body"></div></dialog><div id="wb-toast" role="status" aria-live="polite"></div>${window.LESSON ? '<div id="wb-selection-menu" aria-label="Save selected text" hidden><button id="wb-selection" class="button primary compact" data-wb="selection" hidden>Add to wordbook ＋</button><button id="wb-save-sentence" class="button secondary compact" data-wb="sentence-selection" hidden>Save sentence</button></div>' : ''}`);
  const dialog = document.querySelector('#wb-dialog'), body = document.querySelector('#wb-dialog-body');
  function notify(message, editId, allowUndo = false) {
    const toast = document.querySelector('#wb-toast');
    (document.querySelector('#wb-dialog[open]') || document.querySelector('#detail-dialog[open]') || document.body).append(toast);
    toast.innerHTML = `<span>${esc(message)}</span>${editId ? `<button data-wb="edit" data-id="${esc(editId)}">Edit →</button>` : ''}${allowUndo ? '<button data-wb="undo">Undo</button>' : ''}`;
    toast.classList.add('visible'); clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('visible'), allowUndo ? 15000 : 7000);
  }
  function open(title, html) {
    lastFocus = document.activeElement;
    document.querySelector('#wb-dialog-title').textContent = title;
    body.innerHTML = html;
    if (!dialog.open) dialog.showModal();
    hideSelection();
  }
  function close() { dialog.close(); editing = null; lastFocus?.focus?.({ preventScroll: true }); }
  dialog.addEventListener('cancel', () => { editing = null; });
  const statusText = e => W.kind(e) === 'sentence' ? 'Saved sentence' : e.definition ? ({active:'Active · two tracks',recognition:'Recognition · reading track',known:'Already know · paused',skip:'Skip · paused',exposure:'Reading exposure · not enrolled'}[e.learning.status]) : 'Meaning needed';
  function sourceHTML(s) {
    const lesson = W.lessons.find(l => l.folder === s.folder);
    if (!lesson) return '';
    return `<div class="wb-context"><blockquote>${esc(s.quote || s.selectedText)}</blockquote><a class="wb-source" href="${base}${lesson.folder}/index.html#${esc(s.location)}">Day ${lesson.day} · ${esc(s.label)} <span aria-hidden="true">↗</span></a><span class="wb-original">Selected: ${esc(s.selectedText)}</span></div>`;
  }
  function attributionHTML(e, candidates = false) {
    const a = candidates ? e.attribution : e.definitionAttribution; if (!a) return '';
    if (!a.url) return '<p class="wb-attribution">Meaning from lesson vocabulary.</p>';
    return `<p class="wb-attribution">Definitions: <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">Wiktionary</a> via <a href="https://freedictionaryapi.com/" target="_blank" rel="noopener noreferrer">FreeDictionaryAPI.com</a>${a.license?.url ? ` · <a href="${esc(a.license.url)}" target="_blank" rel="noopener noreferrer">${esc(a.license.name)}</a>` : ''}${e.edited.definition ? ' · Meaning selected or edited by you' : ''}.</p>`;
  }
  function filtered() {
    const search = document.querySelector('#wb-search')?.value.toLowerCase().trim() || '';
    const folder = document.querySelector('#wb-lesson')?.value || '';
    const status = document.querySelector('#wb-status')?.value || '';
    return W.read().entries.filter(e => W.kind(e) === collectionType && (!folder || e.sources.some(s => s.folder === folder)) && (!status || (status === 'missing' ? (collectionType === 'sentence' ? !e.definition && !e.note : !e.definition) : e.learning?.status === status)) && `${e.term} ${e.definition} ${e.note}`.toLowerCase().includes(search)).sort((a, b) => b.createdAt - a.createdAt);
  }
  function row(e) {
    if (W.kind(e) === 'sentence') return sentenceRow(e);
    const s = e.sources[0];
    return `<article class="wb-row" data-entry="${esc(e.id)}"><div class="wb-word"><div class="wb-word-title"><button data-wb="edit" data-id="${esc(e.id)}">${esc(e.term)}</button><button class="icon-button" data-wb="speak" data-id="${esc(e.id)}" aria-label="Read aloud: ${esc(e.term)}">${sound}</button></div>${e.ipa ? `<p class="ipa">${esc(e.ipa)}</p>` : ''}<span class="wb-status ${e.definition ? '' : 'needs-meaning'}">${statusText(e)}</span><p class="wb-meaning">${esc(e.definition || (e.dictionaryStatus === 'pending' ? 'Looking up dictionary meanings…' : e.candidates.length ? 'Choose a meaning for this context.' : 'Add a meaning or retry the dictionary.'))}</p>${e.note ? `<p class="wb-note">${esc(e.note)}</p>` : ''}<div class="wb-row-actions"><button class="text-button" data-wb="edit" data-id="${esc(e.id)}">Edit entry</button><button class="text-button" data-wb="delete" data-id="${esc(e.id)}">Delete</button></div>${window.VocabularyLearningUI.entryControl(e)}${attributionHTML(e)}</div><div class="wb-contexts">${s ? sourceHTML(s) : '<div class="wb-context wb-manual"><p>No lesson linked.</p><p class="subtle">Collect this word in a lesson to keep its original sentence here.</p></div>'}${e.sources.length > 1 ? `<details><summary>${e.sources.length - 1} more saved context${e.sources.length > 2 ? 's' : ''}</summary>${e.sources.slice(1).map(sourceHTML).join('')}</details>` : ''}</div></article>`;
  }
  function sentenceRow(e) {
    return `<article class="wb-row wb-sentence-row" data-entry="${esc(e.id)}"><div><p class="eyebrow">SAVED SENTENCE</p><blockquote class="wb-sentence-text">${esc(e.term)}</blockquote><div class="wb-row-actions"><button class="text-button" data-wb="edit" data-id="${esc(e.id)}">Edit notes</button><button class="text-button" data-wb="delete" data-id="${esc(e.id)}">Delete</button><button class="icon-button" data-wb="speak" data-id="${esc(e.id)}" aria-label="Read saved sentence aloud">${sound}</button></div>${e.definition ? `<div class="wb-sentence-note"><p class="eyebrow">YOUR UNDERSTANDING</p><p>${esc(e.definition)}</p></div>` : ''}${e.note ? `<div class="wb-sentence-note"><p class="eyebrow">YOUR NOTE</p><p>${esc(e.note)}</p></div>` : ''}${!e.definition && !e.note ? '<p class="subtle wb-sentence-hint">Add your understanding or a note when you revisit this sentence.</p>' : ''}</div><aside class="wb-contexts" aria-label="Sentence sources">${e.sources.length ? `<p class="eyebrow">FROM YOUR READING</p>${e.sources.map(s => { const lesson = W.lessons.find(l => l.folder === s.folder); return `<div class="wb-sentence-source"><p>${esc(lesson.title)}</p><a class="wb-source" href="${base}${lesson.folder}/index.html#${esc(s.location)}">Day ${lesson.day} · ${esc(s.label)} ↗</a>${s.quote && s.quote !== e.term ? `<details><summary>Surrounding context</summary><blockquote>${esc(s.quote)}</blockquote></details>` : ''}</div>`; }).join('')}` : '<p class="subtle">No lesson linked. Saved by you.</p>'}</aside></article>`;
  }
  function render() {
    const all = W.read().entries;
    document.querySelectorAll('[data-wb-count]').forEach(el => el.textContent = String(all.length));
    if (!root) return;
    const entries = all.filter(e => W.kind(e) === collectionType), sentences = collectionType === 'sentence';
    document.querySelector('#wb-word-count').textContent = all.filter(e => W.kind(e) === 'word').length;
    document.querySelector('#wb-sentence-count').textContent = all.filter(e => W.kind(e) === 'sentence').length;
    document.querySelectorAll('[data-wb="tab"]').forEach(tab => { const active = tab.dataset.kind === collectionType; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    document.querySelector('#wb-collection').setAttribute('aria-labelledby', sentences ? 'wb-sentences-tab' : 'wb-words-tab');
    document.querySelector('.wb-heading [data-wb="add"]').textContent = sentences ? 'Add a sentence ＋' : 'Add a word ＋';
    document.querySelector('#wb-total').textContent = entries.length;
    document.querySelector('#wb-total-label').textContent = sentences ? 'saved sentences' : 'words & phrases';
    document.querySelector('#wb-again').parentElement.hidden = sentences;
    document.querySelector('#wb-again').textContent = entries.filter(e => ['active','recognition'].includes(e.learning?.status)).length;
    document.querySelector('#wb-missing').textContent = entries.filter(e => sentences ? !e.definition && !e.note : !e.definition).length;
    document.querySelector('#wb-missing-label').textContent = sentences ? 'without notes' : 'need a meaning';
    document.querySelector('#wb-search').placeholder = sentences ? 'Search sentences, understanding or notes' : 'Search words, meanings or notes';
    document.querySelector('#wb-status option[value="missing"]').textContent = sentences ? 'Without notes' : 'Meaning needed';
    for (const value of ['active','recognition','known','skip','exposure']) document.querySelector(`#wb-status option[value="${value}"]`).hidden = sentences;
    document.querySelector('[data-wb="recall"]').hidden = sentences;
    if (W.problem) document.querySelector('#wb-notice').textContent = W.problem;
    const list = filtered();
    document.querySelector('#wb-results').textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'} · Most recently added first`;
    document.querySelector('#wb-list').innerHTML = list.length ? list.map(row).join('') : `<div class="wb-empty"><p class="eyebrow">${entries.length ? 'NO MATCHES' : sentences ? 'KEEP A SENTENCE FOR LATER' : 'YOUR NEXT WORD STARTS HERE'}</p><h2>${entries.length ? 'Try another search or filter.' : sentences ? 'Return to the sentences that make you think.' : 'Keep the words that make you pause.'}</h2><p>${entries.length ? 'Your other saved entries are still in this collection.' : sentences ? 'Select a sentence in any lesson, then choose “Save sentence”. Add your understanding and notes whenever you revisit it.' : 'Select a word or short phrase in any lesson, then choose “Add to wordbook”. Its sentence comes with it.'}</p>${entries.length ? '<button class="button secondary" data-wb="clear-filters">Clear filters</button>' : `<a class="button secondary" href="index.html">Choose a lesson →</a><button class="text-button" data-wb="add">${sentences ? 'Or add a sentence yourself' : 'Or add a word yourself'}</button>`}</div>`;
    document.querySelector('[data-wb="recall"]').disabled = false;
  }
  function candidatesHTML(e) {
    const status = e.dictionaryStatus;
    const hint = status === 'pending' ? 'Looking up dictionary meanings…' : status === 'error' ? 'The dictionary could not be reached. Your word and context are saved. Retry or write a meaning yourself.' : !e.candidates.length ? 'No dictionary entry found. Try a base form, retry, or write a meaning yourself.' : 'Choose the sense that fits your original sentence. Dictionary senses are general definitions.';
    return `<p class="subtle" role="status">${hint}</p>${e.candidates.length ? `<div class="wb-senses">${e.candidates.map((c, i) => `<button data-wb="sense" data-id="${esc(e.id)}" data-index="${i}" aria-pressed="${e.definition === c.definition}"><small>${esc(c.partOfSpeech)}</small><span>${esc(c.definition)}</span></button>`).join('')}</div>` : ''}<button class="text-button" data-wb="retry" data-id="${esc(e.id)}" ${status === 'pending' ? 'disabled' : ''}>Retry dictionary lookup</button>${attributionHTML(e, true)}`;
  }
  function edit(id) {
    const e = W.get(id); if (!e) { notify('This entry no longer exists.'); return; }
    editing = id;
    if (W.kind(e) === 'sentence') {
      open('Your saved sentence', `<form id="wb-edit-form"><p class="eyebrow">ORIGINAL SENTENCE</p><blockquote class="wb-sentence-text wb-editor-sentence">${esc(e.term)}</blockquote><label class="wb-field">Your understanding<textarea name="definition" rows="3" maxlength="3000" placeholder="Explain the sentence in your own English.">${esc(e.definition)}</textarea></label><label class="wb-field">Your note<textarea name="note" rows="3" maxlength="3000" placeholder="What made this sentence difficult? What would you like to remember?">${esc(e.note)}</textarea></label><div class="wb-form-actions"><button class="button primary" type="submit">Save changes</button><button class="text-button" type="button" data-wb="close">Cancel</button><button class="icon-button" type="button" data-wb="speak" data-id="${esc(e.id)}" aria-label="Read saved sentence aloud">${sound}</button></div><p id="wb-form-error" role="alert"></p></form>${e.sources.length ? `<div class="wb-editor-contexts"><p class="eyebrow">YOUR ORIGINAL CONTEXT</p>${e.sources.map(sourceHTML).join('')}</div>` : ''}`);
      return;
    }
    open('Edit wordbook entry', `<form id="wb-edit-form"><label class="wb-field">Word or phrase<input name="term" value="${esc(e.term)}" maxlength="100" required autocomplete="off"></label><p class="subtle wb-edit-hint">Change a word to its base form to look it up again. Your original selected text stays in each saved context. Changing the expression or meaning clears both review tracks; changes to capitalisation, spacing or notes keep progress.</p><p id="wb-learning-reset" class="learning-hint" role="status"></p><label class="wb-field">Meaning in this context<textarea name="definition" rows="3" maxlength="3000" placeholder="Choose a dictionary sense below, or write your own English meaning.">${esc(e.definition)}</textarea></label><label class="wb-field">Your note<textarea name="note" rows="2" maxlength="3000" placeholder="A collocation, memory clue or example of your own.">${esc(e.note)}</textarea></label><div class="wb-form-actions"><button class="button primary" type="submit">Save changes</button><button class="text-button" type="button" data-wb="close">Cancel</button><button class="icon-button" type="button" data-wb="speak" data-id="${esc(e.id)}" aria-label="Read aloud: ${esc(e.term)}">${sound}</button></div><p id="wb-form-error" role="alert"></p></form><details class="wb-dictionary" open><summary>Dictionary meanings ${esc(e.ipa)}</summary><div id="wb-candidates">${candidatesHTML(e)}</div></details>${e.sources.length ? `<div class="wb-editor-contexts"><p class="eyebrow">YOUR ORIGINAL CONTEXT${e.sources.length > 1 ? 'S' : ''}</p>${e.sources.map(sourceHTML).join('')}</div>` : ''}`);
  }
  function addDialog() {
    editing = null;
    if (collectionType === 'sentence') {
      open('Add a sentence', '<form id="wb-add-form" data-kind="sentence"><label class="wb-field">Sentence<textarea name="term" rows="4" maxlength="3000" required placeholder="Paste the complete sentence you want to keep."></textarea></label><p class="subtle">Its wording and punctuation stay as you save them. Add your notes afterwards.</p><div class="wb-form-actions"><button class="button primary" type="submit">Save sentence</button><button class="text-button" type="button" data-wb="close">Cancel</button></div><p id="wb-form-error" role="alert"></p></form>');
      return;
    }
    open('Add a word or phrase', '<form id="wb-add-form"><label class="wb-field">Word or phrase<input name="term" placeholder="e.g. purchasing power" maxlength="100" required autocomplete="off"></label><p class="subtle">Save first. Choose or write its meaning afterwards.</p><div class="wb-form-actions"><button class="button primary" type="submit">Add to wordbook</button><button class="text-button" type="button" data-wb="close">Cancel</button></div><p id="wb-form-error" role="alert"></p></form>');
  }
  function speak(id) {
    const e = W.get(id); if (!e) return;
    if (!('speechSynthesis' in window)) { notify('Read-aloud is not available in this browser. Use the pronunciation guide.'); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(e.term);
    utterance.lang = 'en-GB'; utterance.rate = .85;
    utterance.onerror = () => notify('Read-aloud is unavailable right now. Use the pronunciation guide.');
    speechSynthesis.speak(utterance);
  }
  function exportJSON() {
    const blob = new Blob([W.exportBackup()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'passage-wordbook-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('JSON backup exported.');
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-wb]'); if (!button) return;
    const action = button.dataset.wb, id = button.dataset.id;
    try {
      if (action === 'close') close();
      else if (action === 'tab') activateTab(button.dataset.kind);
      else if (action === 'add') addDialog();
      else if (action === 'edit') edit(id);
      else if (action === 'speak') speak(id);
      else if (action === 'delete') { undo = W.remove(id); notify('Entry deleted from your wordbook.', null, true); }
      else if (action === 'undo') { W.restore(undo); undo = null; notify('Entry restored.'); }
      else if (action === 'export') exportJSON();
      else if (action === 'import') document.querySelector('#wb-import').click();
      else if (action === 'retry') W.lookup(id, true);
      else if (action === 'sense') {
        const e = W.get(id), c = e?.candidates[Number(button.dataset.index)];
        if (c) { const field = body.querySelector('[name="definition"]'); field.value = c.definition; field.dataset.fromDictionary = 'true'; field.dispatchEvent(new Event('input',{bubbles:true})); body.querySelectorAll('[data-wb="sense"]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); }
      }
      else if (action === 'recall') location.href = base + 'review.html';
      else if (action === 'clear-filters') { ['#wb-search', '#wb-lesson', '#wb-status'].forEach(s => document.querySelector(s).value = ''); render(); }
      else if (['selection','sentence-selection'].includes(action) && selection) {
        const saved = selection;
        const sentenceSave = action === 'sentence-selection';
        const id = sentenceSave ? W.addSentence(saved.text, saved.source) : W.add(saved.term, saved.source);
        hideSelection(); window.getSelection()?.removeAllRanges();
        notify(sentenceSave ? 'Sentence saved.' : 'Added to wordbook.', id);
      }
    } catch (error) { notify(error.message); }
  });
  document.addEventListener('input', event => {
    const form=event.target.closest('#wb-edit-form'), warning=form?.querySelector('#wb-learning-reset');
    if(!warning)return;
    const entry=W.get(editing),fields=new FormData(form);
    warning.textContent=W.changesLearning(entry,{term:fields.get('term'),definition:fields.get('definition')})?'Saving this change will clear Recognition and Production history and restart both schedules.':'';
  });
  document.addEventListener('submit', event => {
    if (!['wb-edit-form', 'wb-add-form'].includes(event.target.id)) return;
    event.preventDefault();
    const fields = new FormData(event.target);
    try {
      if (event.target.id === 'wb-add-form') { const id = event.target.dataset.kind === 'sentence' ? W.addSentence(fields.get('term')) : W.add(fields.get('term')); edit(id); }
      else {
        const old = W.get(editing), changed = old && W.normalize(old.term) !== W.normalize(fields.get('term'));
        const id = W.update(editing, { term: fields.has('term') ? fields.get('term') : undefined, definition: fields.get('definition'), note: fields.get('note'), definitionSource: event.target.querySelector('[name="definition"]').dataset.fromDictionary === 'true' ? 'dictionary' : undefined });
        const reset=W.changesLearning(old,{term:fields.has('term')?fields.get('term'):undefined,definition:fields.get('definition')});
        close(); notify(reset?'Changes saved. Both review tracks were reset; your learning goal and original contexts were kept.':'Changes saved.', id);
        if (changed && W.kind(old) === 'word') W.lookup(id);
      }
    } catch (error) { document.querySelector('#wb-form-error').textContent = error.message; }
  });
  function activateTab(type, updateHash = true) {
    if (!root) return;
    if (collectionType !== type) {
      collectionType = type;
      document.querySelector('#wb-search').value = '';
      document.querySelector('#wb-status').value = '';
    }
    render();
    if (updateHash) location.hash = type === 'sentence' ? 'sentences' : 'words';
  }
  if (root) {
    window.addEventListener('hashchange', () => activateTab(location.hash === '#sentences' ? 'sentence' : 'word', false));
    document.querySelector('.wb-tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const type = event.key === 'Home' ? 'word' : event.key === 'End' ? 'sentence' : collectionType === 'word' ? 'sentence' : 'word';
      activateTab(type);
      document.querySelector(`[data-wb="tab"][data-kind="${type}"]`).focus();
    });
    const folderSelect = document.querySelector('#wb-lesson');
    W.lessons.forEach(l => folderSelect.insertAdjacentHTML('beforeend', `<option value="${esc(l.folder)}">Day ${l.day} · ${esc(l.title)}</option>`));
    folderSelect.value = new URLSearchParams(location.search).get('lesson') || '';
    if (folderSelect.selectedIndex < 0) folderSelect.value = '';
    ['#wb-search', '#wb-lesson', '#wb-status'].forEach(s => document.querySelector(s).addEventListener('input', render));
    document.querySelector('#wb-import').addEventListener('change', async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        if (file.size > 5000000) throw new Error('Choose a wordbook backup smaller than 5 MB.');
        const result = W.importBackup(await file.text());
        document.querySelector('#wb-notice').textContent = `Import complete: ${result.added} added, ${result.merged} merged. Your current edits were kept.`;
      } catch (error) { document.querySelector('#wb-notice').textContent = error.message; }
      finally { event.target.value = ''; }
    });
  }
  function hideSelection() { const menu = document.querySelector('#wb-selection-menu'); if (menu) { menu.hidden = true; menu.querySelectorAll('button').forEach(button => button.hidden = true); } selection = null; }
  function sentence(text, start, end) {
    if (Intl.Segmenter) {
      const segments = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)];
      const matching = segments.filter(s => s.index < end && s.index + s.segment.length > start);
      if (matching.length) return matching.map(s => s.segment).join('').trim().slice(0, 3000);
    }
    let left = start, right = end;
    while (left > 0 && !/[.!?\n]/.test(text[left - 1])) left--;
    while (right < text.length && !/[.!?\n]/.test(text[right])) right++;
    if (right < text.length) right++;
    return text.slice(left, right).trim().slice(0, 3000);
  }
  function capture() {
    const menu = document.querySelector('#wb-selection-menu'), button = document.querySelector('#wb-selection'), sentenceButton = document.querySelector('#wb-save-sentence'); if (!menu || dialog.open) return;
    const active = document.activeElement;
    let text, quote, host, rect;
    if (active?.matches('textarea,input[type="text"]') && active.closest('#main') && active.selectionEnd > active.selectionStart) {
      text = active.value.slice(active.selectionStart, active.selectionEnd);
      quote = sentence(active.value, active.selectionStart, active.selectionEnd); host = active; rect = active.getBoundingClientRect();
    } else {
      const selected = window.getSelection();
      if (!selected || selected.isCollapsed || !selected.rangeCount) { hideSelection(); return; }
      const range = selected.getRangeAt(0);
      const element = n => n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement;
      const start = element(range.startContainer), end = element(range.endContainer);
      if (!start?.closest('#main,#dialog-content') || !end?.closest('#main,#dialog-content')) { hideSelection(); return; }
      text = selected.toString(); host = start;
      const block = start.closest('.english-passage,p,blockquote,li,td,.sentence-chunks,label,h2,h3') || start;
      const prefix = document.createRange(); prefix.selectNodeContents(block);
      try { prefix.setEnd(range.startContainer, range.startOffset); } catch { hideSelection(); return; }
      const offset = prefix.toString().length;
      quote = sentence(block.textContent, offset, offset + text.length);
      rect = range.getBoundingClientRect();
    }
    const word = W.term(text);
    if (!/[A-Za-z]/.test(text) || text.trim().length > 3000) { hideSelection(); return; }
    const L = window.LESSON, lesson = W.lessons.find(l => l.storageKey === L.storageKey);
    const paragraph = host.closest('.paragraph')?.id.replace('paragraph-', '');
    const location = paragraph ? 'reading-' + paragraph : (window.location.hash.slice(1) || 'overview');
    const label = paragraph ? 'Paragraph ' + paragraph : (document.querySelector('#breadcrumb-current')?.textContent || 'Lesson context');
    selection = { term: word, text: text.trim(), source: { folder: lesson.folder, location, label, quote, selectedText: text.trim() } };
    (host.closest('dialog') || document.body).append(menu);
    menu.hidden = false;
    button.hidden = text.trim().length > 100 || word.split(' ').length > 12;
    sentenceButton.hidden = false;
    const x = Math.max(12, Math.min(rect.left, innerWidth - menu.offsetWidth - 12));
    const y = rect.bottom + 8 + menu.offsetHeight < innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - menu.offsetHeight - 8);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    button.setAttribute('aria-label', 'Add to wordbook: ' + word);
  }
  if (window.LESSON) {
    // Keep the selection intact while the floating action receives focus.
    document.querySelector('#wb-selection-menu').addEventListener('pointerdown', event => event.preventDefault());
    document.addEventListener('mouseup', event => { if (!event.target.closest('#wb-selection-menu,#wb-toast')) setTimeout(capture, 0); });
    document.addEventListener('keyup', event => { if (['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) capture(); if (event.key === 'Escape') hideSelection(); });
    document.addEventListener('selectionchange', () => { if (!window.getSelection()?.toString() && !document.activeElement?.matches('textarea,input') && !document.activeElement?.closest('#wb-selection-menu')) hideSelection(); });
    window.addEventListener('scroll', hideSelection, { passive: true });
    window.addEventListener('resize', hideSelection);
    window.addEventListener('hashchange', hideSelection);
  }
  window.addEventListener('wordbook-change', () => {
    render();
    if (editing && dialog.open) {
      const e = W.get(editing);
      if (!e) { close(); notify('This entry was deleted in another window.'); }
      else { const candidates = document.querySelector('#wb-candidates'); if (candidates) candidates.innerHTML = candidatesHTML(e); }
    }
  });
  render();
  if (W.problem) notify(W.problem);
})();
