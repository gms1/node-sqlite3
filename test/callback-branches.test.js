/**
 * Tests for uncovered branches in sqlite3-callback.js
 * Covers: cached.Database with mode parameter, Statement.map error/empty paths, verbose() called twice
 */

'use strict';

var sqlite3 = require('..');
var assert = require('assert');
var helper = require('./support/helper');

describe('cached.Database branches', function() {
    before(function() {
        helper.ensureExists('test/tmp');
    });

    it('should return cached database with mode parameter and callback', function(done) {
        var filename = 'test/tmp/test_cache_mode.db';
        helper.deleteFile(filename);

        // First, open and cache the database
        var db1 = new sqlite3.cached.Database(filename, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, function(err) {
            if (err) throw err;

            // Now request the same cached database with mode + callback
            var db2 = new sqlite3.cached.Database(filename, sqlite3.OPEN_READWRITE, function(err) {
                if (err) throw err;
                assert.strictEqual(db1, db2);
                db1.close(function() {
                    delete sqlite3.cached.objects[require('path').resolve(filename)];
                    helper.deleteFile(filename);
                    done();
                });
            });
        });
    });

    it('should return cached database with mode parameter when db is already open', function(done) {
        var filename = 'test/tmp/test_cache_mode2.db';
        helper.deleteFile(filename);

        var db1 = new sqlite3.cached.Database(filename, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, function(err) {
            if (err) throw err;
            // db is already open now, request cached version with mode
            var db2 = new sqlite3.cached.Database(filename, sqlite3.OPEN_READONLY, function(err) {
                if (err) throw err;
                assert.strictEqual(db1, db2);
                db1.close(function() {
                    delete sqlite3.cached.objects[require('path').resolve(filename)];
                    helper.deleteFile(filename);
                    done();
                });
            });
        });
    });

    it('should return cached database with mode parameter and no callback', function(done) {
        var filename = 'test/tmp/test_cache_mode_nocb.db';
        helper.deleteFile(filename);

        var db1 = new sqlite3.cached.Database(filename, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, function(err) {
            if (err) throw err;
            // Request cached database with mode but NO callback
            // This covers the false branch of `if (typeof callback === 'function')` on line 46
            var db2 = new sqlite3.cached.Database(filename, sqlite3.OPEN_READWRITE);
            assert.strictEqual(db1, db2);
            db1.close(function() {
                delete sqlite3.cached.objects[require('path').resolve(filename)];
                helper.deleteFile(filename);
                done();
            });
        });
    });
});

describe('Statement#map branches', function() {
    it('should handle error in map callback', function(done) {
        var db = new sqlite3.Database(':memory:');
        db.serialize(function() {
            db.run('CREATE TABLE foo (id INT, value TEXT)');
            db.map('SELECT * FROM nonexistent_table', function(err, map) {
                assert(err); // Should receive an error
                db.close(done);
            });
        });
    });

    it('should handle empty result in map', function(done) {
        var db = new sqlite3.Database(':memory:');
        db.serialize(function() {
            db.run('CREATE TABLE foo (id INT, value TEXT)');
            db.map('SELECT * FROM foo', function(err, map) {
                if (err) throw err;
                assert.deepEqual(map, {});
                db.close(done);
            });
        });
    });

    it('should handle error in Statement#map inner callback via stub', function(done) {
        // Test the error path in Statement.prototype.map's inner callback (line 124)
        // by stubbing the all() method to call back with an error
        var db = new sqlite3.Database(':memory:');
        db.serialize(function() {
            db.run('CREATE TABLE foo (id INT, value TEXT)');
            var stmt = db.prepare('SELECT * FROM foo');

            // Save original all method
            var originalAll = stmt.all;

            // Stub all() to call back with an error
            stmt.all = function() {
                var args = Array.prototype.slice.call(arguments);
                var callback = args[args.length - 1];
                callback(new Error('simulated all error'));
                return this;
            };

            stmt.map(function(err, result) {
                assert(err);
                assert(err.message === 'simulated all error');

                // Restore and clean up
                stmt.all = originalAll;
                stmt.finalize(function() {
                    db.close(done);
                });
            });
        });
    });
});
