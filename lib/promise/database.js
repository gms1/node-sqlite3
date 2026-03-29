/**
 * Promise-based wrapper for the Database class from node-sqlite3
 * @module promise/database
 */

'use strict';

const { Database } = require('../sqlite3.js');
const { SqliteStatement } = require('./statement');
const { SqliteBackup } = require('./backup');

/**
 * Result object returned by run() operations
 * @typedef {Object} SqlRunResult
 * @property {number} lastID - The ID of the last inserted row
 * @property {number} changes - The number of rows affected
 */

/**
 * @typedef {import('../sqlite3-binding.js').Database} Database
 */

/**
 * A thin wrapper for the 'Database' class from 'node-sqlite3' using Promises
 * instead of callbacks
 *
 * @see https://github.com/mapbox/node-sqlite3/wiki/API
 */
class SqliteDatabase {
    /**
   * Creates a new SqliteDatabase instance (without opening a database).
   * Use open() to open a database connection, or use the static factory method open().
   *
   * @example
   * // Using constructor + open
   * const db = new SqliteDatabase();
   * await db.open(':memory:');
   *
   * // Using static factory method
   * const db = await SqliteDatabase.open(':memory:');
   */
    constructor() {
        /**
         * @type {Database | undefined}
      * @protected
      */
        this.db = undefined;
    }

    /**
   * Static factory method to create and open a database connection.
   *
   * @param {string} filename - The path to the database file or ':memory:' for in-memory
   * @param {number} [mode] - Optional mode flags (OPEN_READONLY, OPEN_READWRITE, OPEN_CREATE)
   * @returns {Promise<SqliteDatabase>} A promise that resolves to the opened database
   * @example
   * const db = await SqliteDatabase.open(':memory:');
   * const db = await SqliteDatabase.open('mydb.sqlite', sqlite3.OPEN_READONLY);
   */
    static async open(filename, mode) {
        const db = new SqliteDatabase();
        await db.open(filename, mode);
        return db;
    }

