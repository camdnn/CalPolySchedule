import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  host: "localhost",
  database: "postgres",
  port: 5342,
});
