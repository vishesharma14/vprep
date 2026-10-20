# vprep

Exam-preparation platform. This repo is currently the **foundation only**: routing, layout, design tokens, UI primitives, domain types and the Supabase client. No features yet.

## Stack

- React 18 + TypeScript, built with Vite
- Tailwind CSS v4 via the `@tailwindcss/vite` plugin (no `tailwind.config.js`; tokens live in `src/index.css`)
- React Router
- Supabase JS client

## Setup

Requires Node.js `^20.19.0` or `>=22.12.0`.

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env
#    then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
#    (from your Supabase project's API settings)

# 3. Start the dev server
npm run dev
```

`.env` is gitignored, so don't commit real keys. The anon key ends up in the browser bundle. That's expected for Supabase, but it means every table needs Row Level Security policies.

The app runs without `.env` until something imports `src/lib/supabase.ts`. From then on, missing variables throw a clear error at startup.

## Scripts

| Command           | What it does                         |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server with HMR        |
| `npm run build`   | Type-check, then build to `dist/`    |
| `npm run preview` | Serve the production build locally   |
| `npm run lint`    | Lint with oxlint                     |

## Project structure

```
src/
  components/
    ui/          Button, Card, Tag, Bubble (OMR-style option circle)
    layout/      AppShell (sidebar on desktop, bottom tab bar on mobile),
                 PageHeader, nav config
  pages/         One component per route (title only for now)
  lib/           supabase.ts (client), cx.ts (class-name helper)
  types/         Exam, Subject, Topic, Question, Attempt, AttemptStatus
  hooks/         (empty)
  App.tsx        Router
  index.css      Tailwind import + design tokens
```

## Routes

| Path             | Page        |
| ---------------- | ----------- |
| `/`              | Home        |
| `/exams`         | Exams       |
| `/exams/:examId` | ExamDetail  |
| `/practice`      | Practice    |
| `/test`          | TimedTest   |
| `/result`        | Result      |
| `/revision`      | Revision    |
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
