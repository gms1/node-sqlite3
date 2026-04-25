# Build System

## Overview

The project uses **node-gyp** to build the native SQLite3 addon. The build system supports both Debug and Release configurations.

## Build Files

### binding.gyp

Main build configuration file:

```python
{
  "includes": ["deps/common-sqlite.gypi"],
  "variables": {
      "sqlite%": "internal",      # Use bundled SQLite
      "sqlite_libname%": "sqlite3",
      "module_name": "node_sqlite3",
  },
  "targets": [
    {
      "target_name": "<(module_name)",
      "sources": [
        "src/backup.cc",
        "src/database.cc",
        "src/node_sqlite3.cc",
        "src/statement.cc"
      ],
      "defines": [
        "NAPI_VERSION=<(napi_build_version)"
      ]
      // ... more config
    }
  ]
}
```

### deps/common-sqlite.gypi

Common build configurations:

| Configuration | Defines | Optimization |
|--------------|---------|--------------|
| Debug | `DEBUG`, `_DEBUG` | None (`-O0`) |
| Release | `NDEBUG` | Full (`-O3`) |

### deps/sqlite3.gyp

SQLite library build configuration:
- Compiles SQLite from amalgamation source (pre-extracted in deps/)
- Enables FTS3/4/5, R-Tree, math functions
- Thread-safe configuration

## Build Commands

### Standard Build

```bash
# Install with prebuilt binaries or compile from source
yarn install

# Explicit rebuild
yarn rebuild
# or
node-gyp rebuild
```

Output: `build/Release/node_sqlite3.node`

### Debug Build

```bash
node-gyp rebuild --debug
```

Output: `build/Debug/node_sqlite3.node`

### Clean Build

```bash
node-gyp clean
node-gyp rebuild
```

### Verbose Build

```bash
node-gyp rebuild --verbose
```

## Build Configurations

### Debug Configuration

Enables:
- `DEBUG` and `_DEBUG` preprocessor macros
- Debug symbols (`GCC_GENERATE_DEBUGGING_SYMBOLS: YES`)
- No optimizations (`GCC_OPTIMIZATION_LEVEL: 0`)
- `ASSERT_STATUS()` macro checks (src/macros.h)

### Release Configuration (Default)

Enables:
- `NDEBUG` preprocessor macro
- Full optimizations (`GCC_OPTIMIZATION_LEVEL: 3`)
- No debug symbols

## Custom Build Options

### Using External SQLite

```bash
node-gyp rebuild --sqlite=/path/to/sqlite --sqlite_libname=sqlite3
```

### NAPI Version

The `NAPI_VERSION` define is set via `napi_build_version` variable in binding.gyp:

```python
"defines": [ "NAPI_VERSION=<(napi_build_version)" ]
```

**How it works**:
- The `napi_build_version` variable is automatically set by node-gyp based on the target Node.js version
- For local builds, it's stored in `build/config.gypi` (e.g., `"napi_build_version": "9"`)
- For prebuilds, `prebuildify` passes it via the `--napi` flag which builds a single NAPI-version-agnostic binary (named `@homeofthings+sqlite3.<libc>.node`). The actual NAPI version used at compile time is determined by the Node.js version running the build. Since NAPI is forward-compatible, prebuilts must be built on the lowest supported Node version to maximize compatibility — building on Node 20 (NAPI v9) produces prebuilts compatible with all Node.js 20+ versions.

### NAPI Versions Configuration

With `prebuildify --napi`, the NAPI version is auto-detected from the build Node.js version — it is not explicitly configured. The CI builds prebuilds on Node 20 (which supports NAPI v9), producing a single `@homeofthings+sqlite3.glibc.node` binary per platform. The `PREBUILD_NODE_VERSION` workflow variable controls which Node version is used for prebuilds.

**Why multiple versions?**

NAPI versions are independent of Node.js versions - they represent API feature tiers, not Node.js version numbers. Each NAPI version adds new capabilities:

| NAPI Version | Key Features Added                      |
|--------------|-----------------------------------------|
| v3           | Instance data, cleanup hooks            |
| v4           | Thread-safe functions                   |
| v5           | BigInt support                          |
| v6           | Instance data with finalizer hints      |
| v7           | ArrayBuffer detaching                   |
| v8           | Type tagging, async cleanup             |
| v9           | External strings, syntax error creation |
| v10          | Latin1 external strings                 |

**Forward Compatibility**:

