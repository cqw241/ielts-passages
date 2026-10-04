import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lessonId = process.argv[2] || '26.9.6';
const folder = path.join(root, lessonId);
const sourceFile = fs.readdirSync(folder).find(p => p.endsWith('.md') && /^\d/.test(p));
if (!sourceFile) throw new Error(`No lesson Markdown in ${lessonId}`);
const raw = fs.readFileSync(path.join(folder, sourceFile), 'utf8').replace(/\r/g, '');
const sections = {};
for (const match of raw.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) sections[match[1]] = match[2].trim();
function fields(text) {
  const data = {};
  for (const m of text.matchAll(/^\*\*([^*]+):\*\*\s*(.+)$/gm)) data[m[1]] = m[2].trim();
  return data;
}
function blocks(text) { return [...text.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(m => ({title:m[1],text:m[2].trim(),fields:fields(m[2])})); }
const title = Object.keys(sections).find(name => /^### A$/m.test(sections[name]));
const paragraphs = blocks(sections[title]).filter(p => /^[A-J]$/.test(p.title)).map(p => ({id:p.title,text:p.text.split('\n\n**Evidence lens:')[0].trim()}));
const vocabulary = blocks(sections['THE 30 NEW WORDS AND PHRASES']).map(p => ({id:p.title.slice(0,2),word:p.title.slice(4).split(' — ')[0],core:p.title.includes('CORE VOCABULARY'),...p.fields}));
const grammar = blocks(sections['FIVE SENTENCES FOR DEEP ANALYSIS']);
const readingText = sections['IELTS ACADEMIC READING EXERCISES'];
const answers = readingText.split('ANSWERS AND EXPLANATIONS')[1].split('**Self-check:')[0];
const answerMap = {};
for (const m of answers.matchAll(/^(\d+)\. \*\*(.+?)\.\*\* (.+)$/gm)) {
 const parts=m[2].split(' — ');
 answerMap[m[1]]={answer:parts[0],paragraph:parts[1] || (/^[A-J]$/.test(parts[0])?parts[0]:null),explanation:m[3]};
}
const reading = [];
const hasInformationMatching = readingText.includes('Questions 6–10 — Matching information');
const headings = [...readingText.matchAll(/^(i{1,3}|iv|v|vi)\. (.+)$/gm)].map(m=>({value:m[1],text:m[2].trim()}));
const summary = hasInformationMatching ? readingText.match(/^(.+?\*\*11\. __________\*\*.+)$/m)[1] : '';
const summaryPrompts = hasInformationMatching ? [...summary.matchAll(/(?:^|(?<=\. ))(.+?\*\*(\d+)\. __________\*\*.+?)(?=\. |$)/g)] : [];
for (let id=1;id<=15;id++) {
  let question,options,type,instruction;
  if (hasInformationMatching) {
    if(id<=5) { question=readingText.match(new RegExp('^'+id+'\\. (.+)$','m'))[1];options=['YES','NO','NOT GIVEN'].map(x=>({value:x,text:x}));type='Yes / No / Not Given';instruction="YES = agrees with the writer · NO = contradicts the writer · NOT GIVEN = the writer's position is not stated"; }
    else if(id<=10) { question=readingText.match(new RegExp('^'+id+'\\. (.+)$','m'))[1];options=paragraphs.map(p=>({value:p.id,text:'Paragraph '+p.id}));type='Matching information';instruction='Choose a paragraph A–J. You may use a letter more than once.'; }
    else { question=summaryPrompts.find(m=>Number(m[2])===id)?.[1].replace(/\*\*/g,'');options=[];type='Summary completion';instruction='Complete the summary with no more than two words from the passage.'; }
  }
  else if (id<=5) { question=readingText.match(new RegExp('^'+id+'\\. (.+)$','m'))[1];options=['TRUE','FALSE','NOT GIVEN'].map(x=>({value:x,text:x}));type='True / False / Not Given'; }
  else if (id<=8) { const match=readingText.match(new RegExp('^\\*\\*'+id+'\\. (.+?)\\*\\*\\n\\n([\\s\\S]*?)(?=\\n\\n)','m'));question=match[1];options=[...match[2].matchAll(/^([A-D])\. (.+)$/gm)].map(m=>({value:m[1],text:m[2].trim()}));type='Multiple choice'; }
  else if (id<=11) {question=readingText.match(new RegExp('^'+id+'\\. (.+)$','m'))[1].trim();options=headings;type='Matching headings';}
  else {question=readingText.match(new RegExp('^'+id+'\\. (.+)$','m'))[1].trim();options=[];type='Sentence completion';}
  if(!question||!answerMap[id])throw new Error(`Cannot extract question ${id}`);
  reading.push({id,question,options,type,instruction,...answerMap[id]});
}
const practiceText=sections['NEW VOCABULARY PRACTICE'];
const practice=[];
for (const m of practiceText.split('### NEW VOCABULARY ANSWER KEY')[0].matchAll(/^([A-E]\d+)\. (.+)$/gm)) {
 const key=practiceText.match(new RegExp('^- '+m[1]+'\\. (.+)$','m'))[1];
 const answer=key.match(/\*\*(.+?)\*\*/)[1];
 practice.push({id:m[1],question:m[2].trim(),answer,explanation:key});
}
const images=fs.readdirSync(path.join(folder,'images')).filter(p=>/^reference-\d+\.webp$/.test(p)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).map(p=>'images/'+p);
const recallSection=sections['SPACED-REPETITION REVIEW — 20 WORDS'];
const recall=[...recallSection.matchAll(/^R(\d+)\. (.+)$/gm)].map(m=>({id:m[1],question:m[2].trim(),explanation:recallSection.split('### REVIEW ANSWER KEY')[1].match(new RegExp('^'+m[1]+'\\. (.+)$','m'))[1]}));
const lesson={title,date:raw.match(/^Date: (.+?) — /m)[1],day:Number(raw.match(/^Course day: (\d+)/m)[1]),topic:raw.match(/^Topic Area: (.+)$/m)[1].trim(),paragraphs,vocabulary,grammar,reading,practice,recall,summary,speaking:blocks(sections['IELTS SPEAKING PART 3']),sections,images,sourceFile};
lesson.storageKey = 'passage-' + new Date(lesson.date + ' 12:00 UTC').toISOString().slice(0,10) + '-v1';
if (paragraphs.length!==10||vocabulary.length!==30||grammar.length!==5||reading.length!==15||practice.length!==30) throw new Error('Incomplete lesson extraction');
fs.writeFileSync(path.join(folder,'lesson-data.js'),'window.LESSON = '+JSON.stringify(lesson,null,2)+';\n');
console.log(`Extracted ${paragraphs.length} paragraphs, ${vocabulary.length} words, ${grammar.length} sentence analyses, ${reading.length} reading questions and ${practice.length} vocabulary exercises.`);
