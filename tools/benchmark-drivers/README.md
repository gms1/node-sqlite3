# SQLite3 Benchmark

A comprehensive benchmark suite comparing the performance and event loop utilization of different SQLite drivers for Node.js.

Thanks to [better-sqlite3/benchmark](https://github.com/WiseLibs/better-sqlite3/tree/master/benchmark) for the initial work!

This benchmark is using small tables with few columns and little data, therefore low I/O, so it's not reasonable to expect an asynchronous driver to perform in anyway better here.
But it is strange, though, that a brief review also highlighted some other “tricks” designed to make the async driver look worse.

- In general, prepared statements were not used for the async driver, but for all others.
  The performance improvements are significant, e.g 2.4 x for 'select-iterate', 1.5 x for 'insert'
- The async driver had to open an additional database connection for each isolated transaction, even though this is a limitation of SQLite that affects all drivers equally.
  The performance improvements are significant, e.g 'transaction small' is now about 26x faster

## Why Async Drivers are expected to be slower

1. **Event Loop Integration**: Async drivers must integrate with Node.js's event loop, requiring context switches and queue management.

2. **Thread Pool Usage**: Async SQLite operations are using libuv's thread pool, introducing thread scheduling overhead.

Despite lower raw throughput, async drivers provide **Non-Blocking I/O**, by preventing the event loop from being blocked and provide **Concurrency**, by allowing other operations (network requests, file I/O, timers) to proceed while waiting for database operations to complete.

## Supported Drivers

| Driver | Type | Description |
|--------|------|-------------|
| `better-sqlite3` | Synchronous | High-performance synchronous SQLite bindings |
| `@homeofthings/sqlite3` | Asynchronous | Promise-based SQLite bindings (fork of node-sqlite3) |
| `node:sqlite` | Synchronous | Built-in Node.js SQLite (Node.js v22.6.0+) |

## Requirements

- **Node.js**: v20.17.0 or later (for N-API compatibility)
- **For `node:sqlite`**: Node.js v22.6.0+ (experimental) or v22.12.0+ (stable)

## Installation

```bash
npm install
```

## Usage

### Run Default Benchmarks

```bash
node index.js
```

This runs a general-purpose benchmark suite

### Run Specific Benchmarks

```bash
node index.js <search-terms...>
```

Examples:
```bash
# Run only select benchmarks
node index.js select

# Run benchmarks for specific tables
node index.js small

# Run benchmarks for specific columns
node index.js integer text

# Combine search terms
node index.js select small integer
```

### Using Local Development Version

To benchmark the local development version of `@homeofthings/sqlite3` instead of the npm package:

```bash
node index.js --use-local
```

This is useful for testing performance changes before publishing. Requires the native addon to be built:

```bash
# From project root
npm run build
```

The `--use-local` flag can be combined with search terms:

```bash
node index.js --use-local insert small
```

## Benchmark Types

| Type | Description |
|------|-------------|
| `select` | Reading single rows by primary key |
| `select-all` | Reading 100 rows into an array |
| `select-iterate` | Iterating over 100 rows |
| `insert` | Inserting single rows |
| `update` | Updating single rows |
| `transaction` | Inserting 100 rows in a single transaction |
| `update-transaction` | Updating 100 rows in a single transaction |

## Output Format

Results are displayed as:
```
driver-name        x 471,255 ops/sec ±0.07% (event loop: 50%, 2.1μs/op)
```

- `x` - Separator (from original benchmark format)
- `ops/sec` - Operations per second (higher is better)
- `±X.XX%` - Relative margin of error
- `event loop: X%, Yμs/op` - Utilization percentage and blocking time per operation (lower is better)

### Example Output

Running `node index.js select` produces output like:

```
select small (nul)
better-sqlite3        x 638,075 ops/sec ±0.44% (event loop: 100%, 1.6μs/op)
@homeofthings/sqlite3 x 88,459 ops/sec ±0.82% (event loop: 47%, 5.3μs/op)
node:sqlite           x 543,445 ops/sec ±0.53% (event loop: 100%, 1.8μs/op)
```

### Event Loop Metrics

The **event loop** metrics show how the driver affects the event loop (measured using Node.js native `performance.eventLoopUtilization()` API):

**Utilization Percentage:** How much of the benchmark time the event loop was busy (100% = completely blocked, 0% = completely free)

**Time per Operation:** `(1,000,000 μs/sec ÷ ops/sec) × utilization = μs blocked per operation`

| Driver                  | Utilization | Time per Op | Meaning                                         |
|-------------------------|-------------|-------------|-------------------------------------------------|
| `better-sqlite3`        | 100%        | ~1.6μs/op   | Blocks completely - all time is event loop time |
| `@homeofthings/sqlite3` | ~47%        | ~5.3μs/op   | 3.3x more blocking than sync drivers            |
| `node:sqlite`           | 100%        | ~1.8μs/op   | Blocks completely - all time is event loop time |

Such metric shows the real cost: dependend on the operation, async drivers may even block the event loop **longer in total** for the same amount of work, even though they don't block it **completely** for the whole operation, like the sync drivers do. However, async drivers also do not always block the event loop **longer in total**:

```
--- inserting rows individually ---
better-sqlite3        x 139,898 ops/sec ±21.94% (event loop: 100%, 7.1μs/op)
@homeofthings/sqlite3 x 47,619 ops/sec ±18.89% (event loop: 22%, 4.6μs/op)
node:sqlite           x 128,465 ops/sec ±22.25% (event loop: 100%, 7.8μs/op)
```

### Large Data Performance

For I/O-bound operations (large data reads), async drivers can actually **outperform** sync drivers:

```
--- reading large blobs (16MB each) ---
better-sqlite3        x 83 ops/sec ±7.99% (event loop: 100%, 12.07ms/op)
@homeofthings/sqlite3 x 94 ops/sec ±8.57% (event loop: 34%, 3.63ms/op)
node:sqlite           x 127 ops/sec ±10.75% (event loop: 100%, 7.88ms/op)
```

**Why async wins for large data:**

1. **Lower event loop blocking**: 3.63ms vs 12.07ms - async driver blocks 70% less
2. **Higher throughput**: 94 vs 83 ops/sec - async driver is 13% faster
3. **Event loop availability**: 66% free during async operations

For I/O-bound operations, the async driver's overhead becomes negligible compared to disk I/O wait time. The ability to interleave other work becomes an advantage - the event loop can process other tasks while waiting for data.

## Project Structure

```
├── index.js           # Main orchestrator
├── benchmark.js       # Benchmark runner (tinybench)
├── drivers.js         # SQLite driver configurations
├── trials.js          # Benchmark trial definitions
├── seed.js            # Database seeding
├── types/
│   ├── insert.js      # Insert benchmark
│   ├── select.js      # Single row select benchmark
│   ├── select-all.js  # Multi-row select benchmark
│   ├── select-iterate.js # Iteration benchmark
│   └── transaction.js  # Transaction benchmark
└── temp/              # Temporary database files (auto-created)
```

## Architecture

Each benchmark runs in an isolated child process to ensure:
- Clean state for each measurement
- Memory isolation between runs
- No interference between drivers

## Adding a New Driver

1. Add the driver to `package.json` dependencies
2. Add a connection function to `drivers.js`:
```javascript
['driver-name', async (filename, pragma) => {
    const db = require('driver-package')(filename);
    // Apply PRAGMA settings
    for (const str of pragma) await db.exec(`PRAGMA ${str}`);
    return db;
}]
```
3. Add benchmark implementations in each `types/*.js` file:
```javascript
// Either return sync or async function

exports['driver-name'] = (db, ctx) => {
    return () => db.someOperation();
};

exports['driver-name'] = async (db, ctx) => {
    return () => db.someOperation();
};
```
