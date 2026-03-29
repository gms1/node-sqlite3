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
- Compiles SQLite from source tarball
- Enables FTS3/4/5, R-Tree, math functions
- Thread-safe configuration

## Build Commands

### Standard Build

```bash
# Install with prebuild or compile
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
- For prebuilds, the `prebuild` package passes it via `--napi_build_version=<version>` flag

**Prebuilt binaries**: Available for NAPI versions 3 and 6 (see `package.json` `binary.napi_versions`).

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
module.exports = require('bindings')('node_sqlite3.node');
```

The `bindings` package searches:
1. `build/Debug/node_sqlite3.node`
2. `build/Release/node_sqlite3.node`

**Note**: Debug builds take precedence if both exist.

## Prebuilt Binaries

### Downloading Prebuilts

```bash
yarn install  # Automatically downloads prebuilt if available
```

### Building Prebuilts

```bash
yarn prebuild  # Build for all NAPI versions
```

### Uploading Prebuilts

```bash
yarn upload  # Upload to GitHub releases
```

## Platform Support

- Node.js >= 20.17.0
- NAPI versions: 3, 6
- Platforms: Linux, macOS, Windows (see prebuild configuration)

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

## Troubleshooting

### Build Fails

1. Check Node.js version: `node --version` (must be >= 20.17.0)
2. Check node-gyp version: `node-gyp --version`
3. Try clean rebuild: `node-gyp clean && node-gyp rebuild`
4. Check Python version (node-gyp requires Python 3)

### Native Module Not Found

1. Verify build output exists: `ls build/Release/node_sqlite3.node`
2. Check if bindings package is installed: `yarn install`
3. Try explicit rebuild: `yarn rebuild`

### Debug Symbols Missing

1. Build with `--debug` flag: `node-gyp rebuild --debug`
2. Verify output location: `build/Debug/node_sqlite3.node`

## Related Files

- [Project Overview](project-overview.md) - Architecture and components
- [Development Workflow](development.md) - Testing and contributing
- [Decision Log](decisionLog.md) - Technical decisions including hardening rationale
