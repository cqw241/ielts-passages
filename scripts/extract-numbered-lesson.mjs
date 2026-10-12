// Numbered editorial format: preserve the Markdown source and adapt it to the shared UI.
export function extractStructuredLesson({raw, sections, lessonId, sourceFile, images, day}) {
  const clean = text => text.replace(/\*\*/g, '').replace(/^"|"$/g, '').trim();
  const blocks = (text, pattern) => [...text.matchAll(pattern)];
  const fields = text => Object.fromEntries(blocks(text, /^- \*\*([^*]+):\*\* (.+)$/gm).map(m => [m[1], m[2]]));
  const section = name => sections[Object.keys(sections).find(key => key.replace(/^\d+\. /, '') === name)] || '';
  const title = raw.match(/^# (.+)$/m)?.[1];
  const dateText = raw.match(/^- \*\*Publication Date:\*\* (.+)$/m)?.[1];
  const date = new Date(dateText + ' 12:00 UTC');
  const topic = raw.match(/^- \*\*Topic:\*\* (.+)$/m)?.[1];
  if (!title || !topic || Number.isNaN(date.valueOf()) || day < 1) throw new Error(`Incomplete metadata in ${lessonId}`);
  const paragraphs = blocks(section('Main Reading Article'), /^\*\*([A-J])\.\*\* ([\s\S]*?)(?=^\*\*[A-J]\.\*\*|^---|$(?![\s\S]))/gm).map(m => ({id:m[1], text:m[2].trim()}));
  const vocabulary = [];
  for (const tier of blocks(section('Vocabulary Builder'), /^### ([A-C])\. (.+)\n([\s\S]*?)(?=^### |^---|$(?![\s\S]))/gm)) {
    for (const m of blocks(tier[3], /^#### (\d+)\. (★ )?(.+?) \((.+?)\)\n([\s\S]*?)(?=^#### |$(?![\s\S]))/gm)) {
      const f = fields(m[5]);
      const quote = Object.entries(f).find(([key]) => key.startsWith('From the text'))?.[1];
      const note = m[5].slice(m[5].indexOf(f['Another context']) + (f['Another context']?.length || 0)).trim();
      vocabulary.push({id:m[1].padStart(2,'0'), word:m[3], core:!!m[2],
        priority:{A:'Suggested active',B:'Suggested recognition',C:'Exposure'}[tier[1]],
        'IPA / part of speech':m[4], Definition:f.Definition, Article:clean(quote || ''),
        Collocation:f['Useful patterns'] || f['Useful pattern'], 'In context':f['In this article'],
        'Additional example':f['Another context'], 'Learner note':note});
    }
  }
  const answers = section('Answers and Explanations');
  const answerSection = name => answers.match(new RegExp('^### '+name+'[^\\n]*\\n([\\s\\S]*?)(?=^### |^---|$(?![\\s\\S]))','m'))?.[1] || '';
  const readingKeys = new Map(blocks(answerSection('C\\.'), /^\*\*(\d+)\. ([^\n]+)\*\*\n([\s\S]*?)(?=^\*\*\d+\. |$(?![\s\S]))/gm).map(m => [Number(m[1]), {
    answer:m[2], explanation:m[3].trim(), paragraph:m[3].match(/\*\*Evidence \(([A-J])/)?.[1]
  }]));
  const reading = [];
  const types = {'True / False / Not Given':'True / False / Not Given','Multiple Choice':'Multiple choice','Sentence Completion':'Sentence completion','Short Answer':'Short answers'};
  for (const group of blocks(section('IELTS-Style Reading Comprehension'), /^\*\*Questions (\d+)[–-](\d+): (.+)\*\*\n([\s\S]*?)(?=^\*\*Questions |^---|$(?![\s\S]))/gm)) {
    const type = types[group[3]];
    if (!type) throw new Error(`Unsupported reading type: ${group[3]}`);
    for (const m of blocks(group[4], /^\*\*(\d+)\.\*?\*? (.+?)\n([\s\S]*?)(?=^\*\*\d+\.\*?\*? |$(?![\s\S]))/gm)) {
      const id = Number(m[1]), key = readingKeys.get(id);
      if (!key) throw new Error(`Missing reading answer ${id}`);
      const options = type.includes('Not Given') ? ['TRUE','FALSE','NOT GIVEN'].map(value => ({value,text:value}))
        : type === 'Multiple choice' ? blocks(m[3], /^([A-D])\. (.+)$/gm).map(o => ({value:o[1],text:o[2]})) : [];
      if (type === 'Multiple choice' && options.length !== 4) throw new Error(`Missing choices for ${id}`);
      const selfCheck = type === 'Short answers';
      reading.push({id,question:m[2].replace(/\*\*$/, ''),type,options,...key,
        answer:type === 'Multiple choice' ? key.answer.split(' — ')[0] : selfCheck ? 'Compare with the model and evidence' : key.answer,
        instruction:selfCheck ? 'Answer briefly in your own words, then compare with the evidence. These responses are self-checked.'
          : type.includes('Not Given') ? 'TRUE = agrees · FALSE = contradicts · NOT GIVEN = insufficient information'
          : type === 'Multiple choice' ? 'Choose the one answer A–D that best matches the passage.'
          : 'Use no more than two words from the article. Spelling matters.',
        ...(selfCheck ? {marking:'self-check',placeholder:'Write a brief answer',selfCheckInstruction:id === 9
          ? 'Check that you named one practical obstacle from paragraph F. This open response is excluded from the automatic score.'
          : 'Check that you explained what averages can hide and how detailed data helps target support. This open response is excluded from the automatic score.'} : {})});
    }
  }
  const recallKeys = new Map(blocks(answerSection('A\\.'), /^\*\*(\d+)\. (.+?)\*\*\n([\s\S]*?)(?=^\*\*\d+\. |$(?![\s\S]))/gm).map(m => [m[1], {answer:m[2],explanation:m[3].trim()}]));
  const models = new Map(blocks(answerSection('B\\.'), /^\*\*Task (\d+) — Model Response\*\*\n([\s\S]*?)(?=^\*\*Task |$(?![\s\S]))/gm).map(m => [m[1],m[2].trim()]));
  const practiceText = section('Vocabulary Practice — Active Recall and Production');
  const practice = blocks(practiceText.split('### Part B.')[0], /^\*\*(\d+)\.\*\* (.+)$/gm).map(m => {
    const key = recallKeys.get(m[1]);
    if (!key) throw new Error(`Missing recall answer ${m[1]}`);
    return {id:'A'+m[1],question:m[2],...key};
  });
  for (const m of blocks(practiceText, /^\*\*Task (\d+) — (.+)\*\*\n([\s\S]*?)(?=^\*\*Task |^---|$(?![\s\S]))/gm)) {
    const model = models.get(m[1]);
    if (!model) throw new Error(`Missing production model ${m[1]}`);
    practice.push({id:'B'+m[1],question:m[2]+'. '+m[3].trim().replace(/\n+/g,' '),answer:model,explanation:model,production:true});
  }
  const grammar = blocks(section('Deep Sentence Analysis'), /^### (.+)\n([\s\S]*?)(?=^### |^---|$(?![\s\S]))/gm).map(m => {
    const parts = blocks(m[2], /^\*\*([^*]+):\*\*\n([\s\S]*?)(?=^\*\*[^*]+:\*\*\n|$(?![\s\S]))/gm);
    return {title:m[1],text:m[2].trim(),paragraph:m[2].match(/Original \(([A-J])\)/)?.[1],
      fields:Object.fromEntries(parts.map(p => [p[1],p[2].trim().replace(/^> /gm,'')]))};
  });
  const extension = section('IELTS Extension');
  const speaking = blocks(extension, /^\*\*Question (\d+):\*\* (.+)$/gm).map(m => ({title:m[2],fields:{'Useful language':extension.split('**Useful expressions from this lesson:**')[1].trim().replace(/^- /gm,'').replace(/\n+/g,' · ').replace(/ · ---.*$/,'')}}));
  const normalizedSections = {...sections,[title]:section('Main Reading Article'),
    'IELTS WRITING TASK 2':extension.split('### Writing Task 2')[1].split('### Speaking Part 3')[0].trim(),
    'TODAY YOU LEARNED':section('Today You Learned'),
    'SOURCES AND FURTHER READING':section('Sources and Further Reading').replace(/https?:\/\/\S+/g,url => `[Read source](${url})`)};
  if (paragraphs.map(p=>p.id).join('') !== 'ABCDEFGHIJ' || vocabulary.length !== 30 || vocabulary.some((v,i)=>Number(v.id)!==i+1 || !v.Definition || !v.Article || !v.Collocation) || reading.length !== 10 || practice.length !== 9 || grammar.length !== 3 || speaking.length !== 2) throw new Error(`Incomplete numbered extraction: ${lessonId}: paragraphs=${paragraphs.length}, vocabulary=${vocabulary.length}, reading=${reading.length}, practice=${practice.length}, grammar=${grammar.length}, speaking=${speaking.length}`);
  return {title,date:date.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}),day,topic,paragraphs,vocabulary,reading,practice,grammar,speaking,images,sourceFile,sections:normalizedSections,summary:'',
    practiceGroups:[{id:'A',title:'Active recall',description:'Retrieve the six suggested active expressions from memory. Change the grammatical form when necessary. No word bank is provided.'},{id:'B',title:'Contextual production',description:'Write original sentences before opening the model. More than one response can work.'}],storageKey:'passage-'+date.toISOString().slice(0,10)+'-v1'};
}
