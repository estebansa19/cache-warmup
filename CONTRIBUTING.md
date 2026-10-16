# Contributing to Cache Warmup

Thanks for wanting to help. New lessons, better explanations, fixes to wrong facts, and code examples in other languages are all very welcome.

## Getting started

```bash
npm install
npm run dev      # app + AI feedback with hot reload, at http://localhost:5173
npm run check    # formatting, types, and tests
npm run build    # the production build; CI runs `npm run check`, then this
```

## How the project is organized

```
src/
  lessons/            one .mdx file per lesson (most contributions happen here)
  content/            turns MDX into lessons: parse-lesson.ts, the frontmatter schema, the
                      build-time lesson check (check-lesson.ts), the components lessons can use, types
  views/              one component per screen: Home, LessonPlayer, Review, Gym, CheatSheets, Settings
  components/         pieces shared between screens; steps/ has one component per step type
  state/              progress (a reducer saved to localStorage), spaced repetition, levels
  ai/                 talks to the AI server and reads the feedback it sends back
  styles/             design tokens and shared styles; each view keeps its own CSS next to it
server/               plain JavaScript with no dependencies, type-checked through JSDoc comments
  index.mjs           `npm start`: serves the built app and the AI endpoints
  static.mjs          serves dist/ (security headers, no hidden files)
  bridge.mjs          the AI endpoints (also mounted by `npm run dev`)
  prompt.mjs          the interviewer prompt, built from the question, rubric, answer, and "About you"
  providers.mjs       Claude Code, Codex, Gemini, OpenCode, Ollama, APIs
  options.mjs         flags and environment variables, shared by `npm start` and `npm run dev`
  config.mjs          reads and writes cache-warmup.config.json
tests/                Vitest: lessons, the lesson parser, progress logic, AI parsing, the servers
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

Put each tag (`<Quiz>`, `<Why>`, and so on) on its own line, with a blank line between it and the Markdown next to it. Content on the same line as a tag isn't read as Markdown, and without the blank line a tag can be swallowed by the block before it: a `<Why>` right after the last option ends up inside that option. Blank lines between quiz options are fine. Don't indent the content inside tags; MDX doesn't need it, and the files stay easier to read.

Each check gets an id that answers are saved under: a hash of its text. If you reword a check that's already published, give it an id first so people keep their answers: `<Quiz id="covering-index">` (lowercase letters, digits and dashes, starting with a letter). Flashcards are saved under their front, so fixing a typo on a card's front resets that one card.

**One MDX quirk:** `{`, `}` and `<` mean something in MDX. In normal text, put them inside backticks (`` `a < b` ``) or escape them (`\{`). If you forget, the dev server shows an error with the file and line.

If something's off (a missing `<Why>`, no `- [x]` option, a bad `track`), the dev server's error overlay shows the file, the line, and what to fix, and `npm run build` fails with the same message. A few problems are only found when the lesson is turned into steps (like a missing `<Interview>`, or text after a quiz without a `## heading`): those show up in `npm test` and in the browser console.

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

Add an entry to `PROVIDERS` in `server/providers.mjs` with `id`, `label`, `usage`, `hint`, `models`, `available()` and `run(prompt, model, signal)`. Set `needsModel: true` if it can't run without a model name; "auto" then skips it. It shows up in Settings automatically.

For a CLI, use `runCli`: it passes arguments directly (never through a shell), sends the prompt on stdin, runs in an empty temporary folder, and stops the tool when `signal` aborts. Turn off every tool the CLI documents a way to turn off, check the result with the CLI's own help or debug commands, and say in the README what's left when a tool can't be fully turned off. Pass the model as one `--model=value` argument. If an environment variable would quietly switch the CLI from the user's plan to API credits, remove it with `dropEnv`. The server has no dependencies, and we'd like to keep it that way.
