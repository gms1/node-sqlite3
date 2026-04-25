# issues

## Uncatchable Native Addon Exceptions (C++ → Napi::Error) — FIXED

**Status**: Fixed as of 2026-04-25. Switched from `node_addon_api_except` to `node_addon_api` (NAPI_DISABLE_CPP_EXCEPTIONS mode), removed dead `TRY_CATCH_CALL` try/catch and `g_env_shutting_down`, and initialized `retryErrors` in the C++ Backup constructor.

### Previously uncatchable scenarios (now catchable)

#### 1. `Backup.step()` after `Backup.finish()` — FIXED

Previously crashed with `FATAL ERROR: Error::New napi_get_last_error_info` in `GetRetryErrors()` because `retryErrors` (`Napi::Reference<Array>`) was never initialized in the C++ constructor — it was only set by the JS wrapper in `Database.prototype.backup()`. Calling `retryErrors.Value()` on an empty reference caused a N-API fatal error.

**Fix**: Initialize `retryErrors` in the C++ `Backup::Backup()` constructor with default values `[SQLITE_BUSY, SQLITE_LOCKED]`, matching what the JS wrapper sets. Now `Backup.step()` after `Backup.finish()` returns a normal JS error: `SQLITE_MISUSE: Backup is already finished`.

**Test**: `test/uncatchable-scenarios/backup-step-after-finish.js` — exit code 0 with "OK: got expected error".

#### 2. JS callback throw inside Work_After* async callback — FIXED

Previously, `TRY_CATCH_CALL`'s `try { callback.Call() } catch (Napi::Error& e) { throw; }` re-threw C++ exceptions from within async `Work_After*` callbacks where there was no C++ catch handler on the stack, causing `std::terminate()` → `abort()`.

**Fix**: Switched to `NAPI_DISABLE_CPP_EXCEPTIONS=1` (via `node_addon_api` dependency). With exceptions disabled, `Napi::Error` is never thrown as a C++ exception — it's just a JavaScript value. Also removed the dead `try/catch` and `throw;` from `TRY_CATCH_CALL` macro.

**Test**: `test/uncatchable-scenarios/stmt-callback-throws.js` — exit code 1 (normal JS uncaught exception) instead of 134 (SIGABRT).

#### 3. Statement operations after `Database.close()` — Already catchable

`Statement::Schedule()` calls `CleanQueue()` synchronously on the main JS thread, where `InstanceMethodCallbackWrapper` catches the `Napi::Error` and converts it to a JS exception. This scenario returns a normal JS error: `SQLITE_MISUSE: Statement is already finalized`.

#### 4. `verbose.test.js` assertion failure after `verbose()` called

When `sqlite3.verbose()` has been called globally (setting `isVerbose = true`), the test "Should not add trace info to error when verbose is not called" in `verbose.test.js` will fail because the error stack DOES contain trace info. The `resetVerbose()` function restores original methods but does NOT reset the `isVerbose` flag.

**Workaround**: The `verbose()` idempotency test was placed as the LAST test in `verbose.test.js` to avoid contaminating the "not called" test. Test ordering matters for this file.

### Root cause (historical)

With `NAPI_CPP_EXCEPTIONS` enabled, `Napi::Error` was thrown as a C++ exception. The `TRY_CATCH_CALL` macro caught it and re-threw with `throw;`, but from within async `Work_After*` callbacks where there was no C++ catch handler on the stack → `std::terminate()` → `abort()`. Additionally, `Backup::GetRetryErrors()` crashed on an uninitialized `Napi::Reference<Array>`.

### Changes made

1. **`binding.gyp`**: Changed dependency from `node_addon_api_except` to `node_addon_api` (includes `noexcept.gypi` which defines `NODE_ADDON_API_DISABLE_CPP_EXCEPTIONS` and `-fno-exceptions`)
2. **`src/macros.h`**: Removed `#include <atomic>`, `extern std::atomic<bool> g_env_shutting_down`, and the `try/catch` + `throw;` from `TRY_CATCH_CALL`
3. **`src/node_sqlite3.cc`**: Removed `#include <atomic>`, `g_env_shutting_down` variable, `EnvCleanupHook`, and `napi_add_env_cleanup_hook` call
4. **`src/backup.cc`**: Initialize `retryErrors` in `Backup::Backup()` constructor with `[SQLITE_BUSY, SQLITE_LOCKED]`
5. **`test/uncatchable-exceptions.test.js`**: Integration tests that verify both scenarios now produce catchable JS errors
6. **`test/uncatchable-scenarios/`**: Child process scripts for crash reproduction

---

## async hook stack corruption

within CI workflow on macOS we got an async hook stack corruption as race condition in native addon
This error has appeared from time to time in the CI workflow, but was not reproducible by the test/sync_hooks_stress.test.js

