/*
 * Generate one article-level MP3 per registered lesson with DashScope TTS.
 *
 *   node --env-file=.env.tts scripts/generate-audio.mjs
 *   node --env-file=.env.tts scripts/generate-audio.mjs 26.10.12
 *   node --env-file=.env.tts scripts/generate-audio.mjs --force
 *
 * The API key is read from DASHSCOPE_API_KEY and never written into the site.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'lessons.json'), 'utf8'));
const args = process.argv.slice(2);
const force = args.includes('--force');
const requested = args.filter(arg => !arg.startsWith('--'));
const folders = requested.length ? requested : manifest.lessons.map(lesson => lesson.folder);
const folderPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
  console.error('Missing DASHSCOPE_API_KEY.\nRun with: node --env-file=.env.tts scripts/generate-audio.mjs');
  process.exit(1);
}

const config = {
  endpoint: process.env.DASHSCOPE_TTS_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
  model: process.env.TTS_MODEL || 'qwen-audio-3.1-tts-flash',
  voice: process.env.TTS_VOICE || 'Emily_v3.1',
  format: 'mp3',
  sampleRate: 24000,
  languageHints: ['en']
};

for (const folder of folders) {
  if (!folderPattern.test(folder)) throw new Error(`Invalid lesson folder: ${folder}`);
  if (!manifest.lessons.some(lesson => lesson.folder === folder)) throw new Error(`${folder} is not registered in lessons.json`);
}

function cleanText(text) {
  return String(text || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readLesson(folder) {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-lesson.mjs'), folder], {cwd: root, stdio: 'inherit'});
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(root, folder, 'lesson-data.js'), 'utf8'), context);
  return context.window.LESSON;
}

function sourceHash(text) {
  const {model, voice, format, sampleRate, languageHints} = config;
  return crypto.createHash('sha256').update(JSON.stringify({text, model, voice, format, sampleRate, languageHints})).digest('hex');
}

function chunkText(text, limit) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > limit) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n\n' : '') + paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function synthesize(text) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        text,
        voice: config.voice,
        format: config.format,
        sample_rate: config.sampleRate,
        language_hints: config.languageHints
      }
    }),
    signal: AbortSignal.timeout(240000)
  });
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`TTS request failed (HTTP ${response.status}): ${body.slice(0, 600)}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  let data;
  try { data = JSON.parse(body); } catch { throw new Error(`TTS returned invalid JSON: ${body.slice(0, 400)}`); }
  const url = data?.output?.audio?.url;
  if (!url) throw new Error(`TTS response has no output.audio.url: ${body.slice(0, 600)}`);
  const usage = data.usage ? ` usage=${JSON.stringify(data.usage)}` : '';
  console.log(`  accepted${usage}`);
  return download(url);
}

async function download(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(180000), redirect: 'follow'});
  if (!response.ok) throw new Error(`Audio download failed (HTTP ${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const looksLikeMp3 = buffer.subarray(0, 3).toString() === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  if (buffer.length < 1024 || !looksLikeMp3) {
    throw new Error(`Audio download is not a usable MP3 (${buffer.length} bytes, ${response.headers.get('content-type') || 'unknown type'})`);
  }
  return buffer;
}

function looksLikeLengthError(error) {
  return error.status === 400 && /length|too long|exceed|maximum|limit|字符|长度/i.test(error.body || '');
}

function mergeMp3(buffers, target) {
  const temporary = buffers.map((buffer, index) => {
    const file = `${target}.part-${index}.mp3`;
    fs.writeFileSync(file, buffer);
    return file;
  });
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `concat:${temporary.join('|')}`, '-acodec', 'copy', target]);
  } catch (error) {
    console.warn(`  ffmpeg merge unavailable (${error.message.split('\n')[0]}); writing concatenated MP3 frames instead.`);
    fs.writeFileSync(target, Buffer.concat(buffers));
  } finally {
    for (const file of temporary) fs.rmSync(file, {force: true});
  }
}

async function synthesizeArticle(text, target) {
  try {
    const buffer = await synthesize(text);
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, buffer);
    fs.renameSync(temporary, target);
    return buffer.length;
  } catch (error) {
    fs.rmSync(`${target}.tmp`, {force: true});
    if (!looksLikeLengthError(error) || text.length < 3000) throw error;
    console.warn('  full text was rejected; retrying in paragraph-sized chunks.');
    const chunks = chunkText(text, 2800);
    const buffers = [];
    for (const [index, chunk] of chunks.entries()) {
      console.log(`  chunk ${index + 1}/${chunks.length}: ${chunk.length} characters`);
      buffers.push(await synthesize(chunk));
    }
    mergeMp3(buffers, target);
    return fs.statSync(target).size;
  }
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'unknown length';
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function probeDuration(file) {
  try {
    const output = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], {encoding: 'utf8'});
    return Number(output.trim());
  } catch { return null; }
}

for (const folder of folders) {
  const lesson = readLesson(folder);
  const text = lesson.paragraphs.map(paragraph => cleanText(paragraph.text)).join('\n\n');
  if (!text) throw new Error(`${folder} has no article paragraphs`);
  const hash = sourceHash(text);
  const directory = path.join(root, folder, 'audio');
  const target = path.join(directory, 'article.mp3');
  const metaFile = path.join(directory, 'meta.json');
  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
  if (!force && fs.existsSync(target) && existing?.hash === hash) {
    console.log(`${folder}: up to date (${text.length} characters, ${(fs.statSync(target).size / 1048576).toFixed(1)} MB)`);
    continue;
  }

  fs.mkdirSync(directory, {recursive: true});
  console.log(`${folder}: ${text.length} characters with ${config.model} / ${config.voice}`);
  const bytes = await synthesizeArticle(text, target);
  const duration = probeDuration(target);
  fs.writeFileSync(metaFile, JSON.stringify({
    hash,
    model: config.model,
    voice: config.voice,
    format: config.format,
    sampleRate: config.sampleRate,
    chars: text.length,
    generatedAt: new Date().toISOString()
  }, null, 2) + '\n');
  console.log(`${folder}: wrote audio/article.mp3 (${(bytes / 1048576).toFixed(1)} MB, ${formatDuration(duration)})`);
}

console.log('Audio generation complete. Run node scripts/build-site.mjs to publish the files into _site/.');
