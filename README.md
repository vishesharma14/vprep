# vprep

Exam-preparation platform. This repo is currently the **foundation only**: routing, layout, design tokens, UI primitives, domain types, the database schema and the Neon client. No features yet.

## Stack

- React 18 + TypeScript, built with Vite
- Tailwind CSS v4 via the `@tailwindcss/vite` plugin (no `tailwind.config.js`; tokens live in `src/index.css`)
- React Router
- [Neon](https://neon.tech): Postgres, with Neon Auth for sign-in and the Neon Data API for queries from the browser, through `@neondatabase/neon-js`

## Setup

Requires Node.js `^20.19.0` or `>=22.12.0`.

### 1. Set up the Neon database

Do this once per Neon project, in the [Neon Console](https://console.neon.tech), in this order. The schema script checks that steps 1 and 2 are done and stops with a clear message if they aren't.

1. **Enable Neon Auth.** Open **Auth** and click **Enable Auth**.
2. **Enable the Data API.** Open **Data API**, tick **Use Neon Auth**, and click **Enable Data API**.
3. **Create the schema.** Open the **SQL Editor**, paste in all of [`db/migrations/0001_schema.sql`](db/migrations/0001_schema.sql) and run it. It creates the tables, Row Level Security policies, views and functions in one transaction, so if it fails nothing is created and you can run it again after fixing the problem.
4. **Load the seed data.** In the SQL Editor, run all of [`db/seed.sql`](db/seed.sql). It adds 7 exams with their subjects and topics, 27 formulas and 54 published questions. Run it only once: a second run fails on duplicate slugs and changes nothing.
5. **Add the catalog views.** In the SQL Editor, run all of [`db/migrations/0002_catalog_views.sql`](db/migrations/0002_catalog_views.sql). It adds the read-only `topic_catalog` and `my_topic_progress` views that the Home and Exams pages read.

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

## Scripts

| Command           | What it does                         |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server with HMR        |
| `npm run build`   | Type-check, then build to `dist/`    |
| `npm run preview` | Serve the production build locally   |
| `npm run lint`    | Lint with oxlint                     |

## Project structure

```
db/
  migrations/    0001_schema.sql (tables, RLS, views, functions)
                 0002_catalog_views.sql (topic_catalog, my_topic_progress)
  seed.sql       Exams, subjects, topics, formulas, questions
src/
  components/
    ui/          Button, Card, Tag, Bubble (OMR-style option circle), Notice,
                 Disclosure (closed-by-default toggle), Tabs, FilterChips,
                 form fields, icons
    layout/      AppShell (sidebar on desktop, bottom tab bar on mobile),
                 PageHeader, nav config
    practice/    QuestionScreen, OptionList, Summary, status labels and colours,
                 BookmarkButton, ReportProblem (report form)
  pages/         One component per route
  lib/           neon.ts (Neon Auth + Data API client), attempts.ts (attempt
                 statuses and saving), reports.ts (report reasons and
                 sending), cx.ts (class-name helper)
  types/         One interface per table, view and function result,
                 plus a union type for every CHECK constraint
  auth/          AuthProvider, useAuth, RequireAuth
  hooks/         useExamCatalog, useTopicProgress, usePracticeSet, useAsync,
                 useBookmarks (shared bookmark store, optimistic updates)
  App.tsx        Router
  index.css      Tailwind import + design tokens
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
| `/leaderboard`   | Leaderboard |
| `/search`        | Search      |
| `/admin`         | Admin       |
| `/account`       | Account     |

Unknown paths redirect to `/`.

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
