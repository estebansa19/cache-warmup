import type { Lesson } from "./types";

/*
 * What each lesson installs in prod (see state/prod.ts), by lesson id. A lesson without an entry
 * still gets an upgrade, named after it. The lines are about the service, never the lesson's answers.
 */
const UPGRADES: Record<string, { name: string; line: string }> = {
  bigo: { name: "Leaner code paths", line: "The busiest endpoint stops doing work it doesn't need." },
  ds: { name: "Better data structures", line: "Hot lookups get fast." },
  solid: { name: "Clean boundaries", line: "Changes stop breaking unrelated features." },
  patterns: { name: "Shared patterns", line: "Less one-off glue code to go wrong." },
  indexes: { name: "Database indexes", line: "The slow queries get fast." },
  tx: { name: "Tighter transactions", line: "Fewer requests stuck waiting on each other." },
  jobs: { name: "Background jobs", line: "Slow work leaves the request path." },
  http: { name: "HTTP caching", line: "Repeat visits barely touch your servers." },
  cache: { name: "Cache tier", line: "Hot reads skip the database." },
  dist: { name: "Replicas", line: "More copies to serve from, and fewer bad nights." },
  sysdesign: { name: "Load balancing", line: "Traffic spreads across everything you run." },
  testing: { name: "CI pipeline", line: "Bugs get caught before customers find them." },
  security: { name: "Rate limiting", line: "Bots stop eating your capacity." },
  story: { name: "A teammate", line: "Someone to share the pager with." },
};

export const SERVERS_UPGRADE = { name: "App servers", line: "More boxes in the rack, more requests." };

export function upgradeFor(lesson: Lesson) {
  return UPGRADES[lesson.id] ?? { name: lesson.title, line: "What you learned, running in prod." };
}
