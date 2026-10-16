# Contributing to Cache Warmup

Thanks for wanting to help. New lessons, better explanations, fixes to wrong facts, and code examples in other languages are all very welcome.

## Getting started

```bash
npm install
npm run dev      # app + AI feedback with hot reload, at http://localhost:5173
npm run check    # formatting, types, and tests: what CI runs
```

## How the project is organized

```
src/
  lessons/            one .mdx file per lesson (most contributions happen here)
  content/            turns MDX into lessons: parse-lesson.ts, the components lessons can use, types
  views/              one component per screen: Home, LessonPlayer, Review, Gym, CheatSheets, Settings
  components/         pieces shared between screens; steps/ has one component per step type
  state/              progress (a reducer saved to localStorage), spaced repetition, levels
  ai/                 talks to the AI server and builds the interviewer prompt
  styles/             design tokens and shared styles; each view keeps its own CSS next to it
server/
  index.mjs           `npm start`: serves the built app and the AI endpoints
  bridge.mjs          the AI endpoints (also mounted by `npm run dev`)
  providers.mjs       Claude Code, Codex, Gemini, OpenCode, Ollama, APIs
  config.mjs          reads and writes cache-warmup.config.json
tests/                Vitest: lessons, progress logic, AI parsing, server rules
```

There's no state library and no router library. Progress is one object behind `useProgress()`, and routes are hash links like `#/lesson/indexes`.

## Writing a lesson

A lesson is a file in `src/lessons/` named with its position on the path, like `15-observability.mdx`. Add the file and it appears on the path.

### Frontmatter

```yaml
---
id: "observability" # unique and permanent: progress is saved under it
title: "Observability that answers questions"
track: "Systems" # Foundations, Data, Systems, or Craft
mins: 25 # honest estimate
tag: "One line that makes someone want to click."
cards: # flashcards, 4–7 of them
  - ["Logs vs metrics vs traces?", "Events vs aggregates vs request paths."]
---
```

### Body

Write it top to bottom. The app splits it into steps:

````mdx
A short scenario that shows why this matters. <mark>Highlight</mark> the key idea.

## Each heading starts a concept card

Plain Markdown: **bold**, `code`, lists, tables, and code blocks.

```ruby
puts "code blocks work as usual"
```

<Note>

A "From the field" aside: a real-world tip or analogy.

</Note>

<Quiz>

The question. It can include code blocks too.

- [ ] A wrong option
- [x] The right option (exactly one `[x]`)
- [ ] Another wrong option

<Why>

Why the right option is right. Worth reading even when you got it right.

</Why>

</Quiz>

<Myth fact={false}>

A confident-sounding statement that's actually wrong.

<Why>

What's really true.

</Why>

</Myth>

<Order>

Put these steps in order.

1. Write the items in the correct order
2. The app shuffles them on screen
3. At least three items

<Why>

Why this order matters.

</Why>

</Order>

<Interview>

An open-ended question an interviewer would really ask.

<Rubric>

- What a strong answer covers (also sent to the AI interviewer)
- One point per line

</Rubric>

<Answer>

A strong answer, in Markdown.

</Answer>

</Interview>

<CheatSheet>

- One-line takeaway
- Four to six of them

</CheatSheet>
````

Leave a blank line after every opening tag and before every closing tag (`<Quiz>`, `<Why>`, and so on). That tells MDX to read what's inside as Markdown.

**One MDX quirk:** `{`, `}` and `<` mean something in MDX. In normal text, put them inside backticks (`` `a < b` ``) or escape them (`\{`). If you forget, the dev server shows an error with the file and line.

If something's off (a missing `<Why>`, no `- [x]` option, a bad `track`), the dev server and `npm test` tell you which file and what to fix.

### Writing lessons people finish

The whole point of this project is that it's **not** a textbook. Some guidelines:

- **Open with a situation, not a definition.** "The query was 4 ms in staging and 9 s in prod" beats "An index is a data structure that…".
- **Keep concept cards short.** If a card needs scrolling, split it under another `##` heading.
- **Explain the trade-off.** Interviews care about "when would you not do this?" as much as "what is it?".
- **Every check teaches.** The `<Why>` should be worth reading even when you got it right.
- **Plain language.** Write it the way you'd explain it to a colleague over coffee.
- **Be accurate.** If a fact depends on a version or vendor, say so ("Postgres defaults to Read Committed; MySQL InnoDB to Repeatable Read").

Extra Interview gym questions live in `src/content/extra-questions.ts`.

## Before opening a pull request

- `npm run dev` and click through your lesson end to end, including every check.
- `npm run check` passes (run `npm run format` to fix formatting).

## Adding an AI provider

Add an entry to `PROVIDERS` in `server/providers.mjs` with `id`, `label`, `usage`, `hint`, `models`, `available()` and `run(prompt, model)`. It shows up in Settings automatically. CLIs must run without tools or file access (see how `claude` and `codex` are called), with arguments passed directly, never through a shell. The server has no dependencies, and we'd like to keep it that way.
