# Decision Log

## Technical Decisions

### 2026-04-23: Add debug logging for async hook stack corruption diagnosis

**Decision**: Add `SQLITE3_DEBUG_ASYNC_HOOKS=1` environment variable to enable detailed diagnostic logging in the async_hooks stress test. When enabled, logs `executionAsyncId`, `triggerAsyncId`, and stack depth at each `init`, `before`, `after`, `destroy` hook invocation.

**Rationale**: Static analysis of Node.js source code could not definitively identify the root cause of the async hook stack corruption. The error `(actual: 573357, expected: 573357)` shows identical displayed values but different binary values, suggesting `kExecutionAsyncId` was modified between `InternalCallbackScope` push and pop. Runtime debug logging is needed to capture the exact push/pop sequence.

**Files changed**: `test/async_hooks_stress.test.js` (added debug logging via `SQLITE3_DEBUG_ASYNC_HOOKS` env var), `.github/workflows/ci.yml` (added macOS debug step)

### 2026-04-21: SQLite Build Pipeline using sqlite-amalgamation-*.zip

**Decision**: Switch from `sqlite-autoconf-*.tar.gz` as an amalgamation (extracted at build time via `tar` npm package) to `sqlite-amalgamation-*.zip` (pre-extracted in `deps/`).

**Rationale**:
- Removes `tar` npm dependency — smaller install for all consumers
- Eliminates build-time extraction — simpler `sqlite3.gyp`, no `action_before_build`
- No `VERSION` file conflict — amalgamation zip doesn't include it
- Faster builds — no extraction step during `yarn install` or `yarn rebuild`
- Simpler debugging — source files are directly visible in `deps/`
- Same pattern — `sqlite_version` variable still drives path references

**Changes**:
- `deps/sqlite3.gyp` — removed `action_before_build` target, paths now reference `./sqlite-amalgamation-<@(sqlite_version)/`
- `deps/extract.js` — deleted (no longer needed)
- `deps/sqlite-autoconf-3530000.tar.gz` — deleted, replaced by `deps/sqlite-amalgamation-3530000/`
- `package.json` — removed `tar` from dependencies
- `tools/bin/bump-sqlite.sh` — downloads amalgamation zip, extracts immediately, commits directory

### 2026-04-21: ESM + CJS Dual Support

**Decision**: Use ESM Wrapper Pattern with native CJS→ESM interop for ESM support, while keeping CJS as the primary module system.

**Rationale**:
- ESM wrappers (`.mjs` files) use direct `import` statements to load CJS modules
- This approach maintains full CJS backward compatibility while providing ESM support
- Conditional `exports` map in `package.json` routes ESM/TypeScript/CJS consumers correctly

**Circular Dependency Fix**:
- Original structure: `sqlite3.js` → `promise/` → `sqlite3.js` (circular)
- When loading promise subpath first via ESM, Node.js warned about accessing non-existent properties
- Solution: Extract callback API into `sqlite3-callback.js`, make `sqlite3.js` a thin wrapper
- `promise/database.js` now requires `sqlite3-callback.js` instead of `sqlite3.js`
- This eliminates the circular dependency entirely

**Key Files**:
- `lib/sqlite3.mjs` — ESM entry point (default + named exports)
- `lib/promise/index.mjs` — ESM entry point for promise subpath
- `lib/sqlite3-callback.js` — Callback API (extracted from sqlite3.js)
- `lib/promise/index.d.ts` — TypeScript declarations for promise subpath
- `test/esm.test.mjs` — 38 ESM-specific tests

**package.json `exports` map**:
```json
{
  ".": {
    "types": "./lib/sqlite3.d.ts",
    "import": "./lib/sqlite3.mjs",
    "require": "./lib/sqlite3.js",
    "default": "./lib/sqlite3.js"
  },
  "./promise": {
    "types": "./lib/promise/index.d.ts",
    "import": "./lib/promise/index.mjs",
    "require": "./lib/promise/index.js",
    "default": "./lib/promise/index.js"
  }
}
```

**CI/CD**:
- `test-npm-package.yml` now has `workflow_call` trigger for reuse from CI
- Added ESM smoke tests to `test-npm-package.yml`
- `ci.yml` calls `test-npm-package` as a reusable workflow

**Alternatives Considered**:
1. Pure ESM with top-level await — Rejected (native addons require `require()`)
2. Dual CJS/ESM package — Rejected (dual package hazard, complexity)
3. Lazy property getters in sqlite3.js — Rejected (still had circular dependency warning)

---

### 2026-04-18: Prebuild Migration (prebuild/prebuild-install → prebuildify/node-gyp-build)

**Decision**: Replace deprecated `prebuild` and `prebuild-install` with `prebuildify` and `node-gyp-build`

