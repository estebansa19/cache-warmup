// Lesson 12: Testing that earns its keep
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "testing",
  n: 12,
  track: "Craft",
  mins: 20,
  title: "Testing that earns its keep",
  tag: "A flaky suite isn't a safety net. It's weather.",
  hook: "A suite that takes 40 minutes and fails randomly 5% of the time isn't a safety net. <mark>It's weather.</mark> People stop trusting it, then stop reading it, then merge on red.",
  steps: [
    {
      k: "read",
      t: "The pyramid (and why people argue about it)",
      b: "<b>Unit</b>: fast and focused, lots of them. <b>Integration</b>: real DB and real collaborators, fewer. <b>End-to-end/system</b>: a real browser, slow, a handful for critical paths.<br><br>The 'testing trophy' crowd argues integration tests give the best confidence per dollar. Both camps agree: <mark>push each test as low as it can go while still proving what matters.</mark>"
    },
    {
      k: "read",
      t: "Test doubles vocabulary",
      b: "<ul><li><b>Dummy</b>: passed around, never used.</li><li><b>Stub</b>: returns canned answers. RSpec: <code>allow(x).to receive(:y).and_return(z)</code>.</li><li><b>Spy</b>: records calls so you can assert afterward (<code>have_received</code>).</li><li><b>Mock</b>: pre-programmed expectations that fail if not met. <code>expect(x).to receive(:y)</code>.</li><li><b>Fake</b>: a working lightweight implementation, like an in-memory gateway.</li></ul>",
      code: `gateway = instance_double(PaymentGateway)  # verifies the methods exist
allow(gateway).to receive(:charge).and_return(Result.ok)

RenewSubscription.new(gateway:).call(sub)

expect(gateway).to have_received(:charge).with(amount: 1999, key: "sub-1-2026-10")`
    },
    {
      k: "mcq",
      q: "Difference between a stub and a mock?",
      o: [
        "None",
        "A stub provides canned answers (state); a mock asserts that a specific interaction happened (behavior)",
        "Mocks are faster",
        "Stubs only work with classes"
      ],
      a: 1,
      why: "Stub: 'when asked, say this.' Mock: 'you must be called like this.' Over-mocking couples tests to implementation, so refactors break tests even when behavior is fine."
    },
    {
      k: "read",
      t: "What makes a test good",
      b: "<ul><li>Tests <b>behavior</b>, not private implementation.</li><li>One reason to fail, and a failure message that explains itself.</li><li>Arrange / Act / Assert, readable top to bottom.</li><li><mark>Don't mock what you don't own.</mark> Wrap the Stripe SDK in your own adapter, mock the adapter in unit tests, and use WebMock/VCR at the adapter's edge.</li></ul>"
    },
    {
      k: "mcq",
      q: "Why does <code>instance_double</code> beat a plain <code>double</code>?",
      o: [
        "It's faster",
        "It verifies stubbed methods actually exist on the real class (with the right arity), so tests break when the interface changes",
        "It hits the database",
        "It auto-generates factories"
      ],
      a: 1,
      why: "Plain doubles happily stub methods that were renamed months ago, and the test stays green while production breaks. Verifying doubles catch that drift."
    },
    {
      k: "read",
      t: "Flaky tests: the usual suspects",
      b: "<ul><li><b>Time</b>: <code>Date.today</code> near midnight or month-end. Fix with <code>travel_to</code>.</li><li><b>Order dependence</b>: leaked global state, class variables, ENV. Run with <code>--order random</code> and the seed.</li><li><b>Async UI</b>: system specs asserting before the JS finishes. Use Capybara's waiting matchers, never <code>sleep</code>.</li><li><b>Unseeded randomness</b>, unique-constraint collisions in factories.</li><li><b>Shared external resources</b>: real network, shared Redis DBs.</li></ul>Fix the cause. <mark>Auto-retrying flaky tests just hides the bug.</mark>"
    },
    {
      k: "mcq",
      q: "A spec fails only on the last day of the month. Most likely culprit?",
      o: [
        "Database corruption",
        "Date math (e.g. 'next month same day') without freezing time",
        "Too many threads",
        "A Ruby bug"
      ],
      a: 1,
      why: "Jan 31 + 1 month is Feb 28/29. Freeze time with <code>travel_to</code> and add explicit edge-case tests for month-end. Billing code has a lot of these."
    },
    {
      k: "myth",
      q: "100% code coverage means the code has no bugs.",
      a: false,
      why: "Coverage proves lines ran, not that the assertions were meaningful or that edge cases were tested. It's a useful flashlight for untested areas and a bad target to chase."
    },
    {
      k: "read",
      t: "Characterization tests for legacy code",
      b: "Before refactoring code nobody understands, write tests that pin down <mark>what it does today</mark>, even if that's weird. Capture inputs and outputs (a 'golden master'), refactor, and confirm the outputs are identical. Then change behavior deliberately, one test at a time."
    }
  ],
  interview: {
    q: "Our CI takes 35 minutes and ~5% of runs fail on flaky tests. You own fixing it. What's your plan?",
    rubric: [
      "Measures first: per-file timings, flake rate per test (CI history)",
      "Quarantines known flakes with owners/tickets instead of global retries",
      "Fixes root-cause categories (time, order, async, shared state)",
      "Speeds up: parallelization (split by timing), cheaper factories (build_stubbed, let_it_be), push tests down the pyramid",
      "Infra wins: caching dependencies, DB setup strategy",
      "Sets a target/SLO and ownership so it doesn't regress"
    ],
    model: "<p><b>Measure:</b> collect per-test timing and failure history from CI. Usually ~10% of files take ~50% of the time, and a dozen tests cause most flakes.</p><p><b>Flakes:</b> quarantine them (still run, non-blocking) with a ticket and owner each, then fix by category: freeze time, random order with seed reproduction, Capybara waiting matchers, isolated Redis/DB state.</p><p><b>Speed:</b> parallelize split by historical timing; replace <code>create</code> with <code>build_stubbed</code> where persistence isn't needed; <code>let_it_be</code> for shared setup; move logic tests out of system specs; cache gems and assets.</p><p><b>Keep it fixed:</b> a target (under 10 min, under 1% flake), a dashboard, and a rule that new flakes get fixed or quarantined within a day.</p>"
  },
  cards: [
    ["Stub vs mock", "Stub: canned answers. Mock: asserts an interaction happened."],
    ["Why instance_double?", "Verifies stubbed methods exist on the real class."],
    [
      "Don't mock what you don't own means…",
      "Wrap third-party APIs in your adapter and mock the adapter."
    ],
    ["Flaky on month-end → fix with…", "travel_to + explicit edge-case tests."],
    [
      "Does 100% coverage mean no bugs?",
      "No. It shows lines ran, not that behavior was verified."
    ],
    ["Characterization test", "Pins current behavior of legacy code before refactoring."]
  ],
  cheat: [
    "Push tests as low as they can go while still proving what matters.",
    "Stub = state, mock = interaction. Verifying doubles.",
    "Don't mock what you don't own.",
    "Flakes: time, order, async, shared state. Fix, don't retry.",
    "Characterize legacy code before changing it."
  ]
});
