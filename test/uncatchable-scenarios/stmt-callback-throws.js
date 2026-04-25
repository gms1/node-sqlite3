/**
 * Crash scenario: JS callback throws inside Work_After* async callback
 * With NAPI_CPP_EXCEPTIONS, TRY_CATCH_CALL catches the Napi::Error and
 * re-throws (throw;), which escapes the async callback → std::terminate() → abort()
 */
'use strict';

const sqlite3 = require('../..');

const db = new sqlite3.Database(':memory:', function(err) {
    if (err) { console.error('open error:', err.message); process.exit(1); }

    db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)', function(err) {
        if (err) { console.error('create error:', err.message); process.exit(1); }

        db.run("INSERT INTO test (value) VALUES ('hello')", function(err) {
            if (err) { console.error('insert error:', err.message); process.exit(1); }

            // This callback throws inside Work_AfterRun (async callback context).
            // TRY_CATCH_CALL catches the Napi::Error and re-throws with throw;
            // The re-throw escapes the async callback → std::terminate() → abort()
            db.run("INSERT INTO test (value) VALUES ('world')", function(err) {
                throw new Error('intentional throw from async callback');
            });
        });
    });
});