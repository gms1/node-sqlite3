/**
 * ESM wrapper for the Promise-based API of @homeofthings/sqlite3
 *
 * Usage:
 *   import { SqliteDatabase } from '@homeofthings/sqlite3/promise';
 *   const db = await SqliteDatabase.open(':memory:');
 */

export { SqliteDatabase, SqliteStatement, SqliteBackup } from './index.js';