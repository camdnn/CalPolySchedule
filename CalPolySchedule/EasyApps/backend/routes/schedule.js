const express = require("express");
const router = express.Router();
const { pool } = require("../db/index");

// ── Helpers ────────────────────────────────────────────────────────────────

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Compute metadata for a set of sections (used in /generate response)
function calcMeta(sections) {
  const days = new Set();
  const byDay = {};
  for (const s of sections) {
    if (!s.days || !s.start_time || !s.end_time) continue;
    for (const day of s.days.split("")) {
      days.add(day);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({ start: timeToMin(s.start_time), end: timeToMin(s.end_time) });
    }
  }
  let totalGap = 0;
  for (const daySections of Object.values(byDay)) {
    daySections.sort((a, b) => a.start - b.start);
    for (let i = 1; i < daySections.length; i++) {
      const gap = daySections[i].start - daySections[i - 1].end;
      if (gap > 0) totalGap += gap;
    }
  }
  return { daysOnCampus: days.size, totalGap };
}

// Parse JSON-encoded blocked time slots from query param
function parseBlockedSlots(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// Returns true if a section overlaps any blocked slot
function sectionIsBlocked(row, blockedSlots) {
  if (!row.days || !row.start_time || !row.end_time) return false;
  const rowStart = timeToMin(row.start_time);
  const rowEnd   = timeToMin(row.end_time);
  const rowDays  = new Set(row.days.split(""));
  return blockedSlots.some(
    (slot) => rowDays.has(slot.day) && rowStart < slot.endMin && slot.startMin < rowEnd
  );
}

// Build WHERE conditions + params array (shared by /schedule and /generate)
function buildConditions(term, courses, startTime, endTime, days) {
  const courseList = courses.split(",").map((c) => {
    const parts = c.trim().split(" ");
    return { subject: parts[0], catalog_nbr: parts[1] };
  });

  const conditions  = ["t.term_code = $1"];
  const params      = [term];
  let   paramIndex  = 2;

  const courseConditions = courseList.map((c) => {
    const s = `(o.subject = $${paramIndex} AND o.catalog_nbr = $${paramIndex + 1})`;
    params.push(c.subject, c.catalog_nbr);
    paramIndex += 2;
    return s;
  });
  conditions.push(`(${courseConditions.join(" OR ")})`);

  if (startTime) {
    conditions.push(`o.start_time >= $${paramIndex}::time`);
    params.push(startTime);
    paramIndex++;
  }
  if (endTime) {
    conditions.push(`o.end_time <= $${paramIndex}::time`);
    params.push(endTime);
    paramIndex++;
  }
  if (days) {
    const allowedDays = days.split(",").join("");
    conditions.push(`o.days ~ $${paramIndex}`);
    params.push(`^[${allowedDays}]+$`);
    paramIndex++;
  }
  return { conditions, params };
}

const SELECT_COLS = `
  o.subject,
  o.catalog_nbr,
  o.descr,
  o.class_section,
  o.component,
  o.class_nbr,
  o.days,
  o.start_time,
  o.end_time,
  o.facility_descr  AS location,
  o.instructor_name,
  o.enrollment_available,
  pr.overall_rating,
  pr.num_evals
`;

const FROM_JOIN = `
  FROM class_offerings o
  JOIN  terms t ON t.id = o.term_id
  LEFT JOIN professor_ratings pr
    ON LOWER(o.instructor_name) LIKE
       '%%' || LOWER(SPLIT_PART(pr.professor_name, ',', 1)) || '%%'
`;

// Two sections conflict when they share a day AND their times overlap
function sectionsConflict(a, b) {
  if (!a.days || !b.days || !a.start_time || !b.start_time || !a.end_time || !b.end_time) return false;
  const aDays = new Set(a.days.split(""));
  if (!b.days.split("").some((d) => aDays.has(d))) return false;
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

// Backtracking combination builder — stops at `limit` results
function buildSchedules(groups, idx, current, results, limit) {
  if (results.length >= limit) return;
  if (idx === groups.length) { results.push([...current]); return; }
  for (const section of groups[idx]) {
    if (!current.some((s) => sectionsConflict(s, section))) {
      current.push(section);
      buildSchedules(groups, idx + 1, current, results, limit);
      current.pop();
      if (results.length >= limit) return;
    }
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.get("/terms", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT term_code, term_name FROM terms WHERE is_active = true ORDER BY term_code DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching terms:", err);
    res.status(500).json({ error: "Failed to fetch terms", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/schedule
// Returns a flat list of matching sections.
// Supports: term, courses, minRating, startTime, endTime, days, blockedTimes
// ─────────────────────────────────────────────────────────────────
router.get("/schedule", async (req, res) => {
  try {
    const { term, courses, minRating, startTime, endTime, days, blockedTimes } = req.query;
    if (!term || !courses) return res.status(400).json({ error: "term and courses are required" });
    if (startTime && endTime && startTime > endTime) {
      return res.status(400).json({ error: "startTime must be <= endTime" });
    }

    const { conditions, params } = buildConditions(term, courses, startTime, endTime, days);
    const SQL = `
      SELECT ${SELECT_COLS}
      ${FROM_JOIN}
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY o.subject, o.catalog_nbr, o.class_section;
    `;
    const result = await pool.query(SQL, params);
    let rows = result.rows;

    if (minRating) {
      const min = parseFloat(minRating);
      rows = rows.filter((r) => r.overall_rating === null || Number(r.overall_rating) >= min);
    }

    const blocked = parseBlockedSlots(blockedTimes);
    if (blocked.length > 0) {
      rows = rows.filter((r) => !sectionIsBlocked(r, blocked));
    }

    res.json(rows);
  } catch (err) {
    console.error("Error fetching schedule:", err);
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/generate
// Returns conflict-free schedule combinations sorted by avg rating.
// Extra params: blockedTimes (JSON), lockedClassNbrs (CSV class numbers)
// Response: Array<{ sections, avgRating, daysOnCampus, totalGap }>
// ─────────────────────────────────────────────────────────────────
router.get("/generate", async (req, res) => {
  try {
    const {
      term, courses, minRating, startTime, endTime, days,
      blockedTimes, lockedClassNbrs,
    } = req.query;
    if (!term || !courses) return res.status(400).json({ error: "term and courses are required" });

    const { conditions, params } = buildConditions(term, courses, startTime, endTime, days);
    const SQL = `
      SELECT ${SELECT_COLS}
      ${FROM_JOIN}
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY o.subject, o.catalog_nbr, o.component, o.class_section;
    `;
    const result = await pool.query(SQL, params);
    let rows = result.rows;

    // Filter by min rating (keep unknowns)
    if (minRating) {
      const min = parseFloat(minRating);
      rows = rows.filter((r) => r.overall_rating === null || Number(r.overall_rating) >= min);
    }

    // Hard-filter blocked time slots
    const blocked = parseBlockedSlots(blockedTimes);
    if (blocked.length > 0) {
      rows = rows.filter((r) => !sectionIsBlocked(r, blocked));
    }

    // Separate locked sections (fixed slots) from unlocked (to be permuted)
    const lockedNbrs = new Set(
      (lockedClassNbrs || "").split(",").filter(Boolean).map(Number)
    );
    const lockedRows   = rows.filter((r) => lockedNbrs.has(Number(r.class_nbr)));
    const unlockedRows = rows.filter((r) => !lockedNbrs.has(Number(r.class_nbr)));

    // Keys already covered by a locked section — skip those groups
    const lockedKeys = new Set(
      lockedRows.map((r) => `${r.subject}|${r.catalog_nbr}|${r.component}`)
    );

    // Group remaining sections by (subject, catalog_nbr, component)
    const groupMap = new Map();
    for (const row of unlockedRows) {
      const key = `${row.subject}|${row.catalog_nbr}|${row.component}`;
      if (lockedKeys.has(key)) continue;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key).push(row);
    }
    const groups = [...groupMap.values()];

    if (groups.length === 0 && lockedRows.length === 0) return res.json([]);

    // Backtracking: seed `current` with locked sections
    const raw = [];
    buildSchedules(groups, 0, [...lockedRows], raw, 100);

    // Score and attach metadata
    const scored = raw.map((sections) => {
      const ratings = sections
        .map((s) => s.overall_rating)
        .filter((r) => r !== null)
        .map(Number);
      const avgRating = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;
      const { daysOnCampus, totalGap } = calcMeta(sections);
      return { sections, avgRating, daysOnCampus, totalGap };
    });

    // Default sort: best avg rating first, null-rated last
    scored.sort((a, b) => {
      if (a.avgRating === null && b.avgRating === null) return 0;
      if (a.avgRating === null) return 1;
      if (b.avgRating === null) return -1;
      return b.avgRating - a.avgRating;
    });

    res.json(scored.slice(0, 15));
  } catch (err) {
    console.error("Error generating schedules:", err);
    res.status(500).json({ error: "Failed to generate schedules" });
  }
});

module.exports = router;
