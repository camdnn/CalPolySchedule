const { Pool } = require("pg");

// setup a pool variable to be used to handle SQL requests
const pool = new Pool({
  host: "localhost",
  database: "postgres",
  port: 5432,   
});

module.exports = { pool };
