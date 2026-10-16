import { AIProvider } from "./ai/AIContext";
import { Nav } from "./components/Nav";
import { lessonById } from "./content/lessons";
import { useRoute } from "./router";
import { ProgressProvider } from "./state/ProgressContext";
import { CheatSheets } from "./views/CheatSheets";
import { Gym } from "./views/Gym";
import { Home } from "./views/Home";
import { LessonPlayer } from "./views/LessonPlayer";
import { Review } from "./views/Review";
import { Settings } from "./views/Settings";

export function App() {
  return (
    <ProgressProvider>
      <AIProvider>
        <Shell />
      </AIProvider>
    </ProgressProvider>
  );
}

function Shell() {
  const route = useRoute();
  const lesson = route.view === "lesson" ? lessonById.get(route.id) : undefined;

  return (
    <>
      <Nav route={route} />
      <main className="page">
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
