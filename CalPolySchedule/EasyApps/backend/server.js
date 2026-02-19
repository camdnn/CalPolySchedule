const express = require("express");
const cors = require("cors");
const scheduleRoutes = require("./routes/schedule");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────────
// cors() lets the React dev server (localhost:5173) talk to this
// server (localhost:3001). Without it, the browser blocks the request.
app.use(cors());

// Parses JSON request bodies so req.body works
app.use(express.json());

// ── Health check (used by UptimeRobot to prevent Render spin-down) ─
app.get("/health", (_req, res) => res.sendStatus(200));

// ── Routes ────────────────────────────────────────────────────────
// Everything under /api/schedule is handled by the schedule router
app.use("/api", scheduleRoutes);

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
