#!/usr/bin/env bash
#
# maintenance.sh — Check for SQLite bumps and dependency upgrades, then apply them
#
# Usage: maintenance.sh [OPTIONS]
#
# Options:
#   --dry-run            Show what would be done without making changes
#   --no-push            Commit but do not push to remote
#   --skip-sqlite        Skip SQLite version check
#   --skip-deps          Skip dependency upgrade check
#   --force-sqlite       Pass --force to bump-sqlite.sh (skip cooldown)
#   -h, --help           Show this help message
#
set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly SEMVER_CHECK_SCRIPT="${PROJECT_ROOT}/tools/semver-check.js"
readonly BUMP_SQLITE_SCRIPT="${PROJECT_ROOT}/tools/bin/bump-sqlite.sh"
readonly GYPI_FILE="${PROJECT_ROOT}/deps/common-sqlite.gypi"
readonly SQLITE_DOWNLOAD_URL="https://sqlite.org/download.html"
readonly SQLITE_CHANGES_URL="https://sqlite.org/changes.html"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_DIRTY_TREE=2
readonly EXIT_SEMVER_FAIL=10
readonly EXIT_BUILD_FAIL=7
readonly EXIT_LINT_FAIL=8
readonly EXIT_TEST_FAIL=9

# ─── Defaults ─────────────────────────────────────────────────────────────────

DRY_RUN=false
NO_PUSH=false
SKIP_SQLITE=false
SKIP_DEPS=false
FORCE_SQLITE=false

# ─── Helper Functions ────────────────────────────────────────────────────────

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Check for available SQLite bumps and dependency upgrades, then apply them.

The script will:
  1. Check if a newer SQLite version is available (with cooldown)
  2. Check if npm dependencies have upgrades available
  3. Create a feature branch and apply upgrades
  4. Run semver check, rebuild, lint, and test

Options:
  --dry-run            Show what would be done without making changes
  --no-push            Commit but do not push to remote
  --skip-sqlite        Skip SQLite version check
  --skip-deps          Skip dependency upgrade check
  --force-sqlite       Pass --force to bump-sqlite.sh (skip cooldown)
  -h, --help           Show this help message

Examples:
  $(basename "$0")                      # Check and apply all upgrades
  $(basename "$0") --dry-run            # Preview what would be done
  $(basename "$0") --skip-sqlite        # Only upgrade dependencies
  $(basename "$0") --skip-deps          # Only bump SQLite

Exit Codes:
  0  Success
  1  General error
  2  Dirty working tree
  7  Build failure
  8  Lint failure
  9  Test failure
  10 Semver check failure
EOF
}

log() {
    echo "[maintenance] $*"
}

log_step() {
    echo ""
    echo "━━━ Step $1: $2 ━━━"
}

log_dry() {
    echo "[DRY-RUN] $*"
}

# Convert SQLite numeric version to human-readable format
numeric_to_human() {
    local ver="$1"
    local major=$((ver / 1000000))
    local minor=$(( (ver % 1000000) / 10000 ))
    local patch=$(( (ver % 10000) / 100 ))
    printf "%d.%d.%d" "$major" "$minor" "$patch"
}

# Read the current SQLite version from deps/common-sqlite.gypi
read_current_sqlite_version() {
    grep "sqlite_version%" "$GYPI_FILE" | grep -oE '[0-9]+' | head -1
}

# Detect the latest available SQLite version from sqlite.org
detect_latest_sqlite_version() {
    log "Fetching SQLite download page to detect latest version..." >&2
    local download_html
    download_html="$(curl -sL "$SQLITE_DOWNLOAD_URL" 2>/dev/null || true)"

    if [[ -z "$download_html" ]]; then
        echo "ERROR: Could not fetch SQLite download page to detect latest version" >&2
        return 1
    fi

    local latest_version
    latest_version="$(echo "$download_html" | \
        grep -oP 'sqlite-amalgamation-\K3\d{6}' | \
        sort -n | \
        tail -1 || true)"

    if [[ -z "$latest_version" ]]; then
        echo "ERROR: Could not parse latest SQLite version from download page" >&2
        return 1
    fi

    echo "$latest_version"
}

# ─── Argument Parsing ────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-push)
                NO_PUSH=true
                shift
                ;;
            --skip-sqlite)
                SKIP_SQLITE=true
                shift
                ;;
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --force-sqlite)
                FORCE_SQLITE=true
                shift
                ;;
            -h|--help)
                usage
                exit "$EXIT_SUCCESS"
                ;;
            -*)
                echo "ERROR: Unknown option: $1" >&2
                usage >&2
                exit "$EXIT_GENERAL_ERROR"
                ;;
            *)
                echo "ERROR: Unexpected argument: $1" >&2
                usage >&2
                exit "$EXIT_GENERAL_ERROR"
                ;;
        esac
    done
}

