# gms1/node-sqlite3

**Note:** This repository is forked from [TryGhost/node-sqlite3](https://github.com/TryGhost/node-sqlite3) which was marked as deprecated/unmaintained.

**Note:** Fortunately, there is already another well maintained fork: [AppThreat/node-sqlite3](https://github.com/AppThreat/node-sqlite3). Unfortunately, this fork didn't appear in the list of forks of TryGhost/node-sqlite3, which is why I created this fork here.

**So you have the choice**

---
Asynchronous, non-blocking [SQLite3](https://sqlite.org/) bindings for [Node.js](http://nodejs.org/).

[![npm version](https://badge.fury.io/js/%40homeofthings%2Fsqlite3.svg)](https://badge.fury.io/js/%40homeofthings%2Fsqlite3)
![NPM Downloads](https://img.shields.io/npm/dm/%40homeofthings%2Fsqlite3)
[![Build Status](https://github.com/gms1/node-sqlite3/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gms1/node-sqlite3/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/gms1/node-sqlite3/branch/main/graph/badge.svg?token=6H0X94BL3X)](https://codecov.io/gh/gms1/node-sqlite3)
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bhttps%3A%2F%2Fgithub.com%2Fmapbox%2Fnode-sqlite3.svg?type=shield)](https://app.fossa.io/projects/git%2Bhttps%3A%2F%2Fgithub.com%2Fmapbox%2Fnode-sqlite3?ref=badge_shield)
![Node-API v9 Badge](https://raw.githubusercontent.com/nodejs/abi-stable-node/doc/assets/Node-API%20v9%20Badge.svg)

# Features

 - Bundles SQLite v3.53.0, or you can build using a local SQLite (or SqlCipher,...)
 - Straightforward query and parameter binding interface
 - Full Buffer/Blob support
 - Extensive debugging support via [verbose mode](docs/API.md#verbose-mode)
 - [Query serialization](docs/API.md#databaseserialize) API
 - [Extension support](docs/API.md#databaseloadextension), including bundled support for the [json1 extension](https://www.sqlite.org/json1.html)
 - Big test suite
 - Written in modern C++
 - Is built using hardening flags
 - Promise-based API
 - supports ESM and CJS

# Installing

You can use [`npm`](https://github.com/npm/cli) or [`yarn`](https://github.com/yarnpkg/yarn) to install `@homeofthings/sqlite3`:

* (recommended) Latest published package:
```bash
npm install @homeofthings/sqlite3
# or
yarn add @homeofthings/sqlite3
```

### Prebuilt binaries

`@homeofthings/sqlite3` uses [Node-API](https://nodejs.org/api/n-api.html) so prebuilt binaries do not need to be built for specific Node versions. Prebuilt binaries are built as NAPI-version-agnostic (`@homeofthings+sqlite3.*.node`) using the `--napi` flag, and work on any Node.js version that supports the NAPI version used at compile time. Requires Node.js v20.17.0 or later.

Prebuilt binaries are bundled inside the npm package using [`prebuildify`](https://github.com/prebuild/prebuildify) and loaded at runtime by [`node-gyp-build`](https://github.com/prebuild/node-gyp-build). No separate download step is needed — `npm install` just works. The following targets are currently provided:

* `darwin-arm64`
* `darwin-x64`
* `linux-arm64` (glibc)
* `linux-x64` (glibc)
* `linux-arm64` (musl)
* `linux-x64` (musl)
* `win32-x64`

Support for other platforms and architectures may be added in the future if CI supports building on them.

If your platform isn't supported, `node-gyp-build` automatically falls back to building from source using `node-gyp`. 

### Other ways to install

It is also possible to make your own build of `sqlite3` from its source instead of its npm package ([See below.](#source-install)).

The `sqlite3` module also works with [node-webkit](https://github.com/rogerwang/node-webkit) if node-webkit contains a supported version of Node.js engine. [(See below.)](#building-for-node-webkit)

SQLite's [SQLCipher extension](https://github.com/sqlcipher/sqlcipher) is also supported. [(See below.)](#building-for-sqlcipher)

# API

See the [API documentation](docs/API.md) for detailed documentation of both the callback-based and Promise-based APIs.

## Quick Example

### Callback-based API (Traditional)

```js
const sqlite3 = require('@homeofthings/sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run("CREATE TABLE lorem (info TEXT)");
    db.run("INSERT INTO lorem VALUES (?)", ['test']);
    db.each("SELECT * FROM lorem", (err, row) => {
        console.log(row);
    });
});

db.close();
```

### Promise-based API (Modern)

```js
const { SqliteDatabase } = require('@homeofthings/sqlite3');

async function main() {
    const db = await SqliteDatabase.open(':memory:');
    
    await db.run("CREATE TABLE lorem (info TEXT)");
    await db.run("INSERT INTO lorem VALUES (?)", ['test']);
    
    const rows = await db.all("SELECT * FROM lorem");
    console.log(rows);
    
    await db.close();
}

main().catch(console.error);
```

## ESM and CJS Support

This package supports both CommonJS (CJS) and ECMAScript Modules (ESM):

### CJS (CommonJS)

```js
// Default import
const sqlite3 = require('@homeofthings/sqlite3');

// Destructured import
const { Database, SqliteDatabase } = require('@homeofthings/sqlite3');

// Promise subpath import
const { SqliteDatabase } = require('@homeofthings/sqlite3/promise');
```

### ESM (ECMAScript Modules)

```js
// Default import
import sqlite3 from '@homeofthings/sqlite3';

// Named imports
import { Database, OPEN_CREATE, SqliteDatabase } from '@homeofthings/sqlite3';

// Promise subpath import
import { SqliteDatabase } from '@homeofthings/sqlite3/promise';
```


# Usage

**Note:** the module must be [installed](#installing) before use.

``` js
const sqlite3 = require('@homeofthings/sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run("CREATE TABLE lorem (info TEXT)");

    const stmt = db.prepare("INSERT INTO lorem VALUES (?)");
    for (let i = 0; i < 10; i++) {
        stmt.run("Ipsum " + i);
    }
    stmt.finalize();

    db.each("SELECT rowid AS id, info FROM lorem", (err, row) => {
        console.log(row.id + ": " + row.info);
    });
});

db.close();
```

## Source install

To build from source, use

```bash
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --sqlite=/usr/local
```

If building against an external sqlite3 make sure to have the development headers available. Mac OS X ships with these by default. If you don't have them installed, install the `-dev` package with your package manager, e.g. `apt-get install libsqlite3-dev` for Debian/Ubuntu. Make sure that you have at least `libsqlite3` >= 3.6.

Note, if building against homebrew-installed sqlite on OS X you can do:

```bash
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --sqlite=/usr/local/opt/sqlite/
```

## Custom file header (magic)

The default sqlite file header is "SQLite format 3". You can specify a different magic, though this will make standard tools and libraries unable to work with your files.

```bash
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --sqlite_magic="MyCustomMagic15"
```

Note that the magic *must* be exactly 15 characters long (16 bytes including null terminator).

## Building for node-webkit

Because of ABI differences, `sqlite3` must be built in a custom to be used with [node-webkit](https://github.com/rogerwang/node-webkit).

To build `sqlite3` for node-webkit:

1. Install [`nw-gyp`](https://github.com/rogerwang/nw-gyp) globally: `npm install nw-gyp -g` *(unless already installed)*

2. Build the module with the custom flags of `--runtime`, `--target_arch`, and `--target`:

```bash
NODE_WEBKIT_VERSION="0.8.6" # see latest version at https://github.com/rogerwang/node-webkit#downloads
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --runtime=node-webkit --target_arch=ia32 --target=$(NODE_WEBKIT_VERSION)
```

You can also run this command from within a `@homeofthings/sqlite3` checkout:

```bash
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --runtime=node-webkit --target_arch=ia32 --target=$(NODE_WEBKIT_VERSION)
```

Remember the following:

* You must provide the right `--target_arch` flag. `ia32` is needed to target 32bit node-webkit builds, while `x64` will target 64bit node-webkit builds (if available for your platform).

* After the `sqlite3` package is built for node-webkit it cannot run in the vanilla Node.js (and vice versa).
   * For example, `npm test` of the node-webkit's package would fail.

Visit the “[Using Node modules](https://github.com/rogerwang/node-webkit/wiki/Using-Node-modules)” article in the node-webkit's wiki for more details.

## Building for SQLCipher

For instructions on building SQLCipher, see [Building SQLCipher for Node.js](https://coolaj86.com/articles/building-sqlcipher-for-node-js-on-raspberry-pi-2/). Alternatively, you can install it with your local package manager.

To run against SQLCipher, you need to compile `sqlite3` from source by passing build options like:

```bash
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --sqlite_libname=sqlcipher --sqlite=/usr/

node -e 'require("@homeofthings/sqlite3")'
```

If your SQLCipher is installed in a custom location (if you compiled and installed it yourself), you'll need to set some environment variables:

### On OS X with Homebrew

Set the location where `brew` installed it:

```bash
export LDFLAGS="-L`brew --prefix`/opt/sqlcipher/lib"
export CPPFLAGS="-I`brew --prefix`/opt/sqlcipher/include/sqlcipher"
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --sqlite_libname=sqlcipher --sqlite=`brew --prefix`

node -e 'require("@homeofthings/sqlite3")'
```

### On most Linuxes (including Raspberry Pi)

Set the location where `make` installed it:

```bash
export LDFLAGS="-L/usr/local/lib"
export CPPFLAGS="-I/usr/local/include -I/usr/local/include/sqlcipher"
export CXXFLAGS="$CPPFLAGS"
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --sqlite_libname=sqlcipher --sqlite=/usr/local --verbose

node -e 'require("@homeofthings/sqlite3")'
```

### Custom builds and Electron

Running `sqlite3` through [electron-rebuild](https://github.com/electron/electron-rebuild) does not preserve the SQLCipher extension, so some additional flags are needed to make this build Electron compatible. So your command needs these additional flags (be sure to replace the target version with the current Electron version you are working with):

```bash
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --runtime=electron --target=18.2.1 --dist-url=https://electronjs.org/headers
```

In the case of MacOS with Homebrew, the command should look like the following:

```bash
cd node_modules/@homeofthings/sqlite3
npx node-gyp rebuild --sqlite_libname=sqlcipher --sqlite=`brew --prefix` --runtime=electron --target=18.2.1 --dist-url=https://electronjs.org/headers
```

# Testing

```bash
npm test
```

# Benchmarks

## Driver Comparison

The `tools/benchmark-drivers` directory contains a comprehensive benchmark suite comparing different SQLite drivers for Node.js:

```bash
cd tools/benchmark-drivers
npm install
node index.js
```

This compares `@homeofthings/sqlite3` against other popular SQLite drivers:
- `better-sqlite3` - Synchronous, high-performance
- `node:sqlite` - Built-in Node.js SQLite (v22.6.0+)

See [tools/benchmark-drivers/README.md](tools/benchmark-drivers/README.md) for details.

**Key insight**: Async drivers like `@homeofthings/sqlite3` show lower raw throughput but provide better event loop availability, allowing other operations to proceed concurrently. Sync drivers block the event loop completely.

## Internal Benchmarks

Internal performance benchmarks are available in `tools/benchmark-internal`:

```bash
node tools/benchmark-internal/run.js
```

# Contributors

* [Daniel Lockyer](https://github.com/daniellockyer)
* [Konstantin Käfer](https://github.com/kkaefer)
* [Dane Springmeyer](https://github.com/springmeyer)
* [Will White](https://github.com/willwhite)
* [Orlando Vazquez](https://github.com/orlandov)
* [Artem Kustikov](https://github.com/artiz)
* [Eric Fredricksen](https://github.com/grumdrig)
* [John Wright](https://github.com/mrjjwright)
* [Ryan Dahl](https://github.com/ry)
* [Tom MacWright](https://github.com/tmcw)
* [Carter Thaxton](https://github.com/carter-thaxton)
* [Audrius Kažukauskas](https://github.com/audriusk)
* [Johannes Schauer](https://github.com/pyneo)
* [Mithgol](https://github.com/Mithgol)
* [Kewde](https://github.com/kewde)

# Acknowledgments

Thanks to [Orlando Vazquez](https://github.com/orlandov),
[Eric Fredricksen](https://github.com/grumdrig) and
[Ryan Dahl](https://github.com/ry) for their SQLite bindings for node, and to mraleph on Freenode's #v8 for answering questions.

This module was originally created by [Mapbox](https://mapbox.com/), then it was taken over by [Ghost](https://ghost.org), but was then deprecated without prior notice, so that the original is no longer maintained. See [TryGhost/node-sqlite3](https://github.com/TryGhost/node-sqlite3)

# Changelog

We use [GitHub releases](https://github.com/gms1/node-sqlite3/releases) for notes on the latest versions. See [CHANGELOG.md](https://github.com/gms1/node-sqlite3/blob/main/CHANGELOG.md) in git history for details on older versions.

# Copyright & license

Copyright (c) 2013-2026 Mapbox & Ghost Foundation

`node-sqlite3` is [BSD licensed](https://github.com/gms1/node-sqlite3/raw/main/LICENSE).

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bhttps%3A%2F%2Fgithub.com%2Fmapbox%2Fnode-sqlite3.svg?type=large)](https://app.fossa.io/projects/git%2Bhttps%3A%2F%2Fgithub.com%2Fmapbox%2Fnode-sqlite3?ref=badge_large)
