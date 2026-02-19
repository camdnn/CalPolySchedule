import { useState } from "react";
import LoginForm from "./components/LoginForm.tsx";
import Loading from "./components/Loading.tsx";
import Dashboard from "./components/CalendarCreation.tsx";

export default function App() {
  // `isLoggedIn`: user has submitted the login form.
  // `isLoading`: short transition state while we show the branded loading screen.
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
      {/* LoginForm is always mounted here until dashboard is ready.
          Loading overlays only after login is triggered. */}
      {!showDashboard && (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
          <LoginForm isLoggedIn={isLoggedIn} setIsLoggedIn={handleLogin} />
          {isLoggedIn && (
            <Loading isLoading={isLoading} setIsLoading={setIsLoading} />
          )}
        </div>
      )}

      {/* ── Dashboard ─────────────────────────────────────────────────── */}
      {/* Main app shell renders only when auth transition is complete. */}
      {showDashboard && <Dashboard />}
    </div>
  );
}
