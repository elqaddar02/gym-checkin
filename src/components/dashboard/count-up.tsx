"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 900;

/** Fast at first, settling at the end — a count that lands rather than stops. */
function easeOutCubic(progress: number) {
  const p = Math.min(Math.max(progress, 0), 1);
  return 1 - (1 - p) ** 3;
}

/**
 * A figure that counts up to its value. Starts at 0 on the server and the client
 * alike so hydration agrees; anyone who asked for less motion gets the number
 * straight away. Screen readers get the final figure once, not every frame.
 */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = reduced ? 1 : (now - start) / DURATION_MS;
      const next = Math.round(from + (value - from) * easeOutCubic(progress));
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <>
      <span aria-hidden>{shown.toLocaleString("fr-FR")}</span>
      <span className="sr-only">{value.toLocaleString("fr-FR")}</span>
    </>
  );
}
