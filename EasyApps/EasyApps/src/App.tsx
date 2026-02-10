import { useState } from "react";
import LoginForm from "./components/LoginForm.tsx";
import Loading from "./components/Loading.tsx";
import Dashboard from "./components/CalendarCreation.tsx";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // When user logs in, show loading screen
  const handleLogin = () => {
    setIsLoggedIn(true);
    setIsLoading(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-green-900 to-emerald-950 flex items-center justify-center p-6">
      {/* Login Form */}
      <LoginForm isLoggedIn={isLoggedIn} setIsLoggedIn={handleLogin} />

      {/* Loading Screen - shows after login */}
      {isLoggedIn && (
        <Loading isLoading={isLoading} setIsLoading={setIsLoading} />
      )}

      <Dashboard isVisible={!isLoading && isLoggedIn} />
    </div>
  );
}
