import { AboutYou } from "./AboutYou";
import { AISettings } from "./AISettings";
import { ProgressSettings } from "./ProgressSettings";
import "./Settings.css";

export function Settings() {
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Settings</p>
        <h1>Make it yours</h1>
        <p>Everything here is optional. Your progress stays in this browser unless you export it.</p>
      </div>
      <div className="settings">
        <AISettings />
        <AboutYou />
        <ProgressSettings />
      </div>
    </>
  );
}
