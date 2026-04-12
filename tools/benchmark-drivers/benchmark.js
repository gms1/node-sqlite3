#!/usr/bin/env node
'use strict';
const { Bench } = require('tinybench');
const { performance } = require('perf_hooks');

const formatResult = (task, eventLoopUtilization) => {
    // Format: 471,255 ops/sec ±0.07% (event loop: 50%, 2.1μs/op)
    const hz = task.result?.hz || 0;
    const rme = task.result?.rme || 0;
    const ops = Math.round(hz).toLocaleString('en-US');
    // Calculate event loop time per operation in microseconds
    // Formula: (1,000,000 μs/sec / ops/sec) × utilization = μs blocked per operation
    const timePerOpUs = hz > 0 ? (1000000 / hz) * eventLoopUtilization : 0;
    // Format: use μs for values < 1000, otherwise ms
    let eluTimeStr;
    if (timePerOpUs < 1000) {
        eluTimeStr = `${timePerOpUs.toFixed(1)}μs/op`;
    } else {
        eluTimeStr = `${(timePerOpUs / 1000).toFixed(2)}ms/op`;
    }
    // Format utilization percentage
    const eluPct = (eventLoopUtilization * 100).toFixed(0);
    return `${ops} ops/sec ±${rme.toFixed(2)}% (event loop: ${eluPct}%, ${eluTimeStr})`;
};

const runWithEventLoopMeasurement = async (fn, isAsync) => {
    const bench = new Bench({ time: 1000, warmupTime: 0 });

    // Warmup run
    const warmupBench = new Bench({ time: 100, warmupTime: 0 });
    warmupBench.add('warmup', isAsync ? async () => { await fn(); } : fn);
    await warmupBench.run();

    // Actual benchmark with event loop measurement using native API
    const eluStart = performance.eventLoopUtilization();

    bench.add('test', isAsync ? async () => { await fn(); } : fn);
    await bench.run();

    const eluEnd = performance.eventLoopUtilization();
    const eventLoopUtilization = performance.eventLoopUtilization(eluStart, eluEnd).utilization;

    return formatResult(bench.tasks[0], eventLoopUtilization);
};

const runSync = async (fn) => {
    return runWithEventLoopMeasurement(fn, false);
};

const runAsync = async (fn) => {
    return runWithEventLoopMeasurement(fn, true);
};

const display = (result) => {
    process.stdout.write(result);
    process.exit();
};

(async () => {
    process.on('unhandledRejection', (err) => { throw err; });
    const ctx = JSON.parse(process.argv[2]);
    const type = require(`./types/${ctx.type}`);
    const drivers = require('./drivers')(ctx.useLocal);
    const db = await drivers.get(ctx.driver)('../temp/benchmark.db', ctx.pragma);
    if (!type.readonly) {
        for (const table of ctx.tables) await db.exec(`DELETE FROM ${table} WHERE rowid > 1;`);
        await db.exec('VACUUM;');
    }
    const fn = type[ctx.driver](db, ctx);
    if (typeof fn === 'function') {
        setImmediate(async () => { display(await runSync(fn)); });
    } else {
        setImmediate(async () => { display(await runAsync(await fn)); });
    }
})();
