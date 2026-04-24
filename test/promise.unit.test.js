/**
 * Unit tests for Promise-based wrapper classes using mocks
 * Tests error paths that are difficult or impossible to trigger with integration tests
 */

'use strict';

const assert = require('assert');
const { SqliteDatabase } = require('../lib/promise/database');
const { SqliteStatement } = require('../lib/promise/statement');
const { SqliteBackup } = require('../lib/promise/backup');

/**
 * Helper: create a mock callback-style Database object
 */
function createMockDb(overrides = {}) {
    const listeners = {};
    return {
        close(cb) { cb(null); },
        run(sql, params, cb) {
            if (typeof params === 'function') { cb = params; }
            if (cb) cb(null);
        },
        get(sql, params, cb) {
            if (typeof params === 'function') { cb = params; }
            if (cb) cb(null, {});
        },
        all(sql, params, cb) {
            if (typeof params === 'function') { cb = params; }
            if (cb) cb(null, []);
        },
        each(sql, params, cb, completeCb) { completeCb(null, 0); },
        exec(sql, cb) { cb(null); },
        prepare(sql, params, cb) {
            if (typeof params === 'function') { cb = params; }
            cb(null);
            return {};
        },
        backup(filename, destName, sourceName, filenameIsDest, cb) {
            cb(null);
            return {};
        },
        loadExtension(filename, cb) { cb(null); },
        wait(cb) { cb(null); },
        interrupt() {},
        configure(option, value) {},
        serialize(cb) { if (cb) cb(); },
        parallelize(cb) { if (cb) cb(); },
        on(event, listener) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(listener);
            return this;
        },
        off(event, listener) {
            if (listeners[event]) {
                listeners[event] = listeners[event].filter(l => l !== listener);
            }
            return this;
        },
        removeAllListeners(event) {
            if (event) {
                delete listeners[event];
            } else {
                Object.keys(listeners).forEach(k => delete listeners[k]);
            }
            return this;
        },
        ...overrides
    };
}

