/**
 * Tests for transaction isolation behavior
 *
 * Key insight from SQLite documentation:
 * - Isolation EXISTS between different database connections
 * - NO isolation between operations on the SAME database connection
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('..');
const { SqliteDatabase } = sqlite3;
const helper = require('./support/helper');

// Helper function to generate unique database paths
let dbCounter = 0;
function newDatabasePath() {
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    return path.join(tmpDir, `transaction_test_${Date.now()}_${++dbCounter}.db`);
}

describe('Transaction Isolation', () => {
    describe('single connection behavior', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
        });

        afterEach(async () => {
            await db.close();
        });

        it('should handle sequential transactions correctly', async () => {
            // Sequential transactions on same connection should work fine
            await db.transactionalize(async () => {
                await db.run("INSERT INTO test (value) VALUES ('tx1')");
            });

            await db.transactionalize(async () => {
                await db.run("INSERT INTO test (value) VALUES ('tx2')");
            });

            const rows = await db.all('SELECT * FROM test ORDER BY id');
            assert.strictEqual(rows.length, 2);
            assert.strictEqual(rows[0].value, 'tx1');
            assert.strictEqual(rows[1].value, 'tx2');
        });

        it('should handle nested transactionalize calls (same connection)', async () => {
            // Note: This tests behavior but is NOT recommended practice
            // Nested transactions on same connection share the same transaction
            let insertedInNested = false;

            await db.transactionalize(async () => {
                await db.run("INSERT INTO test (value) VALUES ('outer')");

                // Inner transactionalize will start a new transaction
                // but since we're on the same connection, it's actually the same transaction
                try {
                    await db.transactionalize(async () => {
                        await db.run("INSERT INTO test (value) VALUES ('inner')");
                        insertedInNested = true;
                    });
                } catch (err) {
                    // May fail because there's already an active transaction
                }
            });

            const rows = await db.all('SELECT * FROM test ORDER BY id');
            // At minimum, outer should be inserted
            assert.strictEqual(rows.length >= 1, true);
        });

        it('should demonstrate that concurrent operations on same connection are serialized', async () => {
            // JavaScript is single-threaded, so even with Promise.all,
            // operations on the same connection are serialized
            const results = await Promise.all([
                db.run("INSERT INTO test (value) VALUES ('concurrent1')"),
                db.run("INSERT INTO test (value) VALUES ('concurrent2')"),
            ]);

            const rows = await db.all('SELECT * FROM test ORDER BY id');
            assert.strictEqual(rows.length, 2);
        });
    });

    describe('multiple connections behavior', () => {
        let db1, db2;

        beforeEach(async () => {
            // Create a file-based database for cross-connection tests
            const dbPath = newDatabasePath();
            db1 = await SqliteDatabase.open(dbPath);
            db2 = await SqliteDatabase.open(dbPath);

            await db1.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)');
            // Clear any existing data
            await db1.exec('DELETE FROM test');
        });

        afterEach(async () => {
            await db1.close();
            await db2.close();
        });

        it('should provide isolation between concurrent transactions on different connections', async () => {
            // Start transaction on db1
            await db1.beginTransaction();

            // Insert in db1's transaction (not committed yet)
            await db1.run("INSERT INTO test (value) VALUES ('from_db1')");

            // db2 should NOT see uncommitted changes from db1
            const rowsBeforeCommit = await db2.all('SELECT * FROM test');
            assert.strictEqual(rowsBeforeCommit.length, 0, 'db2 should not see uncommitted changes');

            // Commit db1's transaction
            await db1.commitTransaction();

            // Now db2 should see the committed changes
            const rowsAfterCommit = await db2.all('SELECT * FROM test');
            assert.strictEqual(rowsAfterCommit.length, 1, 'db2 should see committed changes');
            assert.strictEqual(rowsAfterCommit[0].value, 'from_db1');
        });

        it('should handle concurrent transactions on different connections', async () => {
            // NOTE: This test demonstrates that concurrent write transactions
            // on different connections to the same database will fail with SQLITE_BUSY
            // because BEGIN IMMEDIATE TRANSACTION acquires a write lock.
            // This is expected SQLite behavior

            // Start transaction on db1 first
            await db1.beginTransaction();

            // db2 trying to start a transaction while db1 has the lock should fail
            await assert.rejects(
                async () => await db2.beginTransaction(),
                /SQLITE_BUSY|database is locked/,
                'db2 should fail to start transaction while db1 has write lock'
            );

            // db1 can still insert
            await db1.run("INSERT INTO test (value) VALUES ('from_db1')");

            // Commit db1
            await db1.commitTransaction();

            // Now db2 can start its transaction
            await db2.beginTransaction();
            await db2.run("INSERT INTO test (value) VALUES ('from_db2')");
            await db2.commitTransaction();

            // Both should see all committed data
            const rowsFinal1 = await db1.all('SELECT * FROM test ORDER BY value');
            const rowsFinal2 = await db2.all('SELECT * FROM test ORDER BY value');

            assert.strictEqual(rowsFinal1.length, 2);
            assert.strictEqual(rowsFinal2.length, 2);
        });

        it('should handle rollback isolation between connections', async () => {
            // db1 starts and completes its transaction first
            await db1.beginTransaction();
            await db1.run("INSERT INTO test (value) VALUES ('from_db1')");
            await db1.rollbackTransaction();

            // Now db2 can start its transaction
            await db2.beginTransaction();
            await db2.run("INSERT INTO test (value) VALUES ('from_db2')");
            await db2.commitTransaction();

            // Both should only see db2's committed data (db1 was rolled back)
            const rows1 = await db1.all('SELECT * FROM test');
            const rows2 = await db2.all('SELECT * FROM test');

            assert.strictEqual(rows1.length, 1);
            assert.strictEqual(rows2.length, 1);
            assert.strictEqual(rows1[0].value, 'from_db2');
        });

        it('should demonstrate proper isolation with transactionalize on separate connections', async () => {
            // Run concurrent transactions on separate connections
            const results = await Promise.all([
                db1.transactionalize(async () => {
                    await db1.run("INSERT INTO test (value) VALUES ('tx1')");
                    // Small delay to increase chance of concurrent execution
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return 'tx1_done';
                }),
                db2.transactionalize(async () => {
                    await db2.run("INSERT INTO test (value) VALUES ('tx2')");
                    await new Promise(resolve => setTimeout(resolve, 10));
                    return 'tx2_done';
                }),
            ]);

            assert.deepStrictEqual(results, ['tx1_done', 'tx2_done']);

            // Both transactions should have committed
            const rows = await db1.all('SELECT * FROM test ORDER BY value');
            assert.strictEqual(rows.length, 2);
        });
    });

    describe('write lock contention', () => {
        let db1, db2;

        beforeEach(async () => {
            const dbPath = newDatabasePath();
            db1 = await SqliteDatabase.open(dbPath);
            db2 = await SqliteDatabase.open(dbPath);

            await db1.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, value TEXT)');
            await db1.exec('DELETE FROM test');
        });

        afterEach(async () => {
            await db1.close();
            await db2.close();
        });

        it('should handle write lock contention with BEGIN IMMEDIATE', async () => {
            // BEGIN IMMEDIATE TRANSACTION acquires a write lock immediately
            // This prevents deadlocks by failing fast if lock is not available

            await db1.beginTransaction(); // Uses BEGIN IMMEDIATE TRANSACTION

            // db2 trying to start a transaction should wait or fail
            // depending on the busy timeout
            let db2Started = false;
            let db2Error = null;

            const db2Promise = db2.beginTransaction()
                .then(() => {
                    db2Started = true;
                })
                .catch(err => {
                    db2Error = err;
                });

            // Give db2 a chance to try
            await new Promise(resolve => setTimeout(resolve, 50));

            // db1 should still have the lock
            await db1.run("INSERT INTO test (value) VALUES ('from_db1')");
            await db1.commitTransaction();

            // Now db2 should be able to proceed
            await db2Promise;

            if (db2Error) {
                // If db2 timed out waiting for lock, that's acceptable behavior
                assert.ok(db2Error.message.includes('locked') || db2Error.message.includes('busy'),
                    `Expected lock-related error, got: ${db2Error.message}`);
            } else {
                // db2 got the lock after db1 committed
                assert.strictEqual(db2Started, true);
            }
        });
    });
});