NAPI is forward-compatible — a binary built with NAPI_VERSION=X requires a Node.js version supporting NAPI vX or higher. Since our prebuilts are built with NAPI v9 on Node 20, they are compatible with all Node.js 20+ versions (which support NAPI v9 or higher).

**Code Conditionals**:

The source code uses `#if NAPI_VERSION < 6` conditionals in [`src/database.h`](../src/database.h) and [`src/database.cc`](../src/database.cc) to provide backward compatibility for NAPI versions below v6. When building for NAPI v6+, these conditionals are disabled.

## Assert Control

### Asserts in Debug Mode

The `ASSERT_STATUS` macro in src/macros.h is enabled when `DEBUG` is defined:

```c
#ifdef DEBUG
    #define ASSERT_STATUS() assert(status == 0);
#else
    #define ASSERT_STATUS() (void)status;
#endif
```

## Module Loading

The native addon is loaded via lib/sqlite3-binding.js:

```javascript
module.exports = require('node-gyp-build')(require('path').join(__dirname, '..'));
```

The project root directory (`path.join(__dirname, "..")`) is passed instead of `__dirname` because `node-gyp-build` looks for `prebuilds/` and `build/` directories relative to the path it receives. Since `sqlite3-binding.js` is in `lib/`, passing `__dirname` would cause it to look in `lib/prebuilds/` and `lib/build/` — which do not exist.

The `node-gyp-build` package resolves the native binary in this order:
1. `build/Release/node_sqlite3.node` — local release build
2. `build/Debug/node_sqlite3.node` — local debug build
3. `prebuilds/<platform>-<arch>/@homeofthings+sqlite3.<libc>.node` — bundled prebuilt binary

**Note**: Local builds take precedence over prebuilt binaries. To force a source build (which creates `build/Release/` and takes precedence), use:

```bash
npx node-gyp rebuild
```

## Prebuilt Binaries

Prebuilt binaries are bundled inside the npm package using `prebuildify` and loaded at runtime by `node-gyp-build`. This eliminates the need for a separate download step during `npm install`.

### Building Prebuilts

```bash
yarn prebuild  # Build prebuilt binaries using prebuildify
```

The `prebuild` script runs: `prebuildify --napi --strip --tag-libc`

Flags:
- `--napi`: Build a NAPI-version-agnostic binary (produces `@homeofthings+sqlite3.*.node`)
- `--strip`: Strip debug symbols from binaries
- `--tag-libc`: Tag binaries with libc variant (glibc vs musl)

### Binary Naming Convention

With `--tag-libc`, prebuildify produces binaries tagged with the libc variant:

| Platform      | Binary Name            |
|---------------|------------------------|
| Linux (glibc) | `@homeofthings+sqlite3.glibc.node` |
| Linux (musl)  | `@homeofthings+sqlite3.musl.node`  |
| macOS         | `@homeofthings+sqlite3.node`       |
| Windows       | `@homeofthings+sqlite3.node`       |

At runtime, `node-gyp-build` determines the libc variant by checking for Alpine Linux (via `/etc/alpine-release`) — if present, it selects the `musl` binary; otherwise, it selects `glibc`. It does not depend on the `detect-libc` package.

### Source Build Fallback

The `install` script runs `node-gyp-build` which tests whether the prebuilt binary works. If it does, no compilation is needed. If it doesn't (unsupported platform), `node-gyp-build` automatically falls back to `node-gyp rebuild`.

## Platform Support

- Node.js >= 20.17.0
- NAPI: version-agnostic (`@homeofthings+sqlite3.*.node`), built with NAPI v9 on Node 20 (PREBUILD_NODE_VERSION)
- Platforms: Linux (glibc + musl), macOS, Windows (see CI configuration)

## Security Hardening

The build system includes platform-specific security hardening flags to protect against common vulnerability classes.

### Linux Hardening

Applied to all Linux builds (see `binding.gyp`):

| Flag                       | Purpose                                                                        |
|----------------------------|--------------------------------------------------------------------------------|
| `-fstack-protector-strong` | Stack overflow protection - inserts canaries into functions with local buffers |
| `-fPIC`                    | Position Independent Code - enables ASLR (Address Space Layout Randomization)  |

Linker flags:

| Flag           | Purpose                                                                              |
|----------------|--------------------------------------------------------------------------------------|
| `-Wl,-z,relro` | Read-Only Relocations - makes some ELF sections read-only after load                 |
| `-Wl,-z,now`   | Immediate binding - resolves all symbols at load time, prevents lazy binding attacks |

