import { useState, useEffect } from "react";

type FormState = { name: string; email: string; message: string };
type Status = "idle" | "submitting" | "success" | "error";

const ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT as string;
const EMPTY: FormState = { name: "", email: "", message: "" };

export default function ContactWidget() {
  const [open, setOpen]     = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [form, setForm]     = useState<FormState>(EMPTY);

  // Lock body scroll while panel is open (mobile bottom-sheet UX)
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) { setStatus("success"); setForm(EMPTY); }
      else setStatus("error");
    } catch { setStatus("error"); }
  }

  const field = (key: keyof FormState) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });

  return (
    <>
      <style>{`
        /* Panel slide/fade/scale — mobile: full bottom-sheet, desktop: card */
        .cw-panel {
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .cw-panel[data-open="false"] {
          opacity: 0;
          transform: translateY(100%);
          pointer-events: none;
        }
        .cw-panel[data-open="true"] {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        @media (min-width: 768px) {
          .cw-panel[data-open="false"] {
            transform: translateY(0.75rem) scale(0.96);
          }
        }

        /* FAB pop-in on first mount */
        @keyframes cw-pop {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .cw-fab { animation: cw-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>

      {/* ── Backdrop (mobile only — desktop panel has its own shadow) ── */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 md:hidden transition-opacity duration-250
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ── Panel ── */}
      <div
        className="cw-panel fixed bottom-0 left-0 right-0 z-50 bg-white shadow-2xl rounded-t-3xl
                   md:bottom-24 md:right-6 md:left-auto md:w-80 md:rounded-2xl"
        data-open={String(open)}
        role="dialog"
        aria-modal="true"
        aria-label="Contact us"
      >
        <div className="p-6">
          {/* Drag handle — visible on mobile only */}
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 md:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-900 tracking-tight">Send a message</h2>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Close contact form"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Success state */}
          {status === "success" ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900">Message sent!</p>
              <p className="text-xs text-gray-500 mt-1">We'll get back to you soon.</p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-4 text-xs text-green-600 hover:text-green-700 font-medium cursor-pointer focus:outline-none underline-offset-2 hover:underline"
              >
                Send another
              </button>
            </div>

          ) : (
            /* Form */
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div>
                <label htmlFor="cw-name" className="block text-xs font-medium text-gray-600 mb-1">
                  Name
                </label>
                <input
                  id="cw-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all placeholder:text-gray-400"
                  {...field("name")}
                />
              </div>

              <div>
                <label htmlFor="cw-email" className="block text-xs font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  id="cw-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@email.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all placeholder:text-gray-400"
                  {...field("email")}
                />
              </div>

              <div>
                <label htmlFor="cw-msg" className="block text-xs font-medium text-gray-600 mb-1">
                  Message
                </label>
                <textarea
                  id="cw-msg"
                  required
                  rows={4}
                  placeholder="How can we help?"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all resize-none placeholder:text-gray-400"
                  {...field("message")}
                />
              </div>

              {status === "error" && (
                <p className="text-xs text-red-500">Something went wrong — please try again.</p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                {status === "submitting" ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── FAB trigger ── */}
      <button
        className={`cw-fab fixed bottom-6 right-6 z-50 w-14 h-14 bg-green-600 hover:bg-green-700
          text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center
          transition-all duration-200 cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
          ${open ? "rotate-90 scale-95" : "rotate-0 scale-100"}`}
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close contact form" : "Contact us"}
        aria-expanded={open}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </>
  );
}
