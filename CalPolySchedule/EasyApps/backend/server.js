const express = require("express");
const cors = require("cors");
const scheduleRoutes = require("./routes/schedule");

const app = express();
const PORT = 3001;

// ── Middleware ─────────────────────────────────────────────────────
// cors() lets the React dev server (localhost:5173) talk to this
// server (localhost:3001). Without it, the browser blocks the request.
app.use(cors());

// Parses JSON request bodies so req.body works
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────
// Everything under /api/schedule is handled by the schedule router
app.use("/api", scheduleRoutes);

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
