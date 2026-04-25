/**
 * Crash scenario: Backup.step() after Backup.finish()
 * With NAPI_CPP_EXCEPTIONS this causes std::terminate() → abort()
 */
'use strict';

const sqlite3 = require('../..');
const path = require('path');
const fs = require('fs');

// Ensure tmp dir exists
const tmpDir = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const db = new sqlite3.Database(':memory:', function(err) {
    if (err) { console.error('open error:', err.message); process.exit(1); }

    db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)', function(err) {
        if (err) { console.error('create error:', err.message); process.exit(1); }

        db.run("INSERT INTO test (value) VALUES ('hello')", function(err) {
            if (err) { console.error('insert error:', err.message); process.exit(1); }

            const backup = new sqlite3.Backup(db, path.join(tmpDir, 'crash_backup.db'), 'main', 'main', true, function(err) {
                if (err) { console.error('backup init error:', err.message); process.exit(1); }

                backup.step(-1, function(err) {
                    if (err) { console.error('step error:', err.message); process.exit(1); }

                    backup.finish(function() {
                        // Use setTimeout to call step outside the async callback context
                        setTimeout(function() {
                            try {
                                backup.step(-1, function(err) {
                                    if (err) {
                                        console.log('OK: got expected error:', err.message);
                                        process.exit(0);
                                    } else {
                                        console.log('ERROR: should have errored');
                                        process.exit(1);
                                    }
                                });
                            } catch (e) {
                                console.log('OK: caught synchronous error:', e.message);
                                process.exit(0);
                            }
                        }, 100);
                    });
                });
            });
        });
    });
});