
# issues

## async hook stack corruption

within CI workflow on macOS we got an async hook stack corruption as race condition in native addon
This error has appeared from time to time in the CI workflow, but was not reproducible by the test/sync_hooks_stress.test.js

```bash
Run yarn test
yarn run v1.22.22
(node:6034) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
(Use `node --trace-deprecation ...` to show where the warning was created)
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
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.
```
