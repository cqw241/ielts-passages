
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'lessons.json'),'utf8'));
const seen=new Set();
const lessons=manifest.lessons.map(entry=>{
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.folder)||seen.has(entry.folder))throw new Error('Invalid or duplicate lesson folder');
  seen.add(entry.folder);
  if(!/^images\/[A-Za-z0-9._-]+\.webp$/.test(entry.image))throw new Error('Invalid lesson image');
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,entry.folder,'lesson-data.js'),'utf8'),context);
  const lesson=context.window.LESSON;
  for(const file of ['index.html','lesson-notes.js',entry.image])if(!fs.existsSync(path.join(root,entry.folder,file)))throw new Error('Missing lesson file: '+file);
  return {...entry,title:lesson.title,day:lesson.day,date:lesson.date,topic:lesson.topic,sourceFile:lesson.sourceFile};
}).sort((a,b)=>a.day-b.day);
fs.writeFileSync(path.join(root,'assets/course-data.js'),'window.COURSE = '+JSON.stringify({lessons},null,2)+';\n');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const latest=lessons.at(-1);
const html=`<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#2966c6">
<meta name="description" content="Illustrated English IELTS lessons with reading, vocabulary, sentence analysis and independent practice.">
<title>Passage · Your reading library</title>
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/lesson.css">
<link rel="stylesheet" href="assets/catalog.css">
</head>
<body class="catalog-page">
<a class="skip-link" href="#library">Skip to lessons</a>
<header class="catalog-header"><a class="catalog-brand" href="index.html">passage<span>.</span></a><span>READ THE LANGUAGE. UNDERSTAND THE WORLD.</span><a class="text-button" href="${latest.folder}/index.html">Open the latest lesson →</a></header>
<main id="library" class="catalog-main">
<section class="library-intro"><div><p class="eyebrow">YOUR IELTS READING LIBRARY</p><h1>A little reading.<br><em>A wider world.</em></h1><p class="library-description">Explore the ideas behind the headlines. Read an illustrated passage, question its claims, and turn useful English into language you can use.</p></div><aside class="library-route"><p class="eyebrow">MAKE EACH LESSON YOUR OWN</p><ol><li><span>Read</span>Follow the original A–J article.</li><li><span>Understand</span>Explore explanations, pictures and sentence patterns.</li><li><span>Use</span>Practise reading, writing and speaking.</li></ol><p>Bookmarks, drafts and progress save in your browser.</p></aside></section>
<section aria-labelledby="lesson-list-title"><div class="section-heading library-heading"><div><p class="eyebrow">THE COLLECTION</p><h2 id="lesson-list-title">Choose your next story</h2></div><span class="subtle">${lessons.length} lessons · B2+–C1 · English throughout</span></div><div class="library-grid">${lessons.map(lesson=>`<article class="library-lesson"><a class="library-image" href="${lesson.folder}/index.html" aria-label="Open ${esc(lesson.title)}"><img src="${lesson.folder}/${lesson.image}" alt="${esc(lesson.shortTitle)} lesson illustration" width="1672" height="941" ${lesson===latest?'fetchpriority="high"':'loading="lazy"'}></a><div class="library-lesson-body"><p class="eyebrow">DAY ${String(lesson.day).padStart(2,'0')} <span>· ${esc(lesson.date)}</span></p><h3><a href="${lesson.folder}/index.html">${esc(lesson.title)}</a></h3><p>${esc(lesson.summary)}</p><div class="library-lesson-bottom"><span>10 paragraphs · 30 expressions</span><a class="button secondary compact" href="${lesson.folder}/index.html">Open lesson →</a></div></div></article>`).join('')}</div></section>
</main><footer class="catalog-footer"><span>passage. / Read a little. Understand more.</span><span>One library. A growing collection.</span></footer>
</body></html>`;
fs.writeFileSync(path.join(root,'index.html'),html+'\n');
console.log(`Updated library and navigation for ${lessons.length} lessons.`);
