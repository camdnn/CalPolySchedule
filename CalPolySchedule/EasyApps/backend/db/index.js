const { Pool } = require("pg");
require("dotenv").config();

// setup a pool variable to be used to handle SQL requests
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = { pool };
