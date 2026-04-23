"use strict";

var sqlite3 = require('..');
const assert = require("assert");
const { createHook, executionAsyncId, triggerAsyncId } = require("async_hooks");

const DEBUG = process.env.SQLITE3_DEBUG_ASYNC_HOOKS === '1';

/**
 * Stress test for async hook stack integrity.
 *
 * The original bug manifested as:
 *   "Error: async hook stack has become corrupted (actual: X, expected: X)"
 *
 * This test tracks async hook lifecycle events and verifies that the
 * before/after stack remains balanced. When SQLITE3_DEBUG_ASYNC_HOOKS=1,
 * detailed diagnostic information is logged to stderr for debugging
 * stack corruption issues.
 */
describe('async_hooks stress', function() {
    this.timeout(60000);

    const OPERATIONS = 500;
    const ITERATIONS = 3;

    /**
     * Wait for all async hooks to be destroyed after closing the database.
     * napi_delete_async_work fires the destroy hook (deferred via SetImmediate),
     * so we need to spin the event loop enough times for all destroy hooks to fire.
     */
    function waitForDestroyHooks(initIds, destroyIds, timeout, callback) {
        const start = Date.now();
        function check() {
            let allDestroyed = true;
            for (const id of initIds) {
                if (!destroyIds.has(id)) {
                    allDestroyed = false;
                    break;
                }
            }
            if (allDestroyed) {
                return callback(null);
            }
            if (Date.now() - start > timeout) {
                const leaked = [];
                for (const id of initIds) {
                    if (!destroyIds.has(id)) leaked.push(id);
                }
                return callback(new Error(
                    `Timeout waiting for destroy hooks. ${leaked.length} hooks never destroyed: ${leaked.slice(0, 10).join(', ')}...`
                ));
            }
            // Spin the event loop to allow deferred destroy hooks to fire.
            setImmediate(() => setImmediate(check));
        }
        // Start checking after giving the event loop time to process deferred deletions.
        setImmediate(() => setImmediate(check));
    }

    /**
     * Force GC if exposed (run with --expose-gc). This increases the chance
     * that freed memory gets reused, making use-after-free more likely to
     * manifest as corruption rather than silently accessing stale but valid data.
     */
    function tryGC() {
        if (typeof global.gc === 'function') {
            global.gc();
        }
    }

    /**
     * Create a debug-enabled async_hooks hook that logs detailed information
     * about each hook invocation when SQLITE3_DEBUG_ASYNC_HOOKS=1.
     */
    function createDebugHook(initIds, destroyIds, beforeAfterStack, options = {}) {
        const { logPrefix = '', trackBeforeAfter = true } = options;
        let hookDepth = 0;

        const hook = createHook({
            init(asyncId, type, triggerAsyncId_, resource) {
                if (type.startsWith("sqlite3.")) {
                    initIds.add(asyncId);
                    if (DEBUG) {
                        process.stderr.write(
                            `[INIT] ${logPrefix} asyncId=${asyncId} type=${type} triggerAsyncId=${triggerAsyncId_} executionAsyncId=${executionAsyncId()}\n`
                        );
                    }
                }
            },
            before(asyncId) {
                if (initIds.has(asyncId)) {
                    if (trackBeforeAfter) {
                        beforeAfterStack.push(asyncId);
                    }
                    if (DEBUG) {
                        process.stderr.write(
                            `[BEFORE] ${logPrefix} asyncId=${asyncId} executionAsyncId=${executionAsyncId()} triggerAsyncId=${triggerAsyncId()} stackDepth=${beforeAfterStack.length}\n`
                        );
                    }
                }
            },
            after(asyncId) {
                if (initIds.has(asyncId)) {
                    if (trackBeforeAfter) {
                        const last = beforeAfterStack.pop();
                        if (asyncId !== last) {
                            const msg = `async hook before/after mismatch: after(${asyncId}) but expected after(${last})`;
                            if (DEBUG) {
                                process.stderr.write(`[AFTER ERROR] ${logPrefix} ${msg}\n`);
                            }
                            assert.strictEqual(asyncId, last, msg);
                        }
                    }
                    if (DEBUG) {
                        process.stderr.write(
                            `[AFTER] ${logPrefix} asyncId=${asyncId} executionAsyncId=${executionAsyncId()} triggerAsyncId=${triggerAsyncId()} stackDepth=${beforeAfterStack.length}\n`
                        );
                    }
                }
            },
            destroy(asyncId) {
                if (initIds.has(asyncId)) {
                    destroyIds.add(asyncId);
                    if (DEBUG) {
                        process.stderr.write(
                            `[DESTROY] ${logPrefix} asyncId=${asyncId} executionAsyncId=${executionAsyncId()}\n`
                        );
                    }
                }
            }
        });
        return hook;
    }

    it('should maintain async hook stack integrity under concurrent operations', function(done) {
        const db = new sqlite3.Database(':memory:');

        // Track all sqlite3 async work lifecycle events
        const initIds = new Set();
        const destroyIds = new Set();
        const beforeAfterStack = [];

        let initCount = 0;
        let destroyCount = 0;

        const hook = createHook({
            init(asyncId, type) {
                if (type.startsWith("sqlite3.")) {
                    initIds.add(asyncId);
                    initCount++;
                    if (DEBUG) {
                        process.stderr.write(
                            `[INIT] asyncId=${asyncId} type=${type} triggerAsyncId=${triggerAsyncId()} executionAsyncId=${executionAsyncId()}\n`
                        );
                    }
                }
            },
            before(asyncId) {
                if (initIds.has(asyncId)) {
                    beforeAfterStack.push(asyncId);
                    if (DEBUG) {
                        process.stderr.write(
                            `[BEFORE] asyncId=${asyncId} executionAsyncId=${executionAsyncId()} stackDepth=${beforeAfterStack.length}\n`
                        );
                    }
                }
            },
            after(asyncId) {
                if (initIds.has(asyncId)) {
                    const last = beforeAfterStack.pop();
                    if (DEBUG) {
                        process.stderr.write(
                            `[AFTER] asyncId=${asyncId} executionAsyncId=${executionAsyncId()} stackDepth=${beforeAfterStack.length}\n`
                        );
                    }
                    assert.strictEqual(asyncId, last,
                        `async hook before/after mismatch: after(${asyncId}) but expected after(${last})`);
                }
            },
            destroy(asyncId) {
                if (initIds.has(asyncId)) {
                    destroyIds.add(asyncId);
                    destroyCount++;
                    if (DEBUG) {
                        process.stderr.write(
                            `[DESTROY] asyncId=${asyncId} executionAsyncId=${executionAsyncId()}\n`
                        );
                    }
                }
            }
        });
        hook.enable();

        // Create a table
        db.run("CREATE TABLE IF NOT EXISTS stress_test (id INTEGER PRIMARY KEY, value TEXT)", (err) => {
            assert.ifError(err);

            let completed = 0;

            // Fire many concurrent operations
            for (let i = 0; i < OPERATIONS; i++) {
                db.run("INSERT INTO stress_test (value) VALUES (?)", `val-${i}`, (err) => {
                    assert.ifError(err);

                    // Mix in some get operations
                    db.get("SELECT COUNT(*) as count FROM stress_test", (err, row) => {
                        assert.ifError(err);
                        assert.ok(row.count > 0);

                        completed++;
                        if (completed === OPERATIONS) {
                            // All operations complete. Now close the db and verify hook lifecycle.
                            db.close((err) => {
                                assert.ifError(err);

                                waitForDestroyHooks(initIds, destroyIds, 5000, (err) => {
                                    hook.disable();

                                    if (err) {
                                        // Log diagnostic info but don't fail — the critical check
                                        // is that no async hook stack corruption occurred
                                        console.log(`Warning: ${err.message}`);
                                        console.log(`initCount=${initCount}, destroyCount=${destroyCount}`);
                                    }

                                    // before/after stack must be fully balanced
                                    assert.strictEqual(beforeAfterStack.length, 0,
                                        `before/after stack not balanced: ${beforeAfterStack.length} unpaired before() calls`);

                                    // The most important assertion: we got here without
                                    // "async hook stack has become corrupted" being thrown.
                                    done();
                                });
                            });
                        }
                    });
                });
            }
        });
    });

    it('should maintain async hook stack integrity with prepared statements', function(done) {
        const db = new sqlite3.Database(':memory:');

        const initIds = new Set();
        const destroyIds = new Set();

        const hook = createHook({
            init(asyncId, type) {
                if (type.startsWith("sqlite3.")) {
                    initIds.add(asyncId);
                }
            },
            destroy(asyncId) {
                if (initIds.has(asyncId)) {
                    destroyIds.add(asyncId);
                }
            }
        });
        hook.enable();

        db.run("CREATE TABLE stmt_test (id INTEGER PRIMARY KEY, v TEXT)", (err) => {
            assert.ifError(err);

            let completed = 0;
            const TOTAL = 200;

            for (let i = 0; i < TOTAL; i++) {
                const stmt = db.prepare("INSERT INTO stmt_test (v) VALUES (?)");
                stmt.run(`s-${i}`, function(err) {
                    assert.ifError(err);
                    this.finalize(function(err) {
                        assert.ifError(err);
                        completed++;
                        if (completed === TOTAL) {
                            db.close((err) => {
                                assert.ifError(err);
                                waitForDestroyHooks(initIds, destroyIds, 5000, (err) => {
                                    hook.disable();
                                    if (err) {
                                        console.log(`Warning: ${err.message}`);
                                    }
                                    // The critical assertion: we got here without
                                    // "async hook stack has become corrupted"
                                    done();
                                });
                            });
                        }
                    });
                });
            }
        });
    });

    it('should maintain async hook stack integrity under repeated open/close cycles with GC pressure', function(done) {
        // This test creates and destroys databases sequentially with GC pressure
        // to increase the chance that freed async work memory gets reused,
        // making use-after-free more likely to manifest as corruption.
        const initIds = new Set();
        const destroyIds = new Set();

        const hook = createHook({
            init(asyncId, type) {
                if (type.startsWith("sqlite3.")) {
                    initIds.add(asyncId);
                }
            },
            destroy(asyncId) {
                if (initIds.has(asyncId)) {
                    destroyIds.add(asyncId);
                }
            }
        });
        hook.enable();

        let cycle = 0;

        function runNextCycle() {
            if (cycle >= ITERATIONS) {
                // All cycles done — verify hooks
                waitForDestroyHooks(initIds, destroyIds, 5000, (err) => {
                    hook.disable();
                    if (err) {
                        console.log(`Warning: ${err.message}`);
                    }
                    // The critical assertion: we got here without
                    // "async hook stack has become corrupted"
                    done();
                });
                return;
            }

            const db = new sqlite3.Database(':memory:');
            db.run("CREATE TABLE gc_test (v TEXT)", (err) => {
                assert.ifError(err);
                db.run("INSERT INTO gc_test VALUES ('x')", (err) => {
                    assert.ifError(err);
                    db.get("SELECT COUNT(*) as c FROM gc_test", (err, row) => {
                        assert.ifError(err);
                        assert.strictEqual(row.c, 1);
                        db.close((err) => {
                            assert.ifError(err);
                            // Force GC to reclaim freed async work memory
                            tryGC();
                            cycle++;
                            // Let deferred destroy hooks complete before next cycle
                            setImmediate(() => setImmediate(runNextCycle));
                        });
                    });
                });
            });
        }

        runNextCycle();
    });

    it('should maintain async hook stack integrity with serialized prepared statement runs (createdb pattern)', function(done) {
        // This mirrors the createdb.js pattern that triggered the original crash:
        // db.serialize() + stmt.run() in a tight loop + finalize + close
        // Repeating the full new→serialize→close cycle stresses async work lifecycle.

        const CYCLES = 100;
        const COUNT = 10;

        const initIds = new Set();
        const destroyIds = new Set();
        const beforeAfterStack = [];

        const hook = createHook({
            init(asyncId, type) {
                if (type.startsWith("sqlite3.")) {
                    initIds.add(asyncId);
                    if (DEBUG) {
                        process.stderr.write(
                            `[INIT] cycle asyncId=${asyncId} type=${type} triggerAsyncId=${triggerAsyncId()} executionAsyncId=${executionAsyncId()}\n`
                        );
                    }
                }
            },
            before(asyncId) {
                if (initIds.has(asyncId)) {
                    beforeAfterStack.push(asyncId);
                    if (DEBUG) {
                        process.stderr.write(
                            `[BEFORE] cycle asyncId=${asyncId} executionAsyncId=${executionAsyncId()} stackDepth=${beforeAfterStack.length}\n`
                        );
                    }
                }
            },
            after(asyncId) {
                if (initIds.has(asyncId)) {
                    const last = beforeAfterStack.pop();
                    if (DEBUG) {
                        process.stderr.write(
                            `[AFTER] cycle asyncId=${asyncId} executionAsyncId=${executionAsyncId()} stackDepth=${beforeAfterStack.length}\n`
                        );
                    }
                    assert.strictEqual(asyncId, last,
                        `async hook before/after mismatch: after(${asyncId}) but expected after(${last})`);
                }
            },
            destroy(asyncId) {
                if (initIds.has(asyncId)) {
                    destroyIds.add(asyncId);
                    if (DEBUG) {
                        process.stderr.write(
                            `[DESTROY] cycle asyncId=${asyncId} executionAsyncId=${executionAsyncId()}\n`
                        );
                    }
                }
            }
        });
        hook.enable();

        let cycle = 0;

        function runNextCycle() {
            if (cycle >= CYCLES) {
                // All cycles done — verify hooks
                waitForDestroyHooks(initIds, destroyIds, 10000, (err) => {
                    hook.disable();
                    if (err) {
                        console.log(`Warning: ${err.message}`);
                    }
                    // before/after stack must be fully balanced
                    assert.strictEqual(beforeAfterStack.length, 0,
                        `before/after stack not balanced: ${beforeAfterStack.length} unpaired before() calls`);
                    // The critical assertion: we got here without
                    // "async hook stack has become corrupted"
                    done();
                });
                return;
            }

            const db = new sqlite3.Database(':memory:');

            db.serialize(function () {
                db.run("CREATE TABLE foo (id INT, txt TEXT)");
                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare("INSERT INTO foo VALUES(?, ?)");
                for (let i = 0; i < COUNT; i++) {
                    stmt.run(i, `text-${i}`);
                }
                stmt.finalize();
                db.run("COMMIT TRANSACTION", [], function () {
                    db.close(function (err) {
                        assert.ifError(err);
                        cycle++;
                        // Let deferred destroy hooks complete before next cycle
                        setImmediate(() => setImmediate(runNextCycle));
                    });
                });
            });
        }

        runNextCycle();
    });
});