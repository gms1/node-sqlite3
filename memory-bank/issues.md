# issues

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
