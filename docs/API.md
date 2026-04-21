# API Documentation

This document describes the API for `@homeofthings/sqlite3`, a Node.js binding for SQLite3.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Module Systems (CJS & ESM)](#module-systems-cjs--esm)
- [Callback API](#callback-api)
  - [Database Class](#database-class-callback)
  - [Statement Class](#statement-class-callback)
  - [Backup Class](#backup-class-callback)
- [Promise API](#promise-api)
  - [SqliteDatabase Class](#sqlitedatabase-class-promise)
  - [SqliteStatement Class](#sqlitestatement-class-promise)
  - [SqliteBackup Class](#sqlitebackup-class-promise)
- [Constants](#constants)
- [Events](#events)

## Installation

```bash
npm install @homeofthings/sqlite3
# or
yarn add @homeofthings/sqlite3
```

## Quick Start

### Callback-based API (Traditional)

```javascript
const sqlite3 = require('@homeofthings/sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run("CREATE TABLE users (id INT, name TEXT)");
    db.run("INSERT INTO users VALUES (1, 'Alice')");
    
    db.each("SELECT * FROM users", (err, row) => {
        console.log(row.id, row.name);
    });
});

db.close();
```

### Promise-based API (Modern)

```javascript
const { SqliteDatabase } = require('@homeofthings/sqlite3');

async function main() {
    const db = await SqliteDatabase.open(':memory:');
    
    await db.run("CREATE TABLE users (id INT, name TEXT)");
    await db.run("INSERT INTO users VALUES (1, 'Alice')");
    
    const rows = await db.all("SELECT * FROM users");
    console.log(rows);
    
    await db.close();
}

main().catch(console.error);
```

---

## Module Systems (CJS & ESM)

This package supports both CommonJS (CJS) and ECMAScript Modules (ESM) via conditional exports in `package.json`.

### CJS (CommonJS) — Traditional

```javascript
// Default import
const sqlite3 = require('@homeofthings/sqlite3');

// Destructured import
const { Database, SqliteDatabase, OPEN_CREATE } = require('@homeofthings/sqlite3');

// Promise subpath import
const { SqliteDatabase } = require('@homeofthings/sqlite3/promise');
```

### ESM (ECMAScript Modules) — Modern

```javascript
// Default import
import sqlite3 from '@homeofthings/sqlite3';

// Named imports
import { Database, OPEN_CREATE, SqliteDatabase } from '@homeofthings/sqlite3';

// Promise subpath import
import { SqliteDatabase } from '@homeofthings/sqlite3/promise';
```

> **Note:** The ESM wrappers use native CJS→ESM interop (`import` from `.js` files), so ESM imports work seamlessly alongside CJS requires. Both module systems share the same underlying native addon instance.

---

## Callback API

The traditional callback-based API is compatible with the original `node-sqlite3` API.

### Database Class (Callback)

#### Constructor

```javascript
const sqlite3 = require('@homeofthings/sqlite3');
const db = new sqlite3.Database(filename, [mode], [callback]);
```

**Parameters:**
- `filename` (string): Path to the database file, or `':memory:'` for an in-memory database
- `mode` (number, optional): Opening mode flags. Default is `OPEN_READWRITE | OPEN_CREATE`
- `callback` (function, optional): Called when the database is opened

**Example:**
```javascript
const db = new sqlite3.Database('mydb.sqlite', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to database');
});
```

#### Database.open

Opens a database connection. This is typically done via the constructor.

```javascript
db.open(filename, [mode], [callback]);
```

#### Database.close

Closes the database connection.

```javascript
db.close([callback]);
```

**Example:**
```javascript
db.close((err) => {
    if (err) console.error(err.message);
    else console.log('Database closed');
});
```

#### Database.run

Executes a SQL statement and returns the result.

```javascript
db.run(sql, [params...], [callback]);
```

**Parameters:**
- `sql` (string): SQL query to execute
- `params` (any, optional): Parameters to bind to the query
- `callback` (function, optional): Called with `this.lastID` and `this.changes`

**Example:**
```javascript
db.run("INSERT INTO users VALUES (?, ?)", [1, 'Alice'], function(err) {
    if (err) return console.error(err);
    console.log(`Inserted row with ID ${this.lastID}`);
    console.log(`Rows affected: ${this.changes}`);
});
```

#### Database.get

Executes a SQL query and returns the first row.

```javascript
db.get(sql, [params...], [callback]);
```

**Example:**
```javascript
db.get("SELECT * FROM users WHERE id = ?", [1], (err, row) => {
    if (err) return console.error(err);
    console.log(row);
});
```

#### Database.all

Executes a SQL query and returns all rows.

```javascript
db.all(sql, [params...], [callback]);
```

**Example:**
```javascript
db.all("SELECT * FROM users", (err, rows) => {
    if (err) return console.error(err);
    rows.forEach(row => console.log(row));
});
```

#### Database.each

Executes a SQL query and calls a callback for each row.

```javascript
db.each(sql, [params...], callback, [complete]);
```

**Parameters:**
- `sql` (string): SQL query to execute
- `params` (any, optional): Parameters to bind to the query
- `callback` (function): Called for each row with `(err, row)`
- `complete` (function, optional): Called when all rows have been processed with `(err, count)`

**Example:**
```javascript
db.each("SELECT * FROM users", (err, row) => {
    if (err) console.error(err);
    else console.log(row);
}, (err, count) => {
    console.log(`Processed ${count} rows`);
});
```

#### Database.exec

Executes multiple SQL statements separated by semicolons.

```javascript
db.exec(sql, [callback]);
```

**Example:**
```javascript
db.exec(`
    CREATE TABLE users (id INT, name TEXT);
    INSERT INTO users VALUES (1, 'Alice');
    INSERT INTO users VALUES (2, 'Bob');
`, (err) => {
    if (err) console.error(err);
});
```

#### Database.prepare

Prepares a SQL statement for repeated execution.

```javascript
const stmt = db.prepare(sql, [params...], [callback]);
```

**Example:**
```javascript
const stmt = db.prepare("INSERT INTO users VALUES (?, ?)");
stmt.run(1, 'Alice');
stmt.run(2, 'Bob');
stmt.finalize();
```

#### Database.serialize

Runs operations in serialized mode (one at a time).

```javascript
db.serialize([callback]);
```

**Example:**
```javascript
db.serialize(() => {
    db.run("CREATE TABLE users (id INT, name TEXT)");
    db.run("INSERT INTO users VALUES (1, 'Alice')");
});
```

#### Database.parallelize

Runs operations in parallel mode.

```javascript
db.parallelize([callback]);
```

#### Database.backup

Creates a backup of the database.

```javascript
const backup = db.backup(filename, [callback]);
// or with full control:
const backup = db.backup(filename, destName, sourceName, filenameIsDest, [callback]);
```

**Parameters:**
- `filename` (string): Path to the backup file
- `destName` (string): Name of the destination database (default: 'main')
- `sourceName` (string): Name of the source database (default: 'main')
- `filenameIsDest` (boolean): Whether filename is the destination (default: true)
- `callback` (function, optional): Called when backup is initialized

#### Database.loadExtension

Loads a SQLite extension.

```javascript
db.loadExtension(filename, [callback]);
```

#### Database.interrupt

Interrupts a running query.

```javascript
db.interrupt();
```

#### Database.wait

Waits for the database to be ready.

```javascript
db.wait(callback);
```

#### Database.configure

Configures database options.

```javascript
db.configure(option, [value]);
```

### Statement Class (Callback)

A prepared statement object returned by `db.prepare()`.

#### Statement.bind

Binds parameters to the prepared statement.

```javascript
stmt.bind([params...], [callback]);
```

**Example:**
```javascript
const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
stmt.bind(1, (err) => {
    if (err) console.error(err);
});
```

#### Statement.reset

Resets the prepared statement cursor, preserving bound parameters.

```javascript
stmt.reset([callback]);
```

#### Statement.run

Executes the prepared statement.

```javascript
stmt.run([params...], [callback]);
```

**Example:**
```javascript
const stmt = db.prepare("INSERT INTO users VALUES (?, ?)");
stmt.run(1, 'Alice', function(err) {
    console.log(`Inserted ID: ${this.lastID}`);
});
```

#### Statement.get

Executes the prepared statement and returns the first row.

```javascript
stmt.get([params...], [callback]);
```

#### Statement.all

Executes the prepared statement and returns all rows.

```javascript
stmt.all([params...], [callback]);
```

#### Statement.each

Executes the prepared statement and calls a callback for each row.

```javascript
stmt.each([params...], callback, [complete]);
```

#### Statement.finalize

Finalizes the prepared statement, freeing resources.

> **Important:** You MUST finalize all prepared statements before closing the database.
> If you attempt to close a database with unfinalized statements, you will get:
> `SQLITE_BUSY: unable to close due to unfinalised statements`

```javascript
stmt.finalize([callback]);
```

### Backup Class (Callback)

A backup object returned by `db.backup()`.

#### Backup.step

Copies the next page or all remaining pages.

```javascript
backup.step([pages], [callback]);
```

**Parameters:**
- `pages` (number, optional): Number of pages to copy. Default: -1 (all remaining)

#### Backup.finish

Finishes the backup operation.

```javascript
backup.finish([callback]);
```

**Properties:**
- `idle` (boolean): True if backup is idle
- `completed` (boolean): True if backup is completed
- `failed` (boolean): True if backup has failed
- `remaining` (number): Remaining pages to copy
- `pageCount` (number): Total number of pages

---

## Promise API

The Promise-based API provides a modern interface using async/await syntax.

### SqliteDatabase Class (Promise)

A Promise-based wrapper around the Database class.

#### SqliteDatabase.open (Static Factory Method)

Creates and opens a new database connection.

```javascript
const db = await SqliteDatabase.open(filename, [mode]);
```

**Parameters:**
- `filename` (string): Path to the database file, or `':memory:'` for in-memory
- `mode` (number, optional): Opening mode flags

**Returns:** `Promise<SqliteDatabase>`

**Example:**
```javascript
const { SqliteDatabase } = require('@homeofthings/sqlite3');

const db = await SqliteDatabase.open(':memory:');
// or with mode
const db = await SqliteDatabase.open('mydb.sqlite', sqlite3.OPEN_READONLY);
```

#### SqliteDatabase Constructor + open

Alternative way to create a database instance.

```javascript
const db = new SqliteDatabase();
await db.open(filename, [mode]);
```

#### SqliteDatabase.close

Closes the database connection.

```javascript
await db.close();
```

**Returns:** `Promise<void>`

#### SqliteDatabase.isOpen

Tests if the connection is open.

```javascript
const open = db.isOpen(); // boolean
```

#### SqliteDatabase.run

Executes a SQL statement.

```javascript
const result = await db.run(sql, [params]);
```

**Parameters:**
- `sql` (string): SQL statement
- `params` (any, optional): Parameters to bind

**Returns:** `Promise<{ lastID: number, changes: number }>`

**Example:**
```javascript
const result = await db.run("INSERT INTO users VALUES (?, ?)", [1, 'Alice']);
console.log(`Inserted ID: ${result.lastID}, Changes: ${result.changes}`);
```

#### SqliteDatabase.get

Executes a query and returns the first row.

```javascript
const row = await db.get(sql, [params]);
```

**Returns:** `Promise<T | undefined>`

**Example:**
```javascript
const user = await db.get("SELECT * FROM users WHERE id = ?", [1]);
if (user) {
    console.log(user.name);
}
```

#### SqliteDatabase.all

Executes a query and returns all rows.

```javascript
const rows = await db.all(sql, [params]);
```

**Returns:** `Promise<T[]>`

**Example:**
```javascript
const users = await db.all("SELECT * FROM users");
users.forEach(user => console.log(user.name));
```

#### SqliteDatabase.each

Executes a query and calls a callback for each row.

```javascript
const count = await db.each(sql, [params], callback);
```

**Parameters:**
- `sql` (string): SQL query
- `params` (any, optional): Parameters to bind
- `callback` (function): Called for each row with `(err, row)`

**Returns:** `Promise<number>` - Number of rows processed

**Example:**
```javascript
const count = await db.each("SELECT * FROM users", (err, row) => {
    console.log(row.name);
});
console.log(`Processed ${count} rows`);
```

#### SqliteDatabase.exec

Executes multiple SQL statements.

```javascript
await db.exec(sql);
```

**Returns:** `Promise<void>`

#### SqliteDatabase.prepare

Prepares a SQL statement.

```javascript
const stmt = await db.prepare(sql, [params]);
```

**Returns:** `Promise<SqliteStatement>`

**Example:**
```javascript
const stmt = await db.prepare("INSERT INTO users VALUES (?, ?)");
await stmt.run([1, 'Alice']);
await stmt.run([2, 'Bob']);
await stmt.finalize();
```

#### SqliteDatabase.serialize

Runs operations in serialized mode.

```javascript
db.serialize([callback]);
```

#### SqliteDatabase.parallelize

Runs operations in parallel mode.

```javascript
db.parallelize([callback]);
```

#### SqliteDatabase.transactionalize

Runs a callback inside a transaction.

```javascript
const result = await db.transactionalize(async () => {
    await db.run("INSERT INTO users VALUES (?, ?)", [1, 'Alice']);
    await db.run("INSERT INTO logs VALUES (?, ?)", [1, 'created']);
    return 'done';
});
```

**Returns:** `Promise<T>` - The result of the callback

#### Transaction Methods

```javascript
await db.beginTransaction();    // BEGIN IMMEDIATE TRANSACTION
await db.commitTransaction();   // COMMIT TRANSACTION
await db.rollbackTransaction(); // ROLLBACK TRANSACTION
await db.endTransaction(commit); // COMMIT or ROLLBACK (ignores "no transaction" errors)
```

> **Important: Transaction Isolation Limitations**
>
> SQLite provides isolation between **different database connections**, but **NOT** between operations on the **same connection**.
>
> **Key behaviors:**
> - `beginTransaction()` uses `BEGIN IMMEDIATE TRANSACTION` which acquires a write lock immediately
> - If another connection tries to start a transaction while one is active, it will fail with `SQLITE_BUSY: database is locked`
> - This is expected SQLite behavior and prevents deadlocks
>
> **For concurrent transactions with isolation:**
> ```javascript
> // Option 1: Sequential on same connection (recommended)
> await db.transactionalize(async () => { /* ... */ });
> await db.transactionalize(async () => { /* ... */ });
>
> // Option 2: Separate connections with retry logic
> const db1 = await SqliteDatabase.open('my.db');
> const db2 = await SqliteDatabase.open('my.db');
>
> // Transactions on db1 and db2 are isolated from each other
> // But concurrent write transactions will fail with SQLITE_BUSY
> // You must handle this error in your application:
> try {
>     await db2.beginTransaction();
> } catch (err) {
>     if (err.message.includes('SQLITE_BUSY') || err.message.includes('database is locked')) {
>         // Wait and retry, or queue the operation
>         await new Promise(resolve => setTimeout(resolve, 100));
>         // retry...
>     }
> }
> ```
>
> See [SQLite Isolation Documentation](https://www.sqlite.org/isolation.html) for more details.

#### SqliteDatabase.backup

Creates a backup of the database.

```javascript
const backup = await db.backup(filename, [filenameIsDest], [destName], [sourceName]);
```

**Returns:** `Promise<SqliteBackup>`

#### SqliteDatabase.loadExtension

Loads a SQLite extension.

```javascript
await db.loadExtension(filename);
```

#### SqliteDatabase.wait

Waits for the database to be ready.

```javascript
await db.wait();
```

#### SqliteDatabase.interrupt

Interrupts a running query.

```javascript
db.interrupt();
```

#### SqliteDatabase.configure

Configures database options.

```javascript
db.configure(option, [value]);
```

#### Event Methods

```javascript
db.on(event, listener);        // Register event listener
db.off(event, listener);       // Remove event listener
db.removeAllListeners([event]); // Remove all listeners
```

### SqliteStatement Class (Promise)

A Promise-based wrapper around the Statement class.

#### SqliteStatement.bind

Binds parameters to the prepared statement.

```javascript
stmt.bind(param1, param2, ...); // Returns this for chaining
```

#### SqliteStatement.reset

Resets the statement cursor.

```javascript
await stmt.reset();
```

#### SqliteStatement.run

Executes the prepared statement.

```javascript
const result = await stmt.run([params]);
```

**Returns:** `Promise<{ lastID: number, changes: number }>`

#### SqliteStatement.get

Executes the statement and returns the first row.

```javascript
const row = await stmt.get([params]);
```

**Returns:** `Promise<T | undefined>`

#### SqliteStatement.all

Executes the statement and returns all rows.

```javascript
const rows = await stmt.all([params]);
```

**Returns:** `Promise<T[]>`

#### SqliteStatement.each

Executes the statement and calls a callback for each row.

```javascript
const count = await stmt.each([params], callback);
```

**Returns:** `Promise<number>`

#### SqliteStatement.finalize

Finalizes the statement.

> **Important:** You MUST finalize all prepared statements before closing the database.
> If you attempt to close a database with unfinalized statements, you will get:
> `SQLITE_BUSY: unable to close due to unfinalised statements`

```javascript
await stmt.finalize();
```

### SqliteBackup Class (Promise)

A Promise-based wrapper around the Backup class.

#### Properties

- `idle` (boolean): True if backup is idle
- `completed` (boolean): True if backup is completed
- `failed` (boolean): True if backup has failed
- `remaining` (number): Remaining pages to copy
- `pageCount` (number): Total number of pages
- `progress` (number): Progress as percentage (0-100)

#### SqliteBackup.step

Copies pages during backup.

```javascript
await backup.step([pages]);
```

**Parameters:**
- `pages` (number, optional): Number of pages to copy. Default: -1 (all remaining)

**Returns:** `Promise<void>`

#### SqliteBackup.finish

Finishes the backup.

```javascript
backup.finish(); // Synchronous
```

---

## Constants

The following constants are available on the exported module:

```javascript
const sqlite3 = require('@homeofthings/sqlite3');

// Open flags
sqlite3.OPEN_READONLY;   // 0x00000001
sqlite3.OPEN_READWRITE;  // 0x00000002
sqlite3.OPEN_CREATE;     // 0x00000004

// Error codes
sqlite3.OK;              // 0
sqlite3.ERROR;           // 1
sqlite3.INTERNAL;        // 2
sqlite3.PERM;            // 3
sqlite3.ABORT;           // 4
sqlite3.BUSY;            // 5
sqlite3.LOCKED;          // 6
sqlite3.NOMEM;           // 7
sqlite3.READONLY;        // 8
sqlite3.INTERRUPT;       // 9
sqlite3.IOERR;           // 10
sqlite3.CORRUPT;         // 11
sqlite3.NOTFOUND;        // 12
sqlite3.FULL;            // 13
sqlite3.CANTOPEN;        // 14
sqlite3.PROTOCOL;        // 15
sqlite3.EMPTY;           // 16
sqlite3.SCHEMA;          // 17
sqlite3.TOOBIG;          // 18
sqlite3.CONSTRAINT;      // 19
sqlite3.MISMATCH;        // 20
sqlite3.MISUSE;          // 21
sqlite3.RANGE;           // 25
sqlite3.FORMAT;          // 26
```

---

## Events

The Database class extends EventEmitter and emits the following events:

### 'open'

Emitted when the database is opened successfully.

```javascript
db.on('open', () => {
    console.log('Database opened');
});
```

### 'close'

Emitted when the database is closed.

```javascript
db.on('close', () => {
    console.log('Database closed');
});
```

### 'error'

Emitted when an error occurs.

```javascript
db.on('error', (err) => {
    console.error('Database error:', err);
});
```

### 'trace'

Emitted for each SQL statement executed (when tracing is enabled).

```javascript
db.on('trace', (sql) => {
    console.log('Executing:', sql);
});
```

### 'profile'

Emitted with timing information for each SQL statement (when profiling is enabled).

```javascript
db.on('profile', (sql, time) => {
    console.log(`Executed: ${sql} in ${time}ms`);
});
```

### 'change'

Emitted when data is modified (INSERT, UPDATE, DELETE).

```javascript
db.on('change', (type, database, table, rowid) => {
    console.log(`Change type: ${type}, Table: ${table}, RowID: ${rowid}`);
});
```

---

## Cached Database

For convenience, a cached version is available that reuses existing connections:

```javascript
const sqlite3 = require('@homeofthings/sqlite3');
const db = sqlite3.cached.Database('mydb.sqlite');
```

This returns the same Database instance for the same filename, useful for connection pooling.

---

## Verbose Mode

Enable verbose mode for better error messages with stack traces:

```javascript
const sqlite3 = require('@homeofthings/sqlite3').verbose();
```

---

## TypeScript Support

TypeScript definitions are included in the package. Both CJS and ESM import styles are supported:

```typescript
// CJS style
const sqlite3 = require('@homeofthings/sqlite3');
const { Database, SqliteDatabase } = require('@homeofthings/sqlite3');

// ESM style
import sqlite3 from '@homeofthings/sqlite3';
import { Database, Statement, Backup } from '@homeofthings/sqlite3';
import { SqliteDatabase, SqliteStatement, SqliteBackup } from '@homeofthings/sqlite3';

// Promise subpath
import { SqliteDatabase } from '@homeofthings/sqlite3/promise';
```

---

## More Information

- [SQLite Documentation](https://www.sqlite.org/docs.html)
