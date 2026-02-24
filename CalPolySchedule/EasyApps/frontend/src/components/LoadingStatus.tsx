import { useState, useEffect } from "react";

const MESSAGES = [
  "Waking up",
  "Connecting",
  "Telling the hampsters to run faster",
  "Fetching classes",
  "Loading courses",
  "Almost There (we think)",
  "Praying to the Javascript Gods",
];

interface LoadingStatusProps {
  messages?: string[];
  intervalMs?: number;
}

export default function LoadingStatus({
  messages = MESSAGES,
  intervalMs = 2000,
}: LoadingStatusProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(id);
  }, [messages.length, intervalMs]);

  return (
    <>
      <style>{`
        @keyframes ls-dot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30%            { opacity: 1;    transform: translateY(-2px); }
        }
        .ls-d1 { animation: ls-dot 1.2s ease-in-out infinite 0ms; }
        .ls-d2 { animation: ls-dot 1.2s ease-in-out infinite 180ms; }
        .ls-d3 { animation: ls-dot 1.2s ease-in-out infinite 360ms; }

        @keyframes ls-msg {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ls-msg { animation: ls-msg 0.25s ease-out both; }

        @media (prefers-reduced-motion: reduce) {
          .ls-d1, .ls-d2, .ls-d3 { animation: none; opacity: 0.5; }
          .ls-msg                  { animation: none; }
        }
      `}</style>

      <div
        className="flex items-center gap-1.5 text-gray-400 text-xs select-none"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`${messages[index]}…`}
      >
        {/* Message — key forces remount so fade animation re-runs each cycle */}
        <span key={index} className="ls-msg">
          {messages[index]}
        </span>

        {/* Pulsing dots */}
        <span className="flex items-center gap-[3px]" aria-hidden="true">
          <span className="ls-d1 w-[3px] h-[3px] rounded-full bg-gray-400 inline-block" />
          <span className="ls-d2 w-[3px] h-[3px] rounded-full bg-gray-400 inline-block" />
          <span className="ls-d3 w-[3px] h-[3px] rounded-full bg-gray-400 inline-block" />
        </span>
      </div>
    </>
  );
}
