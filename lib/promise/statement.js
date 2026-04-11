/**
 * Promise-based wrapper for the Statement class from node-sqlite3
 * @module promise/statement
 */

'use strict';

/**
 * Result object returned by run() operations
 * @typedef {Object} SqlRunResult
 * @property {number} lastID - The ID of the last inserted row
 * @property {number} changes - The number of rows affected
 */

/**
 * A thin wrapper for the 'Statement' class from 'node-sqlite3' using Promises
 * instead of callbacks
 *
 * @see https://github.com/mapbox/node-sqlite3/wiki/API
 */
class SqliteStatement {
    /**
   * Creates an instance of SqliteStatement.
   *
   * @param {import('../sqlite3.js').Statement} stmt - The underlying Statement instance
   */
    constructor(stmt) {
        /**
      * @type {import('../sqlite3.js').Statement}
      * @private
      */
        this._stmt = stmt;
    }

    /**
   * Bind the given parameters to the prepared statement
   *
   * @param {...any} params - The parameters to bind
   * @returns {this} Returns this for chaining
   */
    bind(...params) {
        this._stmt.bind(params);
        return this;
    }

    /**
   * Reset a open cursor of the prepared statement preserving the parameter binding
   * Allows re-execute of the same query
   *
   * @returns {Promise<void>}
   */
    reset() {
        return new Promise((resolve) => {
            this._stmt.reset(() => {
                resolve();
            });
        });
    }

    /**
   * Finalizes a prepared statement (freeing any resource used by this statement)
   *
   * IMPORTANT: You MUST finalize all prepared statements before closing the database.
   * If you attempt to close a database with unfinalized statements, you will get:
   * SQLITE_BUSY: unable to close due to unfinalised statements
   *
   * @returns {Promise<void>}
   */
    finalize() {
        return new Promise((resolve, reject) => {
            this._stmt.finalize((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
   * Runs a prepared statement with the specified parameters
   *
   * @param {any} [params] - The parameters referenced in the statement
   * @returns {Promise<SqlRunResult>} A promise that resolves to the result object
   */
    run(params) {
        return new Promise((resolve, reject) => {
            // Use function() to get 'this' context with lastID and changes
            const callback = function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            };
            // Only pass params if provided - otherwise use bound parameters
            if (params === undefined) {
                this._stmt.run(callback);
            } else {
                this._stmt.run(params, callback);
            }
        });
    }

    /**
   * Runs a prepared statement with the specified parameters, fetching only the first row
   *
   * @template T
   * @param {any} [params] - The parameters referenced in the statement
   * @returns {Promise<T | undefined>} A promise that resolves to the row or undefined
   */
    get(params) {
        return new Promise((resolve, reject) => {
            const callback = (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            };
            // Only pass params if provided - otherwise use bound parameters
            if (params === undefined) {
                this._stmt.get(callback);
            } else {
                this._stmt.get(params, callback);
            }
        });
    }

    /**
   * Runs a prepared statement with the specified parameters, fetching all rows
   *
   * @template T
   * @param {any} [params] - The parameters referenced in the statement
   * @returns {Promise<T[]>} A promise that resolves to an array of rows
   */
    all(params) {
        return new Promise((resolve, reject) => {
            const callback = (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            };
            // Only pass params if provided - otherwise use bound parameters
            if (params === undefined) {
                this._stmt.all(callback);
            } else {
                this._stmt.all(params, callback);
            }
        });
    }

    /**
   * Runs a prepared statement with the specified parameters, fetching all rows
   * using a callback for each row
   *
   * @param {any} [params] - The parameters referenced in the statement
   * @param {(err: Error | null, row: any) => void} [callback] - The callback function for each row
   * @returns {Promise<number>} A promise that resolves to the number of rows retrieved
   */
    each(params, callback) {
    // Handle case where params is actually the callback (no params provided)
        if (typeof params === 'function') {
            callback = params;
            params = undefined;
        }
        return new Promise((resolve, reject) => {
            this._stmt.each(params, callback, (err, count) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(count);
                }
            });
        });
    }
}

module.exports = { SqliteStatement };
