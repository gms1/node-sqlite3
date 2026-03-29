/**
 * Promise-based wrapper for the Backup class from node-sqlite3
 * @module promise/backup
 */

'use strict';

/**
 * A thin wrapper for the 'Backup' class from 'node-sqlite3' using Promises
 * instead of callbacks
 *
 * @see https://github.com/mapbox/node-sqlite3/wiki/API
 */
class SqliteBackup {
    /**
   * Creates an instance of SqliteBackup.
   *
   * @param {import('../sqlite3.js').Backup} backup - The underlying Backup instance
   */
    constructor(backup) {
        /**
      * @type {import('../sqlite3.js').Backup}
      * @private
      */
        this._backup = backup;
    }

    /**
   * Returns true if the backup is idle (not actively copying)
   *
   * @returns {boolean}
   */
    get idle() {
        return this._backup.idle;
    }

    /**
   * Returns true if the backup is completed
   *
   * @returns {boolean}
   */
    get completed() {
        return this._backup.completed;
    }

    /**
   * Returns true if the backup has failed
   *
   * @returns {boolean}
   */
    get failed() {
        return this._backup.failed;
    }

    /**
   * Returns the remaining number of pages left to copy
   * Returns -1 if `step` not yet called
   *
   * @returns {number}
   */
    get remaining() {
        return this._backup.remaining;
    }

    /**
   * Returns the total number of pages
   * Returns -1 if `step` not yet called
   *
   * @returns {number}
   */
    get pageCount() {
        return this._backup.pageCount;
    }

    /**
   * Returns the progress (percentage completion)
   *
   * @returns {number} Progress as percentage (0-100)
   */
    get progress() {
        const pageCount = this.pageCount;
        const remaining = this.remaining;
        if (pageCount === -1 || remaining === -1) {
            return 0;
        }
        return pageCount === 0 ? 100 : ((pageCount - remaining) / pageCount) * 100;
    }

    /**
   * Copy the next page or all remaining pages of the backup
   *
   * @param {number} [pages=-1] - Number of pages to copy (-1 for all remaining)
   * @returns {Promise<void>}
   */
    step(pages) {
        return new Promise((resolve, reject) => {
            if (!this._backup) {
                reject(new Error('backup handle not open'));
                return;
            }
            this._backup.step(pages === undefined ? -1 : pages, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
   * Finish the backup (synchronous)
   */
    finish() {
        if (this._backup) {
            this._backup.finish();
        }
    }
}

module.exports = { SqliteBackup };
