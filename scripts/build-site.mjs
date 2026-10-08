
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'lessons.json'),'utf8'));
for(const {folder} of manifest.lessons){
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(folder))throw new Error('Invalid lesson folder');
  execFileSync(process.execPath,[path.join(root,'scripts/build-lesson.mjs'),folder],{cwd:root,stdio:'inherit'});
}
await import('./build-catalog.mjs');
const output=path.join(root,'_site');
fs.mkdirSync(output,{recursive:true});
function copy(relative){
 const target=path.join(output,relative);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(path.join(root,relative),target);
}
copy('index.html');
copy('wordbook.html');
copy('review.html');
for(const name of fs.readdirSync(path.join(root,'assets')))if(/\.(css|js|svg)$/.test(name))copy('assets/'+name);
for(const {folder} of manifest.lessons){
 const context={window:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,folder,'lesson-data.js'),'utf8'),context);
 const lesson=context.window.LESSON;
 for(const name of ['index.html','lesson-data.js','lesson-notes.js',lesson.sourceFile])copy(folder+'/'+name);
 for(const name of fs.readdirSync(path.join(root,folder,'images')))if(name.endsWith('.webp'))copy(folder+'/images/'+name);
}
fs.writeFileSync(path.join(output,'.nojekyll'),'');
console.log('Ready for GitHub Pages: _site (website files and lesson source downloads only).');
