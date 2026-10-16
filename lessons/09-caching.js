// Lesson 9: Caching without regrets
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "cache",
  n: 9,
  track: "Systems",
  mins: 20,
  title: "Caching without regrets",
  tag: "Fast, until it's wrong.",
  hook: "'There are only two hard things in computer science: cache invalidation and naming things.' This app is called Cache Warmup, so let's get the other one right. <mark>A cache is a bet that data won't change before you read it again.</mark>",
  steps: [
    {
      k: "read",
      t: "Layers, and why they exist",
      b: "Each layer is closer and faster than the next one down. Rough latencies are worth knowing for system design talks:",
      table: {
        head: ["Where", "Roughly"],
        rows: [
          ["CPU L1 cache", "~1 ns"],
          ["Main memory", "~100 ns"],
          ["SSD random read", "~100 µs"],
          ["Round trip in the same datacenter (e.g. Redis)", "~0.5 ms"],
          ["Round trip across an ocean", "~150 ms"]
        ]
      },
      note: "Web layers, outermost first: browser → CDN → reverse proxy → app cache (Redis/Memcached) → database buffer cache."
    },
    {
      k: "read",
      t: "Read and write patterns",
      b: "<ul><li><b>Cache-aside</b> (the default): read the cache; on a miss, load from the DB and fill it. <code>Rails.cache.fetch</code> is exactly this.</li><li><b>Write-through</b>: write to cache and DB together. Reads are fresh; writes are slower.</li><li><b>Write-back</b>: write to cache now, DB later. Fast, but you can lose data.</li><li><b>Write-around</b>: write only to the DB and let reads fill the cache.</li></ul>"
    },
    {
      k: "read",
      t: "Invalidation strategies",
      b: "<ul><li><b>TTL</b>: accept staleness up to N seconds. Simple and bounded.</li><li><b>Delete on write</b>: precise, but easy to forget a code path.</li><li><b>Key-based expiration</b>: put the version in the key so <mark>you never invalidate</mark>; new data simply lives at a new key and old entries age out. Rails' <code>cache_key_with_version</code> does this.</li></ul>",
      code: `# Russian doll: the outer cache auto-busts when an inner record changes
class LineItem < ApplicationRecord
  belongs_to :invoice, touch: true
end

<% cache invoice do %>          <%# key includes invoice.updated_at %>
  <% invoice.line_items.each do |li| %>
    <% cache li do %> ... <% end %>
  <% end %>
<% end %>`
    },
    {
      k: "mcq",
      q: "With key-based expiration (<code>cache invoice</code>), what happens when the invoice is updated?",
      o: [
        "You must call Rails.cache.delete",
        "updated_at changes the key, so the next read misses and fills a fresh entry; the old one gets evicted eventually",
        "The cache serves stale data forever",
        "Redis notices and deletes it"
      ],
      a: 1,
      why: "The key includes a version (updated_at), so nothing needs deleting. You trade some memory for never forgetting an invalidation path."
    },
    {
      k: "read",
      t: "How caches fail",
      b: "<ul><li><b>Stampede / dogpile</b>: a hot key expires and 500 requests all miss and recompute at once. Fixes: <code>race_condition_ttl</code>, a lock so one request recomputes, early probabilistic refresh, serving stale while revalidating.</li><li><b>Penetration</b>: lookups for keys that don't exist always miss. Cache the 'not found' too, briefly.</li><li><b>Hot keys</b>: one key gets all the traffic on one Redis node.</li><li><b>Eviction</b>: when memory is full, Redis' policy decides. The default <code>noeviction</code> makes writes fail; caches usually want <code>allkeys-lru</code> or <code>allkeys-lfu</code>.</li></ul>"
    },
    {
      k: "mcq",
      q: "Every hour at :00 the homepage stats key expires and DB CPU spikes to 100%. What is this, and what fixes it?",
      o: [
        "A memory leak; restart Redis",
        "A cache stampede. Use race_condition_ttl / a recompute lock / serve stale while one request refreshes",
        "Too many indexes",
        "Network partition"
      ],
      a: 1,
      why: "Synchronized expiry plus an expensive recompute makes a dogpile. Let one request rebuild while everyone else gets the slightly stale value."
    },
    {
      k: "myth",
      q: "Adding a cache always reduces database load.",
      a: false,
      why: "A low hit ratio, stampedes on expiry, and cache-penetration misses can make load spikier than before. Measure the hit rate, and protect the miss path."
    },
    {
      k: "mcq",
      q: "The browser sends <code>If-None-Match: \"abc123\"</code> and the resource hasn't changed. Ideal response?",
      o: [
        "200 with the full body",
        "304 Not Modified, no body",
        "204 No Content",
        "302 to itself"
      ],
      a: 1,
      why: "ETags enable conditional requests. A 304 saves bandwidth and rendering. Rails' <code>fresh_when</code> / <code>stale?</code> handle this."
    },
    {
      k: "read",
      t: "What not to cache (casually)",
      b: "Be careful caching <mark>balances, permissions, and anything a user just changed</mark> (read-your-writes surprises). Cache keys must include everything that changes the output, like locale, currency, plan, and permissions, or one customer sees another's data. That bug is a lot worse than a slow page."
    }
  ],
  interview: {
    q: "A shipping-rate calculator page is slow because rates come from 6 carrier APIs. How would you use caching here, and what could go wrong?",
    rubric: [
      "Identifies what is cacheable and the key (origin, destination, weight/dimension bucket, service, account pricing)",
      "TTL tied to how long carrier rates are valid",
      "Stampede protection and serve-stale/fallback when a carrier is down",
      "Fetches carriers in parallel with timeouts; partial results are OK",
      "Re-quotes or validates the price at checkout/booking for correctness",
      "Measures hit rate and latency; considers key cardinality/memory"
    ],
    model: "<p><b>Cache the carrier responses</b> per <code>(carrier, origin zip, dest zip, weight bucket, dims bucket, service, account pricing tier)</code>. Bucketing weights raises the hit rate. The TTL comes from the carrier's quote validity (minutes to hours).</p><p><b>Protect the miss path:</b> call carriers in parallel with tight timeouts, show what returned, and use a recompute lock plus serve-stale so a hot route doesn't stampede.</p><p><b>Correctness:</b> a cached rate is for display. Re-quote (or validate against a short TTL) at booking, because the price you charge must be right.</p><p><b>Measure:</b> hit ratio per carrier, p95, key count. Cache-key mistakes that mix up account pricing are the scary bug, so test them.</p>"
  },
  cards: [
    ["Cache-aside in Rails", "Rails.cache.fetch(key) { load_from_db }."],
    [
      "Key-based expiration",
      "Version in the key (updated_at), so you never explicitly invalidate."
    ],
    ["Russian doll caching needs…", "touch: true on belongs_to so parent keys change."],
    [
      "Cache stampede fixes",
      "race_condition_ttl, recompute lock, serve stale while revalidating, jittered TTLs."
    ],
    [
      "Redis default eviction policy",
      "noeviction (writes fail when full). Caches usually want allkeys-lru/lfu."
    ],
    ["Same-DC round trip vs main memory", "~0.5 ms vs ~100 ns, about 5,000× apart."]
  ],
  cheat: [
    "Cache = a bet that data won't change before the next read.",
    "Cache-aside by default; key-based expiration avoids invalidation bugs.",
    "Stampedes: lock, stale-while-revalidate, jitter.",
    "Cache 'not found' briefly; set an eviction policy.",
    "Keys must include everything that changes the output."
  ]
});
