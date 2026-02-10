import React, { useState } from "react";

interface LoginFormProps {
  isLoggedIn: boolean;
  setIsLoggedIn: (value: boolean) => void;
}

export default function LoginForm({
  isLoggedIn,
  setIsLoggedIn,
}: LoginFormProps) {
  const [isFading, setIsFading] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }

    localStorage.setItem("userName", name.trim());

    setIsFading(true);
    setTimeout(() => {
      setIsLoggedIn(true);
    }, 500);
  };

  return (
    <div
      className={`
        w-full max-w-lg
        transition-all duration-500 ease-in-out
        ${isFading ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"}
        ${isLoggedIn ? "hidden" : ""}
      `}
    >
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-yellow-400 mb-3">
          Mustang Scheduler
        </h1>
        <p className="text-lime-300/80 text-lg">
          Build your optimal Cal Poly schedule
        </p>
        <p className="text-emerald-400/60 text-sm mt-2">
          Powered by PolyRatings
        </p>
      </div>

      <div className="bg-emerald-900/20 backdrop-blur-sm p-8 rounded-2xl border border-emerald-700/30 shadow-2xl">
        <div className="mb-6">
          <label className="block text-lime-400 font-medium mb-3 text-lg">
            What's your name?
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Enter your name"
            autoFocus
            className="
              w-full px-5 py-4 bg-emerald-950/30 
              border-2 border-emerald-700/50 rounded-xl
              text-lime-50 text-base
              outline-none
              transition-all duration-300 ease-out
              placeholder:text-emerald-400/40
              focus:border-lime-400 focus:shadow-lg focus:shadow-lime-400/20 focus:bg-emerald-950/50
              hover:border-emerald-600
            "
          />
        </div>

        {name.trim() && (
          <div className="mb-6 p-4 bg-lime-500/10 border border-lime-500/30 rounded-lg animate-fade-in">
            <p className="text-lime-300 text-center">
              Hey <span className="font-semibold text-lime-400">{name}</span>!
              👋
              <br />
              <span className="text-sm text-emerald-300">
                Let's build your perfect schedule
              </span>
            </p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="
            w-full px-6 py-4 
            bg-gradient-to-r from-lime-500 to-yellow-500
            hover:from-lime-400 hover:to-yellow-400
            text-emerald-950 font-semibold text-lg
            rounded-xl
            transform transition-all duration-300
            hover:scale-[1.02] hover:shadow-xl hover:shadow-lime-400/30
            active:scale-[0.98]
            cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
          "
        >
          Get Started
        </button>

        <p className="text-emerald-400/60 text-xs text-center mt-4">
          No account needed • Free to use • Student-built
        </p>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
