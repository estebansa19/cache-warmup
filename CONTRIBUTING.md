# Contributing to Cache Warmup

Thanks for wanting to help. New lessons, better explanations, fixes to wrong facts, and code examples in other languages are all very welcome.

## Running it locally

```bash
npm start
```

There's no build step and no dependencies. Edit a file, refresh the browser.

## How a lesson is built

Each lesson is one file in `lessons/` that pushes an object onto `window.LESSONS`. `index.html` loads the files with a `<script>` tag each, so a new lesson needs:

1. A file, e.g. `lessons/15-observability.js` (copy an existing one as a starting point).
2. A line in `index.html` next to the others:
   ```html
   <script src="lessons/15-observability.js"></script>
   ```

### Lesson fields

```js
window.LESSONS.push({
  id: "observability",        // unique, short, never change it once published (progress is keyed by it)
  n: 15,                      // order on the path
  track: "Systems",           // Foundations, Data, Systems, or Craft
  mins: 25,                   // honest estimate
  title: "Observability that answers questions",
  tag: "One line that makes someone want to click.",
  hook: "A short scenario that shows why this matters. <mark>Highlight</mark> the key idea.",
  steps: [ /* see below */ ],
  interview: {
    q: "An open-ended question an interviewer would really ask.",
    rubric: ["What a strong answer covers", "..."],   // also sent to the AI interviewer
    model: "<p>A strong answer, in HTML.</p>"
  },
  cards: [["Flashcard front", "Flashcard back"]],     // 5–7 cards
  cheat: ["One-line takeaway", "..."]                 // 4–6 lines, HTML allowed
});
```

### Step kinds

Mix them. A good rhythm is one or two concept cards, then a check.

```js
// A concept card. b is HTML; table, code and note are optional.
{ k: "read", t: "Title", b: "Body with <mark>highlights</mark> and <code>code</code>.",
  table: { head: ["Col A", "Col B"], rows: [["a", "b"]] },
  code: `# shown in a code block, comments are dimmed`,
  note: "A 'From the field' aside: a real-world tip or analogy." }

// Multiple choice. a is the index of the right option (options are shuffled on screen).
{ k: "mcq", q: "Question?", code: `optional snippet`, o: ["A", "B", "C", "D"], a: 1, why: "Why B is right." }

// Myth or fact. a is true for fact, false for myth.
{ k: "myth", q: "A confident-sounding statement.", a: false, why: "Why it's a myth." }

// Put in order. Write items in the correct order; they're shuffled on screen.
{ k: "order", q: "Order these steps.", items: ["First", "Second", "Third"], why: "Why this order." }
```

Extra Interview gym questions live in `lessons/extra-questions.js` as `{ id, topic, q }`.

## Writing lessons people finish

The whole point of this project is that it's **not** a textbook. Some guidelines:

- **Open with a situation, not a definition.** "The query was 4 ms in staging and 9 s in prod" beats "An index is a data structure that…".
- **Keep concept cards short.** If a card needs scrolling, split it.
- **Explain the trade-off.** Interviews care about "when would you not do this?" as much as "what is it?".
- **Every check teaches.** The `why` should be worth reading even when you got it right.
- **Plain language.** Write it the way you'd explain it to a colleague over coffee.
- **Be accurate.** If a fact depends on a version or vendor, say so ("Postgres defaults to Read Committed; MySQL InnoDB to Repeatable Read").

## Before opening a pull request

- Open the app and click through your lesson end to end, including every check.
- Check that `id` is unique and that the new `<script>` tag is in `index.html`.
- Run `node --check lessons/your-file.js` to catch syntax errors.

## Changing the AI bridge

`serve.mjs` has no dependencies, and we'd like to keep it that way. To add a provider, add an entry to the `PROVIDERS` list with `id`, `label`, `usage`, `available()` and `run(prompt)`. CLIs must run without tools or file access (see how `claude` and `codex` are called) and with arguments passed directly, never through a shell.