```bash
Run yarn test
yarn run v1.22.22
(node:6034) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for this URL parsing vulnerabilities that have security implications. Use the WHATWG URL API instead.
$ node test/support/createdb.js && nyc mocha -R spec --timeout 480000 "test/*.test.js" "test/*.test.mjs"
Creating test database... This may take several minutes.
Error: async hook stack has become corrupted (actual: 573357, expected: 573357)
----- Native stack trace -----

 1: 0x104f0dfb8 node::AsyncHooks::FailWithCorruptedAsyncStack(double) [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 2: 0x104f0df79 node::AsyncHooks::pop_async_context(double) [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 3: 0x104ebad39 node::InternalCallbackScope::Close() [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 4: 0x104eba771 node::CallbackScope::~CallbackScope() [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 5: 0x104fa07fc (anonymous namespace)::uvimpl::Work::AfterThreadPoolWork(int) [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 6: 0x104fa0c6f node::ThreadPoolWork::ScheduleWork()::'lambda'(uv_work_s*, int)::operator()(uv_work_s*, int) const [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 7: 0x104fa0b36 node::ThreadPoolWork::ScheduleWork()::'lambda'(uv_work_s*, int)::__invoke(uv_work_s*, int) [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 8: 0x105fbce49 uv__work_done [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
 9: 0x105fc1691 uv__async_io [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
10: 0x105fd6876 uv__io_poll [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
11: 0x105fc1c10 uv_run [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
12: 0x104ebc435 node::SpinEventLoopInternal(node::Environment*) [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
13: 0x1050554ae node::NodeMainInstance::Run() [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
14: 0x104f98d1e node::Start(int, char**) [/Users/runner/hostedtoolcache/node/24.15.0/x64/bin/node]
15: 0x20c462530
error Command failed with exit code 1.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this yarn command.
```

Also seen with Node.js v20.20.2 on macOS x64:
```
Error: async hook stack has become corrupted (actual: 315540, expected: 315540)
```

### Root Cause Analysis (2026-04-23)

**Status**: Root cause not definitively identified. Extensive static analysis of Node.js source code and Amazon Q analysis completed.

**Key findings**:

1. The error `(actual: N, expected: N)` shows identical displayed values but the `!=` check triggered — `%.f` format rounds to 0 decimal places, masking the actual difference. Either non-integer doubles rounding identically, or a race condition.

2. The crash occurs in `pop_async_context()` when `kExecutionAsyncId != async_id` at the time `InternalCallbackScope::Close()` is called.

3. **Only on macOS x64** — never on Linux x64 or macOS arm64. macOS x64 CI runners may be running via Rosetta 2 on Apple Silicon.

4. **`createdb.js` does NOT use async_hooks** — `kInit == 0`, `kBefore == 0`, `kAfter == 0`. So `EmitBefore`/`EmitAfter` are no-ops.

5. **DeferredDelete fix is WRONG** — `napi_delete_async_work` → `delete work` → `~AsyncResource()` → `EmitDestroy` does NOT call `pop_async_context`. Deferring deletion doesn't affect the async hook stack. Calling `napi_delete_async_work` from within the complete callback is the documented correct N-API pattern.

6. **What does NOT modify async context between push and pop**:
   - `CallIntoModule` — simply calls `call(this)`, no async context manipulation
   - `EmitBefore`/`EmitAfter` — no-ops when no hooks registered
   - `napi_create_async_work` — fires `init` hook (no-op) but does NOT push async context
   - `napi_delete_async_work` — fires `EmitDestroy` (deferred) but does NOT pop
   - `TRY_CATCH_CALL` — uses `napi_call_function` (NOT `napi_make_callback`), no CallbackScope
   - `CallbackScope` copies `async_context_` by value — even if Work is deleted, values preserved

7. **HandleScope accumulation**: With 1M operations, the outer `HandleScope` in `AfterThreadPoolWork` accumulates ~2M `Local<>` handles (one per `napi_create_async_work` call). This is because `CREATE_WORK` is called from within the complete callback, which is inside the `InternalCallbackScope`'s outer `HandleScope`.

8. **Amazon Q analysis explored many hypotheses** including:
   - `native_execution_async_resources_` use-after-free (ruled out — `CallbackScope` copies by value)
   - Floating-point precision issue (possible but unproven)
   - Race condition with concurrent access to `async_id_fields_` (ruled out — single-threaded)
   - V8 GC or handle block management interaction (possible)
   - macOS x86_64-specific V8 JIT or memory behavior (possible)

**Remaining hypotheses**:
1. **HandleScope accumulation** causing V8 issues on macOS x64
2. **V8/compiler bug** on macOS x64 specific to `async_id_fields_` Float64Array handling
3. **Promise hooks** pushing/popping async contexts during the complete callback

**Next steps**: Try HandleScope fix (add `Napi::HandleScope` in `CREATE_WORK`), reorder CI to capture debug output, and if needed use `--no-force-async-hooks-checks` workaround.