**Rationale**:
- `prebuild` and `prebuild-install` are deprecated and no longer maintained
- `prebuildify` bundles prebuilt binaries inside the npm package, eliminating the need for a separate download step during `npm install`
- `node-gyp-build` replaces both `bindings` (for local builds) and `prebuild-install` (for downloading prebuilts) with a single module
- `node-gyp-build` checks `build/Release/` before `prebuilds/`, so local builds always take precedence
- The `node-gyp-build` CLI (used as `install` script) automatic fallback to source build
- `--tag-libc` flag ensures musl/glibc differentiation for Linux binaries

**Key Changes**:
- Replaced `bindings` + `prebuild-install` → `node-gyp-build`; replaced `prebuild` → `prebuildify`
- Added `"install": "node-gyp-build"` script (tests prebuilt, falls back to `node-gyp rebuild`)
- `lib/sqlite3-binding.js` must pass project root (`path.join(__dirname, "..")`) to `node-gyp-build`, not `__dirname`
- Removed `binary` config and `upload` script from `package.json`
- Updated CI: replaced `yarn upload` with `gh release upload`, added `package` job for PRs

**Source Builder Experience**:
- `npx node-gyp rebuild` works
- Local builds in `build/Release/` take precedence over prebuilts
- No separate download step needed — prebuilts are bundled in the npm package


---

### 2026-04-17: SQLite Version Bump Script Design

**Decision**: Create `tools/bin/bump-sqlite.sh` as a standalone bash script in `tools/bin/` (not a per-script subdirectory)

**Rationale**:
- `tools/bin/` is the designated directory for all utility scripts — avoids creating a sub-directory per script
- Bash script chosen over Node.js: simpler for git operations, no dependency installation needed
- 17-step workflow: parse args → clean tree → checkout main → fetch → check newer → cooldown → pull → create branch → download/replace → update gypi → update readme → check other changes → build → lint → test → commit → push
- `FROM_VERSION` global variable set in step 5 (before any file modifications) and reused in steps 8, 9, 10 — avoids re-reading the gypi file after it has been updated
- Auto-detection of latest SQLite version from sqlite.org download page (optional `<new-version>` argument)
- Cooldown period (default 7 days) to let new SQLite releases settle before adoption

**Files Created**:
- `tools/bin/bump-sqlite.sh` — Main script

---

### 2026-04-10: Queue Processing Deadlock Fix

**Decision**: Track `pending` counter to detect synchronous operations in `Database::Process()`

**Rationale**:
- Bug: When using `db.serialize()`, synchronous operations like `configure()` would cause subsequent operations to get stuck in the queue indefinitely
- Root cause: `Process()` loop breaks after exclusive operations, but synchronous operations don't increment `pending`, leaving `locked=true` with no async work pending
- Solution detects synchronous completion by checking if `pending` counter changed during callback execution

**Implementation**:
```cpp
// Track pending before callback to detect synchronous operations
unsigned int before_pending = pending;
call->callback(call->baton);

// If operation was synchronous (pending unchanged) and we're in exclusive mode,
// reset locked and continue processing the queue.
if (locked && pending == before_pending) {
    locked = false;
    continue;
}
```

**Files Changed**:
- `src/database.cc`: Modified `Database::Process()` function
- `test/serialization.test.js`: Added test cases for queue processing bug

**Affected Synchronous Operations**:
- `SetLimit` - SQLite limit configuration
- `SetBusyTimeout` - Busy timeout setting
- `RegisterTraceCallback` - Trace callback registration
- `RegisterProfileCallback` - Profile callback registration
- `RegisterUpdateCallback` - Update hook registration
- `Work_Wait` - Wait operation

**References**:
- GitHub Issue: https://github.com/TryGhost/node-sqlite3/issues/1838

---

### 2026-03-29: Security Hardening Implementation

**Decision**: Implement platform-specific security hardening flags in binding.gyp

**Rationale**:
- Native addons are potential attack vectors in Node.js applications
- Security hardening protects against common vulnerability classes:
  - Buffer overflow attacks
  - Control flow hijacking (ROP/JOP)
  - Stack smashing attacks
  - Memory corruption exploits
- Modern compilers and linkers provide built-in security features
- Minimal performance impact in Release builds

**Implementation**:

**Linux (all builds)**:
- `-fstack-protector-strong` - Stack canaries for functions with local buffers
- `-fPIC` - Position Independent Code for ASLR
- `-Wl,-z,relro,-z,now` - RELRO and immediate binding

**Linux (Release only)**:
- `_FORTIFY_SOURCE=2` - Source-level buffer overflow detection
- `-fcf-protection=full` - Intel CET (x86_64 only)

**Windows (all builds)**:
- `BufferSecurityCheck` - Stack buffer overrun detection
- `ControlFlowGuard` - Control Flow Guard
- `/DYNAMICBASE` - ASLR support
- `/NXCOMPAT` - DEP support

**Windows (Release only)**:
- `/sdl` - Additional security checks

**macOS (all builds)**:
- `-fstack-protector-strong` - Stack protection
- `libc++` - Modern C++ standard library

**Files Changed**:
- `binding.gyp`: Added hardening flags for all platforms

