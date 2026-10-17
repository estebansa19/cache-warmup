export type Message = { text: string; error?: boolean } | null;

/** Two live regions that are always on the page, so screen readers announce what changes in them. */
export function Notices({ message }: { message: Message }) {
  const info = message && !message.error ? message.text : null;
  const error = message?.error ? message.text : null;

  return (
    <>
      <p role="status" className={info ? "notice live" : "live"}>
        {info}
      </p>
      <p role="alert" className={error ? "notice error live" : "live"}>
        {error}
      </p>
    </>
  );
}
