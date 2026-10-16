// Lesson 1: Big-O for people who ship
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "bigo",
  n: 1,
  track: "Foundations",
  mins: 20,
  title: "Big-O for people who ship",
  tag: "Complexity as a growth story, not a math exam.",
  hook: "Your billing report endpoint was fine with 50 brands. Now there are 4,000 and it times out. Nobody touched the code. <mark>The input changed.</mark> Big-O is the tool that predicts that phone call before it happens.",
  steps: [
    {
      k: "read",
      t: "What Big-O actually says",
      b: "Big-O describes <mark>how cost grows as the input grows</mark>. It ignores constants and small terms because, at scale, the shape of the curve wins. It tells you nothing about how fast something is today, only how it ages.",
      table: {
        head: ["Class", "n = 1,000", "Feels like"],
        rows: [
          ["O(1)", "1", "Hash lookup"],
          ["O(log n)", "~10", "Index lookup, binary search"],
          ["O(n)", "1,000", "One pass over the list"],
          ["O(n log n)", "~10,000", "A good sort"],
          ["O(n²)", "1,000,000", "Loop inside a loop"],
          ["O(2ⁿ)", "a number with 301 digits", "Trying every subset"]
        ]
      }
    },
    {
      k: "mcq",
      q: "Roughly what's the complexity here, and what's the cheapest fix?",
      code: `admins = Admin.pluck(:email)          # Array, m items
users.select { |u| admins.include?(u.email) }  # n users`,
      o: [
        "O(n), it's already fine",
        "O(n·m). Make admins a Set, which gets you to O(n + m)",
        "O(log n). Sort users first",
        "O(n²). Can't be improved"
      ],
      a: 1,
      why: "<code>Array#include?</code> scans the whole array, so every user costs m comparisons. <code>admins.to_set</code> makes each lookup O(1) on average. Total: build the set once (m) plus one pass over users (n)."
    },
    {
      k: "read",
      t: "Why hashes feel like magic",
      b: "A hash function turns a key into a bucket number, so a lookup goes straight to the right bucket and never scans. That's <mark>O(1) on average</mark>. Worst case is O(n) when everything collides into one bucket, which good hash functions make vanishingly rare. Ruby's <code>Set</code> is built on <code>Hash</code>, so it gets the same speed.",
      note: "Rule of thumb from code review: if you see <code>.include?</code>, <code>.find</code>, or <code>.detect</code> inside a loop, ask whether a hash or set keyed by that value should exist."
    },
    {
      k: "read",
      t: "log n means halving",
      b: "Every time you can throw away half the remaining work, you're in log territory. Binary search on a billion sorted rows needs about <mark>30 steps</mark>, because 2³⁰ ≈ 1,000,000,000. Database indexes are trees built on this idea, which is why an indexed lookup on 300M rows still feels instant.",
      code: "Math.log2(1_000_000_000) # => 29.897..."
    },
    {
      k: "myth",
      q: "An O(1) operation is always faster than an O(n) one.",
      a: false,
      why: "Big-O hides constants. Scanning an array of 8 items can beat hashing a key, and a cache-friendly linear scan beats pointer-chasing for small n. Big-O tells you who wins eventually, not who wins at n = 8."
    },
    {
      k: "read",
      t: "Amortized: cheap on average, spiky sometimes",
      b: "<code>array &lt;&lt; item</code> is O(1) <mark>amortized</mark>. Most pushes are trivial, but when capacity runs out Ruby allocates a bigger buffer and copies everything, which is O(n). Because capacity grows geometrically, those copies are rare enough that the average per push stays constant.",
      note: "Think of a hotel chain: most weeks you add a room, and occasionally you open a whole new building. Averaged over the year, rooms are cheap to add."
    },
    {
      k: "read",
      t: "The complexity you meet at work",
      b: "In Rails apps the expensive n is rarely CPU. It's <mark>round trips and memory</mark>.<ul><li><b>N+1 queries</b> are O(n) network round trips. <code>includes</code> collapses them into 2 queries.</li><li><code>User.all.each</code> holds every record in memory: O(n) space. <code>find_each</code> keeps it at O(batch size).</li><li>Sorting in Ruby what the database could sort with an index is O(n log n) work you didn't need.</li></ul>"
    },
    {
      k: "mcq",
      q: "You swap <code>User.all.each</code> for <code>User.find_each</code> on 5M rows. What actually improves?",
      o: [
        "Time complexity drops from O(n) to O(log n)",
        "Peak memory: records load in batches of 1,000 instead of all at once",
        "It skips users that haven't changed",
        "Nothing, it's an alias"
      ],
      a: 1,
      why: "You still visit every row, so time stays O(n). The win is space: <code>find_each</code> paginates by primary key, so memory stays flat no matter how big the table gets."
    },
    {
      k: "mcq",
      q: "Find two invoice amounts that sum to a target. The nested loop is O(n²). What's the classic O(n) move?",
      o: [
        "Sort, then nested loop",
        "Walk once and keep a hash of amounts seen. For each x, check whether target − x is already in it",
        "Use recursion",
        "Split the array in half"
      ],
      a: 1,
      why: "Trading memory for time is the most common optimization there is. One pass plus O(1) hash lookups gives O(n) time and O(n) space. (Sort + two pointers also works at O(n log n).)"
    }
  ],
  interview: {
    q: "A nightly job dedupes 2 million subscription events by (account_id, event_type, day) and takes 40 minutes. Walk me through how you'd analyze and speed it up.",
    rubric: [
      "Measures before guessing: profiles, benchmarks, finds where time goes (DB vs Ruby)",
      "Identifies likely quadratic behavior (include?/find in a loop) and states the complexity",
      "Uses a hash/set keyed on the composite tuple for O(n)",
      "Considers pushing the work into SQL (GROUP BY, DISTINCT ON, unique index + upsert)",
      "Watches memory: batches/streams instead of loading 2M records",
      "Mentions verifying correctness and results after the change"
    ],
    model: "<p><b>Measure first.</b> Is it DB time or Ruby time? A quick profile usually shows something like <code>events.find { ... }</code> inside a loop, which makes it O(n²).</p><p><b>Fix the algorithm.</b> Key a <code>Set</code> on <code>[account_id, event_type, day]</code>, one pass, O(n).</p><p><b>Better: let Postgres do it.</b> <code>SELECT DISTINCT ON (account_id, event_type, date_trunc('day', created_at)) ...</code>, or prevent duplicates entirely with a unique index and <code>insert_all ... on conflict do nothing</code>.</p><p><b>Mind memory.</b> Stream with <code>find_each</code>/<code>in_batches</code>. <b>Verify</b> with counts before and after, and keep the old path behind a flag until the numbers match.</p>"
  },
  cards: [
    ["Array#include? complexity", "O(n): it scans every element."],
    ["Set#include? complexity", "O(1) on average. Ruby's Set is backed by a Hash."],
    ["About how many halvings to search 1 billion sorted items?", "~30, since 2³⁰ ≈ 10⁹."],
    [
      "What does 'amortized O(1)' mean for Array#<<?",
      "Occasional O(n) resizes, but growth is geometric, so the average per push is constant."
    ],
    [
      "N+1 queries: complexity in round trips?",
      "O(n) round trips. Eager loading makes it a constant number (usually 2)."
    ],
    [
      "find_each vs each on a big table?",
      "Same O(n) time; find_each keeps memory at O(batch) instead of O(n)."
    ]
  ],
  cheat: [
    "Big-O = how cost grows with n. Shape, not speed.",
    "<code>.include?</code>/<code>.find</code> in a loop → build a hash or set.",
    "log n = halving. 1B items ≈ 30 steps.",
    "Constants matter at small n; Big-O wins at large n.",
    "At work, the costly n is usually round trips and memory."
  ]
});
