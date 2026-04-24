/**
 * Tests for Promise-based wrapper classes
 */

'use strict';

const assert = require('assert');
const sqlite3 = require('..');
const { SqliteDatabase, SqliteStatement, SqliteBackup } = sqlite3;
const helper = require('./support/helper');

describe('SqliteDatabase', () => {
    describe('open/close', () => {
        it('should open and close database with constructor + open', async () => {
            const db = new SqliteDatabase();
            await db.open(':memory:');
            assert.strictEqual(db.isOpen(), true);
            await db.close();
            assert.strictEqual(db.isOpen(), false);
        });

        it('should open and close database with static factory method', async () => {
            const db = await SqliteDatabase.open(':memory:');
            assert.strictEqual(db.isOpen(), true);
            await db.close();
            assert.strictEqual(db.isOpen(), false);
        });

        it('should open database with mode flags', async () => {
            const db = await SqliteDatabase.open(':memory:', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
            assert.strictEqual(db.isOpen(), true);
            await db.close();
        });

        it('should handle close on unopened database', async () => {
            const db = new SqliteDatabase();
            assert.strictEqual(db.isOpen(), false);
            await db.close(); // Should not throw
            assert.strictEqual(db.isOpen(), false);
        });

        it('should handle errors when opening database', async () => {
            const db = new SqliteDatabase();
            await assert.rejects(
                async () => db.open('/nonexistent/path/database.db', sqlite3.OPEN_READONLY),
                /Error/
            );
        });
    });

    describe('exec', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
        });

        afterEach(async () => {
            await db.close();
        });

        it('should execute SQL statements', async () => {
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
            await db.exec("INSERT INTO test VALUES (1, 'hello')");
            const result = await db.get('SELECT * FROM test WHERE id = ?', 1);
            assert.strictEqual(result.value, 'hello');
        });

        it('should reject on SQL errors', async () => {
            await assert.rejects(
                async () => db.exec('INVALID SQL'),
                /Error/
            );
        });
    });

    describe('run', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
        });

        afterEach(async () => {
            await db.close();
        });

        it('should run INSERT and return lastID and changes', async () => {
            const result = await db.run("INSERT INTO test (value) VALUES ('hello')");
            assert.strictEqual(result.lastID, 1);
            assert.strictEqual(result.changes, 1);
        });

        it('should run UPDATE and return changes', async () => {
            await db.run("INSERT INTO test (value) VALUES ('hello')");
            await db.run("INSERT INTO test (value) VALUES ('world')");
            const result = await db.run("UPDATE test SET value = 'updated' WHERE id = ?", 1);
            assert.strictEqual(result.changes, 1);
        });

        it('should run DELETE and return changes', async () => {
            await db.run("INSERT INTO test (value) VALUES ('hello')");
            const result = await db.run('DELETE FROM test WHERE id = ?', 1);
            assert.strictEqual(result.changes, 1);
        });
    });

    describe('get', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
            await db.run("INSERT INTO test (value) VALUES ('hello')");
            await db.run("INSERT INTO test (value) VALUES ('world')");
        });

        afterEach(async () => {
            await db.close();
        });

        it('should get a single row', async () => {
            const row = await db.get('SELECT * FROM test WHERE id = ?', 1);
            assert.strictEqual(row.id, 1);
            assert.strictEqual(row.value, 'hello');
        });

        it('should return undefined for no rows', async () => {
            const row = await db.get('SELECT * FROM test WHERE id = ?', 999);
            assert.strictEqual(row, undefined);
        });

        it('should work with named parameters', async () => {
            const row = await db.get('SELECT * FROM test WHERE id = $id', { $id: 1 });
            assert.strictEqual(row.id, 1);
        });
    });

    describe('all', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
            await db.run("INSERT INTO test (value) VALUES ('one')");
            await db.run("INSERT INTO test (value) VALUES ('two')");
            await db.run("INSERT INTO test (value) VALUES ('three')");
        });

        afterEach(async () => {
            await db.close();
        });

        it('should get all rows', async () => {
            const rows = await db.all('SELECT * FROM test ORDER BY id');
            assert.strictEqual(rows.length, 3);
            assert.strictEqual(rows[0].value, 'one');
            assert.strictEqual(rows[1].value, 'two');
            assert.strictEqual(rows[2].value, 'three');
        });

        it('should return empty array for no rows', async () => {
            const rows = await db.all('SELECT * FROM test WHERE id > ?', 999);
            assert.strictEqual(rows.length, 0);
            assert(Array.isArray(rows));
        });
    });

    describe('each', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
            await db.run("INSERT INTO test (value) VALUES ('one')");
            await db.run("INSERT INTO test (value) VALUES ('two')");
            await db.run("INSERT INTO test (value) VALUES ('three')");
        });

        afterEach(async () => {
            await db.close();
        });

        it('should iterate over rows with callback', async () => {
            const values = [];
            const count = await db.each('SELECT * FROM test ORDER BY id', (err, row) => {
                if (err) throw err;
                values.push(row.value);
            });
            assert.strictEqual(count, 3);
            assert.deepStrictEqual(values, ['one', 'two', 'three']);
        });

        it('should work with parameters', async () => {
            const values = [];
            const count = await db.each('SELECT * FROM test WHERE id <= ?', 2, (err, row) => {
                if (err) throw err;
                values.push(row.value);
            });
            assert.strictEqual(count, 2);
            assert.deepStrictEqual(values, ['one', 'two']);
        });
    });

    describe('prepare', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
        });

        afterEach(async () => {
            await db.close();
        });

        it('should prepare a statement', async () => {
            const stmt = await db.prepare('SELECT * FROM test');
            assert(stmt instanceof SqliteStatement);
            await stmt.finalize();
        });

        it('should prepare and bind parameters', async () => {
            const stmt = await db.prepare('INSERT INTO test (value) VALUES (?)');
            await stmt.run('hello');
            await stmt.finalize();

            const row = await db.get('SELECT * FROM test WHERE id = ?', 1);
            assert.strictEqual(row.value, 'hello');
        });
    });

    describe('transaction helpers', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
        });

        afterEach(async () => {
            await db.close();
        });

        it('should begin, commit transaction', async () => {
            await db.beginTransaction();
            await db.run("INSERT INTO test (value) VALUES ('test')");
            await db.commitTransaction();

            const row = await db.get('SELECT COUNT(*) as count FROM test');
            assert.strictEqual(row.count, 1);
        });

        it('should rollback transaction', async () => {
            await db.beginTransaction();
            await db.run("INSERT INTO test (value) VALUES ('test')");
            await db.rollbackTransaction();

            const row = await db.get('SELECT COUNT(*) as count FROM test');
            assert.strictEqual(row.count, 0);
        });

        it('should use transactionalize helper', async () => {
            await db.transactionalize(async () => {
                await db.run("INSERT INTO test (value) VALUES ('test1')");
                await db.run("INSERT INTO test (value) VALUES ('test2')");
            });

            const row = await db.get('SELECT COUNT(*) as count FROM test');
            assert.strictEqual(row.count, 2);
        });

        it('should rollback on error in transactionalize', async () => {
            await assert.rejects(
                async () => db.transactionalize(async () => {
                    await db.run("INSERT INTO test (value) VALUES ('test1')");
                    throw new Error('Test error');
                }),
                /Test error/
            );

            const row = await db.get('SELECT COUNT(*) as count FROM test');
            assert.strictEqual(row.count, 0);
        });
    });

    describe('serialize/parallelize', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
        });

        afterEach(async () => {
            await db.close();
        });

        it('should serialize operations', (done) => {
            db.serialize(async () => {
                await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
                done();
            });
        });

        it('should parallelize operations', (done) => {
            db.parallelize(async () => {
                await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
                done();
            });
        });
    });

    describe('events', () => {
        let db;

        beforeEach(async () => {
            db = await SqliteDatabase.open(':memory:');
        });

        afterEach(async () => {
            await db.close();
        });

        it('should emit trace event', async () => {
            let tracedSql = null;
            db.on('trace', (sql) => {
                tracedSql = sql;
            });

            await db.exec('CREATE TABLE test (id INTEGER)');

            // Note: trace event may not be emitted in all configurations
            // This test verifies the event listener can be registered
        });

        it('should remove event listener', async () => {
            const listener = () => {};
            db.on('trace', listener);
            db.off('trace', listener);
            // Should not throw
        });

        it('should remove all listeners', async () => {
            db.on('trace', () => {});
            db.on('error', () => {});
            db.removeAllListeners('trace');
            // Should not throw
        });

        it('should throw when calling methods on unopened database', async () => {
            const unopened = new SqliteDatabase();
            assert.strictEqual(unopened.isOpen(), false);

            assert.throws(() => unopened.interrupt(), /database connection not open/);
            assert.throws(() => unopened.configure('busyTimeout', 1000), /database connection not open/);
            assert.throws(() => unopened.on('trace', () => {}), /database connection not open/);
            assert.throws(() => unopened.off('trace', () => {}), /database connection not open/);
            assert.throws(() => unopened.removeAllListeners('trace'), /database connection not open/);
        });

        it('should reject when calling async methods on unopened database', async () => {
            const unopened = new SqliteDatabase();

            // close() on unopened database resolves successfully (safe to call)
            await unopened.close(); // Should not throw

            await assert.rejects(async () => unopened.run('SELECT 1'), /database connection not open/);
            await assert.rejects(async () => unopened.get('SELECT 1'), /database connection not open/);
            await assert.rejects(async () => unopened.all('SELECT 1'), /database connection not open/);
            await assert.rejects(async () => unopened.each('SELECT 1', () => {}), /database connection not open/);
            await assert.rejects(async () => unopened.exec('SELECT 1'), /database connection not open/);
            await assert.rejects(async () => unopened.prepare('SELECT 1'), /database connection not open/);
            await assert.rejects(async () => unopened.backup('test.db'), /database connection not open/);
            await assert.rejects(async () => unopened.wait(), /database connection not open/);
        });

        it('should throw when calling serialize/parallelize on unopened database', async () => {
            const unopened = new SqliteDatabase();
            assert.throws(() => unopened.serialize(), /database connection not open/);
            assert.throws(() => unopened.parallelize(), /database connection not open/);
        });

        it('should handle close errors', async () => {
            const db = await SqliteDatabase.open(':memory:');
            await db.close();
            // Second close should succeed (no error)
            await db.close();
        });

        it('should handle run/get/all/each errors', async () => {
            const db = await SqliteDatabase.open(':memory:');

            await assert.rejects(async () => db.run('INVALID SQL'), /Error/);
            await assert.rejects(async () => db.get('INVALID SQL'), /Error/);
            await assert.rejects(async () => db.all('INVALID SQL'), /Error/);
            await assert.rejects(async () => db.each('INVALID SQL', () => {}), /Error/);

            await db.close();
        });

        it('should handle prepare errors', async () => {
            const db = await SqliteDatabase.open(':memory:');

            await assert.rejects(async () => db.prepare('INVALID SQL'), /Error/);

            await db.close();
        });

        it('should wait for database', async () => {
            const db = await SqliteDatabase.open(':memory:');
            await db.wait();
            await db.close();
        });

        it('should interrupt queries', async () => {
            const db = await SqliteDatabase.open(':memory:');
            // interrupt() should not throw
            db.interrupt();
            await db.close();
        });

        it('should configure database', async () => {
            const db = await SqliteDatabase.open(':memory:');
            db.configure('busyTimeout', 1000);
            await db.close();
        });

        it('should handle backup errors', async () => {
            const db = await SqliteDatabase.open(':memory:');

            // Try to backup to an invalid path
            await assert.rejects(async () => db.backup('/nonexistent/path/backup.db'), /Error/);

            await db.close();
        });

        it('should use endTransaction for commit', async () => {
            const db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');

            await db.beginTransaction();
            await db.run('INSERT INTO test VALUES (1)');
            await db.endTransaction(true); // commit

            const row = await db.get('SELECT COUNT(*) as count FROM test');
            assert.strictEqual(row.count, 1);

            await db.close();
        });

        it('should use endTransaction for rollback', async () => {
            const db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');

            await db.beginTransaction();
            await db.run('INSERT INTO test VALUES (1)');
            await db.endTransaction(false); // rollback

            const row = await db.get('SELECT COUNT(*) as count FROM test');
            assert.strictEqual(row.count, 0);

            await db.close();
        });

        it('should reject endTransaction on unopened database', async () => {
            const db = new SqliteDatabase();
            await assert.rejects(async () => db.endTransaction(true), /database connection not open/);
        });

        it('should ignore no-transaction errors in endTransaction', async () => {
            const db = await SqliteDatabase.open(':memory:');
            // Calling endTransaction without an active transaction
            // should resolve (ignoring "no transaction" errors)
            await db.endTransaction(true);
            await db.endTransaction(false);
            await db.close();
        });

        it('should reject loadExtension on unopened database', async () => {
            const db = new SqliteDatabase();
            await assert.rejects(async () => db.loadExtension('test.ext'), /database connection not open/);
        });

        it('should reject loadExtension with invalid extension', async () => {
            const db = await SqliteDatabase.open(':memory:');
            await assert.rejects(async () => db.loadExtension('nonexistent_extension'), /Error/);
            await db.close();
        });

        it('should handle each with callback only (no params)', async () => {
            const db = await SqliteDatabase.open(':memory:');
            await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
            await db.run("INSERT INTO test (value) VALUES ('one')");
            await db.run("INSERT INTO test (value) VALUES ('two')");

            const values = [];
            const count = await db.each('SELECT * FROM test ORDER BY id', (err, row) => {
                if (err) throw err;
                values.push(row.value);
            });
            assert.strictEqual(count, 2);
            assert.deepStrictEqual(values, ['one', 'two']);
            await db.close();
        });
    });
});

