const sqlite3 = require('../../lib/sqlite3');
const fs = require('fs');

const iterations = 10000;

/**
 * Helper to promisify sqlite3 operations
 */
function promisifyRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function promisifyExec(db, sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function promisifyClose(db) {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

/**
 * Insert benchmarks with proper setup/teardown separation.
 * Setup (create database, create table) and teardown (close database)
 * are NOT measured - only the actual insert operations are measured.
 */
module.exports = {
    benchmarks: {
        'literal file': (() => {
            let db = null;
            let sqlFile = null;

            return {
                async beforeEach() {
                    // Setup: Create in-memory database - NOT measured
                    db = new sqlite3.Database(':memory:');
                    sqlFile = fs.readFileSync(__dirname + '/insert-transaction.sql', 'utf8');
                },

                async fn() {
                    // Benchmark: Execute SQL file - MEASURED
                    await promisifyExec(db, sqlFile);
                },

                async afterEach() {
                    // Teardown: Close database - NOT measured
                    await promisifyClose(db);
                },
            };
        })(),

        'transaction with two statements': (() => {
            let db = null;

            return {
                async beforeEach() {
                    // Setup: Create database and table - NOT measured
                    db = new sqlite3.Database(':memory:');
                    await promisifyRun(db, 'CREATE TABLE foo (id INT, txt TEXT)');
                },

                async fn() {
                    // Benchmark: Insert with transaction and two parallel statements - MEASURED
                    await new Promise((resolve, reject) => {
                        db.serialize(async () => {
                            await promisifyRun(db, 'BEGIN');

                            db.parallelize(() => {
                                const stmt1 = db.prepare('INSERT INTO foo VALUES (?, ?)');
                                const stmt2 = db.prepare('INSERT INTO foo VALUES (?, ?)');
                                for (let i = 0; i < iterations; i++) {
                                    stmt1.run(i, 'Row ' + i);
                                    i++;
                                    stmt2.run(i, 'Row ' + i);
                                }
                                stmt1.finalize();
                                stmt2.finalize();
                            });

                            await promisifyRun(db, 'COMMIT');
                            resolve();
                        });
                    });
                },

                async afterEach() {
                    // Teardown: Close database - NOT measured
                    await promisifyClose(db);
                },
            };
        })(),

        'with transaction': (() => {
            let db = null;

            return {
                async beforeEach() {
                    // Setup: Create database and table - NOT measured
                    db = new sqlite3.Database(':memory:');
                    await promisifyRun(db, 'CREATE TABLE foo (id INT, txt TEXT)');
                },

                async fn() {
                    // Benchmark: Insert with transaction - MEASURED
                    await new Promise((resolve, reject) => {
                        db.serialize(async () => {
                            await promisifyRun(db, 'BEGIN');
                            const stmt = db.prepare('INSERT INTO foo VALUES (?, ?)');
                            for (let i = 0; i < iterations; i++) {
                                stmt.run(i, 'Row ' + i);
                            }
                            stmt.finalize();
                            await promisifyRun(db, 'COMMIT');
                            resolve();
                        });
                    });
                },

                async afterEach() {
                    // Teardown: Close database - NOT measured
                    await promisifyClose(db);
                },
            };
        })(),

        'without transaction': (() => {
            let db = null;

            return {
                async beforeEach() {
                    // Setup: Create database and table - NOT measured
                    db = new sqlite3.Database(':memory:');
                    await promisifyRun(db, 'CREATE TABLE foo (id INT, txt TEXT)');
                },

                async fn() {
                    // Benchmark: Insert without transaction - MEASURED
                    await new Promise((resolve, reject) => {
                        db.serialize(() => {
                            const stmt = db.prepare('INSERT INTO foo VALUES (?, ?)');
                            for (let i = 0; i < iterations; i++) {
                                stmt.run(i, 'Row ' + i);
                            }
                            stmt.finalize();
                            resolve();
                        });
                    });
                },

                async afterEach() {
                    // Teardown: Close database - NOT measured
                    await promisifyClose(db);
                },
            };
        })(),
    },
};
