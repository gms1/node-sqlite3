# Development and Release Guide

## PRs and pushes to main

On PRs and pushes to main (non-tag), the CI also creates an npm tarball artifact (via `npm pack`) so the package contents can be inspected.
This package contains the prebuilt binaries for these platforms:
  - macOS (x64, arm64)
  - Linux glibc (x64, arm64)
  - Windows (x64)

## Version Bumping

This project uses [npm version](https://docs.npmjs.com/cli/v10/commands/npm-version) to manage version releases.

### Version format

- Versions follow [SemVer](https://semver.org/) format
- Tags should be prefixed with `v`, e.g., `v6.0.2`
- The version in `package.json` must match the Git tag version

### How to release a new version

1. **Bump the version** (this will create a Git tag automatically):
   ```bash
   npm version <major|minor|patch>
   ```

   For example:
   ```bash
   npm version patch
   ```

2. **Push the changes and tags**:
   ```bash
   git push origin main --tags
   ```

   The CI workflow will automatically:
   - Build prebuilt binaries for all platforms
    - macOS (x64, arm64)
    - Linux glibc (x64, arm64)
    - Linux musl (x64, arm64)
    - Windows (x64)

   - Create an npm tarball via `npm pack`
   - Upload binaries and tarball to the GitHub Release (as a pre-release)
   - Smoke-test the tarball on all platforms

3. **Review the pre-release** on GitHub:
   - Check that CI passed (build, test, and smoke tests)
   - Inspect the tarball contents if needed
   - Edit the release notes if desired
     use "Save as draft", do not use "Publish release" button

4. **Publish to npm** — trigger the `Publish to npm` workflow manually:
   - Go to **Actions → Publish to npm → Run workflow**
   - Enter the tag (e.g., `v6.4.0`)
   - Optionally enter an npm dist-tag (e.g., `next`, `beta`) — leave empty for `latest`
   - Click **Run workflow**

   The workflow will:
   - Download the tarball from the GitHub Release
   - Publish it to npm (using trusted publishing / OIDC)
   - Mark the GitHub Release as a full release (not pre-release)

### Checking the release

After releasing, you can verify:
- GitHub Release with binaries: https://github.com/gms1/node-sqlite3/releases
- npm package: https://www.npmjs.com/package/@homeofthings/sqlite3

## Maintenance Workflow

The [`tools/bin/maintenance.sh`](../tools/bin/maintenance.sh) script automates the full maintenance cycle: upgrading dependencies, creating a PR, merging, and releasing.

```bash
# Run the full maintenance cycle
tools/bin/maintenance.sh

# Preview what would be done
tools/bin/maintenance.sh --dry-run

# Skip creating a PR (just upgrade and commit locally)
tools/bin/maintenance.sh --no-pr

# Don't push to remote
tools/bin/maintenance.sh --no-push

# Skip the release step after merging
tools/bin/maintenance.sh --no-release
```

The script performs these steps:

1. **Upgrade** dependencies and SQLite via [`upgrade-deps.sh`](../tools/bin/upgrade-deps.sh)
2. **Create** a pull request with the upgrade changes
3. **Wait** for CI checks to pass, then **merge** the PR
4. **Release** — if the PR contains a SQLite bump or unpublished security fix, bump the patch version, push tags, and trigger npm publish

> **Note:** Step 1 delegates to [`upgrade-deps.sh`](../tools/bin/upgrade-deps.sh), which itself delegates SQLite bumps to [`upgrade-sqlite.sh`](../tools/bin/upgrade-sqlite.sh).

### Upgrade Dependencies: `upgrade-deps.sh`

The [`tools/bin/upgrade-deps.sh`](../tools/bin/upgrade-deps.sh) script checks for SQLite bumps and dependency upgrades, then applies them:

```bash
# Check for SQLite bumps and dependency upgrades, then apply them
tools/bin/upgrade-deps.sh

# Preview what would be done
tools/bin/upgrade-deps.sh --dry-run

# Only upgrade dependencies (skip SQLite check)
tools/bin/upgrade-deps.sh --skip-sqlite

# Only check SQLite (skip dependency upgrades)
tools/bin/upgrade-deps.sh --skip-deps

# Skip cooldown period for SQLite bumps
tools/bin/upgrade-deps.sh --force-sqlite

# Don't push to remote
tools/bin/upgrade-deps.sh --no-push
```

The script performs these steps:

1. **Check** if the source tree is clean
2. **Check** for a new SQLite version — if available, delegates to [`upgrade-sqlite.sh`](../tools/bin/upgrade-sqlite.sh) which handles the full bump process (including build, lint, test, commit, and push)
3. **Check** for outdated npm dependencies via `yarn outdated`
4. **Ensure** a feature branch — if already on a `feature/*` branch (e.g., after a SQLite bump), reuses it; otherwise creates `feature/deps_upgrade_YYYYMMDD`
5. **Upgrade** dependencies via `npx npm-check-updates -u && yarn install` (main project and `tools/benchmark-drivers/` sub-project)
6. **Run semver check** (`node tools/semver-check.js`) to verify dependency Node.js version compatibility
7. **Rebuild** (`yarn rebuild`) to verify compilation
8. **Lint** (`yarn lint --fix`) to ensure code quality
9. **Test** (`yarn test`) to verify functionality
10. **Commit** and **push** the dependency upgrades

> **Note:** If you are already on a `feature/*` branch (e.g., left after a SQLite bump), the script will reuse it for the dependency upgrade commit rather than creating a new one.

## How to Bump SQLite

The project bundles SQLite as an amalgamation zip file in `deps/`. To upgrade to a newer SQLite version, use the automated script or follow the manual steps below.

### Automated: `upgrade-sqlite.sh`

The [`tools/bin/upgrade-sqlite.sh`](../tools/bin/upgrade-sqlite.sh) script automates the entire process:

```bash
# Auto-detect the latest SQLite version and bump (with 7-day cooldown)
tools/bin/upgrade-sqlite.sh

# Specify a version explicitly
tools/bin/upgrade-sqlite.sh 3510400

# Dry-run to preview changes
tools/bin/upgrade-sqlite.sh --dry-run

# Skip cooldown check
tools/bin/upgrade-sqlite.sh --force 3510400
```

The script performs these steps:

1. **Validate** the target version (numeric format, e.g., `3530300` for SQLite 3.53.3)
2. **Check** the source tree is clean (no uncommitted changes)
3. **Compare** the target version against the current version in `deps/common-sqlite.gypi`
4. **Enforce a cooldown** period (default: 7 days since the SQLite release) to allow the community to discover critical bugs
5. **Create** a feature branch (`feature/bump_sqlite_X.Y.Z_W.A.B`)
6. **Download** the new amalgamation zip from sqlite.org and verify its checksum
7. **Update** `deps/common-sqlite.gypi` — change `sqlite_version%` to the new version
8. **Update** `README.md` — update the bundled SQLite version reference
9. **Build** (`yarn rebuild`) to verify compilation
10. **Lint** (`yarn lint`) to ensure code quality
11. **Test** (`yarn test`) to verify functionality
12. **Commit** and **push** the feature branch

### Manual Steps

If you need to bump SQLite manually:

1. **Download** the amalgamation zip from [sqlite.org/download.html](https://sqlite.org/download.html) and place it in `deps/`
2. **Remove** the old zip from `deps/` and from git tracking:
   ```bash
   git rm deps/sqlite-amalgamation-<OLD_VERSION>.zip
   ```
3. **Update** [`deps/common-sqlite.gypi`](../deps/common-sqlite.gypi) — change `sqlite_version%` to the new numeric version:
   ```
   'sqlite_version%':'3530300',
   ```
4. **Update** [`README.md`](../README.md) — update the "Bundles SQLite v" reference (e.g., `Bundles SQLite v3.53.3`)
5. **Review** [`deps/sqlite3.gyp`](../deps/sqlite3.gyp) — check if any new SQLite compile flags or defines are needed (e.g., new extensions)
6. **Build and test**:
   ```bash
   yarn rebuild
   yarn lint
   yarn test
   ```
7. **Commit** with a message like: `Bumped bundled SQLite from 3.XX.YY to 3.WW.ZZ`

### SQLite Version Number Format

SQLite uses a numeric version format `XYYZZ00` where:
- `X` = major version (always `3`)
- `YY` = minor version (zero-padded, e.g., `53`)
- `ZZ` = patch version (zero-padded, e.g., `03`)

For example, SQLite **3.53.3** → numeric version **3530300**.

### Key Files

| File                             | Purpose                                                                       |
|----------------------------------|-------------------------------------------------------------------------------|
| `deps/common-sqlite.gypi`        | Stores `sqlite_version%` — the single source of truth for the bundled version |
| `deps/sqlite3.gyp`               | Build configuration for SQLite (compile flags, defines, extensions)           |
| `deps/sqlite-amalgamation-*.zip` | The bundled SQLite amalgamation archive                                       |
| `deps/extract.js`                | Used at build time to extract the amalgamation zip                            |
| `tools/bin/upgrade-sqlite.sh`    | Automated SQLite version upgrade script                                        |
| `README.md`                      | Human-readable version reference                                              |

## Upgrading Dependencies

When upgrading any npm dependency (e.g., `node-addon-api`, `node-gyp`, `node-gyp-build`), always verify that the new version's Node.js engine requirements are compatible with the project's declared minimum:

1. **Install the dependency** with the new version:
   ```bash
   yarn add <package>@<version>
   # or for devDependencies:
   yarn add -D <package>@<version>
   ```

2. **Rebuild** native addons to pick up the new dependency:
   ```bash
   yarn rebuild
   ```

3. **Run the semver check** to verify that no dependency requires a higher Node.js version than the project supports:
   ```bash
   node tools/semver-check.js
   ```
   This script checks all `dependencies` and `optionalDependencies` in [`package.json`](../package.json) and reports if any dependency's `engines.node` requirement exceeds the [`supportedVersions`](../tools/semver-check.js) constant.

   If the check **fails**, you need to:
   - Update `supportedVersions` in [`tools/semver-check.js`](../tools/semver-check.js) to match the new minimum
   - Update `engines.node` in [`package.json`](../package.json) to the same version
   - Update version references in [`README.md`](../README.md), [`docs/DEVELOP.md`](DEVELOP.md), and [`memory-bank/`](../memory-bank/) files

4. **Lint and test**:
   ```bash
   yarn lint
   yarn test
   ```

5. **Commit** with a message like: `Upgraded <package> from X.Y.Z to A.B.C`

## Code Quality

**IMPORTANT**: After making any code changes, always run:
```bash
yarn lint --fix
yarn test
```

This ensures:
- Code follows project style guidelines
- No syntax errors are introduced
- All tests pass before committing

### Pre-commit Checklist

Before committing changes:
1. Run `yarn lint --fix` to fix code style issues
2. Run `yarn test` to ensure all tests pass
3. Review changes before pushing