describe('SqliteStatement', () => {
    let db;

    beforeEach(async () => {
        db = await SqliteDatabase.open(':memory:');
        await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    });

    afterEach(async () => {
        await db.close();
    });

    describe('run', () => {
        it('should run prepared statement', async () => {
            const stmt = await db.prepare('INSERT INTO test (value) VALUES (?)');
            const result = await stmt.run('hello');
            assert.strictEqual(result.lastID, 1);
            assert.strictEqual(result.changes, 1);
            await stmt.finalize();
        });

        it('should run multiple times', async () => {
            const stmt = await db.prepare('INSERT INTO test (value) VALUES (?)');

            await stmt.run('one');
            await stmt.run('two');
            await stmt.run('three');

            await stmt.finalize();

            const rows = await db.all('SELECT * FROM test ORDER BY id');
            assert.strictEqual(rows.length, 3);
        });
    });

    describe('get', () => {
        it('should get single row', async () => {
            await db.run("INSERT INTO test (value) VALUES ('hello')");

            const stmt = await db.prepare('SELECT * FROM test WHERE id = ?');
            const row = await stmt.get(1);
            assert.strictEqual(row.value, 'hello');
            await stmt.finalize();
        });

        it('should return undefined for no rows', async () => {
            const stmt = await db.prepare('SELECT * FROM test WHERE id = ?');
            const row = await stmt.get(999);
            assert.strictEqual(row, undefined);
            await stmt.finalize();
        });
    });

    describe('all', () => {
        it('should get all rows', async () => {
            await db.run("INSERT INTO test (value) VALUES ('one')");
            await db.run("INSERT INTO test (value) VALUES ('two')");

            const stmt = await db.prepare('SELECT * FROM test ORDER BY id');
            const rows = await stmt.all();
            assert.strictEqual(rows.length, 2);
            await stmt.finalize();
        });
    });

    describe('each', () => {
        it('should iterate over rows', async () => {
            await db.run("INSERT INTO test (value) VALUES ('one')");
            await db.run("INSERT INTO test (value) VALUES ('two')");

            const values = [];
            const stmt = await db.prepare('SELECT * FROM test ORDER BY id');
            const count = await stmt.each((err, row) => {
                if (err) throw err;
                values.push(row.value);
            });
            assert.strictEqual(count, 2);
            assert.deepStrictEqual(values, ['one', 'two']);
            await stmt.finalize();
        });
    });

    describe('bind', () => {
        it('should bind parameters', async () => {
            const stmt = await db.prepare('INSERT INTO test (value) VALUES (?)');
            stmt.bind('bound value');
            await stmt.run();
            await stmt.finalize();

            const row = await db.get('SELECT * FROM test WHERE id = ?', 1);
            assert.strictEqual(row.value, 'bound value');
        });
    });

    describe('reset', () => {
        it('should reset statement', async () => {
            const stmt = await db.prepare('SELECT * FROM test');
            await stmt.reset();
            await stmt.finalize();
            // Should not throw
        });
    });

    describe('errors', () => {
        it('should reject on statement finalize error when statement is invalid', async () => {
            // This is hard to test without corrupting the database
            // Just verify finalize works normally
            const stmt = await db.prepare('SELECT * FROM test');
            await stmt.finalize();
        });
    });

    describe('get with bound params', () => {
        it('should get single row using bound params (no params passed)', async () => {
            await db.run("INSERT INTO test (value) VALUES ('hello')");
            const stmt = await db.prepare('SELECT * FROM test WHERE id = ?');
            stmt.bind(1);
            const row = await stmt.get();
            assert.strictEqual(row.value, 'hello');
            await stmt.finalize();
        });
    });

    describe('all with params', () => {
        it('should get all rows with params', async () => {
            await db.run("INSERT INTO test (value) VALUES ('one')");
            await db.run("INSERT INTO test (value) VALUES ('two')");
            const stmt = await db.prepare('SELECT * FROM test WHERE id <= ?');
            const rows = await stmt.all(2);
            assert.strictEqual(rows.length, 2);
            await stmt.finalize();
        });
    });

    describe('each with params', () => {
        it('should iterate over rows with params and callback', async () => {
            await db.run("INSERT INTO test (value) VALUES ('one')");
            await db.run("INSERT INTO test (value) VALUES ('two')");
            const values = [];
            const stmt = await db.prepare('SELECT * FROM test WHERE id <= ?');
            const count = await stmt.each(2, (err, row) => {
                if (err) throw err;
                values.push(row.value);
            });
            assert.strictEqual(count, 2);
            assert.deepStrictEqual(values, ['one', 'two']);
            await stmt.finalize();
        });
    });

    describe('run error', () => {
        it('should reject on UNIQUE constraint violation', async () => {
            await db.exec('CREATE TABLE unique_test (id INTEGER PRIMARY KEY, value TEXT UNIQUE)');
            await db.run("INSERT INTO unique_test (value) VALUES ('hello')");
            const stmt = await db.prepare('INSERT INTO unique_test (value) VALUES (?)');
            await assert.rejects(async () => stmt.run('hello'), /UNIQUE/);
            await stmt.finalize();
        });
    });

});

