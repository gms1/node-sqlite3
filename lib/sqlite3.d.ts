// Type definitions for sqlite3
// Project: http://github.com/gms1/node-sqlite3

/// <reference types="node" />

import events = require("events");

export const OPEN_READONLY: number;
export const OPEN_READWRITE: number;
export const OPEN_CREATE: number;
export const OPEN_FULLMUTEX: number;
export const OPEN_SHAREDCACHE: number;
export const OPEN_PRIVATECACHE: number;
export const OPEN_URI: number;

export const VERSION: string;
export const SOURCE_ID: string;
export const VERSION_NUMBER: number;

export const OK: number;
export const ERROR: number;
export const INTERNAL: number;
export const PERM: number;
export const ABORT: number;
export const BUSY: number;
export const LOCKED: number;
export const NOMEM: number;
export const READONLY: number;
export const INTERRUPT: number;
export const IOERR: number;
export const CORRUPT: number;
export const NOTFOUND: number;
export const FULL: number;
export const CANTOPEN: number;
export const PROTOCOL: number;
export const EMPTY: number;
export const SCHEMA: number;
export const TOOBIG: number;
export const CONSTRAINT: number;
export const MISMATCH: number;
export const MISUSE: number;
export const NOLFS: number;
export const AUTH: number;
export const FORMAT: number;
export const RANGE: number;
export const NOTADB: number;

export const LIMIT_LENGTH: number;
export const LIMIT_SQL_LENGTH: number;
export const LIMIT_COLUMN: number;
export const LIMIT_EXPR_DEPTH: number;
export const LIMIT_COMPOUND_SELECT: number;
export const LIMIT_VDBE_OP: number;
export const LIMIT_FUNCTION_ARG: number;
export const LIMIT_ATTACHED: number;
export const LIMIT_LIKE_PATTERN_LENGTH: number;
export const LIMIT_VARIABLE_NUMBER: number;
export const LIMIT_TRIGGER_DEPTH: number;
export const LIMIT_WORKER_THREADS: number;

export const cached: {
    Database(filename: string, callback?: (this: Database, err: Error | null) => void): Database;
    Database(filename: string, mode?: number, callback?: (this: Database, err: Error | null) => void): Database;
};

export interface RunResult extends Statement {
  lastID: number;
  changes: number;
}

export class Statement extends events.EventEmitter {
    bind(callback?: (err: Error | null) => void): this;
    bind(...params: any[]): this;

    reset(callback?: (err: null) => void): this;

    finalize(callback?: (err: Error) => void): Database;

    run(callback?: (err: Error | null) => void): this;
    run(params: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(...params: any[]): this;

    get<T>(callback?: (err: Error | null, row?: T) => void): this;
    get<T>(params: any, callback?: (this: RunResult, err: Error | null, row?: T) => void): this;
    get(...params: any[]): this;

    all<T>(callback?: (err: Error | null, rows: T[]) => void): this;
    all<T>(params: any, callback?: (this: RunResult, err: Error | null, rows: T[]) => void): this;
    all(...params: any[]): this;

    each<T>(callback?: (err: Error | null, row: T) => void, complete?: (err: Error | null, count: number) => void): this;
    each<T>(params: any, callback?: (this: RunResult, err: Error | null, row: T) => void, complete?: (err: Error | null, count: number) => void): this;
    each(...params: any[]): this;
}

export class Database extends events.EventEmitter {
    constructor(filename: string, callback?: (err: Error | null) => void);
    constructor(filename: string, mode?: number, callback?: (err: Error | null) => void);

    close(callback?: (err: Error | null) => void): void;

    run(sql: string, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, params: any, callback?: (this: RunResult, err: Error | null) => void): this;
    run(sql: string, ...params: any[]): this;

    get<T>(sql: string, callback?: (this: Statement, err: Error | null, row: T) => void): this;
    get<T>(sql: string, params: any, callback?: (this: Statement, err: Error | null, row: T) => void): this;
    get(sql: string, ...params: any[]): this;

