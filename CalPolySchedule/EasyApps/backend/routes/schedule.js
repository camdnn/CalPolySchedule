const express = require("express");
const router = express.Router();
const { pool } = require("../db/index");

// ─────────────────────────────────────────────────────────────────
// GET /api/terms
// Returns the terms that actually exist in the DB (with data).
// The frontend will use these instead of generating its own.
// ─────────────────────────────────────────────────────────────────
router.get("/terms", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT term_code, term_name
       FROM terms
       WHERE is_active = true
       ORDER BY term_code DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching terms:", err);
    res.status(500).json({
      error: "Failed to fetch terms",
      detail: err.message, // <-- add this
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/schedule
//
// Query params (all sent by the frontend):
//   term       – term code, e.g. "2262"
//   courses    – comma-separated, e.g. "CSC 101,MATH 141"
//   minRating  – number like 3.5  (optional)
//   startTime  – "08:00"          (optional)
//   endTime    – "17:00"          (optional)
//   days       – "M,W,F"          (optional)
// ─────────────────────────────────────────────────────────────────
router.get("/schedule", async (req, res) => {
  try {
    const { term, courses, minRating, startTime, endTime, days } = req.query;

    // ── Validate required params ──
    if (!term || !courses) {
      return res.status(400).json({ error: "term and courses are required" });
    }

    // Parse "CSC 101,MATH 141" into [["CSC","101"], ["MATH","141"]]
    const courseList = courses.split(",").map((c) => {
      const parts = c.trim().split(" ");
      return { subject: parts[0], catalog_nbr: parts[1] };
    });

    // ── Build the WHERE clause dynamically ──
    // We start with the base conditions and add filters as needed.
    // $1, $2, etc. are parameterized to prevent SQL injection.
    const conditions = ["t.term_code = $1"];
    const params = [term];
    let paramIndex = 2; // next available $N

    // Course filter: WHERE (subject = 'CSC' AND catalog_nbr = '101') OR ...
    const courseConditions = courseList.map((c) => {
      const s = `(o.subject = $${paramIndex} AND o.catalog_nbr = $${paramIndex + 1})`;
      params.push(c.subject, c.catalog_nbr);
      paramIndex += 2;
      return s;
    });
    conditions.push(`(${courseConditions.join(" OR ")})`);

    if (startTime && endTime && startTime > endTime) {
      return res.status(400).json({ error: "startTime must be <= endTime" });
    }

    // Time filter
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

    // Day filter – only include sections whose days are in the
    // preferred set. Days in the DB are like "MWF" or "TR".
    // We check that every character in o.days is in the allowed set.
    if (days) {
      // days comes in as "M,W,F" → build a regex like ^[MWF]+$
      const allowedDays = days.split(",").join("");
      conditions.push(`o.days ~ $${paramIndex}`);
      params.push(`^[${allowedDays}]+$`);
      paramIndex++;
    }

    // ── Build the full query ──
    const SQL = `
      SELECT
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
        pr.overall_rating
      FROM class_offerings o
      JOIN terms t ON t.id = o.term_id
      LEFT JOIN professor_ratings pr
        ON LOWER(o.instructor_name) LIKE
           '%%' || LOWER(SPLIT_PART(pr.professor_name, ',', 1)) || '%%'
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY o.subject, o.catalog_nbr, o.class_section;
    `;

    const result = await pool.query(SQL, params);

    // ── filter by minRating in JS ──
    // We do this after the query because the LEFT JOIN means
    // professors without ratings come back as null, and we
    // still want to include sections with unknown ratings.
    let rows = result.rows;
    if (minRating) {
      const min = parseFloat(minRating);
      rows = rows.filter(
        (r) => r.overall_rating === null || r.overall_rating >= min,
      );
    }

    res.json(rows);
  } catch (err) {
    console.error("Error fetching schedule:", err);
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

module.exports = router;