Release-only hardening:

| Flag                   | Purpose                                                           | Scope             |
|------------------------|-------------------------------------------------------------------|-------------------|
| `_FORTIFY_SOURCE=2`    | Source-level buffer overflow detection                            | All architectures |
| `-fcf-protection=full` | Intel CET (Control Flow Guard) - protects against ROP/JOP attacks | x86_64 only       |

### Windows Hardening

Applied to all Windows builds (see `binding.gyp`):

**Compiler settings:**

| Setting                       | Purpose                                              |
|-------------------------------|------------------------------------------------------|
| `ExceptionHandling: 1`        | C++ exception handling support                       |
| `BufferSecurityCheck: "true"` | Stack buffer overrun detection (/GS)                 |
| `ControlFlowGuard: "Guard"`   | Control Flow Guard - validates indirect call targets |

**Linker settings:**

| Setting        | Purpose                                                              |
|----------------|----------------------------------------------------------------------|
| `/DYNAMICBASE` | ASLR - randomizes base address at load time                          |
| `/NXCOMPAT`    | DEP (Data Execution Prevention) - marks stack/heap as non-executable |

Release-only hardening:

| Setting | Purpose                                 |
|---------|-----------------------------------------|
| `/sdl`  | Additional security checks and warnings |

### macOS Hardening

Applied to all macOS builds (see `binding.gyp`):

| Flag                               | Purpose                         |
|------------------------------------|---------------------------------|
| `-fstack-protector-strong`         | Stack overflow protection       |
| `CLANG_CXX_LIBRARY: "libc++"`      | Use modern C++ standard library |
| `MACOSX_DEPLOYMENT_TARGET: "10.7"` | Minimum deployment target       |

### Hardening Summary

| Platform | Stack Protection                 | ASLR                  | Control Flow             | Buffer Checks             |
|----------|----------------------------------|-----------------------|--------------------------|---------------------------|
| Linux    | Yes (`-fstack-protector-strong`) | Yes (`-fPIC` + RELRO) | Yes (CET on x86_64)      | Yes (`_FORTIFY_SOURCE=2`) |
| Windows  | Yes (`BufferSecurityCheck`)      | Yes (`/DYNAMICBASE`)  | Yes (`ControlFlowGuard`) | Yes (`/sdl`)              |
| macOS    | Yes (`-fstack-protector-strong`) | Yes (default)         | No                       | No                        |

### References

