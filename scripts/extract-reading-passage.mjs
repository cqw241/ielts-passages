// Adapt the Reading Passage editorial format to the shared lesson interface.
export function extractReadingPassage({raw, sections, lessonId, sourceFile, images, day}) {
 const sec = n => sections[Object.keys(sections).find(k=>k.startsWith(n+'. '))] || '';
 const blocks=(s,r)=>[...s.matchAll(r)];
 const title=raw.match(/^# (.+)$/m)[1];
 const paragraphs=blocks(sec(1),/^### ([A-J])\n\n([\s\S]*?)(?=^### |^---|$(?![\s\S]))/gm).map(m=>({id:m[1],text:m[2].trim()}));
 const vocabulary=blocks(sec(2),/^\*\*(\d+)\. (.*?)\*\* \*\((.+?)\)\*\s*\n([\s\S]*?)(?=^\*\*\d+\. |^### |^---|$(?![\s\S]))/gm).map(m=>{
  const f=Object.fromEntries(blocks(m[4],/^- \*\*([^*]+):\*\* (.+)$/gm).map(x=>[x[1],x[2].trim()]));
  return {id:m[1].padStart(2,'0'),word:m[2].replace(/^★ CORE VOCABULARY — /,''),core:m[2].includes('CORE VOCABULARY'),priority:+m[1]<=6?'Suggested active':+m[1]<=16?'Suggested recognition':'Exposure','IPA / part of speech':m[3],Definition:f.Definition,Article:f[Object.keys(f).find(k=>k.startsWith('From the text'))],Collocation:f.Pattern,'In context':f['In this article'],'Additional example':f['New example']};
 });
 const answerText=sec(5), answerPart=(letter)=>answerText.match(new RegExp('^### '+letter+'\\.[^\\n]*\\n([\\s\\S]*?)(?=^### |^---|$(?![\\s\\S]))','m'))?.[1]||'';
 const keys=new Map(blocks(answerPart('C'),/^(\d+)\. \*\*(.+?)\*\* — (.+)$/gm).map(m=>[+m[1],{answer:m[2],explanation:m[3],paragraph:m[3].match(/Paragraph ([A-J])/)?.[1]}]));
 const read=sec(4); const reading=[];
 const add=(id,question,type,options,instruction)=>{if(!keys.has(id))throw Error('Missing answer '+id);reading.push({id,question,type,options,instruction,...keys.get(id),...(type === 'Sentence completion' ? {placeholder:'No more than three words'} : type === 'Short answers' ? {placeholder:'Up to two words and/or a number'} : {})});};
 const tf=read.split('### Questions 1–4')[1].split('### Questions 5–7')[0];
 for(const m of blocks(tf,/^(\d+)\. (.+)$/gm))add(+m[1],m[2],'True / False / Not Given',['TRUE','FALSE','NOT GIVEN'].map(value=>({value,text:value})),'TRUE = agrees · FALSE = contradicts · NOT GIVEN = insufficient information');
 for(const m of blocks(read,/^\*\*([5-7])\.\*\* (.+)\n\n([\s\S]*?)(?=^\*\*[5-7]\.\*\*|^### )/gm))add(+m[1],m[2],'Multiple choice',blocks(m[3],/^([A-D])\. (.+)$/gm).map(x=>({value:x[1],text:x[2].trim()})),'Choose the one answer A–D that best matches the passage.');
 const completion=read.split('### Questions 8–9')[1].split('### Question 10')[0];
 for(const m of blocks(completion,/^(\d+)\. (.+)$/gm))add(+m[1],m[2],'Sentence completion',[],'Use no more than three words from the passage.');
 add(10,read.match(/^\*\*10\.\*\* (.+)$/m)[1],'Short answers',[],'Use no more than two words and/or a number.');
 const recall=new Map(blocks(answerPart('A'),/^(\d+)\. \*\*(.+?)\*\* — (.+)$/gm).map(m=>[m[1],{answer:m[2],explanation:m[2]+' — '+m[3]}]));
 const practice=blocks(sec(3).split('### B.')[0],/^(\d+)\. (.+)$/gm).map(m=>({id:'A'+m[1],question:m[2],...recall.get(m[1])}));
 const models=new Map(blocks(answerPart('B'),/^\*\*Task (\d+):\*\* (.+)\n\*\*Why it works:\*\* (.+)$/gm).map(m=>[m[1],m[2]+' '+m[3]]));
 for(const m of blocks(sec(3),/^\*\*Task (\d+) — (.+?)\.\*\* (.+)$/gm))practice.push({id:'B'+m[1],question:m[2]+'. '+m[3],answer:models.get(m[1]),explanation:models.get(m[1]),production:true});
 const grammar=blocks(sec(6),/^### (.+)\n([\s\S]*?)(?=^### |^---|$(?![\s\S]))/gm).map(m=>({title:m[1],paragraph:m[2].match(/Original \(([A-J])\)/)?.[1],fields:Object.fromEntries(blocks(m[2],/^\*\*([^*]+):\*\* (.+)$/gm).map(x=>[x[1],x[2]]))}));
 const extension=sec(7), speakingPart=extension.split('### Speaking Part 3')[1];
 const speaking=blocks(speakingPart,/^\d+\. (.+)$/gm).map(m=>({title:m[1],fields:{'Useful language':speakingPart.match(/\*\*Useful expressions:\*\* (.+)/)[1]}}));
 if(paragraphs.length!==10||vocabulary.length!==30||reading.length!==10||practice.length!==9||grammar.length!==3||speaking.length!==2||vocabulary.some(v=>!v.Definition||!v.Article||!v.Collocation)||practice.some(p=>!p.explanation))throw Error(`Incomplete ${lessonId} extraction: ${[paragraphs.length,vocabulary.length,reading.length,practice.length,grammar.length,speaking.length]}`);
 return {title,date:'13 November 2026',day,topic:'Technology, US Politics, Corporate Power and Media Literacy',paragraphs,vocabulary,reading,practice,grammar,speaking,images,sourceFile,sections:{...sections,[title]:sec(1),'IELTS WRITING TASK 2':extension.split('### Writing Task 2')[1].split('### Speaking Part 3')[0],'TODAY YOU LEARNED':sec(8),'SOURCES AND FURTHER READING':sec(9).replace(/https?:\/\/\S+/g,url=>`[Read source](${url})`)},summary:'',practiceGroups:[{id:'A',title:'Active recall',description:'Retrieve the six suggested active expressions from memory.'},{id:'B',title:'Contextual production',description:'Write your own responses before opening the models.'}],storageKey:'passage-2026-11-13-v1'};
}
