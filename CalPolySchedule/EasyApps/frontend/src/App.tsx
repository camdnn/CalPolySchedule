import { useState } from "react";
import LoginForm from "./components/LoginForm.tsx";
import Loading from "./components/Loading.tsx";
import Dashboard from "./components/CalendarCreation.tsx";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // When user submits name: show loading screen, then reveal dashboard
  const handleLogin = () => {
    setIsLoggedIn(true);
    setIsLoading(true);
  };

  // Auth screens (login + loading) are centered on a gray-50 background.
  // Once loading finishes, the full-screen dashboard takes over.
  const showDashboard = isLoggedIn && !isLoading;

  return (
    <div className="min-h-screen bg-white">
      {/* ── Auth screens ──────────────────────────────────────────────── */}
      {!showDashboard && (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
          <LoginForm isLoggedIn={isLoggedIn} setIsLoggedIn={handleLogin} />
          {isLoggedIn && (
            <Loading isLoading={isLoading} setIsLoading={setIsLoading} />
          )}
        </div>
      )}

      {/* ── Dashboard ─────────────────────────────────────────────────── */}
      {showDashboard && <Dashboard />}
    </div>
  );
}
