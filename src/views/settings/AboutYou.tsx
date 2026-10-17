import { useProgress } from "../../state/ProgressContext";

export function AboutYou() {
  const { progress, dispatch } = useProgress();

  return (
    <section className="panel settings-card">
      <p className="eyebrow">About you</p>
      <div className="field">
        <label htmlFor="profile">What should the interviewer know about you?</label>
        <textarea
          id="profile"
          className="ruled short"
          value={progress.profile}
          onChange={(e) => dispatch({ type: "profile", text: e.target.value })}
          placeholder="Example: Senior backend engineer, 6 years. Mostly Python and Django, some Go. Payments and logistics."
        />
        <span className="help">
          Used to calibrate the feedback, since a junior and a staff engineer get graded differently. It's
          sent with each answer you submit for feedback.
        </span>
      </div>
    </section>
  );
}
