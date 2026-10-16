// Lesson 3: OOP & SOLID, minus the posters
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "solid",
  n: 3,
  track: "Foundations",
  mins: 25,
  title: "OOP & SOLID, minus the posters",
  tag: "Five principles, each one a specific kind of pain.",
  hook: "You've met the 900-line <code>Subscription</code> model. It calculates proration, renders invoices, sends emails, and talks to three gateways. <mark>SOLID is just a list of the ways that file hurts.</mark>",
  steps: [
    {
      k: "read",
      t: "The four pillars, in one breath",
      b: "<ul><li><b>Encapsulation</b>: hide state behind behavior. Callers say <code>invoice.pay!</code> and never set <code>status</code> directly.</li><li><b>Abstraction</b>: expose what, hide how.</li><li><b>Inheritance</b>: reuse via an is-a relationship. Powerful and easy to overuse.</li><li><b>Polymorphism</b>: same message, different behavior. In Ruby it's mostly <mark>duck typing</mark>: if it responds to <code>#charge</code>, it's a gateway.</li></ul>"
    },
    {
      k: "read",
      t: "S: Single Responsibility",
      b: "Not 'does one thing'. Better: <mark>has one reason to change</mark>, meaning one group of people whose requests change it. If finance changes tax rules and marketing changes email copy, and both edit <code>Invoice</code>, it has two responsibilities.",
      code: `# Before: Invoice#total, #to_pdf, #email_customer
# After:
Invoice            # data + domain rules
InvoiceCalculator  # finance changes this
InvoicePdf         # design changes this
InvoiceMailer      # comms changes this`
    },
    {
      k: "read",
      t: "O: Open/Closed",
      b: "Open for extension, closed for modification. Adding a carrier shouldn't mean editing a <code>case</code> statement in five places.",
      code: `# Every new carrier edits this method:
case carrier
when "fedex" then FedexClient.new.quote(pkg)
when "dhl"   then DhlClient.new.quote(pkg)
end

# Extension by registration:
CARRIERS = { fedex: FedexAdapter, dhl: DhlAdapter }
CARRIERS.fetch(carrier).new.quote(pkg)`
    },
    {
      k: "mcq",
      q: "A method switches on <code>plan.kind</code> in six places across the codebase. Each new plan type means touching all six. Which principle hurts most?",
      o: ["Liskov Substitution", "Open/Closed", "Interface Segregation", "DRY only"],
      a: 1,
      why: "Adding behavior requires modifying existing code. Polymorphism (a class per plan kind, or a strategy registry) moves the switch into one place, usually a factory."
    },
    {
      k: "read",
      t: "L: Liskov Substitution",
      b: "A subtype must keep the promises of its parent. If code works with a <code>Plan</code>, it must work with any subclass of <code>Plan</code>, with no surprise exceptions and no stricter inputs.",
      code: `class FreeTrialPlan < Plan
  def charge!(amount)
    raise NotImplementedError  # breaks every caller of Plan#charge!
  end
end`,
      note: "The textbook version is Square < Rectangle: setting width on a square silently changes its height. The fix is usually 'that's not really an is-a relationship', so model it differently."
    },
    {
      k: "read",
      t: "I & D: small interfaces, injected dependencies",
      b: "<b>Interface Segregation</b>: don't force clients to depend on methods they don't use. In Ruby, think small role modules (<code>Refundable</code>, <code>Chargeable</code>) instead of one giant gateway contract.<br><br><b>Dependency Inversion</b>: high-level policy shouldn't depend on low-level details. Both depend on an abstraction, so <mark>your billing logic shouldn't know about the Stripe SDK</mark>.",
      code: `class RenewSubscription
  def initialize(gateway: PaymentGateway.default)
    @gateway = gateway   # injected, so tests pass a fake
  end
end`
    },
    {
      k: "mcq",
      q: "Which snippet is dependency injection?",
      o: [
        "<code>def call; StripeClient.new.charge(x); end</code>",
        "<code>def initialize(client: StripeClient.new); @client = client; end</code>",
        "<code>STRIPE = StripeClient.new</code> (a global)",
        "<code>include StripeClient</code>"
      ],
      a: 1,
      why: "The dependency comes in from outside, with a sensible default. Tests and other callers can swap it without monkey-patching."
    },
    {
      k: "myth",
      q: "Moving methods into Rails concerns gives you Single Responsibility.",
      a: false,
      why: "Concerns split the file, not the responsibility. The model still has every method and every reason to change. Sometimes that's fine, but extracting a real collaborator object is what actually separates responsibilities."
    },
    {
      k: "read",
      t: "Composition over inheritance",
      b: "Inheritance couples you to the parent's internals forever. Composition (an object that <em>has</em> a calculator, a notifier, a gateway) lets you swap parts. Default to composition, and use inheritance for true is-a relationships with a stable parent."
    },
    {
      k: "mcq",
      q: "<code>ExpressShipment < Shipment</code> overrides <code>#deliver_by</code> to raise when the destination is rural. What's the smell?",
      o: [
        "Open/Closed",
        "Liskov: callers expecting any Shipment now get exceptions",
        "Single Responsibility",
        "No smell"
      ],
      a: 1,
      why: "The subclass narrows what the parent accepts. Validate eligibility before choosing the shipment type, or model service levels as composition instead."
    }
  ],
  interview: {
    q: "Tell me about a time you refactored a class or module that did too much. How did you decide what to extract, and how did you keep it safe?",
    rubric: [
      "Concrete example with real context (system, size, pain it caused)",
      "Explains how responsibilities were identified (reasons to change, actors)",
      "Safety net: characterization tests before changing behavior",
      "Incremental approach (extract one collaborator at a time, strangler-style), not a big-bang rewrite",
      "Names trade-offs and shows a measurable result"
    ],
    model: "<p>A strong answer is a short story. <b>Situation:</b> e.g. a legacy retirement-plan app where one model handled contributions, compliance checks, and statements. <b>Diagnosis:</b> three different teams' requests all landed in that file, so it had three reasons to change.</p><p><b>Approach:</b> characterization tests around current behavior first. Then extract one collaborator at a time behind the same public interface, each in its own small PR, shipped behind a flag where the risk was real.</p><p><b>Result:</b> numbers if you have them (fewer bugs in that area, faster PR reviews, onboarding time). Close with what you'd do differently.</p>"
  },
  cards: [
    [
      "SRP in one line",
      "One reason to change, meaning one actor whose requests drive changes."
    ],
    ["Open/Closed smell", "A case/if on type repeated across the codebase."],
    [
      "Liskov in one line",
      "Subtypes must honor the parent's contract: no surprise raises, no stricter inputs."
    ],
    [
      "Dependency Inversion in Ruby",
      "Inject collaborators (with defaults) instead of hard-coding concrete classes."
    ],
    ["Do concerns give you SRP?", "No. They split the file, not the responsibilities."],
    [
      "Composition vs inheritance default?",
      "Prefer composition; inherit only for a real, stable is-a."
    ]
  ],
  cheat: [
    "S: one reason to change. O: extend by adding, not editing.",
    "L: subclasses keep the parent's promises.",
    "I: small role interfaces. D: inject dependencies.",
    "Concerns ≠ separation of responsibilities.",
    "Composition by default."
  ]
});