    /**
   * Open a database connection
   *
   * @param {string} filename - The path to the database file or ':memory:' for in-memory
   * @param {number} [mode] - Optional mode flags (OPEN_READONLY, OPEN_READWRITE, OPEN_CREATE)
   * @returns {Promise<void>}
   */
    open(filename, mode) {
        return new Promise((resolve, reject) => {
            // Default mode: OPEN_READWRITE | OPEN_CREATE
            const defaultMode = 0x00000002 | 0x00000004; // OPEN_READWRITE | OPEN_CREATE
            const db = new Database(filename, mode === undefined ? defaultMode : mode, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.db = db;
                    resolve();
                }
            });
        });
    }

    /**
   * Close the database connection
   *
   * @returns {Promise<void>}
   */
    close() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }
            const db = this.db;
            this.db = undefined;
            db.close((err) => {
                db.removeAllListeners();
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
   * Test if a connection is open
   *
   * @returns {boolean}
   */
    isOpen() {
        return !!this.db;
    }

    /**
   * Runs a SQL statement with the specified parameters
   *
   * @param {string} sql - The SQL statement
   * @param {any} [params] - The parameters referenced in the statement
   * @returns {Promise<SqlRunResult>} A promise that resolves to the result object
   */
    run(sql, params) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            // Use function() to get 'this' context with lastID and changes
            this.db.run(sql, params, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        });
    }

    /**
   * Runs a SQL query with the specified parameters, fetching only the first row
   *
   * @template T
   * @param {string} sql - The DQL statement
   * @param {any} [params] - The parameters referenced in the statement
   * @returns {Promise<T | undefined>} A promise that resolves to the row or undefined
   */
    get(sql, params) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
   * Runs a SQL query with the specified parameters, fetching all rows
   *
   * @template T
   * @param {string} sql - The DQL statement
   * @param {any} [params] - The parameters referenced in the statement
   * @returns {Promise<T[]>} A promise that resolves to an array of rows
   */
    all(sql, params) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
   * Runs a SQL query with the specified parameters, fetching all rows
   * using a callback for each row
   *
   * @param {string} sql - The DQL statement
   * @param {any} [params] - The parameters referenced in the statement
   * @param {(err: Error | null, row: any) => void} [callback] - The callback function for each row
   * @returns {Promise<number>} A promise that resolves to the number of rows retrieved
   */
    each(sql, params, callback) {
    // Handle case where params is actually the callback (no params provided)
        if (typeof params === 'function') {
            callback = params;
            params = undefined;
        }
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            this.db.each(sql, params, callback, (err, count) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(count);
                }
            });
        });
    }

    /**
   * Execute a SQL statement
   *
   * @param {string} sql - The SQL statement
   * @returns {Promise<void>}
   */
    exec(sql) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            this.db.exec(sql, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
   * Prepare a SQL statement
   *
   * @param {string} sql - The SQL statement
   * @param {any} [params] - The parameters referenced in the statement
   * @returns {Promise<SqliteStatement>} A promise that resolves to the prepared statement
   */
    prepare(sql, params) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            const stmt = this.db.prepare(sql, params, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(new SqliteStatement(stmt));
                }
            });
        });
    }

    /**
   * Initiate online backup
   *
   * @param {string} filename - The database file to backup from or to
   * @param {boolean} [filenameIsDest=true] - Whether filename is destination
   * @param {string} [destName='main'] - The destination database name
   * @param {string} [sourceName='main'] - The source database name
   * @returns {Promise<SqliteBackup>} A promise that resolves to the backup object
   */
    backup(filename, filenameIsDest = true, destName = 'main', sourceName = 'main') {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            const backup = this.db.backup(filename, destName, sourceName, filenameIsDest, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(new SqliteBackup(backup));
                }
            });
        });
    }

    /**
   * Serialized sqlite3 calls
   * If callback is provided, run callback in serialized mode
   * Otherwise, switch connection to serialized mode
   *
   * @param {() => void} [callback] - Optional callback to run in serialized mode
   */
    serialize(callback) {
        if (!this.db) {
            throw new Error('database connection not open');
        }
        this.db.serialize(callback);
    }

    /**
   * Parallelized sqlite3 calls
   * If callback is provided, run callback in parallel mode
   * Otherwise, switch connection to parallel mode
   *
   * @param {() => void} [callback] - Optional callback to run in parallel mode
   */
    parallelize(callback) {
        if (!this.db) {
            throw new Error('database connection not open');
        }
        this.db.parallelize(callback);
    }

    /**
   * Run callback inside a database transaction
   *
   * @template T
   * @param {() => Promise<T>} callback - The callback to run in transaction
   * @returns {Promise<T>} A promise that resolves to the callback result
   */
    async transactionalize(callback) {
        await this.beginTransaction();
        try {
            const result = await callback();
            await this.commitTransaction();
            return result;
        } catch (err) {
            await this.rollbackTransaction();
            throw err;
        }
    }

    /**
   * Begin a transaction
   *
   * @returns {Promise<SqlRunResult>}
   */
    beginTransaction() {
        return this.run('BEGIN IMMEDIATE TRANSACTION');
    }

    /**
   * Commit a transaction
   *
   * @returns {Promise<SqlRunResult>}
   */
    commitTransaction() {
        return this.run('COMMIT TRANSACTION');
    }

    /**
   * Rollback a transaction
   *
   * @returns {Promise<SqlRunResult>}
   */
    rollbackTransaction() {
        return this.run('ROLLBACK TRANSACTION');
    }

    /**
   * End a transaction (commit or rollback)
   *
   * @param {boolean} commit - Whether to commit (true) or rollback (false)
   * @returns {Promise<void>}
   */
    endTransaction(commit) {
        const sql = commit ? 'COMMIT TRANSACTION' : 'ROLLBACK TRANSACTION';
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            this.db.run(sql, (err) => {
                // Ignore "no transaction" errors
                if (err && !err.message.includes('no transaction')) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
   * Load an extension
   *
   * @param {string} filename - The path to the extension
   * @returns {Promise<void>}
   */
    loadExtension(filename) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            this.db.loadExtension(filename, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
   * Wait for the database to be ready
   *
   * @returns {Promise<void>}
   */
    wait() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('database connection not open'));
                return;
            }
            this.db.wait((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
   * Interrupt a running query
   */
    interrupt() {
        if (!this.db) {
            throw new Error('database connection not open');
        }
        this.db.interrupt();
    }

    /**
   * Configure database options
   *
   * @param {string} option - The option name
   * @param {number} [value] - The option value
   */
    configure(option, value) {
        if (!this.db) {
            throw new Error('database connection not open');
        }
        this.db.configure(option, value);
    }

    /**
   * Register an event listener
   *
   * @param {'trace' | 'profile' | 'error' | 'close' | 'open' | 'change'} event - The event name
   * @param {Function} listener - The listener function
   * @returns {this}
   */
    on(event, listener) {
        if (!this.db) {
            throw new Error('database connection not open');
        }
        this.db.on(event, listener);
        return this;
    }

    /**
   * Remove an event listener
   *
   * @param {string} event - The event name
   * @param {Function} listener - The listener function
   * @returns {this}
   */
    off(event, listener) {
        if (!this.db) {
            throw new Error('database connection not open');
        }
        this.db.off(event, listener);
        return this;
    }

    /**
   * Remove all event listeners for an event
   *
   * @param {string} [event] - The event name
   * @returns {this}
   */
    removeAllListeners(event) {
        if (!this.db) {
            throw new Error('database connection not open');
        }
        this.db.removeAllListeners(event);
        return this;
    }
}

module.exports = { SqliteDatabase };