# ─── Step Implementations ────────────────────────────────────────────────────

step1_check_clean_tree() {
    log_step "1" "Check if source tree is clean"

    if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        echo "ERROR: Source tree has uncommitted changes. Please commit or stash first." >&2
        if [[ "$DRY_RUN" == true ]]; then
            log_dry "Would exit with ${EXIT_DIRTY_TREE}"
        else
            exit "$EXIT_DIRTY_TREE"
        fi
    fi

    local untracked
    untracked="$(git ls-files --others --exclude-standard 2>/dev/null || true)"
    if [[ -n "$untracked" ]]; then
        log "WARNING: There are untracked files in the working tree:"
        echo "$untracked" | head -5 | sed 's/^/  /'
    fi

    log "Source tree is clean"
}

step2_check_sqlite() {
    log_step "2" "Check for new SQLite version"

    if [[ "$SKIP_SQLITE" == true ]]; then
        log "SQLite check skipped (--skip-sqlite)"
        return 0
    fi

    local current_version
    current_version="$(read_current_sqlite_version)"
    local current_human
    current_human="$(numeric_to_human "$current_version")"

    local latest_version
    if ! latest_version="$(detect_latest_sqlite_version)"; then
        log "WARNING: Could not detect latest SQLite version. Skipping SQLite check."
        return 0
    fi
    local latest_human
    latest_human="$(numeric_to_human "$latest_version")"

    log "Current SQLite version: ${current_version} (${current_human})"
    log "Latest SQLite version:   ${latest_version} (${latest_human})"

    if [[ "$latest_version" -gt "$current_version" ]]; then
        log "New SQLite version available: ${current_human} → ${latest_human}"

        if [[ "$DRY_RUN" == true ]]; then
            log_dry "Would run: ${BUMP_SQLITE_SCRIPT} ${latest_version}"
            if [[ "$FORCE_SQLITE" == true ]]; then
                log_dry "  with --force flag"
            fi
            if [[ "$NO_PUSH" == true ]]; then
                log_dry "  with --no-push flag"
            fi
            return 0
        fi

        local bump_args=()
        if [[ "$FORCE_SQLITE" == true ]]; then
            bump_args+=(--force)
        fi
        if [[ "$NO_PUSH" == true ]]; then
            bump_args+=(--no-push)
        fi
        bump_args+=("$latest_version")

        log "Running bump-sqlite.sh ${bump_args[*]}"
        if ! "${BUMP_SQLITE_SCRIPT}" "${bump_args[@]}"; then
            echo "ERROR: SQLite bump failed." >&2
            exit "$EXIT_GENERAL_ERROR"
        fi

        log "SQLite bump completed. Exiting — dependency upgrade should be run separately."
        exit "$EXIT_SUCCESS"
    else
        log "SQLite is up to date (${current_human})"
    fi
}

step3_check_deps() {
    log_step "3" "Check for dependency upgrades"

    if [[ "$SKIP_DEPS" == true ]]; then
        log "Dependency check skipped (--skip-deps)"
        return 1
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would check for outdated dependencies via yarn outdated"
    else
        log "Checking for outdated dependencies..."
        local outdated
        outdated="$(cd "$PROJECT_ROOT" && yarn outdated --format=json 2>/dev/null || true)"

        if [[ -z "$outdated" ]] || [[ "$outdated" == "{}" ]]; then
            log "All dependencies are up to date"
            return 1
        fi

        # Show what's outdated
        log "Outdated dependencies found:"
        echo "$outdated" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for pkg, info in data.items():
        current = info.get('current', '?')
        wanted = info.get('wanted', '?')
        latest = info.get('latest', '?')
        print(f'  {pkg}: {current} → {wanted} (latest: {latest})')
except Exception:
    pass
" 2>/dev/null || log "(Could not parse yarn outdated output)"
    fi

    return 0
}

