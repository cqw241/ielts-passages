# Passage

**Read in context. Remember what matters. Use English naturally.**

Passage is a lightweight, browser-based English reading and vocabulary-learning website. Its primary goal is to build both **receptive vocabulary** (understanding expressions in context) and **productive vocabulary** (using them in your own writing and speech). IELTS-style practice and current-affairs reading support that goal.

**[Open Passage](https://cqw241.github.io/ielts-passages/)** · [Wordbook](https://cqw241.github.io/ielts-passages/wordbook.html) · [Today Review](https://cqw241.github.io/ielts-passages/review.html)

## Features

- **Illustrated reading lessons:** original explanatory articles, 30 vocabulary items, sentence analysis, reading questions, and language practice.
- **Personal learning goals:** new saved or manually added words default to Active (Recognition + Production); add a meaning before review can start. Choose Recognition, Already know, Skip or Reading exposure as needed. Existing goals and imports keep their status; lesson recommendations alone never enrol words.
- **Two-track spaced repetition:** independent Recognition and Production progress, adaptive scheduling, and Again / Hard / Good / Easy self-assessment.
- **Active output practice:** retrieve expressions, complete new contexts, rewrite sentences, and create your own examples.
- **Wordbook and saved sentences:** preserve reading context, add English explanations and Markdown notes, and export/import JSON backups.
- **Browser-first:** responsive static pages, optional single-account Supabase cloud sync, offline local saving, and no package installation for the website.

Personal meanings and notes support Markdown headings, tables, horizontal rules, bold, italic, lists, quotes, inline code and links, with Preview / Edit controls. Raw HTML and images are disabled. Original Markdown stays editable and survives JSON backups; reviews use its plain text, and formatting-only edits preserve review progress.

The learning dashboard counts total/enrolled/meaning-needed/established words separately from due review tasks and distinct new words ready to start. Enrolled includes words without meanings. Established requires success in every enabled track. The 6-new-word limit applies to starts per local calendar day, never the size of your wordbook. Existing two-track schedules, 20-task backlog admission and Production's 24-hour exposure wait are unchanged. Empty review states explain missing meanings, unenrolled words, the daily limit, backlog capacity, other-track tasks and the next scheduled review, with links to the relevant Wordbook filters.

New-word admission reserves 2 task slots per word within a 20-task capacity. With 19 backlog tasks, only 1 slot remains, so a new word cannot start; with 20, no slots remain. Complete existing reviews to free capacity. This capacity limit is separate from the daily 6-new-word limit.

## Run locally

Use Node.js 22 (the version used for deployment) and a local HTTP server:

```sh
git clone https://github.com/cqw241/ielts-passages.git
cd ielts-passages
node scripts/build-site.mjs
python3 -m http.server 8765 --bind 127.0.0.1
```

Open **http://127.0.0.1:8765/_site/**. The build generates the registered lessons and course catalog in `_site/`; no `npm install` is needed.

## Project structure

| Path | Purpose |
| --- | --- |
| `lessons.json` | Registry for the course library and navigation |
| `26.*/*` | Lesson Markdown, page shell, teaching notes, and images |
| `assets/lesson.*` | Shared reading interface |
| `assets/wordbook*` | Wordbook, saved sentences, and Markdown notes |
| `assets/vocabulary-learning*` | Review scheduling and learning UI |
| `scripts/` | Lesson extraction, site builds, and verification |
| `_site/` | Generated deployment output (not committed) |

## Add or publish a lesson

1. Follow an existing lesson folder: add one source file named `26-MM-DD-Title.md`, an `index.html` page shell, `lesson-notes.js`, and any WebP illustrations.
2. Register its `folder`, `shortTitle`, `summary`, and `image` in `lessons.json`.
3. In `lesson-notes.js`, provide editorial `learningRecommendations` with a `goal` and `reason` for suggested Active and Recognition terms. Aim for 5–6 Active and 8–12 Recognition recommendations; learners choose whether to enrol.
4. Run `node scripts/build-site.mjs`, preview `_site/`, and commit the lesson sources, registry, and regenerated lesson/catalog data.

See [AGENTS.md](AGENTS.md) for development conventions. Pushes to `main` build and deploy the site to GitHub Pages via [GitHub Actions](.github/workflows/pages.yml).

## Verification

```sh
node scripts/build-site.mjs
node scripts/verify-learning.cjs
node scripts/verify-learning-fixes.cjs
```

Browser integration checks include `scripts/verify-wordbook.cjs`, `scripts/verify-sentences.cjs`, `scripts/verify-wordbook-markdown.cjs`, `scripts/verify-markdown-review.cjs`, `scripts/verify-review-states.cjs` (enrollment, counts and idle-state actions), and `scripts/verify-learning-browser.cjs --focused`. Run these against a local server with Playwright and Chrome/Chromium available; `PLAYWRIGHT_MODULE`, `CHROME_PATH`, and `PASSAGE_TEST_URL` can override the defaults.

## Data and acknowledgements

Learning records are stored in your **browser's localStorage**, separately for each browser and website origin. Optional Supabase Auth + versioned PostgreSQL snapshots sync the same account across computers, with explicit conflict resolution. Follow [the first-time cloud setup](supabase/README.md); the first migration must use `passage-wordbook-2026-10-14.json` and is verified in the cloud before any device downloads it. The Wordbook's **Export / Import JSON** controls remain available for backups and older records. Dictionary lookup uses [FreeDictionaryAPI.com](https://freedictionaryapi.com/), with definitions sourced from Wiktionary (CC BY-SA 4.0). Markdown rendering uses [markdown-it](https://github.com/markdown-it/markdown-it), distributed under its [MIT license](assets/markdown-it.LICENSE.txt).
