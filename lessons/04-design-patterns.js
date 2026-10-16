// Lesson 4: Patterns you already use
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "patterns",
  n: 4,
  track: "Foundations",
  mins: 20,
  title: "Patterns you already use",
  tag: "Put names on the shapes you've been writing for years.",
  hook: "You've written a dozen of these in Rails without calling them by name. <mark>Interviews want the name plus the trade-off.</mark> That's the whole trick: the vocabulary lets you explain a design in one sentence.",
  steps: [
    {
      k: "read",
      t: "Three families",
      b: "<b>Creational</b>: how objects get made (Factory, Builder, Singleton). <b>Structural</b>: how objects fit together (Adapter, Decorator, Facade). <b>Behavioral</b>: how objects talk and split work (Strategy, Observer, Template Method, Command)."
    },
    {
      k: "read",
      t: "Strategy",
      b: "Swap an algorithm at runtime behind one interface.",
      code: `class DailyProration;  def amount(plan, days) = plan.daily_rate * days; end
class NoProration;     def amount(plan, _)    = plan.price; end

proration = account.prorates? ? DailyProration.new : NoProration.new
invoice.add_line(proration.amount(plan, remaining_days))`,
      note: "Strategy is how you fix the Open/Closed smell from lesson 3."
    },
    {
      k: "read",
      t: "Adapter and Facade",
      b: "<b>Adapter</b>: make an awkward interface look like the one you want. Each carrier's API gets a <code>FedexAdapter#quote</code> that returns your own <code>Quote</code> object.<br><br><b>Facade</b>: one simple entry point over a messy subsystem. <code>Shipping.book(order)</code> hides quoting, label creation, pickup scheduling, and tracking registration.<br><br>Difference: an adapter <mark>translates</mark> one interface, a facade <mark>simplifies</mark> many."
    },
    {
      k: "read",
      t: "Decorator",
      b: "Add behavior by wrapping an object, without subclassing it. Presenters are decorators.",
      code: `class InvoicePresenter < SimpleDelegator
  def display_total = format("$%.2f", total / 100.0)
end

InvoicePresenter.new(invoice).display_total
# every other method still goes to invoice`
    },
    {
      k: "read",
      t: "Observer (and its dark side)",
      b: "Publishers announce events and subscribers react without the publisher knowing who's listening. <code>ActiveSupport::Notifications</code>, model callbacks, and webhooks are all observer-shaped.<br><br>The trade-off: decoupling becomes <mark>action at a distance</mark>. Saving a model fires a callback that enqueues a job that sends an email, and nobody reading <code>save</code> can tell."
    },
    {
      k: "read",
      t: "Factory, Builder, Null Object, Template Method",
      b: "<ul><li><b>Factory</b>: centralize 'which class do I instantiate?' FactoryBot is named after it.</li><li><b>Builder</b>: assemble a complex object step by step. <code>Order.where(...).order(...).limit(10)</code> is a fluent builder that only runs the SQL at the end.</li><li><b>Null Object</b>: a <code>GuestUser</code> that answers like a user, so you stop writing <code>if user.nil?</code>.</li><li><b>Template Method</b>: a base class defines the steps and subclasses fill in hooks, like a base importer with <code>parse</code> and <code>persist</code>.</li></ul>"
    },
    {
      k: "mcq",
      q: "<code>Invoice.where(status: :open).order(:due_on).limit(20)</code>, where nothing hits the DB until you iterate. Which pattern is closest?",
      o: ["Singleton", "Builder (fluent interface, lazy execution)", "Observer", "Adapter"],
      a: 1,
      why: "Each call returns a new relation with one more piece configured. The query is only built and run at the end. Classic builder."
    },
    {
      k: "mcq",
      q: "You wrap each carrier's SDK so they all return your <code>Quote</code> struct. Pattern?",
      o: ["Facade", "Adapter", "Decorator", "Strategy"],
      a: 1,
      why: "Translating a foreign interface into the one your code expects is an Adapter. Picking which adapter to use at runtime would be Strategy layered on top."
    },
    {
      k: "mcq",
      q: "Views are full of <code>user ? user.name : \"Guest\"</code>. Cleanest fix?",
      o: [
        "A Null Object (<code>GuestUser</code>) that responds to the same methods",
        "A global helper",
        "Singleton",
        "Rescue NoMethodError"
      ],
      a: 0,
      why: "A Null Object removes the conditional from every call site and gives the 'nobody' case explicit, testable behavior."
    },
    {
      k: "myth",
      q: "Singletons are a clean way to share mutable state across an app.",
      a: false,
      why: "A mutable singleton is a global variable in a nice suit. It makes tests order-dependent and breaks under threads. Fine for immutable config, risky for anything that changes."
    }
  ],
  interview: {
    q: "When do design patterns hurt? Give me an example of over-engineering you've seen (or done), and how you decide when an abstraction is worth it.",
    rubric: [
      "Honest, specific example of premature abstraction",
      "Names the cost: indirection, harder onboarding, wrong abstraction locked in",
      "Has a decision heuristic (rule of three, YAGNI, cost of change later)",
      "Mentions that duplication can be cheaper than the wrong abstraction",
      "Shows how they reversed or simplified it"
    ],
    model: "<p>Patterns hurt when they come before the problem. Example: a payment 'provider framework' with factories, registries, and adapters, built when there was exactly one provider. Every change touched five files and new engineers had to learn the framework before they could fix a bug.</p><p><b>Heuristic:</b> wait for the second or third real case (rule of three). Duplication is cheaper than the wrong abstraction. Ask how expensive the change would be later, and if it's cheap, defer it.</p><p><b>Reversal:</b> inline the indirection, keep a single adapter boundary at the external API, delete the rest.</p>"
  },
  cards: [
    ["Adapter vs Facade", "Adapter translates one interface; Facade simplifies many."],
    ["SimpleDelegator presenter is which pattern?", "Decorator."],
    ["ActiveRecord::Relation chaining resembles…", "Builder: fluent, lazily executed."],
    ["Pattern to remove `if user.nil?` everywhere", "Null Object."],
    ["Observer's main downside", "Action at a distance: hidden side effects."],
    ["Rule of three", "Abstract on the third real occurrence, not the first."]
  ],
  cheat: [
    "Strategy swaps algorithms; Adapter translates; Facade simplifies.",
    "Decorator wraps to add behavior (presenters).",
    "Observer decouples but hides side effects.",
    "Builder = fluent, lazy (AR relations).",
    "Duplication beats the wrong abstraction."
  ]
});
