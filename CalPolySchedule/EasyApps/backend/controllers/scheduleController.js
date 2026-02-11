import express from "express";
const app = express();

app.get("/api/schedule", async (req, res) => {
  const SQL = `
    SELECT
      o.subject,
      o.catalog_nbr,
      o.descr,
      o.class_section,
      o.component,
      o.class_nbr,
      o.units,
      o.days,
      o.start_time,
      o.end_time,
      o.facility_descr AS location,
      o.instructor_name,
      pr.overall_rating
    FROM class_offerings o
    JOIN terms t ON t.id = o.term_id
    LEFT JOIN professor_ratings pr
      ON LOWER(pr.professor_name) = LOWER(o.instructor_name)
    WHERE t.is_active = true
    ORDER BY
      o.subject, o.catalog_nbr, o.descr,
      o.class_section, o.component, o.start_time;
  `;

  const result = await pool.query(SQL);
  const rows = result.rows;

  const grouped;

  res.json(rows);
});
