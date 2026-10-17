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

/** Views whose route is just their name, like #/review. */
const SIMPLE_VIEWS = ["review", "gym", "notes", "settings"] as const;
type SimpleView = (typeof SIMPLE_VIEWS)[number];

export function parseRoute(hash: string): Route {
  const [view, id] = hash.replace(/^#\/?/, "").split("/");

  if (view === "lesson" && id) {
    try {
      return { view: "lesson", id: decodeURIComponent(id) };
    } catch {
      return { view: "home" }; // a malformed link, like #/lesson/%E0
    }
  }

  return isSimpleView(view) ? { view } : { view: "home" };
}

function isSimpleView(view: string): view is SimpleView {
  return (SIMPLE_VIEWS as readonly string[]).includes(view);
}

export function hrefFor(route: Route): string {
  switch (route.view) {
    case "lesson":
      return `#/lesson/${encodeURIComponent(route.id)}`;
    case "home":
      return "#/";
    default:
      return `#/${route.view}`;
  }
}

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