    all<T>(sql: string, callback?: (this: Statement, err: Error | null, rows: T[]) => void): this;
    all<T>(sql: string, params: any, callback?: (this: Statement, err: Error | null, rows: T[]) => void): this;
    all(sql: string, ...params: any[]): this;

    each<T>(sql: string, callback?: (this: Statement, err: Error | null, row: T) => void, complete?: (err: Error | null, count: number) => void): this;
    each<T>(sql: string, params: any, callback?: (this: Statement, err: Error | null, row: T) => void, complete?: (err: Error | null, count: number) => void): this;
    each(sql: string, ...params: any[]): this;

    exec(sql: string, callback?: (this: Statement, err: Error | null) => void): this;

    prepare(sql: string, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, params: any, callback?: (this: Statement, err: Error | null) => void): Statement;
    prepare(sql: string, ...params: any[]): Statement;

    serialize(callback?: () => void): void;
    parallelize(callback?: () => void): void;

    on(event: "trace", listener: (sql: string) => void): this;
    on(event: "profile", listener: (sql: string, time: number) => void): this;
    on(event: "change", listener: (type: string, database: string, table: string, rowid: number) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "open" | "close", listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;

    configure(option: "busyTimeout", value: number): void;
    configure(option: "limit", id: number, value: number): void;

    loadExtension(filename: string, callback?: (err: Error | null) => void): this;

    wait(callback?: (param: null) => void): this;

    interrupt(): void;
}

export function verbose(): sqlite3;

export interface Backup {
    idle: boolean;
    completed: boolean;
    failed: boolean;
    remaining: number;
    pageCount: number;
    step(pages: number, callback: (err: Error | null) => void): void;
    finish(): void;
}


export interface sqlite3 {
    OPEN_READONLY: number;
    OPEN_READWRITE: number;
    OPEN_CREATE: number;
    OPEN_FULLMUTEX: number;
    OPEN_SHAREDCACHE: number;
    OPEN_PRIVATECACHE: number;
    OPEN_URI: number;

    VERSION: string;
    SOURCE_ID: string;
    VERSION_NUMBER: number;

    OK: number;
    ERROR: number;
    INTERNAL: number;
    PERM: number;
    ABORT: number;
    BUSY: number;
    LOCKED: number;
    NOMEM: number;
    READONLY: number;
    INTERRUPT: number;
    IOERR: number;
    CORRUPT: number;
    NOTFOUND: number;
    FULL: number;
    CANTOPEN: number;
    PROTOCOL: number;
    EMPTY: number;
    SCHEMA: number;
    TOOBIG: number;
    CONSTRAINT: number;
    MISMATCH: number;
    MISUSE: number;
    NOLFS: number;
    AUTH: number;
    FORMAT: number;
    RANGE: number;
    NOTADB: number;

    LIMIT_LENGTH: number;
    LIMIT_SQL_LENGTH: number;
    LIMIT_COLUMN: number;
    LIMIT_EXPR_DEPTH: number;
    LIMIT_COMPOUND_SELECT: number;
    LIMIT_VDBE_OP: number;
    LIMIT_FUNCTION_ARG: number;
    LIMIT_ATTACHED: number;
    LIMIT_LIKE_PATTERN_LENGTH: number;
    LIMIT_VARIABLE_NUMBER: number;
    LIMIT_TRIGGER_DEPTH: number;
    LIMIT_WORKER_THREADS: number;

    cached: typeof cached;
    RunResult: RunResult;
    Statement: typeof Statement;
    Database: typeof Database;
    Backup: Backup;
    SqlRunResult: SqlRunResult;
    SqliteDatabase: typeof SqliteDatabase;
    SqliteStatement: typeof SqliteStatement;
    SqliteBackup: typeof SqliteBackup;
    verbose(): this;
}

// Default export for ESM consumers
// CJS: const sqlite3 = require('@homeofthings/sqlite3')
// ESM: import sqlite3 from '@homeofthings/sqlite3'
export default sqlite3;

// Promise-based wrapper classes

/**
 * Result object returned by run() operations
 */
export interface SqlRunResult {
    lastID: number;
    changes: number;
}

/**
 * Promise-based wrapper for the Database class
 */
export class SqliteDatabase {
    protected db?: Database;

