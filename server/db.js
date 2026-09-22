const mysql = require('mysql2/promise');

// A pool, not a single connection — Railway's MySQL will drop idle
// connections; the pool transparently opens a new one on the next query
// instead of every request after a quiet period failing.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

module.exports = pool;
