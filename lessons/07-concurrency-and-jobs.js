// Lesson 7: Concurrency, jobs & idempotency
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "jobs",
  n: 7,
  track: "Systems",
  mins: 25,
  title: "Concurrency, jobs & idempotency",
  tag: "At-least-once means sometimes twice.",
  hook: "Sidekiq promises at-least-once delivery. Read that again: <mark>at LEAST once</mark>. Every job you write will eventually run twice. The only question is whether that's harmless.",
  steps: [
    {
      k: "read",
      t: "Concurrency vs parallelism (and the GVL)",
      b: "<b>Concurrency</b>: juggling several tasks over time. <b>Parallelism</b>: literally running them at the same instant.<br><br>CRuby has a <mark>Global VM Lock</mark>: only one thread runs Ruby code at a time per process. But threads release it while waiting on I/O (DB, HTTP, Redis), so threads still help a lot for typical Rails work. For CPU-heavy work you need more processes.",
      note: "That's why Puma has workers (processes, true parallelism) × threads (overlap I/O waits), and why Sidekiq runs many threads per process."
    },
    {
      k: "mcq",
      q: "A Sidekiq process with 10 threads is resizing images (pure CPU, in Ruby). Adding threads barely helps. Why?",
      o: [
        "Redis is slow",
        "The GVL: only one thread executes Ruby at a time, and CPU work never releases it",
        "Sidekiq caps at 10",
        "Images are cached"
      ],
      a: 1,
      why: "Threads overlap waiting, not computing. For CPU-bound work, run more processes (or push the work into a C extension or library that releases the GVL)."
    },
    {
      k: "read",
      t: "Race conditions: check-then-act",
      b: "Most races look like this: <em>check</em> a condition, then <em>act</em> on it, with a gap in between where the world changes.",
      code: `# Race: two threads both see nil, both create
setting = Setting.find_by(key: k) || Setting.create!(key: k)

# Better: let a unique index arbitrate
Setting.create_or_find_by!(key: k)

# Also a race: memoizing into shared class state across threads
@@rates ||= expensive_load  # use a Mutex or load at boot`
    },
    {
      k: "read",
      t: "Delivery guarantees",
      b: "<ul><li><b>At-most-once</b>: fire and forget. Might be lost, never duplicated.</li><li><b>At-least-once</b>: retried until acknowledged. Never lost, sometimes duplicated. This is Sidekiq, SQS, and most webhooks.</li><li><b>Exactly-once</b>: across a network, mostly a myth. What you can build is <mark>effectively-once = at-least-once + idempotent handling</mark>.</li></ul>"
    },
    {
      k: "myth",
      q: "Sidekiq runs each job exactly once.",
      a: false,
      why: "A worker can crash after doing the work but before acknowledging it, a deploy can kill a running job, or a retry can fire after partial success. Design every job to be safe to run twice."
    },
    {
      k: "read",
      t: "Making things idempotent",
      b: "Idempotent means doing it twice has the same effect as doing it once.<ul><li><b>Natural keys + unique index</b>: one shipment label per (order_id, attempt).</li><li><b>Idempotency keys</b> for external APIs.</li><li><b>Upserts</b>: <code>upsert_all</code> / <code>ON CONFLICT</code>.</li><li><b>Set absolute values, not deltas</b>: <code>credits = 50</code> is idempotent; <code>credits += 5</code> isn't.</li><li><b>State machines</b>: transitions only from the expected state.</li></ul>"
    },
    {
      k: "mcq",
      q: "Which job is safe to run twice?",
      o: [
        "<code>user.increment!(:credits, 5)</code>",
        "<code>user.update!(plan: \"pro\", credits: 50)</code>",
        "<code>Mailer.welcome(user).deliver_now</code>",
        "<code>Payment.create!(amount: 10, user: user)</code>"
      ],
      a: 1,
      why: "Setting absolute values gives the same result no matter how many times it runs. Incrementing, sending, and inserting all compound on retry unless guarded."
    },
    {
      k: "read",
      t: "Retries done right",
      b: "<ul><li><b>Exponential backoff with jitter</b>: wait 1s, 2s, 4s… plus randomness, so 10,000 failed jobs don't all retry in the same second (a thundering herd).</li><li><b>Don't retry what can't succeed</b>: a 422 won't fix itself, so send it to the dead set and alert.</li><li><b>Timeouts on everything</b>: a hung HTTP call holds a thread forever.</li><li><b>Enqueue after commit</b>: a job enqueued inside a transaction can run before the commit and hit <code>RecordNotFound</code>.</li></ul>"
    },
    {
      k: "mcq",
      q: "<code>after_create { ChargeJob.perform_later(id) }</code>. The job sometimes fails with RecordNotFound. Why?",
      o: [
        "Redis lost the job",
        "The job ran before the surrounding transaction committed, so the row wasn't visible yet",
        "IDs are reused",
        "Sidekiq is out of threads"
      ],
      a: 1,
      why: "<code>after_create</code> runs inside the transaction. Use <code>after_commit</code> (or Rails' option to defer Active Job enqueues until commit) so the worker can see the row."
    },
    {
      k: "mcq",
      q: "Why add jitter to exponential backoff?",
      o: [
        "Makes logs prettier",
        "Spreads retries out so failed jobs don't hammer the recovering service at the same instant",
        "Required by HTTP",
        "Reduces memory"
      ],
      a: 1,
      why: "Without jitter, everything that failed together retries together, and the service that just came back up falls over again."
    }
  ],
  interview: {
    q: "A carrier sends tracking webhooks that can arrive more than once and out of order. Design the handler.",
    rubric: [
      "Verifies authenticity (HMAC signature, timing-safe compare)",
      "Persists the raw event with a unique provider event ID to dedupe",
      "Acknowledges fast (2xx) and processes asynchronously",
      "Handles ordering: compares event timestamps/sequence, or a state machine that ignores regressions",
      "Idempotent processing, retries with backoff, dead-letter + alerting",
      "Observability: metrics on lag, failures, duplicates"
    ],
    model: "<p><b>1. Verify:</b> check the HMAC signature (timing-safe) and reject otherwise.</p><p><b>2. Store, then ack:</b> insert into <code>carrier_events</code> with a unique index on <code>(carrier, external_event_id)</code>. A duplicate hits the constraint, so return 200 and stop. Ack within milliseconds; never do the real work in the request.</p><p><b>3. Process async:</b> a job loads the event and applies it to the shipment.</p><p><b>4. Ordering:</b> keep <code>last_event_at</code> on the shipment and ignore older events, or model a state machine where <code>delivered</code> never goes back to <code>in_transit</code>.</p><p><b>5. Failure handling:</b> backoff with jitter, dead set, alerting, plus a replay tool, since you kept the raw payloads.</p>"
  },
  cards: [
    [
      "What does the GVL mean for Ruby threads?",
      "One thread runs Ruby at a time; threads still overlap I/O waits."
    ],
    ["Sidekiq delivery guarantee", "At-least-once. Jobs must be idempotent."],
    ["Exactly-once in practice is…", "At-least-once delivery + idempotent processing."],
    ["Idempotent: credits += 5 or credits = 50?", "credits = 50 (absolute value)."],
    [
      "Job enqueued in after_create → RecordNotFound. Fix?",
      "Enqueue in after_commit (or defer enqueue until commit)."
    ],
    ["Why jitter?", "Avoid thundering herds of synchronized retries."]
  ],
  cheat: [
    "GVL: threads for I/O, processes for CPU.",
    "Check-then-act is a race. Let a unique index decide.",
    "At-least-once + idempotency = effectively once.",
    "Absolute values, upserts, unique keys, state machines.",
    "Backoff + jitter, don't retry 4xx, enqueue after commit."
  ]
});
