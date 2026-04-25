# Progress

### CI `gh release upload` glob pattern fix (2026-04-25)
- Changed `prebuilds/*` to `prebuilds/*/*.node` in both `build` and `build-musl` upload steps
- Added `shell: bash` to the `build` job's upload step for consistent glob expansion across platforms (especially Windows)
- The `prebuilds/*` pattern matched directories like `prebuilds/linux-x64/` causing "is a directory" error
- `prebuilds/*/*.node` correctly matches only `.node` files one level deep

### CI "release not found" fix
- Added `create-release` job to `.github/workflows/ci.yml` that creates a draft GitHub Release on tag events
- `build` and `build-musl` jobs now depend on `create-release` to ensure the release exists before uploading
- `build` job depends on `[verify-version, lint, create-release]` with conditional execution
- `build-musl` job depends on `[verify-version, create-release]` with conditional execution

### macOS async hook corruption during prebuild (2026-04-25)
- Same async hook stack corruption bug now observed during `yarn prebuild` (node-gyp rebuild) on macOS x64
- Stack trace shows `FSReqCallback::Resolve` — Node.js's own `fs` module, not our addon code
- Confirms the bug is a Node.js/macOS x64 issue, not specific to our test suite
- Documented in `issues.md`

### Memory Bank CI/CD Documentation Update
- Added CI/CD Workflows section to `build-system.md` documenting all three GitHub Actions workflows (ci.yml, publish.yml, test-npm-package.yml)
- Added CI/CD section to `development.md` with CI pipeline summary, release process, and debugging CI failures
- Added CI/CD Pipeline Design decision entry to `decisionLog.md`
- Added CI/CD section and updated related file references in `project-overview.md`

### async hook stack corruption on macOS CI
- **Status**: Root cause not yet definitively identified. HandleScope fix is next hypothesis to test.
- Original error: `Error: async hook stack has become corrupted (actual: 573357, expected: 573357)`
- Extensive static analysis of Node.js source code completed
- Key finding: `napi_delete_async_work` from within complete callback is the documented correct pattern
- Key finding: `EmitAsyncDestroy` is DEFERRED (via SetImmediate), does NOT pop async context
- Key finding: `CallbackScope` copies `async_context_` by value, so Work deletion doesn't affect values
- Key finding: `actual == expected` pattern (same integer displayed with `%.f`) suggests non-integer doubles or race condition
- Key finding: Only crashes on macOS x64 (never on Linux x64 or macOS arm64)
- Key finding: HandleScope accumulation — each `CREATE_WORK` call inside a complete callback creates `Local<>` handles that accumulate in the outer `HandleScope`
- Added `SQLITE3_DEBUG_ASYNC_HOOKS=1` env var for diagnostic logging in stress test
- Added macOS debug step in CI workflow
- **Next steps**: Try HandleScope fix, file Node.js bug report if needed

### SQLite Build Pipeline using sqlite-amalgamation-*.zip
- Switched from `sqlite-autoconf-*.tar.gz` to `sqlite-amalgamation-*.zip`
- Removed `tar` npm dependency
- Simplified `deps/sqlite3.gyp` (no `action_before_build`)
- Updated `tools/bin/bump-sqlite.sh`

### ESM + CJS Dual Support Implementation
- CJS: `lib/sqlite3.js` → `lib/sqlite3-callback.js` + `lib/sqlite3-binding.js`
- ESM: `lib/sqlite3.mjs` → `lib/promise/` (SqliteDatabase, SqliteStatement, SqliteBackup)
- TypeScript definitions updated
- All 281 tests passing (including ESM tests)

### SQLite Version Bump Script
- `tools/bin/bump-sqlite.sh` downloads amalgamation zip, extracts, commits
- Version driven by `sqlite_version` in `deps/common-sqlite.gypi`

### fixed: queue processing deadlock in serialized mode
- Database::Process() now tracks `pending` counter before/after callback
- If `pending` unchanged and `locked` is true, operation was synchronous → reset `locked` and continue
- This prevents the queue from stalling when a synchronous operation (like `db.run()`) is queued in serialized mode

### Security Hardening Documentation
- Documented hardening flags in `memory-bank/build-system.md`
- Linux: RELRO, stack protector, FORTIFY_SOURCE, PIE, -fno-omit-frame-pointer
- macOS: PIE, hardened runtime
- Windows: CFG, CET compat

### NAPI Exception Handling
- `TRY_CATCH_CALL` macro handles `Napi::Error` exceptions from `napi_call_function`
- During Node.js/Electron shutdown, `g_env_shutting_down` flag prevents re-throwing exceptions

### Memory Bank Update
- Updated project-overview.md, build-system.md, decisionLog.md, progress.md

### Memory Bank Setup
- Created initial memory bank files

### Promisification Implementation (VERIFIED COMPLETE)
- `lib/promise/database.js` - SqliteDatabase class with all async methods returning Promises
- `lib/promise/statement.js` - SqliteStatement class with all async methods returning Promises
- `lib/promise/backup.js` - SqliteBackup class with step/finish returning Promises
- `lib/promise/index.js` - CommonJS entry point
- `lib/promise/index.mjs` - ESM entry point
- `lib/promise/index.d.ts` - TypeScript declarations
- All promise tests passing

### Project Setup
- Initial project structure and configuration

### Build System
- node-gyp based build with prebuildify
- SQLite amalgamation downloaded and extracted at build time

### Testing Infrastructure
- Mocha test framework with nyc coverage
- 281 tests passing (including ESM tests)