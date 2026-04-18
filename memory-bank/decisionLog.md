# Decision Log

## Technical Decisions

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

### 2026-03-29: NAPI Exception Handling

**Decision**: Use `node_addon_api_except` instead of `NAPI_DISABLE_CPP_EXCEPTIONS=1`

**Rationale**:
- Commit 48e95e8a0d32277449c269b41fba6419acb21418 changed the build configuration
- Using `node_addon_api_except` from node-addon-api provides proper exception handling support
- This is the recommended approach for modern node-addon-api versions

**Files Changed**:
- `binding.gyp`: Changed from `node_addon_api` to `node_addon_api_except` dependency

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
