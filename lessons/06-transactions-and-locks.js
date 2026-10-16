// Lesson 6: Transactions, isolation & locks
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "tx",
  n: 6,
  track: "Data",
  mins: 25,
  title: "Transactions, isolation & locks",
  tag: "How two workers manage to charge the same card twice.",
  hook: "Two Sidekiq workers both read 'invoice unpaid'. Both charge the card. The customer paid twice and support is not happy. <mark>Welcome to isolation levels.</mark>",
  steps: [
    {
      k: "read",
      t: "ACID with a billing accent",
      b: "<ul><li><b>Atomicity</b>: the invoice is marked paid and the payment row is inserted together, or neither happens.</li><li><b>Consistency</b>: constraints hold before and after (no negative balance if a CHECK forbids it).</li><li><b>Isolation</b>: concurrent transactions don't see each other's half-done work. <mark>How strictly is configurable</mark>, and that's where the bugs live.</li><li><b>Durability</b>: once committed, a crash won't lose it (write-ahead log).</li></ul>"
    },
    {
      k: "read",
      t: "The anomalies, from mild to sneaky",
      b: "<ul><li><b>Dirty read</b>: you see uncommitted data. Postgres never allows this.</li><li><b>Non-repeatable read</b>: you read a row twice in one transaction and get different values.</li><li><b>Phantom</b>: re-running a query returns new rows.</li><li><b>Lost update</b>: two read-modify-writes and one silently overwrites the other.</li><li><b>Write skew</b>: two transactions each check a condition, then each write, and together they break the rule (two on-call engineers both go off call).</li></ul>",
      table: {
        head: ["Level", "What it adds"],
        rows: [
          ["Read Committed (Postgres default)", "Each statement sees the latest committed data"],
          ["Repeatable Read (MySQL default)", "One snapshot for the whole transaction"],
          [
            "Serializable",
            "As if transactions ran one at a time; may abort with a serialization error, so retry"
          ]
        ]
      }
    },
    {
      k: "mcq",
      q: "What isolation level does PostgreSQL use by default?",
      o: ["Read Uncommitted", "Read Committed", "Repeatable Read", "Serializable"],
      a: 1,
      why: "Read Committed. A transaction alone does <em>not</em> stop two workers from both reading 'unpaid'. MySQL/InnoDB defaults to Repeatable Read."
    },
    {
      k: "read",
      t: "The lost update, in Ruby",
      b: "Read-modify-write in application code is the most common concurrency bug in Rails apps.",
      code: `# Two requests at once. Both read 100, both write 110. One +10 vanishes.
account.balance += 10
account.save!

# Fix 1: atomic update in SQL
Account.update_counters(account.id, balance: 10)

# Fix 2: pessimistic lock (SELECT ... FOR UPDATE)
account.with_lock { account.update!(balance: account.balance + 10) }

# Fix 3: optimistic lock with a lock_version column
# the second save raises ActiveRecord::StaleObjectError → retry`
    },
    {
      k: "read",
      t: "Pessimistic vs optimistic",
      b: "<b>Pessimistic</b>: lock the row up front and make others wait. Good when conflicts are likely and the critical section is short.<br><br><b>Optimistic</b>: don't lock; detect the conflict at write time with a version check and retry. Good when conflicts are rare, like two admins rarely editing the same plan.<br><br>A third option that's often best: a <mark>conditional UPDATE</mark> that only succeeds from the expected state.",
      code: `claimed = Invoice.where(id: id, state: "unpaid")
                 .update_all(state: "charging")
return if claimed.zero?  # someone else got it`
    },
    {
      k: "mcq",
      q: "A counter column is incremented from many workers. Cheapest correct fix?",
      o: [
        "Wrap it in a transaction",
        "<code>update_counters</code> / <code>SET n = n + 1</code> in SQL",
        "Add a Ruby mutex",
        "Use a bigger server"
      ],
      a: 1,
      why: "Let the database do the arithmetic atomically. A transaction at Read Committed doesn't prevent the lost update, and a Ruby mutex only protects one process."
    },
    {
      k: "read",
      t: "Deadlocks and the HTTP-call-in-a-transaction trap",
      b: "<b>Deadlock</b>: T1 locks A and wants B, while T2 locks B and wants A. Postgres detects it and kills one. Prevention: lock rows in a <mark>consistent order</mark>, keep transactions short, and retry the victim.<br><br><b>The trap:</b> calling a payment gateway inside a transaction. You hold row locks for the whole HTTP round trip, and if the transaction rolls back afterward, the charge already happened. A rollback can't un-charge a card.",
      note: "Pattern: claim the work (short transaction) → call the external API (no transaction) → record the result (short transaction). Use an idempotency key on the external call."
    },
    {
      k: "myth",
      q: "Wrapping 'check unpaid, then charge' in a transaction prevents double charges.",
      a: false,
      why: "At Read Committed, both transactions can read 'unpaid' at the same time. You need a lock, a conditional UPDATE, a unique constraint, or Serializable with retries, plus an idempotency key on the gateway call."
    },
    {
      k: "mcq",
      q: "Which situation favors optimistic locking?",
      o: [
        "Thousands of workers hammering the same counter row",
        "Admins occasionally editing the same plan settings",
        "Reserving the last seat on a flight with heavy traffic",
        "Never; always use pessimistic"
      ],
      a: 1,
      why: "Optimistic locking costs nothing until a conflict happens, so it's ideal when conflicts are rare. Under heavy contention you'd spend all your time retrying."
    }
  ],
  interview: {
    q: "How would you guarantee a customer is never charged twice for the same invoice, even with retries, timeouts, and concurrent workers?",
    rubric: [
      "Atomic claim of the work (conditional UPDATE / row lock / state machine)",
      "Idempotency key sent to the payment gateway, derived from invoice + attempt",
      "Unique constraint as a backstop (e.g., one successful payment per invoice)",
      "Never holds a DB transaction open during the external HTTP call",
      "Handles the unknown outcome of a timeout (query gateway / reconcile) instead of blindly retrying",
      "Monitoring/reconciliation job to catch anything that slips"
    ],
    model: "<p><b>Layered defense.</b></p><p>1) <b>Claim atomically:</b> <code>UPDATE invoices SET state='charging' WHERE id=$1 AND state='unpaid'</code>. Zero rows means someone else owns it.</p><p>2) <b>Idempotent external call:</b> send an idempotency key like <code>invoice-123-attempt-1</code>. If the gateway sees it twice, it returns the original result instead of charging again.</p><p>3) <b>Timeouts are 'unknown', not 'failed':</b> on timeout, look the charge up by that key before retrying.</p><p>4) <b>Backstop:</b> a unique index on successful payments per invoice.</p><p>5) <b>No transaction around HTTP.</b> Claim, call, record. Then a <b>reconciliation job</b> compares gateway records with ours nightly.</p>"
  },
  cards: [
    ["Postgres default isolation level", "Read Committed. (MySQL InnoDB: Repeatable Read.)"],
    ["Lost update fix for counters", "Atomic SQL: update_counters / SET n = n + 1."],
    ["Rails pessimistic lock", "with_lock / lock! → SELECT … FOR UPDATE."],
    ["Rails optimistic lock", "lock_version column → StaleObjectError on conflict."],
    [
      "Deadlock prevention",
      "Lock in a consistent order, keep transactions short, retry victims."
    ],
    [
      "Why no HTTP calls inside DB transactions?",
      "Locks held during network I/O, and rollback can't undo the external side effect."
    ]
  ],
  cheat: [
    "ACID's 'I' is configurable. Postgres default is Read Committed.",
    "Read-modify-write in Ruby = lost update. Do the math in SQL.",
    "Conditional UPDATE is a great 'claim' primitive.",
    "Pessimistic for hot rows, optimistic for rare conflicts.",
    "Claim → call API (no tx) → record. Idempotency keys always."
  ]
});
