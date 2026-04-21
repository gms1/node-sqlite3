/**
 * ESM wrapper for @homeofthings/sqlite3
 *
 * This module provides ESM (ECMAScript Module) entry points that delegate
 *
 * Usage:
 *   // Default import
 *   import sqlite3 from '@homeofthings/sqlite3';
 *
 *   // Named imports
 *   import { Database, OPEN_CREATE } from '@homeofthings/sqlite3';
 */

import sqlite3 from './sqlite3.js';

export default sqlite3;

export const {
    OPEN_READONLY,
    OPEN_READWRITE,
    OPEN_CREATE,
    OPEN_FULLMUTEX,
    OPEN_SHAREDCACHE,
    OPEN_PRIVATECACHE,
    OPEN_URI,
    VERSION,
    SOURCE_ID,
    VERSION_NUMBER,
    OK,
    ERROR,
    INTERNAL,
    PERM,
    ABORT,
    BUSY,
    LOCKED,
    NOMEM,
    READONLY,
    INTERRUPT,
    IOERR,
    CORRUPT,
    NOTFOUND,
    FULL,
    CANTOPEN,
    PROTOCOL,
    EMPTY,
    SCHEMA,
    TOOBIG,
    CONSTRAINT,
    MISMATCH,
    MISUSE,
    NOLFS,
    AUTH,
    FORMAT,
    RANGE,
    NOTADB,
    LIMIT_LENGTH,
    LIMIT_SQL_LENGTH,
    LIMIT_COLUMN,
    LIMIT_EXPR_DEPTH,
    LIMIT_COMPOUND_SELECT,
    LIMIT_VDBE_OP,
    LIMIT_FUNCTION_ARG,
    LIMIT_ATTACHED,
    LIMIT_LIKE_PATTERN_LENGTH,
    LIMIT_VARIABLE_NUMBER,
    LIMIT_TRIGGER_DEPTH,
    LIMIT_WORKER_THREADS,
    cached,
    RunResult,
    Statement,
    Database,
    Backup,
    SqlRunResult,
    SqliteDatabase,
    SqliteStatement,
    SqliteBackup,
    verbose
} = sqlite3;
