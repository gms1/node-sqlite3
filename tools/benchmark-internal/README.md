# Benchmark Tools

This directory contains benchmark scripts to measure and compare the performance of different SQLite operations in `@homeofthings/sqlite3` using [tinybench](https://github.com/tinylibs/tinybench).

## Key Features

- **Proper setup/teardown separation**: Database creation, table creation, and data population happen in `beforeEach` (not measured)
- **Only actual operations measured**: The benchmark functions contain only the INSERT/SELECT operations
- **Warmup support**: tinybench includes warmup iterations to allow V8 optimization
- **Statistical accuracy**: Multiple iterations with mean, variance, and margin of error

## Running Benchmarks

### Quick Start

Install dependencies (from project root):

```bash
yarn install
```

Run all benchmarks:

```bash
node tools/benchmark-internal/run.js
```

Or from the benchmark directory:

```bash
cd tools/benchmark-internal
node run.js
```

## Benchmark Scripts

### run.js (Recommended)

The main runner script executes all benchmarks and provides detailed timing statistics including:
- ops/sec (operations per second)
- Mean and margin of error
- Sample variance

### insert.js

Measures performance of different data insertion approaches.

**Benchmark tests:**
- `insert: literal file`: Executes SQL from a file using `db.exec()`
- `insert: transaction with two statements`: Uses parallelized statements within a transaction
- `insert: with transaction`: Uses a single statement within a transaction
- `insert: without transaction`: Uses a single statement without explicit transaction

**Usage:**
```bash
node tools/benchmark-internal/run.js
```

**Expected output:**
```
Task Name                                            ops/sec   Average Time (ns)      Margin   Samples
------------------------------------------------------------------------------------------------------
insert: literal file                                  101.79          9867669.32       1.36%       102
insert: transaction with two statements                15.72         64101675.83       1.81%       100
insert: with transaction                                9.53        105168845.93       0.98%       100
insert: without transaction                             8.76        114706903.08       1.33%       100
```

**Key findings:**
- `literal file` is fastest because it uses a single `db.exec()` call with all SQL in one batch
- `transaction with two statements` uses parallelized statements within a transaction for better throughput
- `with transaction` wraps all inserts in a single transaction
- `without transaction` is slowest because each INSERT is committed individually

### select.js

Measures performance of different data retrieval approaches.

**Benchmark tests:**
- `select: db.each()`: Iterates through results row-by-row using a callback
- `select: db.all()`: Retrieves all results into an array at once
- `select: db.all with statement reset()`: Retrieves all results after resetting the statement

**Usage:**
```bash
node tools/benchmark-internal/run.js
```

**Expected output:**
```
Task Name                                            ops/sec   Average Time (ns)      Margin   Samples
------------------------------------------------------------------------------------------------------
select: db.each                                         0.82       1232450196.30       5.37%        10
select: db.all                                          0.86       1166833768.40       2.27%        10
select: db.all with statement reset                     0.42       2357234044.80       0.77%        10
```

**Key findings:**
- `db.all()` and `db.each()` have similar performance for large result sets (1 million rows)
- `db.each()` is more memory-efficient for large result sets as it processes rows one at a time
- `db.all with statement reset` is slower because it executes the query twice

## Benchmark Data Files

### insert-transaction.sql

Contains 10,000 INSERT statements wrapped in a transaction for the "insert literal file" benchmark.

### select-data.sql

Contains 10,000 INSERT statements to populate the test database for the select benchmarks.

## Architecture

### Setup/Teardown Pattern

Each benchmark follows this pattern to ensure only the actual operation is measured:

```javascript
{
  async beforeEach(ctx) {
    // Setup: Create database, create table, populate data
    // NOT measured
    ctx.db = new sqlite3.Database(':memory:');
    await promisifyRun(ctx.db, 'CREATE TABLE foo ...');
  },

  async fn(ctx) {
    // Benchmark: Only the operation to measure
    // MEASURED
    await insertData(ctx.db);
  },

  async afterEach(ctx) {
    // Teardown: Close database
    // NOT measured
    await promisifyClose(ctx.db);
  },
}
```

### Context Object

A context object (`ctx`) is passed between setup, benchmark, and teardown:
- `ctx.db`: Database instance
- Custom properties can be added as needed

## Adding New Benchmarks

1. Create a new JavaScript file in this directory (e.g., `update.js`)
2. Export a `benchmarks` object with your benchmark functions:

```javascript
module.exports = {
  benchmarks: {
    'benchmark name': {
      async beforeEach(ctx) {
        // Setup - NOT measured
        ctx.db = new sqlite3.Database(':memory:');
        // ... create tables, populate data
      },

      async fn(ctx) {
        // Benchmark - MEASURED
        // ... your operation here
      },

      async afterEach(ctx) {
        // Teardown - NOT measured
        await promisifyClose(ctx.db);
      },
    },
  },
};
```

3. Import and add your benchmarks in `run.js`
4. Add documentation for your benchmark in this README

## Notes

- Benchmarks run in-memory (`:memory:`) by default for faster execution
- Results may vary based on your hardware and system configuration
- tinybench automatically determines the number of runs needed for statistical accuracy
- Warmup iterations allow V8 to optimize the code before measurement
- For meaningful comparisons, run benchmarks multiple times and compare the results

## Dependencies

- `tinybench`: ^6.0.0 - Modern benchmark library with proper setup/teardown support