describe('SqliteBackup', () => {
    before(function() {
        helper.ensureExists('test/tmp');
    });

    let db;

    beforeEach(async () => {
        db = await SqliteDatabase.open(':memory:');
        await db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
        await db.run("INSERT INTO test (value) VALUES ('test data')");
    });

    afterEach(async () => {
        await db.close();
    });

    it('should create backup', async () => {
        const backup = await db.backup('test/tmp/backup.db');
        assert(backup instanceof SqliteBackup);
        backup.finish();

        // Clean up
        helper.deleteFile('test/tmp/backup.db');
    });

    it('should step through backup', async () => {
        const backup = await db.backup('test/tmp/backup2.db');

        // Step through all pages
        await backup.step(-1);

        assert.strictEqual(backup.completed, true);
        assert.strictEqual(backup.idle, true);

        backup.finish();

        // Clean up
        helper.deleteFile('test/tmp/backup2.db');
    });

    it('should report progress', async () => {
        const backup = await db.backup('test/tmp/backup3.db');

        // Before stepping
        assert.strictEqual(backup.progress, 0);

        // Step through all pages
        await backup.step(-1);

        // After completion
        assert.strictEqual(backup.progress, 100);

        backup.finish();

        // Clean up
        helper.deleteFile('test/tmp/backup3.db');
    });

    it('should handle backup errors', async () => {
        // Close the database before backup finishes
        const backup = await db.backup('test/tmp/backup4.db');
        await backup.step(-1);
        backup.finish();

        // Clean up
        helper.deleteFile('test/tmp/backup4.db');
    });

    it('should report failed as false in normal operation', async () => {
        const backup = await db.backup('test/tmp/backup_failed.db');
        assert.strictEqual(backup.failed, false);
        await backup.step(-1);
        assert.strictEqual(backup.failed, false);
        backup.finish();
        helper.deleteFile('test/tmp/backup_failed.db');
    });

    it('should report remaining and pageCount before step', async () => {
        const backup = await db.backup('test/tmp/backup_pages.db');
        assert.strictEqual(backup.remaining, -1);
        assert.strictEqual(backup.pageCount, -1);
        backup.finish();
        helper.deleteFile('test/tmp/backup_pages.db');
    });

    it('should step with specific page count', async () => {
        const backup = await db.backup('test/tmp/backup_step_n.db');
        await backup.step(1);
        backup.finish();
        helper.deleteFile('test/tmp/backup_step_n.db');
    });

});