    constructor();

    static open(filename: string, mode?: number): Promise<SqliteDatabase>;

    open(filename: string, mode?: number): Promise<void>;
    close(): Promise<void>;

    run(sql: string, params?: any): Promise<SqlRunResult>;
    get<T = any>(sql: string, params?: any): Promise<T | undefined>;
    all<T = any>(sql: string, params?: any): Promise<T[]>;
    each<T = any>(
        sql: string,
        params?: any,
        callback?: (err: Error | null, row: T) => void,
    ): Promise<number>;

    exec(sql: string): Promise<void>;
    prepare(sql: string, params?: any): Promise<SqliteStatement>;

    backup(
        filename: string,
        filenameIsDest?: boolean,
        destName?: string,
        sourceName?: string,
    ): Promise<SqliteBackup>;

    serialize(callback?: () => void): void;
    parallelize(callback?: () => void): void;

    /**
     * Run callback inside a database transaction.
     *
     * IMPORTANT: SQLite provides isolation between different database connections,
     * but NOT between operations on the same connection. For concurrent transactions
     * with proper isolation, use separate SqliteDatabase instances.
     *
     * Uses BEGIN IMMEDIATE TRANSACTION which acquires a write lock immediately.
     * @see https://www.sqlite.org/isolation.html
     */
    transactionalize<T>(callback: () => Promise<T>): Promise<T>;

    /**
     * Begin a transaction using BEGIN IMMEDIATE TRANSACTION.
     * Acquires write lock immediately - fails with SQLITE_BUSY if lock unavailable.
     */
    beginTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    endTransaction(commit: boolean): Promise<void>;

    loadExtension(filename: string): Promise<void>;

    wait(): Promise<void>;
    interrupt(): void;

    configure(option: string, ...args: any[]): void;

    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): this;
}

/**
 * Promise-based wrapper for the Statement class
 */
export class SqliteStatement {
    constructor(stmt: Statement);

    bind(...params: any[]): this;
    reset(): Promise<void>;

    run(params?: any): Promise<SqlRunResult>;
    get<T = any>(params?: any): Promise<T | undefined>;
    all<T = any>(params?: any): Promise<T[]>;
    each<T = any>(
        params?: any,
        callback?: (err: Error | null, row: T) => void,
    ): Promise<number>;

    /**
     * Finalizes the statement.
     * IMPORTANT: You MUST finalize all prepared statements before closing the database.
     * Otherwise you will get SQLITE_BUSY: unable to close due to unfinalised statements
     */
    finalize(): Promise<void>;
}

/**
 * Promise-based wrapper for the Backup class
 */
export class SqliteBackup {
    constructor(backup: Backup);

    /**
     * Returns true if the backup is idle (not actively copying)
     */
    readonly idle: boolean;

    /**
     * Returns true if the backup is completed
     */
    readonly completed: boolean;

    /**
     * Returns true if the backup has failed
     */
    readonly failed: boolean;

    /**
     * Returns the remaining number of pages left to copy
     * Returns -1 if `step` not yet called
     */
    readonly remaining: number;

    /**
     * Returns the total number of pages
     * Returns -1 if `step` not yet called
     */
    readonly pageCount: number;

    /**
     * Returns the progress (percentage completion)
     */
    readonly progress: number;

    /**
     * Copy the next page or all remaining pages of the backup
     * @param pages - Number of pages to copy (-1 for all remaining)
     */
    step(pages?: number): Promise<void>;

    /**
     * Finish the backup (synchronous)
     */
    finish(): void;
}
