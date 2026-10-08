# Passage · IELTS Reading

An English-only illustrated learning website. Each lesson preserves its A–J article and vocabulary, grammar, reading, writing and speaking material. Responsive layouts support desktop and mobile browsers.

## Lessons

- [Day 1 · Working lives](26.9.6/index.html): employment measurement, job quality and policy trade-offs.
- [Day 2 · Public health](26.9.7/index.html): maintaining a disease milestone through prevention, surveillance and accessible services. Includes 20 closed-book recall prompts from Day 1.
- [Day 3 · Adult learning](26.9.9/index.html): literacy, digital inclusion and independent judgement through repeated practice. Includes 20 closed-book recall prompts from Days 1 and 2, seven-choice heading matching and short-answer reading questions.
- [Day 4 · Farming ideas](26.9.14/index.html): why a successful farming technique does not automatically become a workable local programme. Includes 20 closed-book recall prompts from 7 September, Yes/No/Not Given, matching information and summary completion.

Open any lesson directly in a browser. The sidebar switches between lessons. No dependencies are required. The root page is the shared course library.

For a local preview, run `python -m http.server 8765 --bind 127.0.0.1` in this directory, then visit `http://127.0.0.1:8765/26.9.7/` or `http://127.0.0.1:8765/26.9.6/`.

## Content and shared presentation

- `assets/lesson.css` and `assets/lesson.js` contain shared styles, rendering and interactions.
- `lessons.json` is the course registry; `scripts/build-catalog.mjs` generates the course home and shared navigation data.
- Each lesson's `lesson-data.js` contains content extracted from its original Markdown source.
- Each `lesson-notes.js` contains English explanations, comprehension checks, vocabulary glosses, grammar annotations and presentation configuration.
- Day 2 uses reusable comparison panels, choice diagrams and a coverage illustration with hypothetical equally sized communities. These supplement the article without replacing its evidence or claiming that a percentage guarantees protection.
- Build source data with `node scripts/build-lesson.mjs <folder>`, for example `node scripts/build-lesson.mjs 26.9.9`. The default remains Day 1. Reading question types and ranges come from the source's question-group headings. Review teaching notes after source changes.
- Each lesson's `images/` contains optimized WebP assets. Original reference images remain untouched.

Reading progress, practice answers, recall attempts, writing drafts and speaking notes save to browser localStorage under separate lesson keys. Day 1 retains its original key. Bookmarks join the shared wordbook described below. Self-marked recall records a learner's own assessment, not independently verified mastery. Records differ between browsers and between file and HTTP access. My review exports TXT study notes. Vocabulary audio uses browser speech synthesis and available voices.

## Shared wordbook

[Wordbook](wordbook.html) has **Words / Sentences** tabs for a shared collection across every lesson. Select learning text (including highlighted words, explanations, examples and writing drafts), then click **Add to wordbook** for a word or short phrase, or **Save sentence** for a sentence. The selection, context and a link to its lesson save immediately. Long selections offer the sentence action without truncating them into words. Existing vocabulary bookmarks from all registered lessons migrate once when any course page opens. My review shows the current lesson's collection; home and lesson sidebars link to the shared wordbook.

