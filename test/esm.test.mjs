/**
 * Tests for ESM (ECMAScript Module) support
 *
 * These tests verify that the package can be imported as an ES module
 * using both default and named imports.
 */

import assert from 'node:assert/strict';

// Test default import
import sqlite3 from '@homeofthings/sqlite3';

// Test named imports
import {
    Database,
    Statement,
    Backup,
    SqliteDatabase,
    SqliteStatement,
    SqliteBackup,
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
    BUSY,
    LOCKED,
    cached,
    verbose
} from '@homeofthings/sqlite3';

// Test promise subpath import
import { SqliteDatabase as PromiseDb } from '@homeofthings/sqlite3/promise';

describe('ESM Support', () => {
    describe('Default import', () => {
        it('should export the sqlite3 object as default', () => {
            assert.ok(sqlite3);
            assert.strictEqual(typeof sqlite3, 'object');
        });

        it('should have Database class on default export', () => {
            assert.ok(sqlite3.Database);
            assert.strictEqual(typeof sqlite3.Database, 'function');
        });

        it('should have Statement class on default export', () => {
            assert.ok(sqlite3.Statement);
            assert.strictEqual(typeof sqlite3.Statement, 'function');
        });

        it('should have Backup class on default export', () => {
            assert.ok(sqlite3.Backup);
            assert.strictEqual(typeof sqlite3.Backup, 'function');
        });

        it('should have constants on default export', () => {
            assert.strictEqual(typeof sqlite3.OPEN_READONLY, 'number');
            assert.strictEqual(typeof sqlite3.VERSION, 'string');
        });

        it('should have SqliteDatabase on default export', () => {
            assert.ok(sqlite3.SqliteDatabase);
            assert.strictEqual(typeof sqlite3.SqliteDatabase, 'function');
        });
    });

    describe('Named imports', () => {
        it('should export Database class', () => {
            assert.ok(Database);
            assert.strictEqual(typeof Database, 'function');
        });

        it('should export Statement class', () => {
            assert.ok(Statement);
            assert.strictEqual(typeof Statement, 'function');
        });

        it('should export Backup class', () => {
            assert.ok(Backup);
            assert.strictEqual(typeof Backup, 'function');
        });

        it('should export SqliteDatabase class', () => {
            assert.ok(SqliteDatabase);
            assert.strictEqual(typeof SqliteDatabase, 'function');
        });

        it('should export SqliteStatement class', () => {
            assert.ok(SqliteStatement);
            assert.strictEqual(typeof SqliteStatement, 'function');
        });

        it('should export SqliteBackup class', () => {
            assert.ok(SqliteBackup);
            assert.strictEqual(typeof SqliteBackup, 'function');
        });

        it('should export OPEN_READONLY constant', () => {
            assert.strictEqual(typeof OPEN_READONLY, 'number');
        });

        it('should export OPEN_READWRITE constant', () => {
            assert.strictEqual(typeof OPEN_READWRITE, 'number');
        });

        it('should export OPEN_CREATE constant', () => {
            assert.strictEqual(typeof OPEN_CREATE, 'number');
        });

        it('should export OPEN_FULLMUTEX constant', () => {
            assert.strictEqual(typeof OPEN_FULLMUTEX, 'number');
        });

        it('should export OPEN_SHAREDCACHE constant', () => {
            assert.strictEqual(typeof OPEN_SHAREDCACHE, 'number');
        });

        it('should export OPEN_PRIVATECACHE constant', () => {
            assert.strictEqual(typeof OPEN_PRIVATECACHE, 'number');
        });

        it('should export OPEN_URI constant', () => {
            assert.strictEqual(typeof OPEN_URI, 'number');
        });

        it('should export VERSION string', () => {
            assert.strictEqual(typeof VERSION, 'string');
        });

        it('should export SOURCE_ID string', () => {
            assert.strictEqual(typeof SOURCE_ID, 'string');
        });

        it('should export VERSION_NUMBER number', () => {
            assert.strictEqual(typeof VERSION_NUMBER, 'number');
        });

        it('should export OK constant', () => {
            assert.strictEqual(typeof OK, 'number');
        });

        it('should export ERROR constant', () => {
            assert.strictEqual(typeof ERROR, 'number');
        });

        it('should export BUSY constant', () => {
            assert.strictEqual(typeof BUSY, 'number');
        });

        it('should export LOCKED constant', () => {
            assert.strictEqual(typeof LOCKED, 'number');
        });

        it('should export cached object', () => {
            assert.ok(cached);
            assert.strictEqual(typeof cached, 'object');
        });

        it('should export verbose function', () => {
            assert.strictEqual(typeof verbose, 'function');
        });
    });

    describe('Callback API via ESM', () => {
        it('should open and close database with default import', (done) => {
            const db = new sqlite3.Database(':memory:', (err) => {
                if (err) { return done(err); }
                db.close((err) => {
                    done(err);
                });
            });
        });

        it('should open and close database with named import', (done) => {
            const db = new Database(':memory:', (err) => {
                if (err) { return done(err); }
                db.close((err) => {
                    done(err);
                });
            });
        });

        it('should run queries with default import', (done) => {
            const db = new sqlite3.Database(':memory:', (err) => {
                if (err) { return done(err); }
                db.run('CREATE TABLE test (id INT, name TEXT)', (err) => {
                    if (err) { return done(err); }
                    db.run("INSERT INTO test VALUES (1, 'hello')", function(err) {
                        if (err) { return done(err); }
                        db.get('SELECT * FROM test', (err, row) => {
                            if (err) { return done(err); }
                            assert.strictEqual(row.id, 1);
                            assert.strictEqual(row.name, 'hello');
                            db.close(done);
                        });
                    });
                });
            });
        });
    });

    describe('Promise API via ESM', () => {
        it('should open and close database via promise subpath import', async () => {
            const db = await PromiseDb.open(':memory:');
            assert.strictEqual(db.isOpen(), true);
            await db.close();
            assert.strictEqual(db.isOpen(), false);
        });

        it('should run queries via promise subpath import', async () => {
            const db = await PromiseDb.open(':memory:');
            await db.run('CREATE TABLE test (id INT, name TEXT)');
            await db.run("INSERT INTO test VALUES (1, 'esm')");
            const row = await db.get('SELECT * FROM test');
            assert.strictEqual(row.id, 1);
            assert.strictEqual(row.name, 'esm');
            await db.close();
        });

        it('should use named import SqliteDatabase from main module', async () => {
            const db = await SqliteDatabase.open(':memory:');
            assert.strictEqual(db.isOpen(), true);
            await db.close();
        });
    });

    describe('Constants via ESM', () => {
        it('should have correct OPEN_READONLY value', () => {
            assert.strictEqual(OPEN_READONLY, sqlite3.OPEN_READONLY);
        });

        it('should have correct OPEN_READWRITE value', () => {
            assert.strictEqual(OPEN_READWRITE, sqlite3.OPEN_READWRITE);
        });

        it('should have correct OPEN_CREATE value', () => {
            assert.strictEqual(OPEN_CREATE, sqlite3.OPEN_CREATE);
        });

        it('should have correct VERSION value', () => {
            assert.strictEqual(VERSION, sqlite3.VERSION);
        });
    });
});