**References**:
- [OWASP Hardening](https://owasp.org/www-project-web-security-testing-guide/)
- [GCC Security Features](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html)
- [MSVC Security Features](https://docs.microsoft.com/en-us/cpp/build/reference/security-best-practices)

---

### 2026-04-25: NAPI Exception Handling — Switched to NAPI_DISABLE_CPP_EXCEPTIONS

**Decision**: Use `node_addon_api` (NAPI_DISABLE_CPP_EXCEPTIONS mode) instead of `node_addon_api_except`

**Rationale**:
- The previous decision (2026-03-29) to use `node_addon_api_except` caused uncatchable C++ exceptions that crashed the process with SIGABRT
- `TRY_CATCH_CALL`'s `try { callback.Call() } catch (Napi::Error& e) { throw; }` re-threw C++ exceptions from within async `Work_After*` callbacks where there was no C++ catch handler on the stack → `std::terminate()` → `abort()`
- With `NAPI_DISABLE_CPP_EXCEPTIONS=1`, `Napi::Error` is never thrown as a C++ exception — it's just a JavaScript value, so all errors are catchable from JS
- The `node_addon_api` target includes `noexcept.gypi` which defines `NODE_ADDON_API_DISABLE_CPP_EXCEPTIONS` and `-fno-exceptions`
- No explicit `NAPI_DISABLE_CPP_EXCEPTIONS=1` define needed in `binding.gyp` — the dependency handles it

**Additional fixes**:
- Removed dead code: `TRY_CATCH_CALL` try/catch block and `throw;`, `g_env_shutting_down` mechanism
- Initialized `retryErrors` in C++ `Backup::Backup()` constructor with `[SQLITE_BUSY, SQLITE_LOCKED]` to prevent `FATAL ERROR: Error::New napi_get_last_error_info` when `retryErrors.Value()` is called on an empty `Napi::Reference<Array>`

**Files Changed**:
- `binding.gyp`: Changed dependency from `node_addon_api_except` to `node_addon_api`
- `src/macros.h`: Removed `#include <atomic>`, `g_env_shutting_down`, and try/catch from `TRY_CATCH_CALL`
- `src/node_sqlite3.cc`: Removed `g_env_shutting_down`, `EnvCleanupHook`, `napi_add_env_cleanup_hook`
- `src/backup.cc`: Initialize `retryErrors` in constructor
- `test/uncatchable-exceptions.test.js`: Integration tests for both fixed scenarios
- `test/uncatchable-scenarios/`: Child process crash reproduction scripts

**Supersedes**: 2026-03-29 decision to use `node_addon_api_except`

---

### 2026-03-28: Memory Bank Structure

**Decision**: Adopt UMB (Update Memory Bank) workflow with standard file structure.

**Rationale**: Following 2026 community standards for AI agent context management.

**Files Created**:
- `activeContext.md` - Current work status
- `progress.md` - Completed work history
- `decisionLog.md` - Technical decisions record

---

### Promisification Architecture

**Decision**: Create Promise-based wrapper classes alongside callback-based classes.

**Status**: ✅ IMPLEMENTED

**Rationale**:
- Maintains backward compatibility with existing callback API
- Provides modern async/await support
- Follows established pattern from sqlite3orm reference implementation

**Implementation**:
- New classes: `SqliteDatabase`, `SqliteStatement`, `SqliteBackup`
- Exported from `lib/promise/index.js`
- Generic type parameters for TypeScript type inference
- Transaction support with `beginTransaction()`, `commitTransaction()`, `rollbackTransaction()`
- Static factory method `SqliteDatabase.open()`

**Alternatives Considered**:
1. Modify existing classes to return Promises - Rejected (breaks backward compatibility)
2. Create separate package - Deferred (can be refactored later if needed)

---

### Node.js Version Requirement

**Decision**: Require Node.js >= 20.17.0

**Rationale**: 
- Modern NAPI support
- Latest performance improvements
- Simplified maintenance

---

### Build System Choice

**Decision**: Use node-gyp with prebuildify for binary distribution

**Rationale**:
- Established tool for native addons
- Prebuilt binaries bundled inside npm package (no separate download needed)
- `node-gyp-build` resolves prebuilt binaries or falls back to source build
- `prebuildify` with `--tag-libc` ensures musl/glibc differentiation
- `npx node-gyp rebuild` for custom builds (SQLCipher, etc.)

---

### SQLite Configuration

**Decision**: Bundle SQLite with enabled extensions

**Extensions Enabled**:
- `SQLITE_THREADSAFE=1` - Thread safety
- `SQLITE_ENABLE_FTS3/4/5` - Full-text search
- `SQLITE_ENABLE_RTREE` - R-Tree index
- `SQLITE_ENABLE_DBSTAT_VTAB=1` - Database stats
- `SQLITE_ENABLE_MATH_FUNCTIONS` - Math functions

**Rationale**: Provides comprehensive SQLite functionality out of the box.

---

### Test Framework

**Decision**: Use mocha with 480s timeout

**Rationale**: 
- Established test suite
- Handles async operations well
- Compatible with existing tests
