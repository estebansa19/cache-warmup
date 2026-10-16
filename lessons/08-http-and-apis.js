// Lesson 8: HTTP, the web & APIs
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "http",
  n: 8,
  track: "Systems",
  mins: 25,
  title: "HTTP, the web & APIs",
  tag: "The 'what happens when you type a URL' answer, crisp.",
  hook: "'What happens when you type a URL and hit enter?' is still asked in 2026. It's a fishing question: <mark>they want to see how deep you can go</mark>, and where you choose to stop.",
  steps: [
    {
      k: "order",
      q: "Put the journey of https://shop.example/cart in order.",
      items: [
        "DNS resolves shop.example to an IP (browser/OS cache, then resolver)",
        "TCP connection (3-way handshake) to that IP",
        "TLS handshake: certificate check, key exchange",
        "Browser sends the HTTP request",
        "Load balancer → Puma → Rack middleware → router → controller",
        "Response returns; browser parses HTML and fetches CSS/JS/images"
      ],
      why: "Name each hop in a sentence, then offer to go deeper on any one. HTTP/3 merges the transport and TLS handshakes over QUIC (UDP), which is a nice detail to drop."
    },
    {
      k: "read",
      t: "Methods: safe vs idempotent",
      b: "<b>Safe</b> = no side effects. <b>Idempotent</b> = repeating it has the same effect as doing it once.",
      table: {
        head: ["Method", "Safe", "Idempotent", "Typical use"],
        rows: [
          ["GET", "✓", "✓", "Read"],
          ["PUT", "", "✓", "Replace a resource"],
          ["DELETE", "", "✓", "Remove (second call: still gone)"],
          ["PATCH", "", "not guaranteed", "Partial update"],
          ["POST", "", "✗", "Create / trigger an action"]
        ]
      },
      note: "That ✗ on POST is why payment and shipment APIs accept an Idempotency-Key header."
    },
    {
      k: "read",
      t: "Status codes that come up",
      b: "<ul><li><b>201</b> created, <b>202</b> accepted (processing async), <b>204</b> no content</li><li><b>301/302</b> redirect, <b>304</b> not modified (ETag cache hit)</li><li><b>400</b> malformed, <b>401</b> who are you?, <b>403</b> I know who you are, and no</li><li><b>404</b>, <b>409</b> conflict (state or version clash), <b>422</b> valid JSON but invalid data, <b>429</b> slow down</li><li><b>500</b> our bug, <b>502</b> bad gateway, <b>503</b> unavailable/overloaded, <b>504</b> upstream timeout</li></ul>"
    },
    {
      k: "mcq",
      q: "A logged-in user requests another account's invoice. Correct status?",
      o: [
        "401 Unauthorized",
        "403 Forbidden, or 404 to avoid revealing that it exists",
        "400 Bad Request",
        "500"
      ],
      a: 1,
      why: "401 means 'not authenticated'. They are authenticated, just not allowed, so 403. Many APIs return 404 so they don't leak that the ID exists. Both are defensible; 401 isn't."
    },
    {
      k: "read",
      t: "HTTP/1.1, 2, and 3 in three lines",
      b: "<b>1.1</b>: keep-alive connections, one request at a time per connection, so browsers open several. <b>2</b>: multiplexes many streams over one TCP connection with header compression, but one lost packet stalls them all (TCP head-of-line blocking). <b>3</b>: runs over <mark>QUIC on UDP</mark>, streams are independent, and it has faster handshakes."
    },
    {
      k: "read",
      t: "API styles and pagination",
      b: "<ul><li><b>REST</b>: resources + HTTP semantics, cacheable, simple. Can over- or under-fetch.</li><li><b>GraphQL</b>: the client picks its fields, so it's great for varied UIs. HTTP caching is harder and N+1s hide in resolvers (batch loaders).</li><li><b>gRPC</b>: protobuf contracts, fast, streaming. Good service-to-service, awkward for browsers.</li><li><b>Webhooks</b>: you call them when something happens.</li></ul><b>Pagination:</b> offset (<code>?page=500</code>) gets slow and skips or duplicates rows when data shifts. <mark>Cursor/keyset</mark> (<code>?after=inv_9182</code>) stays fast and stable."
    },
    {
      k: "mcq",
      q: "Why prefer cursor (keyset) pagination for a large, frequently-written invoices list?",
      o: [
        "It's easier to jump to page 500",
        "Stable results while rows are inserted, and it seeks via the index instead of counting past OFFSET rows",
        "It uses less JSON",
        "Browsers require it"
      ],
      a: 1,
      why: "OFFSET 100000 makes the DB walk and discard 100k rows, and inserts shift every page. A keyset (<code>WHERE id &lt; last_seen ORDER BY id DESC LIMIT 50</code>) avoids both. The trade-off: no random page jumps."
    },
    {
      k: "myth",
      q: "With HTTPS, your ISP can't see which website you're visiting.",
      a: false,
      why: "HTTPS encrypts paths, headers, and bodies, but the domain usually leaks through DNS lookups and the TLS SNI field (unless DNS-over-HTTPS and Encrypted Client Hello are in play). The IP address is always visible."
    },
    {
      k: "mcq",
      q: "Which methods are idempotent by definition?",
      o: ["GET, PUT, DELETE", "GET, POST", "POST, PATCH", "Only GET"],
      a: 0,
      why: "GET, HEAD, PUT, DELETE (and OPTIONS) are idempotent. POST isn't, and PATCH depends on how you design it."
    }
  ],
  interview: {
    q: "Design a public REST API for creating shipments that's safe for clients to retry.",
    rubric: [
      "Clear resource design (POST /shipments, GET /shipments/:id, etc.)",
      "Idempotency-Key header on POST, stored with the response and replayed on retry",
      "Correct status codes: 201 vs 202 for async label creation, 409/422 for errors, consistent error body",
      "Rate limiting with 429 + Retry-After",
      "Cursor pagination for lists; versioning strategy",
      "Auth (API keys/OAuth scopes) and webhooks for status changes"
    ],
    model: "<p><code>POST /v1/shipments</code> with an <b>Idempotency-Key</b> header. Store key → (request hash, response) for ~24h. Same key and same body replays the stored response; same key with a different body returns 422 or 409.</p><p>Label creation calls carriers, so it's slow: return <b>202</b> with the shipment in <code>pending</code> state, then deliver a <code>shipment.label_ready</code> webhook (signed, retried). <code>GET /v1/shipments/:id</code> for polling.</p><p>Errors: one consistent JSON shape with a machine-readable code. <b>429</b> with Retry-After. Lists use cursor pagination. API keys scoped per account, with authorization checked on every object (no IDOR). Version in the path or a header, and never break v1 in place.</p>"
  },
  cards: [
    ["401 vs 403", "401: not authenticated. 403: authenticated but not allowed."],
    ["Is POST idempotent?", "No. Hence Idempotency-Key headers."],
    ["202 Accepted means…", "Request accepted; processing will finish asynchronously."],
    [
      "HTTP/2's remaining weakness",
      "TCP head-of-line blocking (fixed by HTTP/3 over QUIC/UDP)."
    ],
    [
      "Why cursor pagination?",
      "Fast via index seek and stable under inserts; offset scans and shifts."
    ],
    ["What leaks the domain over HTTPS?", "DNS lookups and TLS SNI (unless DoH + ECH)."]
  ],
  cheat: [
    "URL journey: DNS → TCP → TLS → HTTP → LB → app → render.",
    "GET/PUT/DELETE idempotent. POST needs idempotency keys.",
    "401 = who are you. 403 = no. 422 = invalid data. 429 = slow down.",
    "HTTP/3 = QUIC over UDP.",
    "Cursor pagination for big, changing lists."
  ]
});
