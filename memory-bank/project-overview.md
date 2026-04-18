# Project Overview

## Project: @homeofthings/sqlite3

**Description**: Asynchronous, non-blocking SQLite3 bindings for Node.js

**Repository**: https://github.com/gms1/node-sqlite3 (forked from TryGhost/node-sqlite3)

**Package Name**: `@homeofthings/sqlite3`

**Node.js Version**: >= 20.17.0

## Architecture

```
node-sqlite3/
├── lib/                    # JavaScript API layer
│   ├── sqlite3.js          # Main module entry point
│   ├── sqlite3-binding.js  # Native binding loader
│   ├── sqlite3.d.ts        # TypeScript declarations
│   ├── trace.js            # Stack trace augmentation for verbose mode
│   └── promise/            # Promise-based API wrappers
│       ├── index.js        # Promise module exports
│       ├── database.js     # SqliteDatabase class
│       ├── statement.js    # SqliteStatement class
│       └── backup.js       # SqliteBackup class
├── src/                    # C++ native addon
│   ├── node_sqlite3.cc     # Main addon entry
│   ├── database.cc/h       # Database class
│   ├── statement.cc/h      # Statement class
│   ├── backup.cc/h         # Backup class
│   ├── async.h             # Async work utilities
│   ├── macros.h            # Helper macros (ASSERT_STATUS, etc.)
│   └── threading.h         # Threading utilities
├── deps/                   # SQLite dependency
│   ├── sqlite3.gyp         # SQLite build config
│   ├── common-sqlite.gypi  # Common build config
│   └── sqlite-autoconf-*.tar.gz  # SQLite source
├── prebuilds/              # Bundled prebuilt binaries (not in git, included in npm package)
├── test/                   # Test suite (mocha)
├── tools/                  # Development tools
│   ├── bin/                # Utility scripts
│   │   └── bump-sqlite.sh  # SQLite version bump automation
│   ├── benchmark-drivers/  # Driver comparison benchmarks
│   └── benchmark-internal/ # Internal performance benchmarks
└── binding.gyp             # node-gyp build configuration
```

## Key Components

### JavaScript Layer (lib/)

- **sqlite3.js**: Main module that wraps the native addon with a friendlier API
  - `Database` class with methods: `prepare`, `run`, `get`, `all`, `each`, `map`, `exec`, `close`
  - `Statement` class with methods: `bind`, `get`, `run`, `all`, `each`, `map`, `reset`, `finalize`
  - `Backup` class for database backup operations
  - Cached database support via `sqlite3.cached.Database`
  - Event emitter integration for `trace`, `profile`, `change` events

- **sqlite3-binding.js**: Loads the native addon using `node-gyp-build`
  - Passes project root (`path.join(__dirname, "..")`) since `node-gyp-build` looks for `prebuilds/` and `build/` relative to the passed directory
  - Resolves prebuilt binary from `prebuilds/` directory, falling back to `build/` directory
  - Local builds in `build/` take precedence over prebuilts; `npx node-gyp rebuild` forces a local build

- **trace.js**: Stack trace augmentation for verbose mode
  - Extends error stack traces to include operation context

- **promise/**: Promise-based API wrappers (modern async/await support)
  - `SqliteDatabase` class: `open()`, `close()`, `run()`, `get()`, `all()`, `each()`, `exec()`, `prepare()`, `backup()`
  - `SqliteStatement` class: `bind()`, `reset()`, `finalize()`, `run()`, `get()`, `all()`, `each()`
  - `SqliteBackup` class: `step()`, `finish()`
  - Transaction support: `beginTransaction()`, `commitTransaction()`, `rollbackTransaction()`
  - Static factory: `SqliteDatabase.open(filename, mode)`

### Native Layer (src/)

- **node_sqlite3.cc**: Module initialization, exports `Database`, `Statement`, `Backup` classes
- **database.cc/h**: Database implementation with async operations
- **statement.cc/h**: Prepared statement implementation
- **backup.cc/h**: Database backup implementation
- **macros.h**: Contains `ASSERT_STATUS` macro (enabled in DEBUG mode)

### Build System

- **binding.gyp**: node-gyp configuration
  - Builds `node_sqlite3` target
  - Links against SQLite (internal or external)
  - Defines `NAPI_VERSION` based on the target Node.js version

- **deps/common-sqlite.gypi**: Common build configurations
  - `Debug` configuration: disables `NDEBUG`, enables debug symbols
  - `Release` configuration: enables `NDEBUG`, optimizations

## Dependencies

### Runtime
- `node-addon-api`: ^8.7.0 - C++ NAPI wrapper
- `node-gyp-build`: ^4.8.4 - Native addon binary loader (resolves prebuilt or falls back to source build)
- `tar`: ^7.5.13 - Tarball handling

### Development
- `mocha`: 11.7.5 - Test framework
- `eslint`: ^10.2.0 - Linting
- `prebuildify`: ^6.0.1 - Prebuilt binary builder
- `tinybench`: ^6.0.0 - Benchmarking

### Peer
- `node-gyp`: 12.x - Native addon build tool

## SQLite Configuration

The SQLite build includes these extensions:
- `SQLITE_THREADSAFE=1` - Thread-safe
- `SQLITE_ENABLE_FTS3/4/5` - Full-text search
- `SQLITE_ENABLE_RTREE` - R-Tree index
- `SQLITE_ENABLE_DBSTAT_VTAB=1` - Database stats virtual table
- `SQLITE_ENABLE_MATH_FUNCTIONS` - Math functions

## Debug Mode

### JavaScript Debug Mode

```javascript
const sqlite3 = require('@homeofthings/sqlite3').verbose();
```

Enables extended stack traces for better error messages.

### Native Debug Build

```bash
# Build with debug configuration
node-gyp rebuild --debug

# Output: build/Debug/node_sqlite3.node
```

This enables:
- `DEBUG` and `_DEBUG` preprocessor macros
- `ASSERT_STATUS()` macro checks (see src/macros.h:140)
- Debug symbols
- No optimizations

## Module Resolution

The `node-gyp-build` package resolves the native addon in this order:
1. `build/Release/node_sqlite3.node` — local release build
2. `build/Debug/node_sqlite3.node` — local debug build
3. `prebuilds/<platform>-<arch>/@homeofthings+sqlite3.<libc>.node` — bundled prebuilt binary

Local builds take precedence over prebuilt binaries. To force a source build (which creates `build/Release/` and takes precedence), use `npx node-gyp rebuild`.

## Common Commands

```bash
# Install dependencies
yarn install

# Build native addon (uses prebuilt binary or falls back to node-gyp)
yarn install

# Rebuild native addon
yarn rebuild

# Build with debug configuration
node-gyp rebuild --debug

# Run tests
yarn test

# Build prebuilt binaries
yarn prebuild

# Run driver comparison benchmarks
cd tools/benchmark-drivers && npm install && node index.js

# Run internal benchmarks
node tools/benchmark-internal/run.js
```

## Related Files

- [Build System](build-system.md) - Detailed build configuration
- [Development Workflow](development.md) - Testing and contributing