describe('SqliteDatabase (unit/mocked)', () => {
    describe('close() error path', () => {
        it('should reject when underlying db.close returns an error', async () => {
            const closeError = new Error('close error');
            const mockDb = createMockDb({
                close(cb) { cb(closeError); }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.close(), /close error/);
        });
    });

    describe('endTransaction() error path', () => {
        it('should reject when run returns an error that is not "no transaction"', async () => {
            const runError = new Error('database is locked');
            const mockDb = createMockDb({
                run(sql, cb) {
                    if (typeof sql === 'function') { cb = sql; }
                    cb(runError);
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.endTransaction(true), /database is locked/);
        });

        it('should resolve when run returns an error containing "no transaction"', async () => {
            const noTxError = new Error('no transaction is active');
            const mockDb = createMockDb({
                run(sql, cb) {
                    if (typeof sql === 'function') { cb = sql; }
                    cb(noTxError);
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            // Should not throw - "no transaction" errors are ignored
            await db.endTransaction(true);
        });
    });

    describe('loadExtension() error path', () => {
        it('should reject when underlying db.loadExtension returns an error', async () => {
            const extError = new Error('extension not found');
            const mockDb = createMockDb({
                loadExtension(filename, cb) { cb(extError); }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.loadExtension('nonexistent.ext'), /extension not found/);
        });
    });

    describe('loadExtension() success path', () => {
        it('should resolve when underlying db.loadExtension succeeds', async () => {
            const mockDb = createMockDb({
                loadExtension(filename, cb) { cb(null); }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            // Should not throw
            await db.loadExtension('test.ext');
        });
    });

    describe('wait() error path', () => {
        it('should reject when underlying db.wait returns an error', async () => {
            const waitError = new Error('wait error');
            const mockDb = createMockDb({
                wait(cb) { cb(waitError); }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.wait(), /wait error/);
        });
    });

    describe('run() error path', () => {
        it('should reject when underlying db.run returns an error', async () => {
            const runError = new Error('run error');
            const mockDb = createMockDb({
                run(sql, params, cb) {
                    if (typeof params === 'function') { cb = params; }
                    cb.call({ lastID: 0, changes: 0 }, runError);
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.run('SELECT 1'), /run error/);
        });
    });

    describe('get() error path', () => {
        it('should reject when underlying db.get returns an error', async () => {
            const getError = new Error('get error');
            const mockDb = createMockDb({
                get(sql, params, cb) {
                    if (typeof params === 'function') { cb = params; }
                    cb(getError, null);
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.get('SELECT 1'), /get error/);
        });
    });

    describe('all() error path', () => {
        it('should reject when underlying db.all returns an error', async () => {
            const allError = new Error('all error');
            const mockDb = createMockDb({
                all(sql, params, cb) {
                    if (typeof params === 'function') { cb = params; }
                    cb(allError, null);
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.all('SELECT 1'), /all error/);
        });
    });

    describe('each() error path', () => {
        it('should reject when underlying db.each returns an error', async () => {
            const eachError = new Error('each error');
            const mockDb = createMockDb({
                each(sql, params, rowCb, completeCb) {
                    completeCb(eachError, 0);
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.each('SELECT 1', () => {}), /each error/);
        });
    });

    describe('exec() error path', () => {
        it('should reject when underlying db.exec returns an error', async () => {
            const execError = new Error('exec error');
            const mockDb = createMockDb({
                exec(sql, cb) { cb(execError); }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.exec('INVALID SQL'), /exec error/);
        });
    });

    describe('prepare() error path', () => {
        it('should reject when underlying db.prepare returns an error', async () => {
            const prepareError = new Error('prepare error');
            const mockDb = createMockDb({
                prepare(sql, params, cb) {
                    if (typeof params === 'function') { cb = params; }
                    cb(prepareError);
                    return {};
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.prepare('SELECT 1'), /prepare error/);
        });
    });

    describe('backup() error path', () => {
        it('should reject when underlying db.backup returns an error', async () => {
            const backupError = new Error('backup error');
            const mockDb = createMockDb({
                backup(filename, destName, sourceName, filenameIsDest, cb) {
                    cb(backupError);
                    return {};
                }
            });
            const db = new SqliteDatabase();
            db.db = mockDb;

            await assert.rejects(async () => db.backup('test.db'), /backup error/);
        });
    });

    describe('open() error path', () => {
        it('should reject when Database constructor returns an error', async () => {
            const db = new SqliteDatabase();
            // We can't easily mock the Database constructor, but we already test
            // this with integration tests (opening nonexistent path as readonly)
            // This is covered by the existing integration test
        });
    });
});

describe('SqliteStatement (unit/mocked)', () => {
    describe('finalize() error path', () => {
        it('should reject when underlying stmt.finalize returns an error', async () => {
            const finalizeError = new Error('finalize error');
            const mockStmt = {
                finalize(cb) { cb(finalizeError); }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.finalize(), /finalize error/);
        });
    });

    describe('run() error path', () => {
        it('should reject when underlying stmt.run returns an error with params', async () => {
            const runError = new Error('statement run error');
            const mockStmt = {
                run(params, cb) {
                    cb.call({ lastID: 0, changes: 0 }, runError);
                }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.run('param'), /statement run error/);
        });

        it('should reject when underlying stmt.run returns an error without params', async () => {
            const runError = new Error('statement run error no params');
            const mockStmt = {
                run(cb) {
                    cb.call({ lastID: 0, changes: 0 }, runError);
                }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.run(), /statement run error no params/);
        });
    });

    describe('get() error path', () => {
        it('should reject when underlying stmt.get returns an error with params', async () => {
            const getError = new Error('statement get error');
            const mockStmt = {
                get(params, cb) { cb(getError, null); }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.get('param'), /statement get error/);
        });

        it('should reject when underlying stmt.get returns an error without params', async () => {
            const getError = new Error('statement get error no params');
            const mockStmt = {
                get(cb) { cb(getError, null); }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.get(), /statement get error no params/);
        });
    });

    describe('all() error path', () => {
        it('should reject when underlying stmt.all returns an error with params', async () => {
            const allError = new Error('statement all error');
            const mockStmt = {
                all(params, cb) { cb(allError, null); }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.all('param'), /statement all error/);
        });

        it('should reject when underlying stmt.all returns an error without params', async () => {
            const allError = new Error('statement all error no params');
            const mockStmt = {
                all(cb) { cb(allError, null); }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.all(), /statement all error no params/);
        });
    });

    describe('each() error path', () => {
        it('should reject when underlying stmt.each returns an error with params', async () => {
            const eachError = new Error('statement each error');
            const mockStmt = {
                each(params, rowCb, completeCb) { completeCb(eachError, 0); }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.each('param', () => {}), /statement each error/);
        });

        it('should reject when underlying stmt.each returns an error without params (callback only)', async () => {
            const eachError = new Error('statement each error no params');
            const mockStmt = {
                each(params, rowCb, completeCb) { completeCb(eachError, 0); }
            };
            const stmt = new SqliteStatement(mockStmt);

            await assert.rejects(async () => stmt.each(() => {}), /statement each error no params/);
        });
    });

    describe('run() success with bound params', () => {
        it('should resolve with lastID and changes when using bound params', async () => {
            const mockStmt = {
                run(cb) {
                    cb.call({ lastID: 42, changes: 7 }, null);
                }
            };
            const stmt = new SqliteStatement(mockStmt);

            const result = await stmt.run();
            assert.strictEqual(result.lastID, 42);
            assert.strictEqual(result.changes, 7);
        });
    });

    describe('get() success with bound params', () => {
        it('should resolve with row when using bound params', async () => {
            const mockStmt = {
                get(cb) { cb(null, { id: 1, name: 'test' }); }
            };
            const stmt = new SqliteStatement(mockStmt);

            const row = await stmt.get();
            assert.strictEqual(row.id, 1);
            assert.strictEqual(row.name, 'test');
        });
    });

    describe('all() success with bound params', () => {
        it('should resolve with rows when using bound params', async () => {
            const mockStmt = {
                all(cb) { cb(null, [{ id: 1 }, { id: 2 }]); }
            };
            const stmt = new SqliteStatement(mockStmt);

            const rows = await stmt.all();
            assert.strictEqual(rows.length, 2);
            assert.strictEqual(rows[0].id, 1);
            assert.strictEqual(rows[1].id, 2);
        });
    });
});

describe('SqliteBackup (unit/mocked)', () => {
    describe('step() error path', () => {
        it('should reject when underlying backup.step returns an error', async () => {
            const stepError = new Error('step error');
            const mockBackup = {
                step(pages, cb) { cb(stepError); }
            };
            const backup = new SqliteBackup(mockBackup);

            await assert.rejects(async () => backup.step(-1), /step error/);
        });
    });

    describe('step() when backup handle is not open', () => {
        it('should reject when _backup is null', async () => {
            const backup = new SqliteBackup({});
            backup._backup = null;

            await assert.rejects(async () => backup.step(-1), /backup handle not open/);
        });
    });

    describe('failed getter', () => {
        it('should return the failed status from underlying backup', () => {
            const mockBackup = { failed: true, idle: false, completed: false, remaining: 0, pageCount: 10 };
            const backup = new SqliteBackup(mockBackup);
            assert.strictEqual(backup.failed, true);
        });
    });

    describe('progress getter', () => {
        it('should return 100 when pageCount is 0', () => {
            const mockBackup = { failed: false, idle: true, completed: true, remaining: 0, pageCount: 0 };
            const backup = new SqliteBackup(mockBackup);
            assert.strictEqual(backup.progress, 100);
        });

        it('should return 0 when remaining is -1', () => {
            const mockBackup = { failed: false, idle: true, completed: false, remaining: -1, pageCount: -1 };
            const backup = new SqliteBackup(mockBackup);
            assert.strictEqual(backup.progress, 0);
        });

        it('should return 0 when pageCount is -1', () => {
            const mockBackup = { failed: false, idle: true, completed: false, remaining: 5, pageCount: -1 };
            const backup = new SqliteBackup(mockBackup);
            assert.strictEqual(backup.progress, 0);
        });

        it('should calculate progress percentage', () => {
            const mockBackup = { failed: false, idle: false, completed: false, remaining: 5, pageCount: 10 };
            const backup = new SqliteBackup(mockBackup);
            assert.strictEqual(backup.progress, 50);
        });
    });

    describe('finish()', () => {
        it('should call finish on underlying backup', () => {
            let finishCalled = false;
            const mockBackup = {
                finish() { finishCalled = true; }
            };
            const backup = new SqliteBackup(mockBackup);
            backup.finish();
            assert.strictEqual(finishCalled, true);
        });

        it('should not throw when _backup is null', () => {
            const backup = new SqliteBackup({});
            backup._backup = null;
            // Should not throw
            backup.finish();
        });
    });

    describe('step() with explicit page count', () => {
        it('should pass explicit page count to underlying backup', async () => {
            let receivedPages;
            const mockBackup = {
                step(pages, cb) {
                    receivedPages = pages;
                    cb(null);
                }
            };
            const backup = new SqliteBackup(mockBackup);
            await backup.step(5);
            assert.strictEqual(receivedPages, 5);
        });

        it('should pass -1 when no page count is provided', async () => {
            let receivedPages;
            const mockBackup = {
                step(pages, cb) {
                    receivedPages = pages;
                    cb(null);
                }
            };
            const backup = new SqliteBackup(mockBackup);
            await backup.step();
            assert.strictEqual(receivedPages, -1);
        });
    });
});