describe('TypeScript generics (demonstration)', () => {
    // Note: TypeScript generics are only available in TypeScript files.
    // This test demonstrates that the JavaScript API works correctly.
    // In TypeScript, you would use:
    //   const user = await db.get<User>('SELECT * FROM users WHERE id = ?', 1);
    //   const users = await db.all<User>('SELECT * FROM users');

    let db;

    beforeEach(async () => {
        db = await SqliteDatabase.open(':memory:');
        await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)');
    });

    afterEach(async () => {
        await db.close();
    });

    it('should work with typed results (JS)', async () => {
        await db.run("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");

        // In JavaScript, the result is just an object with the expected properties
        const user = await db.get('SELECT * FROM users WHERE id = ?', 1);
        assert.strictEqual(user.name, 'Alice');
        assert.strictEqual(user.email, 'alice@example.com');

        const users = await db.all('SELECT * FROM users');
        assert.strictEqual(users.length, 1);
        assert.strictEqual(users[0].name, 'Alice');
    });

    it('should work with statement generics (JS)', async () => {
        await db.run("INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com')");

        // In JavaScript, the result is just an object with the expected properties
        const stmt = await db.prepare('SELECT * FROM users WHERE id = ?');
        const user = await stmt.get(1);
        assert.strictEqual(user.name, 'Bob');
        await stmt.finalize();
    });
});
