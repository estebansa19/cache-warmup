import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  confirmLabel: string;
  /** Shown next to the buttons while asking. */
  warning?: string;
  small?: boolean;
  onConfirm: () => void;
};

/**
 * A destructive button that asks first: pressing it swaps it for "Yes…" and "Keep it".
 * Focus stays on the safe choice as the buttons swap ("Keep it", or the button again).
 */
export function ConfirmButton({ label, confirmLabel, warning, small, onConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);
  const size = small ? " small" : "";

  useEffect(() => {
    if (!toggled.current) return;
    (asking ? keep : trigger).current?.focus({ preventScroll: true });
  }, [asking]);

  function ask(open: boolean) {
    toggled.current = true;
    setAsking(open);
  }

  function confirm() {
    onConfirm();
    ask(false);
  }

  if (!asking) {
    return (
      <button className={`btn ghost${size}`} ref={trigger} onClick={() => ask(true)}>
        {label}
      </button>
    );
  }

  return (
    <>
      {warning && <span className="muted">{warning}</span>}
      <button className={`btn danger${size}`} onClick={confirm}>
        {confirmLabel}
      </button>
      <button className={`btn ghost${size}`} ref={keep} onClick={() => ask(false)}>
        Keep it
      </button>
    </>
  );
}
