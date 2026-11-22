// Adapt the Passage editorial Markdown to the shared interactive lesson.
export function extractStructuredLesson({raw, sections, lessonId, sourceFile, images, day}) {
  const section = name => sections[Object.keys(sections).find(key => key.replace(/^\d+\. /, '') === name)] || '';
  const content = text => text.trim().replace(/\n+---\s*$/, '');
  const plain = text => text.replace(/^[“"]|[”"]$/g, '').trim();
  const fields = text => Object.fromEntries([...text.matchAll(/^\s*\*\*([^*\n]+):\*\* (.+)$/gm)].map(([, name, value]) => [name, value.trim()]));
  const splitHeadings = text => [...content(text).matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
  const title = raw.match(/^\*\*Title:\*\* (.+)$/m)?.[1].trim();
  const date = raw.match(/^# Passage \| (.+)$/m)?.[1].trim();
  const topic = raw.match(/^\*\*Theme:\*\* (.+)$/m)?.[1].trim();
  const published = new Date(date + ' 12:00 UTC');
  if (!title || !topic || Number.isNaN(+published)) throw new Error('Incomplete metadata in ' + lessonId);

  const paragraphs = [...section('Main Reading').matchAll(/^\*\*\[(P\d+)\]\*\* (.+)$/gm)].map(([, id, text]) => ({
    id, text:text.replace(/\s*\[\^[a-z]+\]/g, '').trim()
  }));
  const vocabulary = splitHeadings(section('Vocabulary in Context')).flatMap(([, heading, body]) => {
    const priority = {'A':'Suggested active', 'B':'Suggested recognition', 'C':'Exposure'}[heading[0]];
    return [...body.matchAll(/^(\d+)\. \*\*(★ )?(.+?)\*\* \*\((.+?)\)\*\s*\n([\s\S]*?)(?=^\d+\. |$(?![\s\S]))/gm)]
      .map(([, id, core, word, partOfSpeech, details]) => {
        const f = fields(details);
        return {id:id.padStart(2, '0'), word, core:!!core, priority, 'IPA / part of speech':partOfSpeech,
          Definition:f.Definition, Article:plain(f.Text || ''), Collocation:f.Pattern, 'In context':f.Here,
          'Additional example':f['New example'], 'Learner note':f['Learner note'] || ''};
      });
  });

  const [recall, production, readingPrompts] = splitHeadings(section('Exercises')).map(match => match[2]);
  const [recallAnswers, productionAnswers, readingAnswers] = splitHeadings(section('Answers and Explanations')).map(match => match[2]);
  const recallKeys = new Map([...recallAnswers.matchAll(/^(\d+)\. \*\*(.+?)\*\* — (.+)$/gm)]
    .map(([, id, answer, reason]) => [id, {answer, explanation:'**' + answer + '** — ' + reason}]));
  const modelKeys = new Map([...productionAnswers.matchAll(/^\*\*Task (\d+):\*\* (.+)\n\*\*Why it works:\*\* (.+)$/gm)]
    .map(([, id, model, reason]) => [id, {answer:plain(model.trim()), explanation:model.trim() + ' **Why it works:** ' + reason}]));
  const practice = [
    ...[...recall.matchAll(/^(\d+)\. (.+)$/gm)].map(([, id, question]) => ({id:'A' + id, question, ...recallKeys.get(id)})),
    ...[...production.matchAll(/^\*\*Task (\d+) — (.+?):\*\* (.+)$/gm)].map(([, id, label, prompt]) => ({
      id:'B' + id, question:label + ': ' + prompt, production:true, ...modelKeys.get(id)
    }))
  ];
  const readingKeys = new Map([...readingAnswers.matchAll(/^\| (\d+) \| \*\*(.+?)\*\*(.*?) \| (.+?) \|$/gm)]
    .map(([, id, answer, model, explanation]) => [Number(id), {answer, model:model.trim(), explanation}]));
  const reading = [...readingPrompts.matchAll(/^(\d+)\. (.+)(?:\n|$)((?:[ \t]+- .+\n)*)/gm)].map(([, number, question, choices]) => {
    const id = Number(number);
    const key = readingKeys.get(id);
    if (!key) throw new Error('Missing reading answer ' + id);
    const paragraph = (key.answer.match(/^P\d+$/) || key.explanation.match(/\bP\d+\b/))?.[0];
    const common = {id, question, answer:key.answer, paragraph, explanation:key.explanation};
    if (id <= 3) return {...common, type:'True / False / Not Given', instruction:'Decide whether each statement agrees with the passage.',
      options:['TRUE', 'FALSE', 'NOT GIVEN'].map(value => ({value, text:value}))};
    if (id <= 5) {
      const options = [...choices.matchAll(/^\s*- \*\*([A-D])\.\*\* (.+)$/gm)].map(([, value, text]) => ({value, text}));
      if (options.length !== 4) throw new Error('Missing choices for question ' + id);
      return {...common, type:'Multiple choice', instruction:'Choose the one answer A–D that best matches the passage.', options};
    }
    if (id <= 7) return {...common, type:'Matching information', instruction:'Choose the paragraph containing the information.',
      options:paragraphs.map(({id:value}) => ({value, text:'Paragraph ' + value}))};
    if (id <= 9) return {...common, type:'Sentence completion', instruction:'Use no more than two words from the passage.', options:[]};
    return {...common, type:'Short answers', instruction:'Answer in no more than 25 words.', options:[],
      marking:'self-check', placeholder:'Write up to 25 words',
      answer:'Compare with the model and evidence', explanation:'**Suggested answer:** ' + key.model + ' ' + key.explanation,
      selfCheckInstruction:'Check that you distinguished sales performance from the quality of oversight. This response is excluded from the automatic score.'};
  });

  const grammar = splitHeadings(section('Deep Sentence Analysis')).map(([, name, body]) => {
    const details = fields(body);
    const paragraph = details.Original?.match(/\*\*\[(P\d+)\]\*\*$/)?.[1];
    details.Original = details.Original?.replace(/\s+\*\*\[P\d+\]\*\*$/, '');
    return {title:name, text:content(body), paragraph, fields:details};
  });
  const extension = splitHeadings(section('IELTS Extension'));
  const writing = content(extension.find(([, name]) => name === 'Writing Task 2')?.[2] || '');
  const speakingText = extension.find(([, name]) => name === 'Speaking Part 3')?.[2] || '';
  const speaking = [...content(speakingText).matchAll(/^\*\*Question \d+:\*\* (.+)\n([\s\S]*?)(?=^\*\*Question |$(?![\s\S]))/gm)]
    .map(([, title, body]) => {
      const f = fields(body);
      return {title, fields:{'Useful ideas':f['Useful angles'], 'Useful language':f['Useful expressions']}};
    });

  if (!paragraphs.length || paragraphs.some((p, i) => p.id !== 'P' + (i + 1)) ||
      vocabulary.length !== 30 || vocabulary.some((v, i) => Number(v.id) !== i + 1 || !v.Definition || !v.Article || !v.Collocation) ||
      reading.length !== 10 || practice.length !== 9 || practice.some(q => !q.answer) ||
      grammar.length !== 3 || speaking.length !== 2 || !writing) {
    throw new Error(`Incomplete Passage extraction in ${lessonId}: paragraphs=${paragraphs.length}, vocabulary=${vocabulary.length}, reading=${reading.length}, practice=${practice.length}, keyed practice=${practice.filter(q => q.answer).length}, grammar=${grammar.length}, speaking=${speaking.length}`);
  }

  return {title, date, day, topic, paragraphs, vocabulary, reading, practice, grammar, speaking, images, sourceFile, summary:'',
    sections:{
      'IELTS WRITING TASK 2':writing,
      'TODAY YOU LEARNED':content(section('Today You Learned')),
      'SOURCES AND FURTHER READING':content(section('Sources and Further Reading')).replace(/^\[\^([a-z]+)\]: /gm, '- ')
    },
    practiceGroups:[
      {id:'A', title:'Active recall', description:'Complete each item from its meaning and grammar. Change the form where necessary.'},
      {id:'B', title:'Contextual production', description:'Write two or three original sentences per scenario before opening the model.'}
    ],
    storageKey:'passage-' + published.toISOString().slice(0, 10) + '-v1'
  };
}
