# Development and Release Guide

## Version Bumping

This project uses [npm version](https://docs.npmjs.com/cli/v10/commands/npm-version) to manage version releases.

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
   - Create an npm tarball via `npm pack`
   - Upload binaries and tarball to the GitHub Release (as a pre-release)
   - Smoke-test the tarball on all platforms

3. **Review the pre-release** on GitHub:
   - Check that CI passed (build, test, and smoke tests)
   - Inspect the tarball contents if needed
   - Edit the release notes if desired

4. **Publish to npm** — trigger the `Publish to npm` workflow manually:
   - Go to **Actions → Publish to npm → Run workflow**
   - Enter the tag (e.g., `v6.4.0`)
   - Optionally enter an npm dist-tag (e.g., `next`, `beta`) — leave empty for `latest`
   - Click **Run workflow**

   The workflow will:
   - Download the tarball from the GitHub Release
   - Publish it to npm (using trusted publishing / OIDC)
   - Mark the GitHub Release as a full release (not pre-release)

### Version format

- Versions follow [SemVer](https://semver.org/) format
- Tags should be prefixed with `v`, e.g., `v6.0.2`
- The version in `package.json` must match the Git tag version

## Release process

When you push a tag (e.g., `v6.0.2`), the CI workflow will:

1. Build prebuilt binaries for:
   - macOS (x64, arm64)
   - Linux glibc (x64, arm64)
   - Linux musl (x64, arm64)
   - Windows (x64)

2. Upload binaries and npm tarball to GitHub Release (as pre-release)

3. Smoke-test the npm tarball on all platforms

Publishing to npm is a **separate manual step** — trigger the `Publish to npm` workflow after reviewing the pre-release.

On PRs and pushes to main (non-tag), the CI also creates an npm tarball artifact (via `npm pack`) so the package contents can be inspected before publishing.

## Checking the release

After releasing, you can verify:
- GitHub Release with binaries: https://github.com/gms1/node-sqlite3/releases
- npm package: https://www.npmjs.com/package/@homeofthings/sqlite3

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