- [OWASP Hardening Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [GCC Security Features](https://gcc.gnu.org/onlinedocs/gcc/Code-Gen-Options.html)
- [MSVC Security Features](https://docs.microsoft.com/en-us/cpp/build/reference/security-best-practices)

## CI/CD Workflows

The project uses three GitHub Actions workflows for continuous integration and release.

### CI Workflow (`.github/workflows/ci.yml`)

**Triggers**: `workflow_dispatch`, `pull_request`, push to `main`, tags (`*`)

**Workflow Environment Variables**:

| Variable | Value | Purpose |
|----------|-------|---------|
| `PREBUILD_NODE_VERSION` | `'20'` | Node version for building prebuilts (NAPI v9, compatible with all Node 20+) |
| `DEFAULT_NODE_VERSION` | `'24'` | Node version for lint, Codecov, smoke tests, packaging |
| `ALPINE_VARIANT` | `'alpine3.20'` | Alpine variant for musl Docker builds |

**Jobs**:

1. **verify-version** — On tag events, checks that the tag version matches `package.json` version. Fails the build if they don't match.

2. **create-release** — On tag events, creates a draft GitHub Release using `gh release create --draft`. This ensures the release exists before `build` and `build-musl` jobs try to upload binaries. Skipped for non-tag events (PRs, pushes to main).

3. **lint** — Runs `yarn lint` on `ubuntu-latest` with `DEFAULT_NODE_VERSION`.

4. **build** — Builds and tests native binaries across a 14-target matrix. Depends on `[verify-version, lint, create-release]`.

   | OS | Host | Target | Platform | Node Versions |
   |----|------|--------|----------|---------------|
   | macos-latest | x64 | x64 | macos-x64 | 20, 22, 24 |
   | macos-latest | arm64 | arm64 | macos-arm64 | 20, 22, 24 |
   | ubuntu-24.04 | x64 | x64 | linux-x64 | 20, 22, 24 |
   | ubuntu-24.04-arm | arm64 | arm64 | linux-arm64 | 20, 22, 24 |
   | windows-latest | x64 | x64 | win32-x64 | 20, 22, 24 |

   Steps per matrix entry:
   - Install dependencies (`yarn install --frozen-lockfile --ignore-scripts`)
   - Node compatibility check (`node tools/semver-check.js`)
   - Set env vars (`V=1`, `TARGET`, Linux: `CFLAGS`/`CXXFLAGS` with `gcc-preinclude.h`)
   - Build binaries (`yarn prebuild`)
   - Print binary info (Linux: `ldd`, `nm`, `file`)
   - **Debug async hook stack integrity** (macOS only): Runs `async_hooks_stress.test.js` with `SQLITE3_DEBUG_ASYNC_HOOKS=1`
   - Run tests (`yarn test`)
   - Upload binaries as commit artifacts (`PREBUILD_NODE_VERSION` only, 7-day retention)
   - Upload binaries to GitHub Release (`PREBUILD_NODE_VERSION` + tag events only, uses `prebuilds/*/*.node` glob to avoid matching directories)
   - Upload coverage to Codecov (linux-x64 + `DEFAULT_NODE_VERSION` only)

5. **build-musl** — Builds Linux musl binaries using Docker (`tools/BinaryBuilder.Dockerfile` with `ALPINE_VARIANT`). Only runs on tag events or `workflow_dispatch`. Depends on `[verify-version, create-release]`. Two targets: `linux/amd64` and `linux/arm64`.

6. **package** — Merges all prebuilt binary artifacts, creates npm tarball (`npm pack`), uploads tarball as artifact and to GitHub Release. Runs after `build` and `build-musl` succeed.

7. **test-package** — Calls `.github/workflows/test-npm-package.yml` as a reusable workflow to smoke-test the npm tarball on 4 platforms (linux-x64, linux-arm64, macos-arm64, win32-x64) with `DEFAULT_NODE_VERSION`.

### Publish Workflow (`.github/workflows/publish.yml`)

**Triggers**: `workflow_dispatch` with inputs:
- `tag` (required) — Release tag to publish (e.g., `v6.4.0`)
- `npm_tag` (optional) — npm dist-tag (e.g., `next`, `beta`); defaults to `latest`

**Steps**:
1. Validate tag input
2. Download tarball from GitHub Release
3. Publish to npm (uses OIDC/trusted publishing)
4. Mark GitHub Release as not pre-release

### Test npm Package Workflow (`.github/workflows/test-npm-package.yml`)

**Triggers**: `workflow_call` (reusable) or `workflow_dispatch`

**Inputs**:
- `target_run_id` (required) — Run ID of upstream CI workflow
- `node_version` (optional, default `20`) — Node.js version for testing

**Smoke tests** on 4 platforms (linux-x64, linux-arm64, macos-arm64, win32-x64):
1. Install tarball and verify package contents
2. Callback API test (`require('@homeofthings/sqlite3')`)
3. Promise API test (`SqliteDatabase.open()`)
4. ESM default import test (`import sqlite3 from '@homeofthings/sqlite3'`)
5. ESM named imports test (`import { Database, OPEN_READWRITE, OPEN_CREATE } from '@homeofthings/sqlite3'`)
6. ESM promise API test (`import { SqliteDatabase } from '@homeofthings/sqlite3/promise'`)

## Troubleshooting

### Build Fails

1. Check Node.js version: `node --version` (must be >= 20.17.0)
2. Check node-gyp version: `node-gyp --version`
3. Try clean rebuild: `node-gyp clean && node-gyp rebuild`
4. Check Python version (node-gyp requires Python 3)

### Native Module Not Found

1. Verify prebuilt binary exists: `ls prebuilds/`
2. Verify build output exists: `ls build/Release/node_sqlite3.node`
3. Try explicit rebuild: `yarn rebuild`
4. Force source build: `npx node-gyp rebuild`

### Debug Symbols Missing

1. Build with `--debug` flag: `node-gyp rebuild --debug`
2. Verify output location: `build/Debug/node_sqlite3.node`

## Related Files

- [Project Overview](project-overview.md) - Architecture and components
- [Development Workflow](development.md) - Testing and contributing
- [Decision Log](decisionLog.md) - Technical decisions including hardening rationale
