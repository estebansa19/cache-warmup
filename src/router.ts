import { useEffect, useState } from "react";

/*
 * Hash routes, so links work on any static host without server rewrites:
 *   #/            path (home)
 *   #/lesson/:id  a lesson
 *   #/review      flashcards
 *   #/gym         interview gym
 *   #/notes       cheat sheets
 *   #/settings    settings
 */

export type Route =
  | { view: "home" }
  | { view: "lesson"; id: string }
  | { view: "review" }
  | { view: "gym" }
  | { view: "notes" }
  | { view: "settings" };

export function parseRoute(hash: string): Route {
  const [view, id] = hash.replace(/^#\/?/, "").split("/");
  if (view === "lesson" && id) return { view: "lesson", id: decodeURIComponent(id) };
  if (view === "review" || view === "gym" || view === "notes" || view === "settings") return { view };
  return { view: "home" };
}

export const hrefFor = (route: Route): string =>
  route.view === "lesson"
    ? `#/lesson/${encodeURIComponent(route.id)}`
    : route.view === "home"
      ? "#/"
      : `#/${route.view}`;

export function navigate(route: Route) {
  window.location.hash = hrefFor(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
