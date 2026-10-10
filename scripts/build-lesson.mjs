import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lessonId = process.argv[2] || '26.9.6';
const folder = path.join(root, lessonId);
const sources = fs.readdirSync(folder).filter(p => /^\d{2}-\d{2}-\d{2}-.+\.md$/.test(p));
if (sources.length !== 1) throw new Error(`Lesson ${lessonId} needs exactly one source named 26-MM-DD-Title.md`);
const sourceFile = sources[0];
const raw = fs.readFileSync(path.join(folder, sourceFile), 'utf8').replace(/\r/g, '');
const sections = {};
for (const match of raw.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) sections[match[1]] = match[2].trim();
if (sections['Main Reading Article']) {
  const {extractStructuredLesson} = await import('./extract-structured-lesson.mjs');
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'lessons.json'),'utf8'));
  const day = manifest.lessons.findIndex(item => item.folder === lessonId) + 1;
  if (!day) throw new Error(`Register ${lessonId} in lessons.json before building`);
  const images = fs.readdirSync(path.join(folder,'images')).filter(p => /^reference-\d+\.webp$/.test(p)).sort((a,b) => Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).map(p => 'images/'+p);
  const lesson = extractStructuredLesson({raw,sections,lessonId,sourceFile,images,day});
  fs.writeFileSync(path.join(folder,'lesson-data.js'),'window.LESSON = '+JSON.stringify(lesson,null,2)+';\n');
  console.log(`Extracted ${lesson.paragraphs.length} paragraphs, ${lesson.vocabulary.length} words, ${lesson.grammar.length} sentence analyses, ${lesson.reading.length} reading questions and ${lesson.practice.length} vocabulary exercises.`);
  process.exit(0);
}
function fields(text) {
  const data = {};
  for (const m of text.matchAll(/^(?:- )?\*\*([^*]+):\*\*\s*(.+)$/gm)) data[m[1]] = m[2].trim();
  return data;
}
function blocks(text) { return [...text.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(m => ({title:m[1],text:m[2].trim(),fields:fields(m[2])})); }
const title = Object.keys(sections).find(name => /^### A$/m.test(sections[name]));
const paragraphs = blocks(sections[title]).filter(p => /^[A-J]$/.test(p.title)).map(p => ({id:p.title,text:p.text.split(/\n\n\*\*Evidence (?:lens|note):/)[0].trim()}));
const vocabulary = blocks(sections['THE 30 NEW WORDS AND PHRASES']).map(p => ({id:p.title.slice(0,2),word:p.title.slice(4).split(' — ')[0],core:p.title.includes('CORE VOCABULARY'),...p.fields}));
const grammar = blocks(sections['FIVE SENTENCES FOR DEEP ANALYSIS']).map(item => {
  const key = Object.keys(item.fields)[0] || '';
  if (key.includes(', ')) return item;
  const quote = String(item.fields[key] || '').replace(/^[“"']+|[”"']+$/g, '');
  const hit = paragraphs.find(paragraph => quote && paragraph.text.includes(quote.slice(0, 48)));
  return hit ? {...item, paragraph: hit.id} : item;
});
const readingText = sections['IELTS ACADEMIC READING EXERCISES'];
const answers = readingText.split('ANSWERS AND EXPLANATIONS')[1].split('**Self-check:')[0];
const answerMap = {};
for (const m of answers.matchAll(/^(\d+)\. \*\*(.+?)\.\*\* (.+)$/gm)) {
 const parts=m[2].split(' — ');
 answerMap[m[1]]={answer:parts[0],paragraph:parts[1] || (/^[A-J]$/.test(parts[0])?parts[0]:null),explanation:m[3]};
}
const reading = [];
const typeNames = {
  'true / false / not given': 'True / False / Not Given',
  'yes / no / not given': 'Yes / No / Not Given',
  'multiple choice': 'Multiple choice',
  'matching headings': 'Matching headings',
  'matching information': 'Matching information',
  'summary completion': 'Summary completion',
  'sentence completion': 'Sentence completion',
  'short answers': 'Short answers'
};
// Question ranges belong to the source, and may differ between lessons.
const groups = blocks(readingText).map(block => {
  const range = block.title.match(/^Questions (\d+)[–-](\d+)\s*[—:-]\s*(.+)$/);
  if (!range) return null;
  const type = typeNames[range[3].toLowerCase()];
  if (!type) throw new Error(`Unsupported reading question type: ${range[3]}`);
  return {...block, first:Number(range[1]), last:Number(range[2]), type};
}).filter(Boolean);
const headings = [...readingText.matchAll(/^([ivxlcdm]+)\. (.+)$/gm)].map(m=>({value:m[1],text:m[2].trim()}));
const summaryGroup = groups.find(group=>group.type==='Summary completion');
const summary = summaryGroup?.text.match(/^(.+?\*\*\d+\. _{3,}\*\*.+)$/m)?.[1] || '';
const summaryPrompts = [...summary.matchAll(/(?:^|(?<=\. ))(.+?\*\*(\d+)\. _{3,}\*\*.+?)(?=\. |$)/g)];
for (const group of groups) {
  const {type} = group;
  for (let id=group.first;id<=group.last;id++) {
    let question=group.text.match(new RegExp('^'+id+'\\. (.+)$','m'))?.[1]?.trim();
    let options=[], instruction;
    if (type==='True / False / Not Given' || type==='Yes / No / Not Given') {
      const values=type.startsWith('True')?['TRUE','FALSE','NOT GIVEN']:['YES','NO','NOT GIVEN'];
      options=values.map(value=>({value,text:value}));
      instruction=type.startsWith('True')?'TRUE = agrees · FALSE = contradicts · NOT GIVEN = insufficient information':"YES = agrees with the writer · NO = contradicts the writer · NOT GIVEN = the writer's position is not stated";
    } else if (type==='Multiple choice') {
      const match=group.text.match(new RegExp('^\\*\\*'+id+'\\. (.+?)\\*\\*\\n\\n([\\s\\S]*?)(?=\\n\\n|$(?![\\s\\S]))','m'));
      question=match?.[1];
      options=[...(match?.[2]||'').matchAll(/^([A-D])\. (.+)$/gm)].map(m=>({value:m[1],text:m[2].trim()}));
      instruction='Choose the one answer A–D that best matches the passage.';
    } else if (type==='Matching headings') {
      options=headings;
      instruction=`Choose from ${headings.length} headings. Use each heading no more than once.`;
    } else if (type==='Matching information') {
      options=paragraphs.map(p=>({value:p.id,text:'Paragraph '+p.id}));
      instruction='Choose a paragraph A–J. You may use a letter more than once.';
    } else if (type==='Summary completion') {
      question=summaryPrompts.find(m=>Number(m[2])===id)?.[1].replace(/\*\*/g,'');
      instruction='Complete the summary with no more than two words from the passage.';
    } else if (type==='Sentence completion' || type==='Short answers') {
      instruction='Use no more than two words from the passage. Spelling matters.';
    } else {
      throw new Error(`Unsupported reading question type: ${type}`);
    }
    if(!question||!answerMap[id]||(type==='Multiple choice'&&options.length!==4))throw new Error(`Cannot extract question ${id}`);
    reading.push({id,question,options,type,instruction,...answerMap[id]});
  }
}
function extractPractice(practiceText) {
  if (/^[A-E]\d+\. /m.test(practiceText)) {
    const practice=[];
    for (const m of practiceText.split('### NEW VOCABULARY ANSWER KEY')[0].matchAll(/^([A-E]\d+)\. (.+)$/gm)) {
      const key=practiceText.match(new RegExp('^- '+m[1]+'\\. (.+)$','m'))[1];
      const answer=key.match(/\*\*(.+?)\*\*/)[1];
      practice.push({id:m[1],question:m[2].trim(),answer,explanation:key});
    }
    return practice;
  }
  const parts = practiceText.split('### NEW VOCABULARY PRACTICE — COMPLETE ANSWER KEY');
  const answerParts = {};
  for (const part of (parts[1] || '').split(/(?=\*\*[A-E]\.)/)) {
    const letter = part.match(/^\*\*([A-E])\./)?.[1];
    if (letter) answerParts[letter] = part;
  }
  const practice = [];
  for (const block of blocks(parts[0])) {
    const letter = block.title.match(/^([A-E])\./)?.[1];
    if (!letter) continue;
    for (const item of block.text.matchAll(/^(\d+)\. (.+)$/gm)) {
      const line = answerParts[letter]?.match(new RegExp('^'+item[1]+'\\. (.+)$','m'));
      const answer = line?.[1].match(/^[“"](.+?)[”"]/)?.[1] || line?.[1].match(/\*\*(.+?)\*\*/)?.[1];
      if (!answer) throw new Error(`Missing practice answer ${letter}${item[1]}`);
      practice.push({id:letter+item[1], question:item[2].trim(), answer, explanation:line[1]});
    }
  }
  return practice;
}
const practice = extractPractice(sections['NEW VOCABULARY PRACTICE']);
// Archive-only source sections never enter the interactive lesson or its data.
for (const heading of Object.keys(sections)) if (/^SPACED-REPETITION REVIEW|^VOCABULARY REVIEW LEDGER/.test(heading)) delete sections[heading];
const images=fs.readdirSync(path.join(folder,'images')).filter(p=>/^reference-\d+\.webp$/.test(p)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).map(p=>'images/'+p);
const lesson={title,date:raw.match(/^Date: (.+?) — /m)[1],day:Number(raw.match(/^(?:Course day|Lesson): (\d+)/m)[1]),topic:raw.match(/^Topic Area: (.+)$/m)[1].trim(),paragraphs,vocabulary,grammar,reading,practice,summary,speaking:blocks(sections['IELTS SPEAKING PART 3']),sections,images,sourceFile};
lesson.storageKey = 'passage-' + new Date(lesson.date + ' 12:00 UTC').toISOString().slice(0,10) + '-v1';
if (paragraphs.length!==10||vocabulary.length!==30||grammar.length!==5||reading.length!==15||practice.length!==30) throw new Error('Incomplete lesson extraction');
fs.writeFileSync(path.join(folder,'lesson-data.js'),'window.LESSON = '+JSON.stringify(lesson,null,2)+';\n');
console.log(`Extracted ${paragraphs.length} paragraphs, ${vocabulary.length} words, ${grammar.length} sentence analyses, ${reading.length} reading questions and ${practice.length} vocabulary exercises.`);
