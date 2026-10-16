// Extra interview questions for the Interview gym (no rubric needed).
// Add one by appending { id, topic, q }. Keep ids unique and prefixed with "x-".
window.GYM_EXTRAS = [
  {
    id: "x-explain-n1",
    topic: "Data",
    q: "Explain the N+1 query problem to a junior engineer, and how you'd catch it before it reaches production."
  },
  {
    id: "x-ruby-gvl",
    topic: "Ruby",
    q: "If Ruby has a GVL, why does running Puma with multiple threads improve throughput for a typical Rails app?"
  },
  {
    id: "x-soft-delete",
    topic: "Data",
    q: "What are the trade-offs of soft deletes (deleted_at) versus hard deletes plus an archive table?"
  },
  {
    id: "x-migrate-col",
    topic: "Data",
    q: "How do you rename a heavily used column in a large production table with zero downtime?"
  },
  {
    id: "x-money",
    topic: "Fintech",
    q: "How should money be represented in code and in the database, and what goes wrong with floats?"
  },
  {
    id: "x-timezones",
    topic: "Fintech",
    q: "A subscription renews 'monthly on the 31st' for customers in many time zones. What edge cases do you design for?"
  },
  {
    id: "x-monolith",
    topic: "Architecture",
    q: "When would you split a Rails monolith into services, and when would you argue against it?"
  },
  {
    id: "x-incident",
    topic: "Ownership",
    q: "Walk me through how you lead the first 30 minutes of a production incident."
  },
  {
    id: "x-observability",
    topic: "Operations",
    q: "What's the difference between logs, metrics, and traces, and what would you instrument first in a new billing service?"
  },
  {
    id: "x-code-review",
    topic: "Craft",
    q: "What do you look for in a code review, and how do you give feedback on a design you disagree with?"
  },
  {
    id: "x-ai-tools",
    topic: "Craft",
    q: "How do you use AI coding tools in your day-to-day work, and how do you keep quality and security high when you do?"
  },
  {
    id: "x-mentor",
    topic: "Leadership",
    q: "Tell me about someone you helped grow. What did you do specifically, and how did you know it worked?"
  }
];
