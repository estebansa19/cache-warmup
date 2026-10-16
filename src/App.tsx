import { useEffect, useRef } from "react";
import { AIProvider } from "./ai/AIContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Nav } from "./components/Nav";
import { lessonById } from "./content/lessons";
import { useRoute, type Route } from "./router";
import { ProgressProvider } from "./state/ProgressContext";
import { focusFirst } from "./utils/focus";
import { CheatSheets } from "./views/CheatSheets";
import { Gym } from "./views/Gym";
import { Home } from "./views/Home";
import { LessonPlayer } from "./views/LessonPlayer";
import { Review } from "./views/Review";
import { Settings } from "./views/Settings";

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

const TITLES: Record<Exclude<Route["view"], "lesson">, string> = {
  home: "",
  review: "Review",
  gym: "Interview gym",
  notes: "Cheat sheets",
  settings: "Settings",
};

function Shell() {
  const route = useRoute();
  const lesson = route.view === "lesson" ? lessonById.get(route.id) : undefined;
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
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
        {route.view === "lesson" && lesson ? (
          // key: a fresh player per lesson, so step state never leaks between lessons
          <LessonPlayer key={lesson.id} lesson={lesson} />
        ) : route.view === "review" ? (
          <Review />
        ) : route.view === "gym" ? (
          <Gym />
        ) : route.view === "notes" ? (
          <CheatSheets />
        ) : route.view === "settings" ? (
          <Settings />
        ) : (
          <Home />
        )}
      </main>
      <footer className="footer">
        Progress is saved in this browser. Settings → Export moves it to another one.
      </footer>
    </>
  );
}
