import { useEffect, useRef } from "react";
import { AIProvider } from "./ai/AIContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Nav } from "./components/Nav";
import { lessonById } from "./content/lessons";
import type { Lesson } from "./content/types";
import { useRoute, type Route } from "./router";
import { ProgressProvider } from "./state/ProgressContext";
import { focusFirst } from "./utils/focus";
import { CheatSheets } from "./views/CheatSheets";
import { Gym } from "./views/Gym";
import { Home } from "./views/Home";
import { LessonPlayer } from "./views/LessonPlayer";
import { Review } from "./views/Review";
import { Settings } from "./views/settings/Settings";

const TITLES: Record<Exclude<Route["view"], "lesson">, string> = {
  home: "",
  review: "Review",
  gym: "Interview gym",
  notes: "Cheat sheets",
  settings: "Settings",
};

export function App() {
  return (
    <ErrorBoundary>
      <ProgressProvider>
        <AIProvider>
          <Shell />
        </AIProvider>
      </ProgressProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const lesson = route.view === "lesson" ? lessonById.get(route.id) : undefined;
  const title = route.view === "lesson" ? (lesson?.title ?? "") : TITLES[route.view];

  // On every route change after the first: name the tab, and take focus to the new page's heading.
  useEffect(() => {
    document.title = title ? `${title} · Cache Warmup` : "Cache Warmup";

    if (firstRender.current) firstRender.current = false;
    else focusFirst(main.current, "h1");
  }, [route.view, title]);

  return (
    <>
      <Nav route={route} />
      <main className="page" ref={main}>
        {renderView(route, lesson)}
      </main>
      <footer className="footer">
        Progress is saved in this browser. Settings → Export moves it to another one.
      </footer>
    </>
  );
}

/** The page for a route. An unknown lesson id shows the path. */
function renderView(route: Route, lesson: Lesson | undefined) {
  switch (route.view) {
    case "lesson":
      // key: a fresh player per lesson, so step state never leaks between lessons
      return lesson ? <LessonPlayer key={lesson.id} lesson={lesson} /> : <Home />;
    case "review":
      return <Review />;
    case "gym":
      return <Gym />;
    case "notes":
      return <CheatSheets />;
    case "settings":
      return <Settings />;
    case "home":
      return <Home />;
  }
}
