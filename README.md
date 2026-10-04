# Passage · IELTS Reading

An English-only illustrated learning website. Each lesson preserves its A–J article and vocabulary, grammar, reading, writing and speaking material. Designed and verified for desktop browsers.

## Lessons

- [Day 1 · Working lives](26.9.6/index.html): employment measurement, job quality and policy trade-offs.
- [Day 2 · Public health](26.9.7/index.html): maintaining a disease milestone through prevention, surveillance and accessible services. Includes 20 closed-book recall prompts from Day 1.

Open either lesson directly in a browser. The sidebar switches between lessons. No dependencies are required. The root page is the shared course library.

For a local preview, run `python -m http.server 8765 --bind 127.0.0.1` in this directory, then visit `http://127.0.0.1:8765/26.9.7/` or `http://127.0.0.1:8765/26.9.6/`.

## Content and shared presentation

- `assets/lesson.css` and `assets/lesson.js` contain shared styles, rendering and interactions.
- `lessons.json` is the course registry; `scripts/build-catalog.mjs` generates the course home and shared navigation data.
- Each lesson's `lesson-data.js` contains content extracted from its original Markdown source.
- Each `lesson-notes.js` contains English explanations, comprehension checks, vocabulary glosses, grammar annotations and presentation configuration.
- Day 2 uses reusable comparison panels, choice diagrams and a coverage illustration with hypothetical equally sized communities. These supplement the article without replacing its evidence or claiming that a percentage guarantees protection.
- Build source data with `node scripts/build-lesson.mjs 26.9.6` or `node scripts/build-lesson.mjs 26.9.7`. The default remains Day 1. Review teaching notes after source changes.
- Each lesson's `images/` contains optimized WebP assets. Original reference images remain untouched.

Reading progress, bookmarks, practice answers, recall attempts, writing drafts and speaking notes save to browser localStorage under separate lesson keys. Day 1 retains its original key. Self-marked recall records a learner's own assessment, not independently verified mastery. Records differ between browsers and between file and HTTP access. My review exports TXT study notes. Vocabulary audio uses browser speech synthesis and available voices.

## Publishing and adding lessons

Repository: https://github.com/cqw241/ielts-passages

Course home: https://cqw241.github.io/ielts-passages/

GitHub Pages deploys the verified `_site` artifact through `.github/workflows/pages.yml` on pushes to `main`. `node scripts/build-site.mjs` rebuilds all registered lessons and the library using Node.js built-ins. No package installation is needed. The deployment runs in a fresh checkout; `_site` is an ignored local build output. Only website assets and lesson-source Markdown downloads enter the deployed artifact.

For each new lesson:

1. Add its source Markdown, `index.html`, `lesson-notes.js`, and optimized WebP illustrations in its lesson folder. Reuse the shared presentation files and include `../assets/course-data.js` before `../assets/lesson.js`.
2. Add a record to `lessons.json` with `folder`, `shortTitle`, `summary`, and a relative WebP `image`. Titles, dates and course days are extracted from lesson data. Keep learner-facing text in English.
3. Run `node scripts/build-site.mjs`. The extractor supports the existing two reading-format profiles; extend it for different formats instead of forcing new source material into an unsuitable profile.
4. Preview `_site/` under a local server and verify the library, lesson interactions, images and source downloads. Keep links relative so they work beneath `/ielts-passages/`.
5. Commit the lesson, registry and generated catalog files, then push to `main`. Check the Pages workflow and live URLs. All lessons remain under the same course home.

Original PNGs, DOCX files, archived content, planning notes and `.preview` files are excluded from Git. The course registry controls which lesson folders join the deployment. Existing browser-local records are retained at their original origin; the hosted site maintains its own study records.
