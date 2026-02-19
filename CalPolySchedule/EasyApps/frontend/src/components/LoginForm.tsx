import { useState } from "react";

interface LoginFormProps {
  isLoggedIn: boolean;
  setIsLoggedIn: (value: boolean) => void;
}

export default function LoginForm({ isLoggedIn, setIsLoggedIn }: LoginFormProps) {
  const [isFading, setIsFading] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    localStorage.setItem("userName", name.trim());
    setIsFading(true);
    setTimeout(() => setIsLoggedIn(true), 500);
  };

  return (
    <div
      className={`
        w-full max-w-sm transition-all duration-500 ease-in-out
        ${isFading ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}
        ${isLoggedIn ? "hidden" : ""}
      `}
    >
      {/* Wordmark */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 bg-green-600 rounded-lg" />
          <span className="text-xl font-bold text-gray-950 tracking-tight">
            Mustang Scheduler
          </span>
        </div>
        <p className="text-gray-500 text-sm">
          Build your optimal Cal Poly SLO schedule
        </p>
        <p className="text-gray-400 text-xs mt-1">Powered by PolyRatings data</p>
      </div>

      {/* Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <div className="mb-5">
          <label className="block text-gray-950 font-medium text-sm mb-2">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Enter your name"
            autoFocus
            className="
              w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl
              text-gray-950 text-sm outline-none transition-all duration-200
              placeholder:text-gray-400
              focus:border-green-600 focus:ring-2 focus:ring-green-600/10 focus:bg-white
            "
          />
        </div>

        {name.trim() && (
          <div className="mb-5 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl animate-fade-in">
            <p className="text-gray-700 text-sm text-center">
              Hey <span className="font-semibold text-gray-950">{name}</span>! 👋{" "}
              <span className="text-gray-500">Let's build your perfect schedule.</span>
            </p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="
            w-full py-3 bg-gray-950 hover:bg-green-600 text-white
            font-medium text-sm rounded-xl transition-all duration-200
            hover:scale-[1.01] active:scale-[0.99] cursor-pointer
            disabled:opacity-40 disabled:cursor-not-allowed
            disabled:hover:scale-100 disabled:hover:bg-gray-950
          "
        >
          Get Started →
        </button>

        <p className="text-gray-400 text-xs text-center mt-5">
          No account needed · Free to use · Student-built
        </p>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.25s ease-out; }
      `}</style>
    </div>
  );
}
