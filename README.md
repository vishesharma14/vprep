# vprep

[![CI](https://github.com/vishesharma14/vprep/actions/workflows/ci.yml/badge.svg)](https://github.com/vishesharma14/vprep/actions/workflows/ci.yml)

Exam-preparation platform. This repo is currently the **foundation only**: routing, layout, design tokens, UI primitives, domain types, the database schema and the Neon client. No features yet.

## Stack

- React 18 + TypeScript, built with Vite
- Tailwind CSS v4 via the `@tailwindcss/vite` plugin (no `tailwind.config.js`; tokens live in `src/index.css`)
- React Router
- [Neon](https://neon.tech): Postgres, with Neon Auth for sign-in and the Neon Data API for queries from the browser, through `@neondatabase/neon-js`

## Setup

Requires Node.js `^22.12.0` or `>=24.0.0` (Vitest needs it for `npm test`). CI uses Node 22.

### 1. Set up the Neon database

Do this once per Neon project, in the [Neon Console](https://console.neon.tech), in this order. The schema script checks that steps 1 and 2 are done and stops with a clear message if they aren't.

1. **Enable Neon Auth.** Open **Auth** and click **Enable Auth**.
2. **Enable the Data API.** Open **Data API**, tick **Use Neon Auth**, and click **Enable Data API**.
3. **Create the schema.** Open the **SQL Editor**, paste in all of [`db/migrations/0001_schema.sql`](db/migrations/0001_schema.sql) and run it. It creates the tables, Row Level Security policies, views and functions in one transaction, so if it fails nothing is created and you can run it again after fixing the problem.
4. **Load the seed data.** In the SQL Editor, run all of [`db/seed.sql`](db/seed.sql). It adds 7 exams with their subjects and topics, 27 formulas and 54 published questions. Run it only once: a second run fails on duplicate slugs and changes nothing.
5. **Run migrations 0002–0008.** In the SQL Editor, run each file below in full, once, in this order:

   | Migration | What it adds |
   | --------- | ------------ |
   | [`0002_catalog_views.sql`](db/migrations/0002_catalog_views.sql) | `topic_catalog` and `my_topic_progress` views, read by Home and Exams |
   | [`0003_auth_debug.sql`](db/migrations/0003_auth_debug.sql) | `auth_debug()`, which the app calls to log why the database rejected a signed-in request |
   | [`0004_fix_current_user_id.sql`](db/migrations/0004_fix_current_user_id.sql) | A fix so `current_user_id()` reliably sees the signed-in user |
   | [`0005_my_progress.sql`](db/migrations/0005_my_progress.sql) | `my_progress()`, for the Progress page and Home |
   | [`0006_search_formulas.sql`](db/migrations/0006_search_formulas.sql) | `search_questions()`, the `formula_catalog` view, and a leaderboard fix |
   | [`0007_admin.sql`](db/migrations/0007_admin.sql) | `admin_users()` and `admin_question_stats()` for the admin panel, and a block on deleting questions that have attempts |
   | [`0008_leaderboard_privacy.sql`](db/migrations/0008_leaderboard_privacy.sql) | A new `get_leaderboard()` for the public leaderboard: short names ("Vishesh S.") and `is_me` instead of full names and account ids, and no learners with 0 points |

The full order is: `0001_schema.sql`, `seed.sql`, then `0002` to `0008`.

### 2. Run the app

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env
#    then set VITE_NEON_AUTH_URL (Neon Console -> Auth)
#    and VITE_NEON_DATA_API_URL (Neon Console -> Data API)

# 3. Start the dev server
npm run dev
```

If everything is set up, the Home page lists five goals (Government, Engineering, Medical, Placement, Certification) with their exam and question counts. If something is missing, it shows the error and a Retry button instead.

`.env` is gitignored, so don't commit it. Both URLs end up in the browser bundle. That's expected: the Data API is public, and the Row Level Security policies in the schema decide what each request can see. Signed-out visitors get an anonymous token (`allowAnonymous: true` in `src/lib/neon.ts`), which lets them read exams, subjects, topics, formulas and published questions, and nothing else.

`src/lib/neon.ts` throws a clear error at startup if either variable is missing.

### 3. Deploy to Vercel

1. **Import the repo** in Vercel. It detects Vite: the build command is `npm run build` and the output directory is `dist`.
2. **Set the environment variables.** In the project's **Settings -> Environment Variables**, add `VITE_NEON_AUTH_URL` and `VITE_NEON_DATA_API_URL`, with the same values as in `.env`. Vite writes them into the bundle at build time, so after adding or changing one, redeploy. If either is missing, the deployed site is a blank page and the browser console shows the error from `src/lib/neon.ts`.
3. **Allow the domain in Neon Auth.** In the Neon Console, open **Auth -> Configuration -> Domains** and add the Vercel domain (for example `https://vprep.vercel.app`). Until you do, sign-in and sign-up fail on the deployed site. Preview deployments have their own URLs; add those too if you want to sign in on them.
4. **Turn on Web Analytics.** In the Vercel project, open **Analytics** and click **Enable**. The app renders `<Analytics />` from `@vercel/analytics` in production builds only, so `npm run dev` sends nothing.

**Link previews.** `index.html` has Open Graph and Twitter tags pointing at `https://vprep-umber.vercel.app/og-image.png`; change those URLs if the domain changes. The image, [`public/og-image.png`](public/og-image.png), is a headless Chrome screenshot of [`scripts/og-image.html`](scripts/og-image.html); the command to make it again is at the top of that file.

[`vercel.json`](vercel.json) does two things:

- **Deep links work.** Every path outside `/assets/` is served `index.html`, so opening `/exams/ssc-cgl` or `/admin?tab=users` directly (or reloading on it) loads the app, which then shows that page. Unknown paths show the app's Page not found page.
- **Built files are cached for a year.** Files in `/assets/` have a content hash in their name, so they get `Cache-Control: public, max-age=31536000, immutable`. `index.html` keeps Vercel's default (revalidate on every visit), so a new deploy shows up on the next page load.

If a learner has the site open during a deploy and opens a page that hasn't loaded yet, its old file may be gone; the page shows "Couldn't load this page" and Retry reloads the app.

### 4. Before launch: remove test data

[`db/cleanup/`](db/cleanup/) holds two one-off scripts that delete the content added while testing. Run them by hand in the SQL Editor, only before launch, in this order:

1. [`cleanup_1_preview.sql`](db/cleanup/cleanup_1_preview.sql) changes nothing. It lists what part 2 will delete: questions added after the seed (above Q1054), every problem report, and exams, subjects, topics and formulas that aren't in `seed.sql`. Its last rows list learners, for information only; they are never deleted.
2. [`cleanup_2_delete.sql`](db/cleanup/cleanup_2_delete.sql) deletes exactly that, in one transaction. Run it only if nothing in the preview is real content you want to keep. If any step fails (for example, a test question that learners have attempted), nothing is deleted. Its last query counts what is left: 7 exams, 17 subjects, 32 topics, 27 formulas, 54 questions and 0 reports.

## Scripts

| Command           | What it does                         |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server with HMR        |
| `npm run build`   | Type-check, then build to `dist/`    |
| `npm run preview` | Serve the production build locally   |
| `npm run lint`    | Lint with oxlint                     |
| `npm test`        | Run the unit tests once with Vitest  |

Tests sit next to the code they test (`src/lib/slug.test.ts` for `src/lib/slug.ts`) and run in Node with no `.env` and no network: [`src/test/setup.ts`](src/test/setup.ts) swaps the Neon client for a stand-in that fails any test that calls it. [GitHub Actions](.github/workflows/ci.yml) runs lint, tests and build on every push and pull request to `main`.

## Project structure

```
.github/
  workflows/     ci.yml: lint, test and build on push and pull request
db/
  migrations/    0001_schema.sql (tables, RLS, views, functions)
                 0002_catalog_views.sql (topic_catalog, my_topic_progress)
                 0003_auth_debug.sql, 0004_fix_current_user_id.sql
                 0005_my_progress.sql, 0006_search_formulas.sql
                 0007_admin.sql, 0008_leaderboard_privacy.sql
  cleanup/       One-off scripts to delete test data before launch
  seed.sql       Exams, subjects, topics, formulas, questions
scripts/
  og-image.html  Template for public/og-image.png, the link preview image
src/
  components/
    ui/          Button, Card, Tag, Bubble (OMR-style option circle), Notice,
                 Disclosure (closed-by-default toggle), Tabs, FilterChips,
                 form fields, icons
    layout/      AppShell (sidebar on desktop, bottom tab bar on mobile),
                 PageHeader, nav config, ErrorBoundary ("Something went
                 wrong" screen)
    practice/    QuestionScreen, OptionList, Summary, status labels and colours,
                 BookmarkButton, ReportProblem (report form)
    admin/       AdminOverview, QuestionList, QuestionEditor, QuestionPreview,
                 TaxonomyTree (exams > subjects > topics), FormulaManager,
                 ReportList, UserList, ScrollTable (table with pinned actions)
  pages/         One component per route
  lib/           neon.ts (Neon Auth + Data API client), attempts.ts (attempt
                 statuses and saving), reports.ts (report reasons and
                 sending), cx.ts (class-name helper)
  types/         One interface per table, view and function result,
                 plus a union type for every CHECK constraint
  auth/          AuthProvider, useAuth, RequireAuth
  hooks/         useExamCatalog, useTopicProgress, usePracticeSet, useAsync,
                 useBookmarks (shared bookmark store, optimistic updates)
  test/          Test setup (Neon client stand-in) and fixtures
  App.tsx        Router; every page except Home is loaded on demand
  index.css      Tailwind import + design tokens
vercel.json      SPA rewrite and cache headers for Vercel
```

## Routes

| Path             | Page        |
| ---------------- | ----------- |
| `/`              | Home        |
| `/exams`         | Exams       |
| `/exams/:slug`   | ExamDetail  |
| `/practice`      | Practice: one of `?topic=<id>`, `?subject=<id>`, `?exam=<slug>`, `?ids=<id,id,…>`, `?q=<id>` |
| `/test`          | TimedTest   |
| `/result`        | Result      |
| `/revision`      | Revision: bookmarks, or `?tab=mistakes` |
| `/formulas`      | Formulas    |
| `/progress`      | Progress    |
| `/leaderboard`   | Leaderboard, open to signed-out visitors: Global, or `?scope=country` / `?scope=state` (signed in). Names show as first name and last initial, and learners join once they have points |
| `/search`        | Search      |
| `/admin`         | Admin (admins only, loaded on demand): `?tab=overview`, `?tab=questions` (with `q`, `exam`, `status`, `sort`), `?tab=edit` for a new question or `?tab=edit&id=<id>`, `?tab=taxonomy` (exams and topics), `?tab=formulas`, `?tab=reports`, `?tab=users` |
| `/account`       | Account     |

Any other path shows Page not found.

## Design tokens

Tokens are defined with `@theme` in `src/index.css`. Each one is a CSS variable (`var(--color-pen)`) and a Tailwind utility (`bg-pen`, `text-drop/80`). Dark mode follows the OS `prefers-color-scheme` setting.

| Token   | Light     | Dark      | Use                                |
| ------- | --------- | --------- | ---------------------------------- |
| `paper` | `#f5f6fa` | `#10121b` | Page background                    |
| `sheet` | `#ffffff` | `#171a26` | Cards and surfaces                 |
| `ink`   | `#151829` | `#e7e8f0` | Text                               |
| `drop`  | `#c4465f` | `#ee8aa0` | Structure and labels (rose)        |
| `pen`   | `#2441a6` | `#8fa3ff` | User actions (ballpoint blue)      |
| `ok`    | `#137a5a` | `#4cc49a` | Correct / success                  |
| `bad`   | `#b3261e` | `#f2867c` | Incorrect / error                  |
| `warn`  | `#935605` | `#e3a64f` | Warnings                           |

Fonts (Google Fonts, loaded in `index.html`):

- `font-display`: Familjen Grotesk, for headings (applied to `h1`–`h6` automatically)
- `font-sans`: Atkinson Hyperlegible, for body text (the default)
- `font-mono`: IBM Plex Mono, for labels, numbers and timers
