import { useEffect } from "react";

interface LoadingProps {
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
}

export default function Loading({ isLoading, setIsLoading }: LoadingProps) {
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setIsLoading(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, setIsLoading]);

  return (
    <div
      className={`
        w-full max-w-sm transition-all duration-500 ease-in-out
        ${isLoading ? "opacity-100 scale-100" : "opacity-0 scale-95 absolute pointer-events-none"}
      `}
    >
      <div className="bg-white border border-gray-200 rounded-2xl p-10 shadow-sm text-center">
        {/* Wordmark */}
        <div className="inline-flex items-center gap-2.5 mb-8">
          <div className="w-7 h-7 bg-green-600 rounded-md" />
          <span className="text-lg font-bold text-gray-950 tracking-tight">
            Mustang Scheduler
          </span>
        </div>

        <p className="text-gray-950 font-semibold text-base mb-1">
          Welcome to Cal Poly SLO
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Setting up your schedule builder...
        </p>

        {/* Spinner */}
        <div className="flex justify-center mb-8">
          <div className="relative w-11 h-11">
            <div className="absolute inset-0 border-[3px] border-gray-100 rounded-full" />
            <div className="absolute inset-0 border-[3px] border-transparent border-t-green-600 rounded-full animate-spin" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
          <div className="h-full bg-green-600 rounded-full animate-loading-bar" />
        </div>
      </div>

      <style>{`
        @keyframes loading-bar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        .animate-loading-bar {
          animation: loading-bar 3s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
}