step4_ensure_branch() {
    log_step "4" "Ensure feature branch for dependency upgrades"

    local current_branch
    current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

    # If already on a feature branch, reuse it
    if [[ -n "$current_branch" && "$current_branch" == feature/* ]]; then
        log "Already on feature branch: ${current_branch} — reusing it"
        return
    fi

    # If on main or another non-feature branch, create a new one
    local timestamp
    timestamp="$(date +%Y%m%d)"
    local branch_name="feature/deps_upgrade_${timestamp}"

    log "Creating branch: ${branch_name}"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: git checkout -b ${branch_name}"
        return
    fi

    git checkout -b "$branch_name"
}

step5_upgrade_deps() {
    log_step "5" "Upgrade dependencies"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: yarn upgrade"
        return
    fi

    log "Upgrading dependencies..."
    cd "$PROJECT_ROOT"
    yarn upgrade

    log "Dependencies upgraded"
}

step6_semver_check() {
    log_step "6" "Run semver check"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: node ${SEMVER_CHECK_SCRIPT}"
        return
    fi

    log "Checking dependency Node.js version compatibility..."
    if ! node "${SEMVER_CHECK_SCRIPT}"; then
        echo "" >&2
        echo "ERROR: Semver check failed. Dependency Node.js version requirements exceed the minimum supported version." >&2
        echo "       To fix this, update:" >&2
        echo "         - supportedVersions in tools/semver-check.js" >&2
        echo "         - engines.node in package.json" >&2
        echo "         - Version references in README.md, docs/DEVELOP.md, and memory-bank/" >&2
        echo "" >&2
        echo "       Then re-run this script or manually continue with:" >&2
        echo "         yarn rebuild && yarn lint --fix && yarn test" >&2
        exit "$EXIT_SEMVER_FAIL"
    fi

    log "Semver check passed"
}

step7_rebuild() {
    log_step "7" "Rebuild (yarn rebuild)"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: yarn rebuild"
        return
    fi

    log "Rebuilding..."
    cd "$PROJECT_ROOT"
    if ! yarn rebuild; then
        echo "ERROR: Build failed." >&2
        exit "$EXIT_BUILD_FAIL"
    fi

    log "Build succeeded"
}

step8_lint() {
    log_step "8" "Lint (yarn lint --fix)"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: yarn lint --fix"
        return
    fi

    log "Running lint with auto-fix..."
    cd "$PROJECT_ROOT"
    if ! yarn lint --fix; then
        echo "ERROR: Lint failed." >&2
        exit "$EXIT_LINT_FAIL"
    fi

    log "Lint passed"
}

step9_test() {
    log_step "9" "Run tests (yarn test)"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: yarn test"
        return
    fi

    log "Running tests..."
    cd "$PROJECT_ROOT"
    if ! yarn test; then
        echo "ERROR: Tests failed." >&2
        exit "$EXIT_TEST_FAIL"
    fi

    log "Tests passed"
}

step10_commit() {
    log_step "10" "Commit changes"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would stage and commit dependency upgrades"
        return
    fi

    cd "$PROJECT_ROOT"

    # Check if there are any changes to commit
    if git diff --quiet HEAD 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
        log "No changes to commit — dependencies were already up to date"
        return
    fi

    local commit_msg="Upgraded dependencies"

    git add -A
    git commit -m "$commit_msg"

    log "Committed: ${commit_msg}"
}

step11_push() {
    log_step "11" "Push to remote"

    if [[ "$NO_PUSH" == true ]]; then
        log "Push skipped (--no-push)"
        return
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: git push origin HEAD"
        return
    fi

    cd "$PROJECT_ROOT"
    git push -u origin HEAD

    log "Pushed to remote"
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          Dependency Maintenance Script                      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    parse_args "$@"

    # Step 1: Check if source tree is clean
    step1_check_clean_tree

    # Step 2: Check for new SQLite version
    # If a new SQLite version is available, bump-sqlite.sh handles everything
    # (including creating a branch, building, testing, and pushing),
    # so we exit after it runs.
    local sqlite_bumped=false
    if [[ "$SKIP_SQLITE" != true ]]; then
        # step2_check_sqlite may exit the script if a bump was performed
        step2_check_sqlite
    fi

    # Step 3: Check for dependency upgrades
    local has_upgrades=true
    if ! step3_check_deps; then
        has_upgrades=false
    fi

    if [[ "$has_upgrades" == false ]]; then
        echo ""
        echo "╔══════════════════════════════════════════════════════════════╗"
        echo "║          No upgrades needed. Everything is up to date!     ║"
        echo "╚══════════════════════════════════════════════════════════════╝"
        exit "$EXIT_SUCCESS"
    fi

    # Steps 4-11: Ensure branch, upgrade, verify, commit, push
    step4_ensure_branch
    step5_upgrade_deps
    step6_semver_check
    step7_rebuild
    step8_lint
    step9_test
    step10_commit
    step11_push

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          Dependency upgrade completed successfully!          ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
}

main "$@"
