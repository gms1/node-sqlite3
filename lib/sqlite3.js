// Main entry point: re-exports the callback API and adds Promise-based wrapper classes.
// The callback API is in sqlite3-callback.js to avoid circular dependencies
// (promise modules require sqlite3-callback.js, not this file).

const sqlite3 = require('./sqlite3-callback.js');

// Export Promise-based wrapper classes
const { SqliteDatabase, SqliteStatement, SqliteBackup } = require('./promise');
sqlite3.SqliteDatabase = SqliteDatabase;
sqlite3.SqliteStatement = SqliteStatement;
sqlite3.SqliteBackup = SqliteBackup;

module.exports = exports = sqlite3;