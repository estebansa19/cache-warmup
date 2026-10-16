// Lesson 2: Data structures you actually reach for
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "ds",
  n: 2,
  track: "Foundations",
  mins: 25,
  title: "Data structures you actually reach for",
  tag: "Pick the structure by the operation you need to be fast.",
  hook: "Every data-structure interview question is secretly one question: <mark>which operation has to be fast?</mark> Lookup by key? Smallest item? Next in line? Prefix match? Name the operation and the structure usually picks itself.",
  steps: [
    {
      k: "read",
      t: "The cheat table",
      b: "Memorize the trade-offs, not the implementations.",
      table: {
        head: ["Structure", "Fast at", "Slow at"],
        rows: [
          ["Array", "Index access, append, iteration", "Search, insert in the middle"],
          ["Hash / Set", "Lookup, insert, delete by key", "Ordered queries, range scans"],
          ["Stack", "Push/pop at one end (LIFO)", "Anything in the middle"],
          ["Queue", "Enqueue at back, dequeue at front (FIFO)", "Random access"],
          ["Heap", "Get min/max, insert: O(log n)", "Search for arbitrary item"],
          ["Balanced tree / B-tree", "Ordered ops and ranges: O(log n)", "Constant-time lookups"],
          ["Trie", "Prefix search", "Memory use"],
          ["Graph", "Modeling relationships", "Everything costs a traversal"]
        ]
      }
    },
    {
      k: "read",
      t: "Stacks and queues in the wild",
      b: "<b>Stacks (LIFO):</b> the call stack, undo history, matching brackets, depth-first search. <b>Queues (FIFO):</b> job queues, breadth-first search, rate-limited outbound requests. A Ruby <code>Array</code> can play both roles (<code>push/pop</code>, <code>push/shift</code>). For threads, use <code>Thread::Queue</code>, which is thread-safe and blocks on empty."
    },
    {
      k: "mcq",
      q: "Sidekiq needs to find the next scheduled job whose run time has passed. What structure does it use in Redis?",
      o: ["A list (queue)", "A sorted set scored by timestamp", "A plain hash", "A stack"],
      a: 1,
      why: "Scheduled jobs and retries live in Redis sorted sets (ZSETs) scored by run-at time. Fetching 'everything with score ≤ now' is a cheap range query. Same idea as a priority queue."
    },
    {
      k: "read",
      t: "Heaps: the 'top k' tool",
      b: "A heap keeps the smallest (or largest) item on top, with O(log n) insert and pop. It's the structure behind priority queues, schedulers, and <mark>top-k problems</mark>: to find the 10 cheapest carrier quotes among 5 million, keep a size-10 max-heap and you're at O(n log k) instead of sorting everything.",
      code: `# Ruby has no stdlib heap, but Enumerable covers the common case:
quotes.min_by(10, &:price)  # top-k without a full sort in your code`
    },
    {
      k: "read",
      t: "Trees and tries",
      b: "A <b>balanced search tree</b> keeps keys ordered with O(log n) insert and lookup, so range queries come cheap. A <b>B-tree</b> is the disk-friendly version with fat nodes and few levels; your database indexes are B-trees (more in lesson 5). A <b>trie</b> stores strings character by character, so every word sharing a prefix shares a path. It's the autocomplete structure.",
      note: "A search box over hotel cities is a classic trie use case. A sorted array plus binary search for the prefix range is the low-tech alternative and is often good enough."
    },
    {
      k: "read",
      t: "Graphs: when things depend on things",
      b: "Nodes plus edges. Three traversals cover most interview questions:<ul><li><b>BFS</b>: shortest path when every edge costs the same (fewest hops).</li><li><b>DFS</b>: explore deep, detect cycles.</li><li><b>Topological sort</b>: order tasks so every dependency comes first. Think build steps, migrations, form components that depend on other components.</li></ul>Weighted shortest path (cheapest shipping route) is <mark>Dijkstra</mark>.",
      code: "require \"tsort\" # Ruby even ships topological sort"
    },
    {
      k: "mcq",
      q: "Your form engine has components that depend on other components' values. You need a valid evaluation order. What do you reach for?",
      o: ["Binary search", "Topological sort on the dependency graph", "A min-heap", "A trie"],
      a: 1,
      why: "Dependencies form a directed graph. A topological sort gives an order where every component comes after its dependencies, and if it fails, you've found a cycle, which is a bug worth reporting."
    },
    {
      k: "mcq",
      q: "Ruby <code>Hash</code> iteration order is…",
      o: [
        "Random",
        "Sorted by key",
        "Insertion order (guaranteed since Ruby 1.9)",
        "Sorted by hash value"
      ],
      a: 2,
      why: "Ruby hashes preserve insertion order. Many languages' hash maps (Java's HashMap, for example) do not. Saying 'it depends on the language' in an interview earns points."
    },
    {
      k: "mcq",
      q: "Autocomplete over 50,000 city names, matching by prefix as the user types. Best fit?",
      o: [
        "Hash keyed by full name",
        "Trie (or sorted array + binary search on the prefix)",
        "Stack",
        "Queue"
      ],
      a: 1,
      why: "A hash only finds exact keys. Prefix queries need order or shared paths. A trie or sorted array gives you every match for 'Med…' fast."
    }
  ],
  interview: {
    q: "Design an LRU cache with O(1) get and put. What data structures do you use and why?",
    rubric: [
      "Hash map for O(1) key lookup",
      "Doubly linked list (or ordered hash) to track recency with O(1) move and evict",
      "Explains get: move to most-recent; put: insert/update then evict least-recent when over capacity",
      "Mentions Ruby's insertion-ordered Hash trick (delete + reinsert, evict first key)",
      "Brings up thread safety or real-world equivalents (Redis allkeys-lru, Rails.cache)"
    ],
    model: `<p>Two structures working together. A <b>hash</b> from key to node gives O(1) lookup. A <b>doubly linked list</b> ordered by recency gives O(1) unlink/move and eviction at the tail.</p><p><b>get:</b> look up the node, move it to the head, return it. <b>put:</b> update or insert at the head; if size exceeds capacity, drop the tail and delete its key from the hash.</p><p>In Ruby you can cheat legitimately, because Hash keeps insertion order:</p><pre>def get(k)
  return unless @h.key?(k)
  @h[k] = @h.delete(k)   # move to newest
end

def put(k, v)
  @h.delete(k)
  @h[k] = v
  @h.delete(@h.first[0]) if @h.size > @cap
end</pre><p>Then mention the edges: a mutex for thread safety, and that Redis offers this as an eviction policy so you rarely build it yourself.</p>`
  },
  cards: [
    [
      "Structure for 'give me the smallest item' repeatedly?",
      "Heap / priority queue. O(log n) insert and pop."
    ],
    [
      "How does Sidekiq store scheduled jobs and retries?",
      "Redis sorted sets scored by run-at timestamp."
    ],
    ["Shortest path with unweighted edges?", "BFS."],
    ["Order tasks so dependencies come first?", "Topological sort (and it detects cycles)."],
    ["Top 10 of 5M items efficiently?", "Size-k heap: O(n log k). Ruby: min_by(10)."],
    ["LRU cache in O(1)?", "Hash map + doubly linked list (or Ruby's ordered Hash)."]
  ],
  cheat: [
    "Name the operation that must be fast, then pick the structure.",
    "Hash for lookup, heap for min/max, tree for ranges, trie for prefixes.",
    "Graph problems are mostly BFS, DFS, or topological sort.",
    "Ruby Hash keeps insertion order. Many languages' maps don't.",
    "LRU = hash + doubly linked list."
  ]
});
