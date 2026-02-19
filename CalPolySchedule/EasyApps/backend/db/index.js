const { Pool } = require("pg");
require("dotenv").config();

// Shared PostgreSQL connection pool for the entire backend.
// Using a pool avoids creating a new TCP connection per request.
const pool = new Pool({
  // DATABASE_URL is expected in .env (local) or environment (deploy).
  connectionString: process.env.DATABASE_URL,
  // Render/Postgres-hosted TLS connections generally require SSL.
  // rejectUnauthorized=false is common for managed cert chains.
  ssl: { rejectUnauthorized: false },
});

// Exported once and reused by route modules.
module.exports = { pool };
