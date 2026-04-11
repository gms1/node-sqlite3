const { Bench } = require('tinybench');
const path = require('path');

// Set working directory to benchmark folder for relative path resolution
process.chdir(__dirname);

// Load benchmarks
const insertBenchmarks = require('./insert');
const selectBenchmarks = require('./select');

async function runBenchmarks() {
    console.log('Running sqlite3 benchmarks...\n');

    const results = [];

    // Run insert benchmarks
    console.log('=== INSERT BENCHMARKS ===\n');
    for (const [name, benchmark] of Object.entries(insertBenchmarks.benchmarks)) {
        console.log(`Running: insert: ${name}`);
        const suite = new Bench({
            iterations: 100,
            warmupIterations: 5,
        });

        suite.add(`insert: ${name}`, benchmark.fn, {
            beforeEach: benchmark.beforeEach,
            afterEach: benchmark.afterEach,
        });

        await suite.run();
        const task = suite.tasks[0];
        if (task.result && task.result.latency) {
            results.push({
                name: `insert: ${name}`,
                throughput: task.result.throughput?.mean,
                latency: task.result.latency.mean,
                rme: task.result.latency.rme,
                samples: task.result.latency.samplesCount,
            });
        }
    }

    // Run select benchmarks (fewer iterations since they're slower)
    console.log('\n=== SELECT BENCHMARKS ===\n');
    for (const [name, benchmark] of Object.entries(selectBenchmarks.benchmarks)) {
        console.log(`Running: select: ${name}`);
        const suite = new Bench({
            iterations: 10,
            warmupIterations: 1,
        });

        suite.add(`select: ${name}`, benchmark.fn, {
            beforeAll: benchmark.beforeAll,
            afterAll: benchmark.afterAll,
        });

        await suite.run();
        const task = suite.tasks[0];
        if (task.result && task.result.latency) {
            results.push({
                name: `select: ${name}`,
                throughput: task.result.throughput?.mean,
                latency: task.result.latency.mean,
                rme: task.result.latency.rme,
                samples: task.result.latency.samplesCount,
            });
        }
    }

    // Output results with full precision
    console.log('\n=== RESULTS ===\n');

    // Header
    const header = [
        'Task Name'.padEnd(45),
        'ops/sec'.padStart(15),
        'Average Time (ns)'.padStart(20),
        'Margin'.padStart(12),
        'Samples'.padStart(10)
    ].join('');
    console.log(header);
    console.log('-'.repeat(102));

    // Results
    for (const result of results) {
        const opsSec = result.throughput?.toFixed(2) || 'N/A';
        const avgTime = (result.latency * 1e6).toFixed(2); // Convert ms to nanoseconds
        const margin = result.rme?.toFixed(2) || 'N/A';
        const samples = result.samples || 0;

        const row = [
            result.name.padEnd(45),
            opsSec.padStart(15),
            avgTime.padStart(20),
            (margin + '%').padStart(12),
            samples.toString().padStart(10)
        ].join('');
        console.log(row);
    }
}

runBenchmarks()
    .catch((err) => {
        console.error('Benchmark failed:', err);
        process.exit(1);
    });
