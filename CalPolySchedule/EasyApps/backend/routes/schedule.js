const express = require("express");
const router = express.Router();
const { pool } = require("../db/index");

// ── Helpers ────────────────────────────────────────────────────────────────

// "HH:MM:SS" -> minutes from midnight for easy arithmetic comparisons.
function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Compute metadata for a set of sections (used in /generate response)
function calcMeta(sections) {
  // Tracks unique campus days represented by this schedule.
  const days = new Set();
  // Bucket classes by day so we can compute intra-day gaps.
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
  // For each day, sort sections by start and sum positive gaps only.
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
  // UI sends blocked slots as JSON in a query-string field.
  // Invalid payloads should not crash the endpoint.
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// Returns true if a section overlaps any blocked slot
function sectionIsBlocked(row, blockedSlots) {
  if (!row.days || !row.start_time || !row.end_time) return false;
  const rowStart = timeToMin(row.start_time);
  const rowEnd   = timeToMin(row.end_time);
  // e.g. "MWF" -> Set("M","W","F") for overlap checks.
  const rowDays  = new Set(row.days.split(""));
  // Interval overlap rule: A starts before B ends && B starts before A ends.
  return blockedSlots.some(
    (slot) => rowDays.has(slot.day) && rowStart < slot.endMin && slot.startMin < rowEnd
  );
}

// Build WHERE conditions + params array (shared by /schedule and /generate)
function buildConditions(term, courses, startTime, endTime, days) {
  // "CSC 101,MATH 142" -> [{subject:"CSC", catalog_nbr:"101"}, ...]
  const courseList = courses.split(",").map((c) => {
    const parts = c.trim().split(" ");
    return { subject: parts[0], catalog_nbr: parts[1] };
  });

  // Parameterized SQL pieces prevent injection and simplify dynamic filters.
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
    // Converts "M,W,F" into regex `^[MWF]+$` so all meeting days must be in set.
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
  pr.num_evals,
  pr.professor_key
`;

// Shared join for both endpoints:
// - terms join scopes offerings by term code
// - professor_ratings left join enriches with rating data when name match exists
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
  // Guardrail: prevents combinatorial explosion from large course sets.
  if (results.length >= limit) return;
  // Base case: one choice picked from each group => complete schedule.
  if (idx === groups.length) { results.push([...current]); return; }
  for (const section of groups[idx]) {
    // Add this candidate only if it doesn't overlap existing picks.
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
    // Active terms are curated by scraper updates in the DB.
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
    // Query-string API inputs from frontend filters.
    const { term, courses, minRating, startTime, endTime, days, blockedTimes, openOnly } = req.query;
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
    // DB returns all matching rows first; remaining filters are easy to apply in JS.
    const result = await pool.query(SQL, params);
    let rows = result.rows;

    // Deduplicate: the professor_ratings LIKE join can match multiple professors
    // with the same last name, producing duplicate rows for the same section.
    // Keep the row with the highest num_evals (most specific match).
    {
      const byNbr = new Map();
      for (const row of rows) {
        const existing = byNbr.get(row.class_nbr);
        if (!existing || (row.num_evals ?? -1) > (existing.num_evals ?? -1)) {
          byNbr.set(row.class_nbr, row);
        }
      }
      rows = [...byNbr.values()];
    }

    // Keep unrated sections (null) so users are not over-filtered.
    if (minRating) {
      const min = parseFloat(minRating);
      rows = rows.filter((r) => r.overall_rating === null || Number(r.overall_rating) >= min);
    }

    // Remove rows that overlap user-blocked windows.
    const blocked = parseBlockedSlots(blockedTimes);
    if (blocked.length > 0) {
      rows = rows.filter((r) => !sectionIsBlocked(r, blocked));
    }

    // Hide sections with no available seats when openOnly is requested.
    if (openOnly === "true") {
      rows = rows.filter((r) => r.enrollment_available !== null && r.enrollment_available > 0);
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
      blockedTimes, lockedClassNbrs, openOnly,
    } = req.query;
    if (!term || !courses) return res.status(400).json({ error: "term and courses are required" });

    const { conditions, params } = buildConditions(term, courses, startTime, endTime, days);
    const SQL = `
      SELECT ${SELECT_COLS}
      ${FROM_JOIN}
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY o.subject, o.catalog_nbr, o.component, o.class_section;
    `;
    // This fetch is the candidate pool for combinatorial schedule generation.
    const result = await pool.query(SQL, params);
    let rows = result.rows;

    // Deduplicate: professor LIKE join can produce duplicate rows per section.
    {
      const byNbr = new Map();
      for (const row of rows) {
        const existing = byNbr.get(row.class_nbr);
        if (!existing || (row.num_evals ?? -1) > (existing.num_evals ?? -1)) {
          byNbr.set(row.class_nbr, row);
        }
      }
      rows = [...byNbr.values()];
    }

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

    // Hide sections with no available seats when openOnly is requested.
    if (openOnly === "true") {
      rows = rows.filter((r) => r.enrollment_available !== null && r.enrollment_available > 0);
    }

    // Separate locked sections (fixed slots) from unlocked (to be permuted)
    // Locked sections are user-pinned and must appear in every generated result.
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
    // Each group represents "choose one section for this course component".
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
    // Limit is intentionally capped to keep response times predictable.
    const raw = [];
    buildSchedules(groups, 0, [...lockedRows], raw, 100);

    // Score and attach metadata
    // avgRating is null if no section in the schedule has rating data.
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

    // Return top N to keep payload/UI manageable.
    res.json(scored.slice(0, 15));
  } catch (err) {
    console.error("Error generating schedules:", err);
    res.status(500).json({ error: "Failed to generate schedules" });
  }
});

module.exports = router;
