/* Shared selection controls, learning summary and the distraction-free review page. */
(() => {
  'use strict';
  const W=window.Wordbook, V=window.VocabularyLearning;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={exposure:'Reading exposure',active:'Active',recognition:'Recognition',known:'Already know',skip:'Skip'};
  const base=window.LESSON?'../':'';
  const dashboard=document.querySelector('#learning-dashboard'), workspace=document.querySelector('#review-workspace');
  let current=null, revealed=false, attempt='', completed=0, trackFilter='all';
  function preset(entry) { for(const source of entry.sources) { const word=W.lessons.find(l=>l.folder===source.folder)?.words.find(w=>W.normalize(w.word)===entry.key); if(word)return word; } return {}; }
  function selector(status,attributes,term) {
    return `<label class="learning-choice">Learning goal <select data-learning="status" ${attributes} aria-label="Learning goal for ${esc(term)}">${Object.entries(labels).map(([v,t])=>`<option value="${v}" ${status===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
  }
  function presetControl(folder,v) {
    const p=W.lessons.find(l=>l.folder===folder)?.words.find(w=>w.id===v.id), l=W.learningFor(v.word);
    return `<div class="learning-controls">${selector(l.status,`data-folder="${esc(folder)}" data-word="${esc(v.id)}"`,v.word)}${p?.recommendation && p.recommendation!=='exposure'?`<p class="learning-hint">Suggested: ${labels[p.recommendation]}${v.core?' · Core vocabulary':''}. ${esc(p.recommendationReason)}</p>`:''}</div>`;
  }
  function trackSummary(entry,name) {
    const t=entry.learning[name], enabled=V.enabled(entry.learning,name);
    const state=!enabled?'Paused':!V.hasMeaning(entry)?'Meaning needed':t.lastAt===null?'Not started':V.mastered(t,name)?'Established':t.streak===0?'Needs practice':'Developing';
    const available=V.availableAt(entry.learning,name);
    const due=available>Date.now()?`Next ${new Date(available).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:t.due===null?'Waiting to start':'Due now';
    return `<div><strong>${name==='recognition'?'Recognition':'Production'}</strong><span>${state}${enabled&&V.hasMeaning(entry)?` · ${due}`:''}</span></div>`;
  }
  function entryControl(entry) { return `<div class="learning-controls">${selector(entry.learning.status,`data-id="${esc(entry.id)}"`,entry.term)}${V.enabled(entry.learning,'recognition')&&!V.hasMeaning(entry)?`<p class="learning-hint">Enrolled. Add a meaning before review can start. <button class="text-button" data-wb="edit" data-id="${esc(entry.id)}">Add meaning →</button></p>`:''}<div class="learning-tracks">${V.tracks.map(n=>trackSummary(entry,n)).join('')}</div><button class="text-button" data-learning="history" data-id="${esc(entry.id)}">Review history</button></div>`; }
  const timeLabel=at=>new Date(at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const countLabel=(n,noun)=>`${n} ${noun}${n===1?'':'s'}`;
  function summary() {
    if(!dashboard)return;
    const stats=V.stats(W.read().entries), percent=(p,n)=>n?`${Math.round(p/n*100)}% · ${p}/${n}`:'No delayed attempts yet';
    const metrics=[['totalWords','Total words'],['enrolledWords','Enrolled words'],['missingWords','Meaning needed'],['due','Due tasks now'],['newWordsReady','New words ready'],['masteredWords','Established words']];
    dashboard.innerHTML=`<div class="learning-banner"><div><p class="eyebrow">TODAY REVIEW</p><h2>${stats.due} due tasks <span>· ${countLabel(stats.newWordsReady,'new word')} ready</span></h2><p>Daily learning limit: 6 new words. ${stats.startedToday} started today; ${Math.max(0,6-stats.startedToday)} daily slots left. Your wordbook can hold more than 6 words.${stats.backlog>=20?' New words paused until the review backlog clears.':''}</p></div>${workspace?'':`<a class="button primary" href="${base}review.html">Start review →</a>`}</div><div class="learning-metrics learning-counts">${metrics.map(([key,label])=>`<p data-learning-count="${key}"><strong>${stats[key]}</strong><span>${label}</span></p>`).join('')}</div><p class="learning-hint">Enrolled includes words waiting for a meaning. New words ready counts words; each Active word has two review tasks. Words with meanings awaiting a first session: ${stats.waitingWords}.${stats.missingWords?` <a href="${base}wordbook.html?status=missing">Add missing meanings →</a>`:''}</p><details class="learning-guide learning-progress"><summary>Learning progress</summary><p>Established words meet the success criteria in every enrolled track. Already know pauses review.</p><div class="learning-metrics"><p><strong>${stats.recognition} / ${stats.recognitionTotal}</strong><span>Recognition established</span></p><p><strong>${stats.production} / ${stats.productionTotal}</strong><span>Production established</span></p><p><strong>${percent(stats.delayedPassed,stats.delayedTotal)}</strong><span>Recall after 7+ days</span></p><p><strong>${stats.lateTotal?percent(stats.latePassed,stats.lateTotal):'No late attempts yet'}</strong><span>Recall when 1+ day overdue</span></p></div></details>${!workspace&&stats.deferred.length?`<p class="learning-hint">${stats.deferred.length} Production tasks available later. Check Today Review for the time.</p>`:''}`;
  }
  function queueItems() { return V.queue(W.read().entries).items.filter(i=>trackFilter==='all'||i.track===trackFilter); }
  function emptyState(stats,items) {
    const reasons=[], other=stats.items.length-items.length;
    if(other)reasons.push(`<li data-review-reason="track">${countLabel(other,'task')} ${other===1?'is':'are'} ready in the other track. <button class="text-button" data-learning="all-tracks">Review both tracks →</button></li>`);
    if(stats.unenrolledWords)reasons.push(`<li data-review-reason="unenrolled">${countLabel(stats.unenrolledWords,'word')} ${stats.unenrolledWords===1?'is':'are'} not enrolled (Reading exposure, Already know or Skip). Choose Active or Recognition to review them. <a href="wordbook.html?status=unenrolled">Choose learning goals →</a></li>`);
    if(stats.missingWords)reasons.push(`<li data-review-reason="missing">${countLabel(stats.missingWords,'word')} ${stats.missingWords===1?'needs':'need'} a meaning. Enrolled words waiting for a meaning: ${stats.enrolledMissing}. <a href="wordbook.html?status=missing">Add meanings →</a></li>`);
    if(stats.blockedWords && stats.startedToday>=6) {
      const tomorrow=new Date();tomorrow.setHours(24,0,0,0);
      reasons.push(`<li data-review-reason="limit">Daily new-word limit reached: ${stats.startedToday} started today (limit 6). ${countLabel(stats.blockedWords,'new word')} ${stats.blockedWords===1?'is':'are'} waiting. New daily slots open ${timeLabel(tomorrow)}.</li>`);
    } else if(stats.blockedWords && stats.backlog)reasons.push(`<li data-review-reason="backlog">${countLabel(stats.blockedWords,'new word')} ${stats.blockedWords===1?'is':'are'} waiting behind ${stats.backlog} existing review tasks. New words pause at 20 backlog tasks; finish existing tasks to free capacity.</li>`);
    const tracks=trackFilter==='all'?V.tracks:[trackFilter], future=tracks.reduce((sum,n)=>sum+stats.futureTasks[n],0);
    const dates=tracks.map(n=>stats.nextByTrack[n]).filter(at=>at!==null);
    if(future)reasons.push(`<li data-review-reason="scheduled">${countLabel(future,'task')} ${future===1?'is':'are'} not due yet. Next review: <time datetime="${new Date(Math.min(...dates)).toISOString()}">${timeLabel(Math.min(...dates))}</time>.</li>`);
    const actionable=other||stats.unenrolledWords||stats.missingWords;
    return `<div class="wb-empty"><p class="eyebrow">${!stats.totalWords?'GET STARTED':actionable?'NEXT STEPS':reasons.length?'UP NEXT':'ALL DONE'}</p><h2>${!stats.totalWords?'Save your first word.':actionable?trackFilter==='all'?'No review tasks ready.':'No tasks ready in this track.':reasons.length?'You are done for now.':'You are caught up.'}</h2>${reasons.length?`<ul class="review-reasons">${reasons.join('')}</ul>`:stats.totalWords?'<p>All available review tasks are complete.</p>':'<p>No words saved yet. New words you save will join both review tracks.</p><a class="button secondary" href="wordbook.html">Add a word →</a><a class="text-button" href="index.html">Explore a lesson →</a>'}</div>`;
  }
  function idle() {
    if(!workspace)return;
    document.body.classList.remove('review-active');
    const entries=W.read().entries, q=V.stats(entries), items=q.items.filter(i=>trackFilter==='all'||i.track===trackFilter);
    const recognition=items.filter(i=>i.track==='recognition').length,production=items.length-recognition;
    workspace.innerHTML=`<div class="review-toolbar"><label>Review track <select id="review-track"><option value="all" ${trackFilter==='all'?'selected':''}>Both tracks</option><option value="recognition" ${trackFilter==='recognition'?'selected':''}>Recognition</option><option value="production" ${trackFilter==='production'?'selected':''}>Production</option></select></label><button class="button primary" data-learning="start" ${items.length?'':'disabled'}>${items.length?`Start ${countLabel(items.length,'task')} →`:'No tasks ready'}</button></div>${completed?`<p class="review-complete" role="status">${completed} tasks completed.</p>`:''}<p class="review-queue-summary">${recognition} Recognition · ${production} Production tasks ready.</p>${q.deferred.length?`<p class="learning-hint" data-review-deferred>${countLabel(q.deferred.length,'Production task')} available ${timeLabel(Math.min(...q.deferred.map(i=>i.availableAt)))} · 24 hours after seeing the answer.</p>`:''}${items.length?'':emptyState(q,items)}`;
  }
  const mask=(text,word)=> {
    const segments=String(word).trim().split(/\s*\.\.\.\s*/);
    const pattern=segments.map(segment=>{
      const parts=segment.split(/\s+/).map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
      return parts.map((p,i)=>i===parts.length-1?`${p}(?:s|es|ed|ing)?`:p).join('\\s+');
    }).join('\\s+(?:\\S+\\s+){0,12}?');
    return String(text||'').replace(new RegExp(`\\b${pattern}\\b`,'gi'),'_____');
  };
  function task(entry) {
    const p=preset(entry), t=entry.learning[current.track], s=V.stage(t);
    const meaning=window.WordbookMarkdown?.definitionText(entry)??entry.definition;
    const note=window.WordbookMarkdown?.text(entry.note)??entry.note;
    if(current.track==='recognition')return {stage:0,title:entry.term,prompt:'Explain this expression in its article context. What does it mean here?',context:p.article||entry.sources[0]?.quote||'Explain the meaning of this expression.',answer:meaning,reference:p.context||p.collocation||'',rubric:'Did you understand the expression in this context without opening its meaning?'};
    const titles=['Retrieve the expression','Complete a new context','Rewrite the idea','Write your own sentence'];
    const cloze=mask(p.example,entry.term);
    const rewrite=p.rewrite;
    return {stage:s,title:s<2?titles[s]:`${titles[s]} · ${entry.term}`,prompt:s===0?`Which expression means: ${mask(meaning,entry.term)}`:s===1&&cloze.includes('_____')?'Fill the gap without a word bank.':s===2?rewrite?.question||(p.example?`Rewrite the sentence below using “${entry.term}”. Change the structure while keeping the meaning.`:`Express this meaning in a different way using “${entry.term}”: ${meaning}`):`Write a short sentence about ${p.topic||'a situation outside the original article'} using “${entry.term}”. Make the meaning clear.`,context:s===1?(cloze.includes('_____')?cloze:`Create a new sentence conveying this meaning: ${mask(meaning,entry.term)}`):s===2&&!rewrite?p.example||'':'',answer:s<2?entry.term:rewrite?.answer&&s===2?rewrite.answer:s===2?`Meaning to preserve: ${meaning}`:p.example||meaning,reference:s<2?p.example||'':p.collocation||note||'',rubric:s===0?'Did the expression come to mind without a hint?':s===1?'Does your expression fit the new meaning and grammatical form?':s===2?'Does your changed sentence preserve the idea, use the expression naturally and have a complete structure?':'Does your independent sentence show the intended meaning, a natural collocation and correct grammar?'};
  }
  function card() {
    const e=W.get(current.id);
    if(!e || !V.enabled(e.learning,current.track)) { current=null; summary(); idle();return; }
    const q=task(e);
    document.body.classList.add('review-active');
    workspace.innerHTML=`<section class="review-card" aria-labelledby="review-card-title"><div class="review-card-top"><p class="eyebrow">${current.track==='recognition'?'RECOGNITION · CONTEXT UNDERSTANDING':`PRODUCTION · STEP ${q.stage+1} OF 4`}</p><button class="text-button" data-learning="stop">Finish later</button></div><h2 id="review-card-title">${esc(q.title)}</h2><p class="review-prompt">${esc(q.prompt)}</p>${q.context?`<blockquote>${esc(q.context)}</blockquote>`:''}<label class="wb-field">Your attempt<textarea id="review-answer" rows="3" maxlength="3000" placeholder="Try before opening the reference." ${revealed?'readonly':''}>${esc(attempt)}</textarea></label>${revealed?`<div class="review-reference"><p class="eyebrow">${current.track==='recognition'?'MEANING IN CONTEXT':'REFERENCE'}</p><p>${esc(q.answer)}</p>${q.reference?`<p class="subtle">${esc(q.reference)}</p>`:''}<p><strong>Self-check:</strong> ${esc(q.rubric)}</p></div><div class="review-ratings">${[['again','Again','Needed help'],['hard','Hard','Effortful or uncertain'],['good','Good','Independent and correct'],['easy','Easy','Immediate and confident']].map(([r,label,hint])=>{const next=V.schedule({...e.learning[current.track],due:current.due},r,Date.now(),'',q.stage,current.track);return `<button data-learning="rate" data-rating="${r}" class="button ${r==='good'?'primary':'secondary'}"><strong>${label}</strong><span>${hint}</span><small>${r==='again'&&current.track==='recognition'?'10 min':`${next.interval} day${next.interval===1?'':'s'}`}</small></button>`;}).join('')}</div>`:'<button class="button primary" data-learning="reveal">Compare with reference →</button>'}</section>`;
    if(!revealed)document.querySelector('#review-answer').focus({preventScroll:true});
  }
  function next() {
    const items=queueItems(); current=items[0]||null; attempt=''; revealed=false;
    if(current) {
      const learning=W.get(current.id).learning;
      current.due=learning[current.track].due===null?null:V.availableAt(learning,current.track);
      current.token=W.beginReview(current.id,current.track);
      if(current.track==='recognition' || V.stage(W.get(current.id).learning.production)>=2)W.exposeReview(current.token);
    }
    if(current)card();else idle();
  }
  function notice(message) {
    let n=document.querySelector('#learning-notice');
    if(!n) { n=document.createElement('p');n.id='learning-notice';n.setAttribute('role','alert');document.body.append(n); }
    n.textContent=message;
  }
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='review-track'){trackFilter=el.value;idle();return;}
    if(el.dataset.learning!=='status')return;
    try { if(el.dataset.id)W.selectStatus(el.dataset.id,el.value);else W.selectPreset(el.dataset.folder,el.dataset.word,el.value); }
    catch(error) { notice(error.message);el.value=el.dataset.id?W.get(el.dataset.id)?.learning.status:W.learningFor(W.lessons.find(l=>l.folder===el.dataset.folder)?.words.find(w=>w.id===el.dataset.word)?.word).status; }
  });
  document.addEventListener('input',event=>{if(event.target.id==='review-answer')attempt=event.target.value;});
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-learning]');if(!el)return;
    try {
      if(el.dataset.learning==='start')next();
      else if(el.dataset.learning==='all-tracks'){trackFilter='all';idle();}
      else if(el.dataset.learning==='stop'){current=null;idle();}
      else if(el.dataset.learning==='reveal'){W.revealReview(current.token);revealed=true;card();document.querySelector('.review-reference').scrollIntoView({block:'nearest'});}
      else if(el.dataset.learning==='rate'&&revealed&&current){W.rate(current.id,current.track,el.dataset.rating,attempt,Date.now(),current.token);completed++;summary();next();}
      else if(el.dataset.learning==='history'){
        const e=W.get(el.dataset.id); if(!e)return;
        let dialog=document.querySelector('#learning-history');
        if(!dialog){dialog=document.createElement('dialog');dialog.id='learning-history';dialog.setAttribute('aria-label','Review history');document.body.append(dialog);}
        dialog.innerHTML=`<div class="dialog-top"><strong>${esc(e.term)} · Review history</strong><button class="icon-button" data-learning="close-history" aria-label="Close history">✕</button></div><div class="learning-history">${V.tracks.map(n=>`<h2>${n==='recognition'?'Recognition':'Production'}</h2>${e.learning[n].history.length?`<ol>${e.learning[n].history.slice().reverse().map(h=>`<li><strong>${new Date(h.at).toLocaleDateString('en-GB')} · ${h.rating}</strong><span>${Math.floor(h.gapDays)}d since last attempt · ${Math.floor(h.lateDays)}d late</span>${h.answer?`<p>${esc(h.answer)}</p>`:''}</li>`).join('')}</ol>`:'<p>No attempts yet.</p>'}`).join('')}</div>`;
        dialog.showModal();
      } else if(el.dataset.learning==='close-history')document.querySelector('#learning-history').close();
    } catch(error){notice(error.message);}
  });
  window.addEventListener('wordbook-change',()=>{summary();if(workspace&&!current)idle();document.querySelectorAll('[data-learning="status"][data-folder]').forEach(el=>{const word=W.lessons.find(l=>l.folder===el.dataset.folder)?.words.find(w=>w.id===el.dataset.word);if(word)el.value=W.learningFor(word.word).status;});});
  // Refresh time-sensitive queues without erasing a learner's current answer.
  setInterval(()=>{summary();if(workspace&&!current)idle();},60000);
  window.addEventListener('focus',()=>{summary();if(workspace&&!current)idle();});
  window.VocabularyLearningUI={presetControl,entryControl,mask};
  summary();idle();
  if(W.problem)notice(W.problem);
})();
