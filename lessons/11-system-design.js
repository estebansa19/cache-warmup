// Lesson 11: System design: the playbook
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "sysdesign",
  n: 11,
  track: "Systems",
  mins: 35,
  title: "System design: the playbook",
  tag: "They grade the thinking, not the diagram.",
  hook: "System design rounds don't grade the boxes and arrows. They grade <mark>how you think out loud</mark>: what you ask, what you estimate, what you trade away, and whether you notice your own bottlenecks before they do.",
  steps: [
    {
      k: "order",
      q: "Order the steps of a 45-minute design round.",
      items: [
        "Clarify requirements: functional and non-functional (scale, latency, consistency)",
        "Back-of-envelope estimates (traffic, storage)",
        "API sketch",
        "Data model",
        "High-level architecture",
        "Deep dive on the hardest part",
        "Bottlenecks, failure modes, trade-offs"
      ],
      why: "Rough budget: ~5 min requirements, ~5 estimates, ~10 API + data, ~10 high level, ~10 deep dive, ~5 wrap-up. Jumping straight to 'we use Kafka' is the most common miss."
    },
    {
      k: "read",
      t: "Back-of-envelope math",
      b: "Precision doesn't matter. Orders of magnitude do.<ul><li>1 day ≈ 86,400 s ≈ <mark>10⁵ s</mark></li><li>1M requests/day ≈ 12 req/s average. Peak is 2–10× that.</li><li>10M rows/day × 1 KB ≈ 10 GB/day ≈ 3.6 TB/year</li><li>A single Postgres box handles thousands of simple queries per second. Many 'scale' problems don't need sharding.</li></ul>"
    },
    {
      k: "mcq",
      q: "50 million API requests per day. Average requests per second?",
      o: ["~58", "~580", "~5,800", "~58,000"],
      a: 1,
      why: "50,000,000 / 86,400 ≈ 579. Then say out loud: 'peak maybe 3–5×, so design for ~2–3k rps.'"
    },
    {
      k: "read",
      t: "The usual building blocks",
      b: "<ul><li><b>Load balancer + stateless app servers</b>: scale horizontally; keep sessions out of memory.</li><li><b>Cache</b> (Redis): read-heavy hot data.</li><li><b>Primary + read replicas</b>: read scaling, with replica lag.</li><li><b>Queue + workers</b>: anything slow, retryable, or bursty.</li><li><b>Object storage + CDN</b>: files, PDFs, labels, images.</li><li><b>Search index</b> (Elasticsearch): full-text and faceted queries the DB is bad at.</li><li><b>Partitioning/sharding</b>: only when one primary can't keep up with writes.</li></ul>Add each one <mark>because a requirement demands it</mark>, and say which requirement."
    },
    {
      k: "read",
      t: "Worked example: a subscription renewal engine",
      b: "<b>Ask:</b> 10M subscriptions; most renew on the 1st at 00:00 UTC; charges must never double; dunning on failure.<br><b>Estimate:</b> 10M charges in a burst. Gateways rate-limit, so this is a scheduling problem, not a CPU problem.<br><b>Design:</b><ul><li>A scheduler finds due subscriptions in keyset-paginated batches and enqueues jobs, spreading them over hours with jitter.</li><li>Workers claim each <code>(subscription_id, period)</code> with a unique constraint, then charge with an idempotency key.</li><li>Failures go to a dunning schedule (retry day 1, 3, 7) as a state machine.</li><li><code>invoice.paid</code> / <code>payment_failed</code> events go out through the outbox to email and analytics.</li></ul><b>Deep dive:</b> gateway rate limits → per-gateway token bucket; a 2-hour outage → backlog drains with backoff, no double charges thanks to the keys."
    },
    {
      k: "mcq",
      q: "Best first move when the interviewer says 'Design a notification system'?",
      o: [
        "Draw Kafka",
        "Ask questions: which channels, volume, latency needs, delivery guarantees, user preferences, priority",
        "Pick MongoDB",
        "Start coding"
      ],
      a: 1,
      why: "Requirements shape everything. 'Transactional receipts within 10s' and 'weekly marketing digest' are completely different systems."
    },
    {
      k: "read",
      t: "Trade-off language",
      b: "Senior signal is in the sentence shape: <mark>'I'd start with X because Y. If Z grows past N, I'd move to W, at the cost of V.'</mark><br><br>Example: 'I'd start with Postgres because the data is relational and we need transactions for billing. If write volume outgrows one primary, I'd partition by account_id, at the cost of cross-account queries becoming harder.'"
    },
    {
      k: "myth",
      q: "For anything at scale, NoSQL is the right choice.",
      a: false,
      why: "Pick by access patterns and consistency needs, not hype. Relational databases scale a long way and give you transactions and constraints. Key-value or document stores shine for simple, huge, partition-friendly access patterns."
    },
    {
      k: "mcq",
      q: "When is adding a queue the right call?",
      o: [
        "Always, it's more scalable",
        "When work is slow, bursty, retryable, or doesn't need to finish before the response",
        "When the DB is slow at reads",
        "To replace the database"
      ],
      a: 1,
      why: "Queues decouple producer speed from consumer speed and absorb bursts. They add latency, operational overhead, and at-least-once semantics, so name that cost too."
    }
  ],
  interview: {
    q: "Design a rate limiter for our public API: 1,000 requests per minute per API key, running across 20 app servers.",
    rubric: [
      "Clarifies requirements (per key, burst tolerance, accuracy, latency budget)",
      "Picks an algorithm and explains it (token bucket, sliding window log/counter, fixed window trade-offs)",
      "Shared state in Redis with atomic ops (INCR + EXPIRE or a Lua script)",
      "Returns 429 with Retry-After / rate-limit headers",
      "Failure mode: what if Redis is down (fail open vs closed) and why",
      "Considers latency overhead, hot keys, per-plan config, multi-region"
    ],
    model: "<p><b>Clarify:</b> per API key, smooth or bursty, how exact? A few percent of slop is usually fine.</p><p><b>Algorithm:</b> fixed window (<code>INCR key:minute</code>) is simple but allows 2× at window edges. A sliding window counter (weighted current + previous window) or a <b>token bucket</b> (refill rate + burst capacity) is smoother. Pick the token bucket and explain the two parameters.</p><p><b>State:</b> Redis shared by all 20 servers, with a Lua script for atomic read-refill-take. Adds about 1 ms.</p><p><b>Response:</b> 429 + Retry-After + <code>RateLimit-*</code> headers.</p><p><b>Failure:</b> if Redis is unreachable, fail open (allow) with a local in-memory fallback limit, because blocking every customer is worse than a brief overage. Alert on it. Limits come from plan config, and multi-region gets a per-region budget.</p>"
  },
  cards: [
    ["Seconds in a day (for estimates)", "86,400 ≈ 10⁵."],
    ["1M requests/day ≈ ? rps", "~12 rps average; peak 2–10×."],
    [
      "First 5 minutes of a design round",
      "Clarify functional + non-functional requirements."
    ],
    [
      "Trade-off sentence template",
      "Start with X because Y; if Z grows, move to W at cost V."
    ],
    ["Token bucket parameters", "Refill rate + bucket capacity (burst)."],
    ["Rate limiter store across many servers", "Redis with atomic ops / Lua script."]
  ],
  cheat: [
    "Requirements → estimates → API → data → high level → deep dive → trade-offs.",
    "10⁵ seconds/day. 1M/day ≈ 12 rps.",
    "Add each component because a requirement demands it.",
    "Say the trade-off out loud.",
    "Relational scales further than people think."
  ]
});
