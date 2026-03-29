# Decision Log

## Technical Decisions

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

**Decision**: Use node-gyp with prebuild for binary distribution

**Rationale**:
- Established tool for native addons
- Prebuilt binaries reduce installation friction
- Supports multiple NAPI versions (3, 6)

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
