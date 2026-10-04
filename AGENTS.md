# Passage Website Development

You are developing an existing educational reading website.

Language

All learner-facing website content must be written in English only.
## Core Principle

Treat every new lesson as part of the existing product, not as a standalone website.

Study the current codebase before making changes. Reuse existing components, layouts, styles, utilities, and interaction patterns whenever possible.

## Lesson Development

When a new article or lesson is provided:

* Understand the lesson structure before implementing the page.
* Preserve the article's paragraph structure and teaching flow.
* Build the page using existing lesson components and design patterns.
* Add new reusable components only when the existing system cannot reasonably support the content.
* Do not redesign shared UI for a single lesson.

## Visual Design

Prioritize readability, comprehension, and visual hierarchy.

* Use generous spacing and clear typography.
* Integrate lesson illustrations where they improve understanding.
* Avoid decorative clutter, excessive cards, unnecessary gradients, or dense UI.
* Images should support the teaching content rather than dominate it.
* Maintain visual consistency across all lessons.
* Ensure layouts work well on desktop and mobile.

## Engineering

* Follow the existing project architecture and conventions.
* Prefer simple, maintainable solutions over lesson-specific hacks.
* Keep content separate from reusable presentation logic where practical.
* Preserve existing functionality unless a change is explicitly required.
* Do not introduce new dependencies unless necessary.
* Avoid duplicating components or styles.

## Before Finishing

Verify the page visually and functionally.

## Course Library and Publishing

For new lessons or deployment changes, read README.md's publishing section. Register each lesson in lessons.json; build the shared catalog with scripts/build-site.mjs. This project publishes all lessons together to the existing cqw241/ielts-passages GitHub Pages site through .github/workflows/pages.yml. Use relative URLs compatible with its project subpath, preserve existing lesson storage keys, and verify the published site after deployment.
