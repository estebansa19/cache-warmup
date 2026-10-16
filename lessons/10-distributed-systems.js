// Lesson 10: Distributed systems survival kit
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "dist",
  n: 10,
  track: "Systems",
  mins: 30,
  title: "Distributed systems survival kit",
  tag: "Two services and a network: the network will lie.",
  hook: "The moment you have two services and a network between them, you have a distributed system. <mark>A timeout doesn't mean it failed. It means you don't know.</mark> Most of this lesson is about living with not knowing.",
  steps: [
    {
      k: "read",
      t: "The fallacies",
      b: "Classic list of things people wrongly assume: the network is reliable; latency is zero; bandwidth is infinite; the network is secure; topology doesn't change; there is one administrator; transport cost is zero; the network is homogeneous.<br><br>The practical consequence: every remote call has <mark>three outcomes</mark>, which are success, failure, and unknown."
    },
    {
      k: "read",
      t: "CAP, said correctly",
      b: "When a <b>network partition</b> happens (and it will), a system must choose: stay <b>Consistent</b> (refuse some requests) or stay <b>Available</b> (answer, possibly with stale data). Partitions aren't optional, so the real choice is C or A <em>during a partition</em>.<br><br><b>PACELC</b> adds the everyday part: <mark>Else (no partition), you trade Latency against Consistency.</mark> Synchronous replication is consistent but slower; async is faster but can serve stale data."
    },
    {
      k: "myth",
      q: "CAP means you pick any two of Consistency, Availability, and Partition tolerance.",
      a: false,
      why: "You can't opt out of partitions on a real network. CAP is about what you give up when one happens: C or A. 'CA systems' only exist on a single node."
    },
    {
      k: "read",
      t: "Consistency you'll actually meet",
      b: "<ul><li><b>Strong</b>: every read sees the latest write.</li><li><b>Read-your-writes</b>: you always see your own changes.</li><li><b>Eventual</b>: replicas converge… eventually.</li></ul>The everyday bug: write to the primary, redirect, read from a <mark>replica that's 200 ms behind</mark>, and get a 404 on the record you just created. Rails' multi-DB support sends reads to the primary for a short window after a write for exactly this reason."
    },
    {
      k: "mcq",
      q: "A user creates a subscription and the confirmation page says 'not found', but a refresh fixes it. Most likely cause?",
      o: [
        "Cache stampede",
        "Replica lag: the read went to a replica that hadn't caught up",
        "Deadlock",
        "DNS"
      ],
      a: 1,
      why: "A classic read-your-writes violation. Pin reads to the primary right after writes for that user, or pass the created data along instead of re-reading it."
    },
    {
      k: "read",
      t: "Queues vs logs",
      b: "<b>Queue</b> (Sidekiq, SQS, RabbitMQ): a message is consumed and gone, and workers compete for messages. <b>Log</b> (Kafka): messages are retained and each consumer group tracks its own offset, so you can replay. Ordering is guaranteed only <mark>within a partition</mark>, so partition by the key whose order matters (account_id, shipment_id)."
    },
    {
      k: "read",
      t: "The dual-write problem → transactional outbox",
      b: "You save the invoice to Postgres, then publish <code>invoice.paid</code> to a broker. If the process dies between the two, the DB says paid and nobody was told. Two systems can't commit atomically without heavy machinery.<br><br><b>Outbox:</b> in the <em>same DB transaction</em>, insert the event into an <code>outbox</code> table. A relay process publishes outbox rows and marks them sent. That's at-least-once, so consumers must be idempotent (lesson 7).",
      note: "<b>Sagas</b> extend this to multi-step workflows. Charge → reserve inventory → book shipment, and if booking fails, run compensations (release inventory, refund) instead of a distributed transaction."
    },
    {
      k: "mcq",
      q: "You need 'save order' and 'publish order.created' to never disagree. Standard pattern?",
      o: [
        "Publish first, then save",
        "Wrap both in a DB transaction",
        "Transactional outbox: write the event to an outbox table in the same transaction, relay it afterward",
        "Retry until both succeed"
      ],
      a: 2,
      why: "A DB transaction can't include the broker. The outbox makes the event part of the same atomic write, and the relay delivers it at least once."
    },
    {
      k: "read",
      t: "Resilience toolkit",
      b: "<ul><li><b>Timeouts</b> on every remote call. No exceptions.</li><li><b>Retries</b> with backoff and jitter, only for idempotent operations.</li><li><b>Circuit breaker</b>: after N failures, stop calling for a while and fail fast, so a sick dependency isn't hammered and your threads aren't all stuck waiting.</li><li><b>Bulkheads</b>: separate pools so one slow carrier can't eat every worker.</li><li><b>Rate limits and backpressure</b>.</li></ul>"
    },
    {
      k: "mcq",
      q: "Kafka topic with 12 partitions. Where is message order guaranteed?",
      o: [
        "Across the whole topic",
        "Within a single partition",
        "Never",
        "Only with one consumer"
      ],
      a: 1,
      why: "Order is per partition. Use the entity ID as the message key so every event for one shipment lands in the same partition, in order."
    }
  ],
  interview: {
    q: "When an invoice is paid, the billing service must update its DB and the notification service must email a receipt. How do you keep them consistent?",
    rubric: [
      "Recognizes the dual-write problem",
      "Transactional outbox (or CDC) to publish the event reliably",
      "At-least-once delivery → idempotent consumer (dedupe by event id)",
      "Ordering concerns (partition by invoice/account) and retries/DLQ",
      "Accepts eventual consistency for email; reconciliation/monitoring for misses",
      "Mentions timeouts/unknown outcomes when calling the email provider"
    ],
    model: "<p>The trap is the <b>dual write</b>: update the DB, then call the notifier, and crash in between. Instead, in the same transaction that marks the invoice paid, insert an <code>invoice.paid</code> row into an <b>outbox</b>. A relay publishes it to the queue or Kafka (keyed by account for ordering) and marks it sent.</p><p>The notification service is an <b>idempotent consumer</b>: it records processed event IDs (unique index) before or with sending, so redeliveries don't double-email. The email provider call gets its own idempotency key if supported.</p><p>Email being a few seconds late is fine, so eventual consistency is acceptable here. Add a DLQ, alerting on outbox lag, and a daily check that every paid invoice has a receipt.</p>"
  },
  cards: [
    ["Three outcomes of a remote call", "Success, failure, unknown (timeout)."],
    ["CAP in one line", "During a partition, choose consistency or availability."],
    ["PACELC adds…", "Else (no partition): latency vs consistency."],
    [
      "'Not found' right after create, fixed by refresh",
      "Replica lag: read-your-writes violation."
    ],
    ["Dual-write fix", "Transactional outbox (+ idempotent consumers)."],
    ["Kafka ordering guarantee", "Per partition only. Key by entity ID."],
    ["Circuit breaker purpose", "Fail fast while a dependency is sick; stop piling on."]
  ],
  cheat: [
    "Timeout = unknown, not failure.",
    "CAP: C or A during a partition. PACELC: latency vs consistency otherwise.",
    "Replica lag breaks read-your-writes.",
    "Outbox for reliable events; sagas for multi-step workflows.",
    "Timeouts, retries + jitter, circuit breakers, bulkheads."
  ]
});
