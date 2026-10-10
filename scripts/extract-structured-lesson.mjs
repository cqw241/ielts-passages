// Descriptive section format. Keep source wording separate from presentation notes.
export function extractStructuredLesson({raw, sections, lessonId, sourceFile, images, day}) {
  const clean = text => text.replace(/\*\*/g, '').replace(/^"|"$/g, '').trim();
  const fields = text => Object.fromEntries([...text.matchAll(/^(?:- )?\*\*([^*]+):\*\*\s*(.+)$/gm)].map(m => [m[1], m[2].trim()]));
  const blocks = text => [...(text || '').matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(m => ({title:m[1], text:m[2].trim(), fields:fields(m[2])}));
  const title = raw.match(/^# (.+)$/m)?.[1];
  const iso = raw.match(/^\*\*Publication date:\*\* (\d{4}-\d{2}-\d{2})/m)?.[1];
  const topic = fields(raw).Topic;
  if (!title || !iso || !topic || !Number.isInteger(day)) throw new Error(`Incomplete metadata in ${lessonId}`);
  const paragraphs = blocks(sections['Main Reading Article']).filter(b => /^[A-J]$/.test(b.title)).map(b => ({id:b.title, text:b.text}));
  const vocabulary = [];
  for (const tier of blocks(sections['Vocabulary Learning'])) {
    const priority = tier.title.includes('Active Vocabulary') ? 'Suggested active' : tier.title.includes('Recognition Vocabulary') ? 'Suggested recognition' : 'Exposure';
    for (const m of tier.text.matchAll(/^\*\*(\d+)\. (.+?)\*\* \*\((.+?)\)\*\n([\s\S]*?)(?=^\*\*\d+\. |$(?![\s\S]))/gm)) {
      const f = fields(m[4]);
      vocabulary.push({id:m[1].padStart(2,'0'), word:m[2], core:m[3].includes('CORE VOCABULARY'), priority,
        'IPA / part of speech':m[3].split(';')[0], Definition:f.Definition,
        Article:clean(f.Text), Collocation:f.Pattern, 'In context':f['In this article'], 'Additional example':f['New example']});
    }
  }
  const grammar = blocks(sections['Deep Sentence Analysis']).map(b => ({...b, paragraph:Object.keys(b.fields)[0]?.match(/Paragraph ([A-J])/)?.[1]}));
  const answerMap = new Map([...sections['Reading Comprehension: Answer Key and Evidence'].matchAll(/^(\d+)\. \*\*(.+?)\*\* (.+)$/gm)].map(m => [Number(m[1]), {answer:m[2].replace(/\.$/,''), explanation:m[3], paragraph:m[3].match(/Paragraphs? ([A-J])\b/)?.[1]}]));
  const typeNames = {'true / false / not given':'True / False / Not Given', 'multiple choice':'Multiple choice', 'sentence completion':'Sentence completion', 'short answer':'Short answers', 'matching information':'Matching information'};
  const reading = [];
  for (const b of blocks(sections['Reading Comprehension'])) {
    const range = b.title.match(/^Questions? (\d+)(?:[–-](\d+))?: (.+)$/);
    const type = typeNames[range?.[3].toLowerCase()];
    if (!range || !type) throw new Error(`Unsupported reading group: ${b.title}`);
    for (const m of b.text.matchAll(/^(\d+)\. (.+)\n?([\s\S]*?)(?=^\d+\. |$(?![\s\S]))/gm)) {
      const id = Number(m[1]), key = answerMap.get(id);
      if (!key) throw new Error(`Missing reading answer ${id}`);
      let options = [], instruction = 'Use no more than two words from the article. Spelling matters.';
      if (type.includes('Not Given')) {
        options = ['TRUE','FALSE','NOT GIVEN'].map(value => ({value,text:value}));
        instruction = 'TRUE = agrees · FALSE = contradicts · NOT GIVEN = insufficient information';
      } else if (type === 'Multiple choice') {
        options = [...m[3].matchAll(/^\s*- ([A-D])\. (.+)$/gm)].map(o => ({value:o[1],text:o[2]}));
        instruction = 'Choose the one answer A–D that best matches the passage.';
        if (options.length !== 4) throw new Error(`Missing options for reading question ${id}`);
      } else if (type === 'Matching information') {
        options = paragraphs.map(p => ({value:p.id,text:'Paragraph '+p.id}));
        instruction = 'Choose the paragraph A–J that contains this information.';
      } else if (type === 'Short answers') instruction = 'Name two distinct difficulties. Use your own words if needed, then compare with the evidence. This answer is self-checked.';
      reading.push({id,question:m[2],options,type,instruction,...key,...(type === 'Short answers' ? {marking:'self-check',answer:'Any two difficulties from paragraph I'} : {})});
    }
  }
  const practiceKey = new Map([...sections['Vocabulary Practice: Model Answers and Explanations'].matchAll(/^(\d+)\. ([\s\S]*?)(?=^\d+\. |^### |$(?![\s\S]))/gm)].map(m => [Number(m[1]),m[2].trim()]));
  const practice = [], practiceGroups = [];
  for (const [i,b] of blocks(sections['Vocabulary Practice: Understanding and Production']).entries()) {
    const group = String.fromCharCode(65+i);
    practiceGroups.push({id:group,title:b.title.replace(/^Part \d+\. /,'').replace(/ \((Questions|Tasks).+\)$/,''),description:b.text.split(/\n\n\d+\./)[0]});
    for (const m of b.text.matchAll(/^(\d+)\. (.+)$/gm)) {
      const explanation = practiceKey.get(Number(m[1]));
      if (!explanation) throw new Error(`Missing vocabulary model ${m[1]}`);
      practice.push({id:group+m[1],question:m[2],answer:clean(explanation),explanation,production:i>0});
    }
  }
  const extension = blocks(sections['Optional IELTS Extension']);
  const speakingBlock = extension.find(b => b.title === 'Speaking Part 3');
  const language = clean(speakingBlock?.fields['Useful expressions'] || '').replace(/\*/g,'');
  const speaking = [...(speakingBlock?.text || '').matchAll(/^(\d+)\. (.+)$/gm)].map(m => ({title:m[2],fields:{'Useful language':language}}));
  const writing = extension.find(b => b.title === 'Writing Task 2');
  const normalizedSections = {...sections,
    [title]:sections['Main Reading Article'],
    'IELTS WRITING TASK 2':writing?.text || '',
    'TODAY YOU LEARNED':sections['Today You Learned'],
    'SOURCES AND FURTHER READING':sections['Sources and Further Reading'].replace(/https?:\/\/\S+/g, url => `[Read source](${url})`)};
  if (paragraphs.map(p=>p.id).join('') !== 'ABCDEFGHIJ' || vocabulary.length !== 30 || vocabulary.some((v,i)=>Number(v.id)!==i+1 || !v.Definition || !v.Article || !v.Collocation) || !grammar.length || !reading.length || reading.length !== answerMap.size || !practice.length || practice.length !== practiceKey.size || !speaking.length) throw new Error(`Incomplete structured extraction: ${lessonId}: paragraphs=${paragraphs.length}, vocabulary=${vocabulary.length}, grammar=${grammar.length}, reading=${reading.length}/${answerMap.size}, practice=${practice.length}/${practiceKey.size}, speaking=${speaking.length}`);
  return {title,date:new Date(iso+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}),day,topic,paragraphs,vocabulary,grammar,reading,practice,practiceGroups,summary:'',speaking,sections:normalizedSections,images,sourceFile,storageKey:'passage-'+iso+'-v1'};
}