[Saved sentences](wordbook.html#sentences) retain their complete selected wording and punctuation, up to 3,000 characters, with lesson/paragraph links. The notes editor leaves the original sentence intact and lets you add **Your understanding** and **Your note** in English. Sentences can also be added manually. Search and lesson filtering work within each tab; a **Without notes** filter helps revisit sentences awaiting your notes. Read-aloud, delete and Undo reuse the existing controls. Duplicate sentences merge sources using case/whitespace matching; punctuation remains significant. Words and sentences are separate entry types, even if their text happens to match. Sentence collection does not query a dictionary or generate an explanation.

Preset words use the lesson's English definition. Other words are queried through [FreeDictionaryAPI.com](https://freedictionaryapi.com/). Choose the dictionary sense that fits the sentence, or write an English meaning and note. The dictionary does not infer the correct contextual meaning. Some phrases have no entries; inflected forms may need manual editing to a base form. Changing the entry retains its original selected text and context. Lookup has a 15-second timeout, cached results and manual retry; unavailable or empty results never prevent saving. Pending lookups resume after reopening the page. Pronunciation uses browser speech synthesis and available English voices; IPA is displayed when supplied.

Entries deduplicate by case, surrounding punctuation and repeated whitespace, preserving separate word forms. Multiple contexts join the same entry. Removing a lesson bookmark unlinks that lesson; global deletion in Wordbook removes the entry and offers Undo. Today Review separates recognition from independent production, hides references until the attempt, and records Again / Hard / Good / Easy self-assessments with adaptive schedules.

Wordbook uses the shared `passage-wordbook-v1` localStorage key at the current origin. Original lesson storage keys and unrelated progress/drafts are preserved. Existing untyped entries remain words; sentence entries have `kind: "sentence"`. JSON export version 3 includes both tabs, meanings/understanding, notes, full contexts, both learning schedules and answer histories, lesson progress/drafts, dictionary candidates and attribution. Import accepts Passage version 1, 2 and 3 JSON backups up to 5 MB / 10,000 entries, validates them before changing records, merges duplicate contexts within each type and preserves current edits. Duplicate review tracks use the schedule with the latest attempt; a current explicit goal wins over an imported goal. Lesson drafts restore only into empty browser records. No account sync or CSV export is included. Different browsers, local previews and the hosted site maintain separate collections.

Dictionary data is from Wiktionary under CC BY-SA 4.0. Definition and candidate displays retain source/provider/license links, and JSON backups retain attribution and edit markers. Typed meanings remain distinct from dictionary-derived meanings. The API requires no key, supports browser CORS and permits 1,000 requests per hour per IP; empty results and failures show a path to editing or retrying.

Implementation: `assets/wordbook-store.js` owns storage, migration, lookup and merging; `assets/wordbook.js` handles selection, editing, review and backup UI. `assets/wordbook.css` reuses the existing design tokens. `scripts/build-catalog.mjs` generates `assets/course-vocabulary.js`, enabling all-lesson migration without loading or fetching individual lesson pages.

Focused integration verification is in `scripts/verify-wordbook.cjs` and `scripts/verify-sentences.cjs`. With Playwright and Chrome available, run both scripts against a local server after building. Set `PLAYWRIGHT_MODULE` to the installed module path if it is outside this project, `CHROME_PATH` to an installed Chrome executable, and optionally `PASSAGE_TEST_URL` (default `http://127.0.0.1:8765/_site/`). Checks use isolated browser profiles and controlled dictionary responses; live dictionary connectivity is checked separately. Sentence checks cover long selections/full text, typed isolation, old and combined backups, notes, source merging, search, delete/Undo and keyboard tabs.

## Long-term vocabulary learning (v2)

The website remains native JavaScript with no framework, account or AI service. In every lesson, vocabulary cards offer **Active**, **Recognition**, **Already know** and **Skip**, with **Reading exposure** as the unselected default. The catalog recommends 6 Active and 10 Recognition words per lesson, ranking existing Core Vocabulary first. Suggestions never enrol a word automatically. A term shares its chosen goal across lessons; its original contexts stay linked.

- **Active** enables separate Recognition and Production tracks. **Recognition** enables the reading track. Already know, Skip and Reading exposure pause scheduling and preserve history.
- [Today Review](review.html) prioritises weak/due tracks, then introduces at most 6 new words per local calendar day. At 20 due tasks, new words pause. Waiting words have no review date until their first attempt. Words without meanings remain editable in Wordbook and cannot enter the queue.
- Again schedules a retry in 10 minutes and resets successful progress. Good uses 1, 3, 7, 14, 30 and 60 day steps; Hard reduces the interval; Easy advances faster. Ease and a capped late-success adjustment adapt intervals up to 120 days. All times are device-local; tracks update independently.
- Production progresses from expression retrieval to a new-context gap, sentence rewriting and independent sentence writing. Retrieved targets and references remain hidden before reveal. Good/Easy production ratings require a written attempt. References support self-assessment; natural language is never graded by string equality. Related-form examples may be overridden in `lesson-notes.js` under `training[wordId].example` to give a genuine new-context gap.
- An established track needs two consecutive successful attempts and a 14+ day interval. Production additionally requires a successful independent sentence. Already know is a learner choice and does not claim tested mastery. Delayed recall measures self-rated success on attempts 7+ days apart; late recall measures attempts 1+ day overdue. Both show sample counts, not inferred test scores.

`assets/vocabulary-learning.js` contains pure scheduling, admission and metrics; `assets/wordbook-store.js` persists learning inside each word; `assets/vocabulary-learning-ui.js` shares goal selectors, the dashboard, history and review UI. The existing wordbook storage key remains in use, with new learning fields. Previous words become Reading exposure until a goal is chosen. Sentence collection and lesson progress retain their original behavior and keys. Learning is local to each origin: export/import from Wordbook to move records between GitHub Pages, Cloudflare Pages or another browser.

Build and verify:

```powershell
node scripts/build-site.mjs
node scripts/verify-learning.cjs
# Start a local server separately: python -m http.server 8765 --bind 127.0.0.1
# Set PLAYWRIGHT_MODULE and CHROME_PATH if needed, as described above.
node scripts/verify-learning-browser.cjs
node scripts/verify-wordbook.cjs
node scripts/verify-sentences.cjs
```

The browser check covers opt-in selection, hidden retrieval, all production stages, independent updates, backup, cross-tab changes and 117 page/viewport combinations at 1440, 768 and 375px. Screenshots go to ignored `.preview/v2/`.

## Cloudflare Pages branch deployment

GitHub Pages remains on `main`. Cloudflare **Pages** project `ielts-passages` connects this repository through the Git integration, with framework **None**, build command `node scripts/build-site.mjs`, output directory `_site` and root directory left blank. `main` is Cloudflare's production branch; `v2` deploys at [the stable v2 preview](https://v2.ielts-passages.pages.dev/). The separate Cloudflare origin keeps v2 learning records separate from the GitHub Pages origin. Each push to `v2` rebuilds the entire catalog and all four lessons. The GitHub application is limited to this repository.

After building locally, set `PASSAGE_TEST_URL` to the v2 preview URL and run `node scripts/verify-deployment.cjs` with the same Playwright/Chrome environment variables used for the other browser checks. It compares published learning assets with the local build and checks all four articles, selection, both review tracks, persistence, backup download and mobile layout in an isolated browser.

## Publishing and adding lessons

Repository: https://github.com/cqw241/ielts-passages

Course home: https://cqw241.github.io/ielts-passages/

GitHub Pages deploys the verified `_site` artifact through `.github/workflows/pages.yml` on pushes to `main`. `node scripts/build-site.mjs` rebuilds all registered lessons and the library using Node.js built-ins. No package installation is needed. The deployment runs in a fresh checkout; `_site` is an ignored local build output. Only website assets and lesson-source Markdown downloads enter the deployed artifact.

For each new lesson:

1. Add its source Markdown, `index.html`, `lesson-notes.js`, and optimized WebP illustrations in its lesson folder. Name the source `26-MM-DD-Article Title.md`, for example `26.9.6/26-09-06-When More Jobs Are Only Part of the Story.md`. Reuse an existing lesson's stylesheet and script tags: lesson data/notes, `../assets/course-data.js`, `../assets/course-vocabulary.js`, `../assets/wordbook-store.js`, `../assets/lesson.js`, then `../assets/wordbook.js`; include both lesson.css and wordbook.css. This keeps free selection, shared bookmarks and navigation available in new lessons.
2. Add a record to `lessons.json` with `folder`, `shortTitle`, `summary`, and a relative WebP `image`. Titles, dates and course days are extracted from lesson data. Keep learner-facing text in English.
3. Run `node scripts/build-site.mjs`. The extractor reads question-group ranges and supports True/False/Not Given, Yes/No/Not Given, multiple choice, matching headings/information, summary/sentence completion and short answers. Extend it for other formats instead of forcing new source material into an unsuitable profile.
4. Preview `_site/` under a local server and verify the library, lesson interactions, images and source downloads. Keep links relative so they work beneath `/ielts-passages/`.
5. Commit the lesson, registry and generated catalog files, then push to `main`. Check the Pages workflow and live URLs. All lessons remain under the same course home.

Original PNGs, DOCX files, archived content, planning notes, `.preview` files and `.playwright-cli` browser snapshots are excluded from Git. The course registry controls which lesson folders join the deployment. Existing browser-local records are retained at their original origin; the hosted site maintains its own study records.
