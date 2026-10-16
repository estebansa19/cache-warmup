// Lesson 5: Indexes & query plans
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "indexes",
  n: 5,
  track: "Data",
  mins: 25,
  title: "Indexes & query plans",
  tag: "Why the same SQL is 4 ms in staging and 9 s in prod.",
  hook: "A query runs in 4 ms in staging and 9 seconds in production. Same SQL, same code. <mark>Different data, so a different plan.</mark> This lesson is about reading what the database decided and nudging it toward a better choice.",
  steps: [
    {
      k: "read",
      t: "What an index really is",
      b: "A B-tree index is a <mark>sorted copy of some columns, with pointers back to the rows</mark>. Because it's sorted and wide (hundreds of keys per page), it's usually only 3–4 levels deep even for hundreds of millions of rows. That's the log n from lesson 1, on disk.<br><br>The cost: every insert or update maintains every index, and indexes take space and memory. More indexes means slower writes."
    },
    {
      k: "read",
      t: "Composite indexes and the leftmost prefix",
      b: "An index on <code>(account_id, created_at)</code> is sorted by account first, then by date within each account. Think of a phone book sorted by last name, then first name.",
      table: {
        head: ["Query", "Uses the index well?"],
        rows: [
          ["WHERE account_id = 7", "Yes (leftmost column)"],
          ["WHERE account_id = 7 ORDER BY created_at", "Yes, rows come out pre-sorted"],
          ["WHERE account_id = 7 AND created_at > '2026-01-01'", "Yes: equality, then range"],
          ["WHERE created_at > '2026-01-01'", "Usually no, it skips the leading column"]
        ]
      },
      note: "Rule: equality columns first, range or sort column last. PostgreSQL 18 added skip scan, which can rescue some leading-column-skipped queries, but don't design around it."
    },
    {
      k: "mcq",
      q: "Index on <code>(status, account_id)</code>. Which query is it worst for?",
      o: [
        "WHERE status = 'open' AND account_id = 9",
        "WHERE status = 'open'",
        "WHERE account_id = 9",
        "WHERE status IN ('open','late') AND account_id = 9"
      ],
      a: 2,
      why: "The index is sorted by status first, so finding one account means looking inside every status group. Flip the order, or add an index that leads with account_id."
    },
    {
      k: "read",
      t: "Reading EXPLAIN without fear",
      b: "<code>EXPLAIN ANALYZE</code> runs the query and shows the plan with real timings. What to look for:<ul><li><b>Seq Scan</b>: reads the whole table. Fine for small tables, bad on big ones.</li><li><b>Index Scan / Index Only Scan</b>: uses the index; 'only' means it never touches the table.</li><li><b>Bitmap Heap Scan</b>: collects matches from the index, then fetches pages in bulk.</li><li><mark>Estimated rows vs actual rows</mark>: a big gap means stale statistics, so run <code>ANALYZE</code>.</li></ul>",
      code: `EXPLAIN ANALYZE SELECT * FROM invoices WHERE account_id = 42;
-- Index Scan using index_invoices_on_account_id on invoices
--   (cost=0.57..812.33 rows=210 width=96)
--   (actual time=0.031..0.402 rows=198 loops=1)`
    },
    {
      k: "read",
      t: "Why the planner ignores your index",
      b: "<ul><li><b>Low selectivity</b>: <code>status</code> has 3 values and 'open' is 60% of rows, so scanning is cheaper.</li><li><b>Function on the column</b>: <code>WHERE lower(email) = ?</code> can't use an index on <code>email</code>. You need an expression index on <code>lower(email)</code>, or <code>citext</code>.</li><li><b>Leading wildcard</b>: <code>LIKE '%son'</code> can't walk a B-tree. Use a <code>pg_trgm</code> GIN index.</li><li><b>Type mismatch</b>: comparing a text column to an integer forces a cast.</li><li><b>Tiny table</b>: a Seq Scan is honestly faster.</li></ul>"
    },
    {
      k: "mcq",
      q: "There's an index on <code>users.email</code>. This query still Seq Scans: <code>WHERE lower(email) = 'a@b.co'</code>. Why?",
      o: [
        "Postgres is broken",
        "The index stores raw email; lower(email) is a different expression. You need an index on lower(email)",
        "Strings can't be indexed",
        "It needs a LIMIT"
      ],
      a: 1,
      why: "An index matches the expression it was built on. <code>add_index :users, \"lower(email)\"</code>, or the citext type, fixes it."
    },
    {
      k: "read",
      t: "Indexes as tools, not just speed",
      b: "<ul><li><b>Unique index</b>: the only real guarantee of uniqueness. <code>validates :uniqueness</code> races under concurrency.</li><li><b>Partial index</b>: <code>WHERE deleted_at IS NULL</code> or <code>WHERE status = 'past_due'</code>. Smaller and hotter.</li><li><b>Covering index</b>: <code>INCLUDE (amount)</code> enables index-only scans.</li><li><b>GIN</b>: jsonb, arrays, full-text, trigram.</li></ul>On a big production table, build indexes <mark>concurrently</mark> so writes aren't blocked:",
      code: `class AddIndexToInvoices < ActiveRecord::Migration[7.1]
  disable_ddl_transaction!
  def change
    add_index :invoices, [:account_id, :due_on],
      where: "status = 'past_due'", algorithm: :concurrently
  end
end`
    },
    {
      k: "myth",
      q: "<code>validates :email, uniqueness: true</code> guarantees no duplicate emails.",
      a: false,
      why: "Two requests can both run the SELECT check, both see nothing, and both INSERT. Only a unique index makes the database refuse the second one. Keep the validation for friendly errors and add the index for correctness."
    },
    {
      k: "order",
      q: "Put these steps for debugging a slow query in order.",
      items: [
        "Reproduce it with EXPLAIN (ANALYZE, BUFFERS) on production-like data",
        "Compare estimated vs actual rows; refresh stats if they're far off",
        "Check which predicates and sort lack a matching index",
        "Add or adjust the index (concurrently in prod)",
        "Re-run the plan and measure p95 latency"
      ],
      why: "Measure → understand the planner's view → change one thing → verify. Skipping straight to 'add an index' is how tables end up with 14 unused indexes."
    }
  ],
  interview: {
    q: "This is slow on a 300M-row table: SELECT * FROM invoices WHERE account_id = $1 AND status = 'past_due' ORDER BY due_on DESC LIMIT 20. How do you fix it?",
    rubric: [
      "Starts with EXPLAIN ANALYZE rather than guessing",
      "Proposes a composite index with equality columns first and the sort column last",
      "Considers a partial index on status = 'past_due' (small and hot)",
      "Builds it concurrently in production; considers write cost",
      "Questions SELECT * / suggests a covering index if useful; verifies afterward"
    ],
    model: "<p><b>Look first:</b> <code>EXPLAIN (ANALYZE, BUFFERS)</code>. Probably a scan on <code>account_id</code> followed by filtering and sorting thousands of rows.</p><p><b>Index:</b> equality columns first, sort last: <code>(account_id, status, due_on DESC)</code>. If past-due is a small slice, a partial index is better: <code>(account_id, due_on DESC) WHERE status = 'past_due'</code>. It's tiny, stays in memory, and the rows come out pre-sorted, so LIMIT 20 stops after 20.</p><p><b>Ship safely:</b> <code>CREATE INDEX CONCURRENTLY</code>, check for unused indexes, re-run the plan, watch p95. Drop <code>SELECT *</code> if the caller only needs a few columns.</p>"
  },
  cards: [
    ["Composite index column order rule", "Equality columns first, range/sort column last."],
    [
      "Index on (a, b): does WHERE b = ? use it well?",
      "Usually no, because of the leftmost prefix rule."
    ],
    ["Estimated rows ≫ actual rows in EXPLAIN means…", "Stale statistics. Run ANALYZE."],
    [
      "Why does WHERE lower(email) = ? skip the email index?",
      "Different expression. Needs an expression index or citext."
    ],
    ["Only real guarantee of uniqueness?", "A unique index (validations race)."],
    [
      "Add an index to a huge prod table safely in Rails?",
      "algorithm: :concurrently + disable_ddl_transaction!"
    ]
  ],
  cheat: [
    "Index = sorted copy of columns. Reads get faster, writes slower.",
    "Equality first, range/sort last.",
    "EXPLAIN ANALYZE: compare estimates vs actual.",
    "Functions on columns and leading wildcards kill index use.",
    "Partial, unique, covering, GIN. Build concurrently."
  ]
});
