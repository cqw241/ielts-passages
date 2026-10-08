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
    return `<div class="learning-controls">${selector(l.status,`data-folder="${esc(folder)}" data-word="${esc(v.id)}"`,v.word)}${p?.recommendation!=='exposure'?`<p class="learning-hint">Suggested: ${labels[p?.recommendation]||'Recognition'}${v.core?' · Core vocabulary':''}. Your choice decides.</p>`:'<p class="learning-hint">Read and encounter it again. Review is optional.</p>'}</div>`;
  }
  function trackSummary(entry,name) {
    const t=entry.learning[name], enabled=V.enabled(entry.learning,name);
    const state=!enabled?'Paused':t.lastAt===null?'Not started':V.mastered(t,name)?'Established':t.streak===0?'Needs practice':'Developing';
    const due=t.due===null?'Waiting to start':t.due<=Date.now()?'Due now':`Next ${new Date(t.due).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
    return `<div><strong>${name==='recognition'?'Recognition':'Production'}</strong><span>${state}${enabled?` · ${due}`:''}</span></div>`;
  }
  function entryControl(entry) { return `<div class="learning-controls">${selector(entry.learning.status,`data-id="${esc(entry.id)}"`,entry.term)}<div class="learning-tracks">${V.tracks.map(n=>trackSummary(entry,n)).join('')}</div><button class="text-button" data-learning="history" data-id="${esc(entry.id)}">Review history</button></div>`; }
  function summary() {
    if(!dashboard)return;
    const stats=V.stats(W.read().entries), percent=(p,n)=>n?`${Math.round(p/n*100)}% · ${p}/${n}`:'No delayed attempts yet';
    dashboard.innerHTML=`<div class="learning-banner"><div><p class="eyebrow">TODAY REVIEW</p><h2>${stats.due} due <span>· ${stats.items.filter(i=>i.new).length} first attempts ready</span></h2><p>${stats.paused?'New words paused. Work through your reviews at your own pace.':`${Math.max(0,6-stats.startedToday)} new-word places left today. Due and weaker words go first.`}${stats.blocked?` ${stats.blocked} first attempts are waiting for capacity.`:''}</p></div>${workspace?'':`<a class="button primary" href="${base}review.html">Start review →</a>`}</div><div class="learning-metrics"><p><strong>${stats.recognition} / ${stats.recognitionTotal}</strong><span>Recognition established</span></p><p><strong>${stats.production} / ${stats.productionTotal}</strong><span>Production established</span></p><p><strong>${percent(stats.delayedPassed,stats.delayedTotal)}</strong><span>Recall after 7+ days</span></p><p><strong>${stats.lateTotal?percent(stats.latePassed,stats.lateTotal):'No late attempts yet'}</strong><span>Recall when 1+ day overdue</span></p></div><p class="learning-hint">Progress reflects your self-assessments. Already know pauses review; it does not count as tested mastery.</p>`;
  }
  function queueItems() { return V.queue(W.read().entries).items.filter(i=>trackFilter==='all'||i.track===trackFilter); }
  function idle() {
    if(!workspace)return;
    document.body.classList.remove('review-active');
    const entries=W.read().entries, q=V.queue(entries), items=queueItems();
    workspace.innerHTML=`<div class="review-toolbar"><label>Review track <select id="review-track"><option value="all">Both tracks</option><option value="recognition" ${trackFilter==='recognition'?'selected':''}>Recognition</option><option value="production" ${trackFilter==='production'?'selected':''}>Production</option></select></label><button class="button primary" data-learning="start" ${items.length?'':'disabled'}>Start ${items.length} tasks →</button></div>${completed?`<p class="review-complete" role="status">${completed} tasks completed this session. Your two schedules are saved.</p>`:''}${items.length?`<ol class="review-queue">${items.map(i=>{const e=entries.find(e=>e.id===i.id),t=e.learning[i.track];return `<li><strong>${esc(e.term)}</strong><span>${i.track==='recognition'?'Recognition':'Production'} · ${i.new?'First attempt':t.streak===0?'Needs practice':'Due'}${t.due!==null&&Date.now()-t.due>=V.DAY?` · ${Math.floor((Date.now()-t.due)/V.DAY)}d overdue`:''}</span></li>`;}).join('')}</ol>`:`<div class="wb-empty"><p class="eyebrow">${q.waiting?'A MANAGEABLE PACE':'ROOM TO KEEP READING'}</p><h2>${q.waiting?'Your next words can wait.':'You are caught up.'}</h2><p>${q.waiting?'Try the other track or return tomorrow for more new words.':'Choose learning goals in a lesson, or come back when a review is due. Again attempts return in 10 minutes.'}</p><a class="button secondary" href="index.html">Explore a lesson →</a></div>`}`;
  }
  const mask=(text,word)=> {
    const parts=String(word).trim().split(/\s+/).map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    const pattern=parts.map((p,i)=>i===parts.length-1?`${p}(?:s|es|ed|ing)?`:p).join('\\s+');
    return String(text||'').replace(new RegExp(`\\b${pattern}\\b`,'gi'),'_____');
  };
  function task(entry) {
    const p=preset(entry), t=entry.learning[current.track], s=V.stage(t);
    if(current.track==='recognition')return {stage:0,title:entry.term,prompt:'Explain this expression in its article context. What does it mean here?',context:p.article||entry.sources[0]?.quote||'Explain the meaning of this expression.',answer:entry.definition,reference:p.context||p.collocation||'',rubric:'Did you understand the expression in this context without opening its meaning?'};
    const titles=['Retrieve the expression','Complete a new context','Rewrite the idea','Write your own sentence'];
    const cloze=mask(p.example,entry.term);
    const rewrite=p.rewrite;
    return {stage:s,title:s<2?titles[s]:`${titles[s]} · ${entry.term}`,prompt:s===0?`Which expression means: ${mask(entry.definition,entry.term)}`:s===1&&cloze.includes('_____')?'Fill the gap without a word bank.':s===2?rewrite?.question||(p.example?`Rewrite the sentence below using “${entry.term}”. Change the structure while keeping the meaning.`:`Express this meaning in a different way using “${entry.term}”: ${entry.definition}`):`Write a short sentence about ${p.topic||'a situation outside the original article'} using “${entry.term}”. Make the meaning clear.`,context:s===1?(cloze.includes('_____')?cloze:`Create a new sentence conveying this meaning: ${mask(entry.definition,entry.term)}`):s===2&&!rewrite?p.example||'':'',answer:s<2?entry.term:rewrite?.answer&&s===2?rewrite.answer:s===2?`Meaning to preserve: ${entry.definition}`:p.example||entry.definition,reference:s<2?p.example||'':p.collocation||entry.note||'',rubric:s===0?'Did the expression come to mind without a hint?':s===1?'Does your expression fit the new meaning and grammatical form?':s===2?'Does your changed sentence preserve the idea, use the expression naturally and have a complete structure?':'Does your independent sentence show the intended meaning, a natural collocation and correct grammar?'};
  }
  function card() {
    const e=W.get(current.id);
    if(!e || !V.enabled(e.learning,current.track)) { current=null; summary(); idle();return; }
    const q=task(e);
    document.body.classList.add('review-active');
    workspace.innerHTML=`<section class="review-card" aria-labelledby="review-card-title"><div class="review-card-top"><p class="eyebrow">${current.track==='recognition'?'RECOGNITION · CONTEXT UNDERSTANDING':`PRODUCTION · STEP ${q.stage+1} OF 4`}</p><button class="text-button" data-learning="stop">Finish later</button></div><h2 id="review-card-title">${esc(q.title)}</h2><p class="review-prompt">${esc(q.prompt)}</p>${q.context?`<blockquote>${esc(q.context)}</blockquote>`:''}<label class="wb-field">Your attempt<textarea id="review-answer" rows="3" maxlength="3000" placeholder="Try before opening the reference." ${revealed?'readonly':''}>${esc(attempt)}</textarea></label>${revealed?`<div class="review-reference"><p class="eyebrow">${current.track==='recognition'?'MEANING IN CONTEXT':'REFERENCE · MORE THAN ONE ANSWER MAY WORK'}</p><p>${esc(q.answer)}</p>${q.reference?`<p class="subtle">${esc(q.reference)}</p>`:''}<p><strong>Self-check:</strong> ${esc(q.rubric)}</p><p class="subtle">Use Again if you needed the reference or a hint. A different natural sentence can be correct. No automatic language grading is used.</p></div><div class="review-ratings">${[['again','Again','Needed help'],['hard','Hard','Effortful or uncertain'],['good','Good','Independent and correct'],['easy','Easy','Immediate and confident']].map(([r,label,hint])=>{const next=V.schedule(e.learning[current.track],r);return `<button data-learning="rate" data-rating="${r}" class="button ${r==='good'?'primary':'secondary'}"><strong>${label}</strong><span>${hint}</span><small>${r==='again'?'10 min':`${next.interval} day${next.interval===1?'':'s'}`}</small></button>`;}).join('')}</div>`:'<button class="button primary" data-learning="reveal">Compare with reference →</button>'}</section>`;
    if(!revealed)document.querySelector('#review-answer').focus({preventScroll:true});
  }
  function next() {
    const items=queueItems(); current=items[0]||null; attempt=''; revealed=false;
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
      else if(el.dataset.learning==='stop'){current=null;idle();}
      else if(el.dataset.learning==='reveal'){revealed=true;card();document.querySelector('.review-reference').scrollIntoView({block:'nearest'});}
      else if(el.dataset.learning==='rate'&&revealed&&current){W.rate(current.id,current.track,el.dataset.rating,attempt);completed++;summary();next();}
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
