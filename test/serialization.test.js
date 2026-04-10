var sqlite3 = require('..');
var assert = require('assert');


describe('serialize() and parallelize()', function() {
    var db;
    before(function(done) { db = new sqlite3.Database(':memory:', done); });

    var inserted1 = 0;
    var inserted2 = 0;
    var retrieved = 0;

    var count = 1000;

    it('should toggle', function(done) {
        db.serialize();
        db.run("CREATE TABLE foo (txt text, num int, flt float, blb blob)");
        db.parallelize(done);
    });

    it('should insert rows', function() {
        var stmt1 = db.prepare("INSERT INTO foo VALUES(?, ?, ?, ?)");
        var stmt2 = db.prepare("INSERT INTO foo VALUES(?, ?, ?, ?)");
        for (var i = 0; i < count; i++) {
            // Interleaved inserts with two statements.
            stmt1.run('String ' + i, i, i * Math.PI, function(err) {
                if (err) throw err;
                inserted1++;
            });
            i++;
            stmt2.run('String ' + i, i, i * Math.PI, function(err) {
                if (err) throw err;
                inserted2++;
            });
        }
        stmt1.finalize();
        stmt2.finalize();
    });

    it('should have inserted all the rows after synchronizing with serialize()', function(done) {
        db.serialize();
        db.all("SELECT txt, num, flt, blb FROM foo ORDER BY num", function(err, rows) {
            if (err) throw err;
            for (var i = 0; i < rows.length; i++) {
                assert.equal(rows[i].txt, 'String ' + i);
                assert.equal(rows[i].num, i);
                assert.equal(rows[i].flt, i * Math.PI);
                assert.equal(rows[i].blb, null);
                retrieved++;
            }

            assert.equal(count, inserted1 + inserted2, "Didn't insert all rows");
            assert.equal(count, retrieved, "Didn't retrieve all rows");
            done();
        });
    });

    after(function(done) { db.close(done); });
});

describe('serialize(fn)', function() {
    var db;
    before(function(done) { db = new sqlite3.Database(':memory:', done); });

    var inserted = 0;
    var retrieved = 0;

    var count = 1000;

    it('should call the callback', function(done) {
        db.serialize(function() {
            db.run("CREATE TABLE foo (txt text, num int, flt float, blb blob)");

            var stmt = db.prepare("INSERT INTO foo VALUES(?, ?, ?, ?)");
            for (var i = 0; i < count; i++) {
                stmt.run('String ' + i, i, i * Math.PI, function(err) {
                    if (err) throw err;
                    inserted++;
                });
            }
            stmt.finalize();

            db.all("SELECT txt, num, flt, blb FROM foo ORDER BY num", function(err, rows) {
                if (err) throw err;
                for (var i = 0; i < rows.length; i++) {
                    assert.equal(rows[i].txt, 'String ' + i);
                    assert.equal(rows[i].num, i);
                    assert.equal(rows[i].flt, i * Math.PI);
                    assert.equal(rows[i].blb, null);
                    retrieved++;
                }
                done();
            });
        });
    });


    it('should have inserted and retrieved all rows', function() {
        assert.equal(count, inserted, "Didn't insert all rows");
        assert.equal(count, retrieved, "Didn't retrieve all rows");
    });

    after(function(done) { db.close(done); });
});

describe('serialize() queue processing with synchronous operations', function () {
    var db;

    beforeEach(function (done) {
        db = new sqlite3.Database(':memory:', done);
    });

    afterEach(function (done) {
        db.close(done);
    });

    it('should process queued operations after configure in serialized mode', function (done) {
    // This test reproduces the bug where operations get stuck in the queue
    // when db.configure() is called during serialized mode with pending async work.
    // See: https://github.com/TryGhost/node-sqlite3/issues/1838

        var LONG_QUERY = `WITH recursive recur(n)
            AS (SELECT 1
            UNION ALL
            SELECT n + 1
            FROM recur where n < 1000000
            )
            SELECT n FROM recur;`;

        var executed = false;

        db.serialize();

        // Start a long-running async operation
        db.exec(LONG_QUERY);

        // Queue a synchronous configure operation
        db.configure('limit', sqlite3.LIMIT_ATTACHED, 1);

        // Queue another operation - this should execute after configure
        db.exec("SELECT 1", function (err) {
            if (err) return done(err);
            executed = true;
        });

        // Give enough time for the bug to manifest
        setTimeout(function () {
            if (executed) {
                done();
            } else {
                done(new Error('Queue processing deadlock: SELECT 1 callback was never called'));
            }
        }, 2000);
    });

    it('should process multiple configure calls in serialized mode', function (done) {
        var executed = false;

        db.serialize();

        db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)");
        db.exec("INSERT INTO test VALUES (1, 'one')");

        // Multiple configure calls should all be processed
        db.configure('limit', sqlite3.LIMIT_ATTACHED, 1);
        db.configure('busyTimeout', 1000);

        db.exec("SELECT * FROM test", function (err, rows) {
            if (err) return done(err);
            executed = true;
        });

        setTimeout(function () {
            if (executed) {
                done();
            } else {
                done(new Error('Queue processing deadlock: SELECT callback was never called'));
            }
        }, 1000);
    });
});
