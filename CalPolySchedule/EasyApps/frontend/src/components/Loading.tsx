import { useEffect } from "react";

interface LoadingProps {
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
}

export default function Loading({ isLoading, setIsLoading }: LoadingProps) {
  useEffect(() => {
    if (isLoading) {
      // Simulate loading time, then transition to next component
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 3000); // 3 seconds loading time

      return () => clearTimeout(timer);
    }
  }, [isLoading, setIsLoading]);

  return (
    <div
      className={`
        w-full max-w-2xl
        transition-all duration-500 ease-in-out delay-300
        ${isLoading ? "opacity-100 scale-100" : "opacity-0 scale-95 absolute pointer-events-none"}
      `}
    >
      <div className="bg-emerald-900/20 backdrop-blur-sm p-8 rounded-2xl border border-emerald-700/30 shadow-2xl">
        <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-yellow-400 mb-8 text-center animate-pulse">
          Welcome to Cal Poly SLO!
        </h2>
        <p className="text-lime-300 text-center mb-6">
          You have successfully logged in, let's start creating your calendar.
        </p>

        {/* Loading Spinner */}
        <div className="flex justify-center items-center mt-8">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-emerald-900/30 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-lime-400 border-r-yellow-400 rounded-full animate-spin"></div>
          </div>
        </div>

        {/* Loading dots */}
        <div className="flex justify-center items-center gap-2 mt-6">
          <div
            className="w-2 h-2 bg-lime-400 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          ></div>
          <div
            className="w-2 h-2 bg-lime-400 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          ></div>
          <div
            className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          ></div>
        </div>

        {/* Progress bar */}
        <div className="mt-8 w-full bg-emerald-950/50 rounded-full h-2 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-lime-500 to-yellow-500 rounded-full animate-loading-bar"></div>
        </div>
      </div>

      <style>{`
        @keyframes loading-bar {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }

        .animate-loading-bar {
          animation: loading-bar 3s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
}
