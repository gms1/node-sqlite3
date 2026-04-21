#!/usr/bin/env bash
#
# bump-sqlite.sh — Create a feature branch for upgrading the bundled SQLite version
#
# Usage: bump-sqlite.sh [OPTIONS] [<new-version>]
#
# Options:
#   --cooldown-days=N   Minimum days since SQLite release before allowing upgrade (default: 7)
#   --dry-run            Show what would be done without making changes
#   --no-push            Commit but do not push to remote
#   --force              Skip cooldown period check
#   -h, --help           Show this help message
#
# Arguments:
#   <new-version>        New SQLite version in numeric format (e.g., 3510400)
#                        If omitted, the latest version is auto-detected from sqlite.org
#
set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly SQLITE_DOWNLOAD_URL="https://sqlite.org/download.html"
readonly SQLITE_CHANGES_URL="https://sqlite.org/changes.html"
readonly GYPI_FILE="${PROJECT_ROOT}/deps/common-sqlite.gypi"
readonly README_FILE="${PROJECT_ROOT}/README.md"
readonly DEPS_DIR="${PROJECT_ROOT}/deps"

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_DIRTY_TREE=2
readonly EXIT_NOT_NEWER=3
readonly EXIT_COOLDOWN=4
readonly EXIT_DOWNLOAD_FAIL=5
readonly EXIT_CHECKSUM_FAIL=6
readonly EXIT_BUILD_FAIL=7
readonly EXIT_LINT_FAIL=8
readonly EXIT_TEST_FAIL=9

# ─── Defaults ─────────────────────────────────────────────────────────────────

COOLDOWN_DAYS=7
DRY_RUN=false
NO_PUSH=false
FORCE=false
NEW_VERSION=""
BRANCH_NAME=""
FROM_VERSION=""

# ─── Helper Functions ────────────────────────────────────────────────────────

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] [<new-version>]

Create a feature branch for upgrading the bundled SQLite version.

If <new-version> is omitted, the script automatically detects the latest
available SQLite version from sqlite.org.

Options:
  --cooldown-days=N   Minimum days since SQLite release before allowing upgrade (default: 7)
  --dry-run            Show what would be done without making changes
  --no-push            Commit but do not push to remote
  --force              Skip cooldown period check
  -h, --help           Show this help message

Arguments:
  <new-version>        New SQLite version in numeric format (e.g., 3510400)
                       If omitted, the latest version is auto-detected from sqlite.org

Examples:
  $(basename "$0")                      # Auto-detect latest version
  $(basename "$0") 3510400              # Specify version explicitly
  $(basename "$0") --dry-run            # Preview with auto-detected version
  $(basename "$0") --cooldown-days=14 --no-push 3510400
  $(basename "$0") --force 3510400

Exit Codes:
  0  Success
  1  General error / validation failure
  2  Dirty working tree
  3  Version not newer
  4  Cooldown period not elapsed
  5  Download failure
  6  Checksum verification failure
  7  Build failure
  8  Lint failure
  9  Test failure
EOF
}

log() {
    echo "[bump-sqlite] $*"
}

log_step() {
    echo ""
    echo "━━━ Step $1: $2 ━━━"
}

log_dry() {
    echo "[DRY-RUN] $*"
}

# Convert SQLite numeric version to human-readable format
# e.g., 3510300 -> 3.51.3
numeric_to_human() {
    local ver="$1"
    local major=$((ver / 1000000))
    local minor=$(( (ver % 1000000) / 10000 ))
    local patch=$(( (ver % 10000) / 100 ))
    printf "%d.%d.%d" "$major" "$minor" "$patch"
}

# Read the current SQLite version from deps/common-sqlite.gypi
read_current_version() {
    grep "sqlite_version%" "$GYPI_FILE" | grep -oE '[0-9]+' | head -1
}

# Detect the latest available SQLite version from sqlite.org
# Parses the download page for the amalgamation zip filename
detect_latest_version() {
    log "Fetching SQLite download page to detect latest version..." >&2
    local download_html
    download_html="$(curl -sL "$SQLITE_DOWNLOAD_URL" 2>/dev/null || true)"

    if [[ -z "$download_html" ]]; then
        echo "ERROR: Could not fetch SQLite download page to detect latest version" >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    # The download page contains lines like:
    #   .../2025/sqlite-amalgamation-3510400.zip
    # Extract the highest version number from amalgamation zip references
    local latest_version
    latest_version="$(echo "$download_html" | \
        grep -oP 'sqlite-amalgamation-\K3\d{6}' | \
        sort -n | \
        tail -1 || true)"

    if [[ -z "$latest_version" ]]; then
        echo "ERROR: Could not parse latest SQLite version from download page" >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    echo "$latest_version"
}

# ─── Argument Parsing ────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --cooldown-days=*)
                COOLDOWN_DAYS="${1#*=}"
                if ! [[ "$COOLDOWN_DAYS" =~ ^[0-9]+$ ]] || [[ "$COOLDOWN_DAYS" -lt 1 ]]; then
                    echo "ERROR: --cooldown-days must be a positive integer" >&2
                    exit "$EXIT_GENERAL_ERROR"
                fi
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --no-push)
                NO_PUSH=true
                shift
                ;;
            --force)
                FORCE=true
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
                if [[ -n "$NEW_VERSION" ]]; then
                    echo "ERROR: Multiple version arguments provided" >&2
                    exit "$EXIT_GENERAL_ERROR"
                fi
                NEW_VERSION="$1"
                shift
                ;;
        esac
    done

    # If no version specified, auto-detect the latest from sqlite.org
    if [[ -z "$NEW_VERSION" ]]; then
        log "No version specified — auto-detecting latest from sqlite.org"
        NEW_VERSION="$(detect_latest_version)"
        local new_human
        new_human="$(numeric_to_human "$NEW_VERSION")"
        log "Latest available version: ${NEW_VERSION} (${new_human})"
    fi

    if ! [[ "$NEW_VERSION" =~ ^3[0-9]{6}$ ]]; then
        echo "ERROR: Invalid SQLite version format: ${NEW_VERSION}" >&2
        echo "       Expected numeric format like 3510400 (3.XX.YY00)" >&2
        exit "$EXIT_GENERAL_ERROR"
    fi
}

# ─── Step Implementations ────────────────────────────────────────────────────

step1_parse_and_validate() {
    log_step "1" "Parse arguments and validate"
    parse_args "$@"

    local new_human
    new_human="$(numeric_to_human "$NEW_VERSION")"

    log "New version: ${NEW_VERSION} (${new_human})"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would validate version ${NEW_VERSION}"
    fi
}

step2_check_clean_tree() {
    log_step "2" "Check if source tree is clean"

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

step3_checkout_main() {
    log_step "3" "Checkout main"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: git checkout main"
        return
    fi

    git checkout main
}

step4_git_fetch() {
    log_step "4" "Git fetch from origin"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: git fetch origin"
        return
    fi

    git fetch origin
}

step5_check_newer_version() {
    log_step "5" "Check if newer version is available"

    FROM_VERSION="$(read_current_version)"
    local current_version="$FROM_VERSION"
    local current_human
    current_human="$(numeric_to_human "$current_version")"
    local new_human
    new_human="$(numeric_to_human "$NEW_VERSION")"

    log "Current version: ${current_version} (${current_human})"
    log "Target version:  ${NEW_VERSION} (${new_human})"

    # Also check what the latest available version is (for informational purposes)
    local latest_version
    latest_version="$(detect_latest_version)"
    local latest_human
    latest_human="$(numeric_to_human "$latest_version")"

    log "Latest available: ${latest_version} (${latest_human})"

    if [[ "$NEW_VERSION" -lt "$latest_version" ]]; then
        log "WARNING: Target version (${new_human}) is not the latest available (${latest_human})"
        log "         Consider upgrading to ${latest_human} instead."
    fi

    if [[ "$NEW_VERSION" -le "$current_version" ]]; then
        if [[ "$current_version" -ge "$latest_version" ]]; then
            log "Already on the latest version (${current_human}). No upgrade needed."
        else
            echo "ERROR: New version (${new_human}) is not newer than current version (${current_human})" >&2
        fi
        exit "$EXIT_NOT_NEWER"
    fi

    log "New version confirmed as newer"
}

step6_cooldown_check() {
    log_step "6" "Cooldown period check (${COOLDOWN_DAYS} days)"

    if [[ "$FORCE" == true ]]; then
        log "Cooldown check skipped (--force)"
        return
    fi

    local new_human
    new_human="$(numeric_to_human "$NEW_VERSION")"

    log "Fetching SQLite release history from ${SQLITE_CHANGES_URL}..."

    local changes_html
    changes_html="$(curl -sL "$SQLITE_CHANGES_URL" 2>/dev/null || true)"

    if [[ -z "$changes_html" ]]; then
        log "WARNING: Could not fetch SQLite changes page. Cannot verify cooldown period."
        log "Use --force to skip this check, or verify manually."
        exit "$EXIT_COOLDOWN"
    fi

    # SQLite changes.html contains entries like:
    # <h3>2025-04-15 (3.51.4)</h3>
    # or
    # <p><b>2025-04-15</b> ... version 3.51.4 ...
    # We try multiple patterns to extract the date

    local release_date=""

    # Pattern 1: <h3>YYYY-MM-DD (X.YY.ZZ)</h3>
    release_date="$(echo "$changes_html" | \
        grep -oP "\d{4}-\d{2}-\d{2}.*?${new_human}" | \
        grep -oP "^\d{4}-\d{2}-\d{2}" | \
        head -1 || true)"

    # Pattern 2: look for version in any heading or paragraph
    if [[ -z "$release_date" ]]; then
        release_date="$(echo "$changes_html" | \
            grep -oP "\d{4}-\d{2}-\d{2}" | \
            head -1 || true)"
    fi

    if [[ -z "$release_date" ]]; then
        log "WARNING: Could not determine release date for SQLite ${new_human}."
        log "Use --force to skip this check, or verify manually."
        exit "$EXIT_COOLDOWN"
    fi

    log "SQLite ${new_human} release date: ${release_date}"

    # Calculate days since release
    local release_epoch current_epoch days_since
    release_epoch="$(date -d "$release_date" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$release_date" +%s 2>/dev/null || true)"
    current_epoch="$(date +%s)"

    if [[ -z "$release_epoch" ]]; then
        log "WARNING: Could not parse release date '${release_date}'."
        log "Use --force to skip this check, or verify manually."
        exit "$EXIT_COOLDOWN"
    fi

    days_since=$(( (current_epoch - release_epoch) / 86400 ))

    log "Days since release: ${days_since} (cooldown: ${COOLDOWN_DAYS} days)"

    if [[ "$days_since" -lt "$COOLDOWN_DAYS" ]]; then
        echo "ERROR: SQLite ${new_human} was released ${days_since} day(s) ago." >&2
        echo "       Cooldown period of ${COOLDOWN_DAYS} days has not elapsed." >&2
        echo "       This cooldown period allows the community to discover critical bugs." >&2
        echo "       Use --force to override, or wait $((COOLDOWN_DAYS - days_since)) more day(s)." >&2
        exit "$EXIT_COOLDOWN"
    fi

    log "Cooldown period satisfied (${days_since} >= ${COOLDOWN_DAYS} days)"
}

step7_pull_origin() {
    log_step "7" "Pull from origin"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: git pull origin main"
        return
    fi

    git pull origin main
}

step8_create_branch() {
    log_step "8" "Create feature branch"

    local from_human
    from_human="$(numeric_to_human "$FROM_VERSION")"
    local to_human
    to_human="$(numeric_to_human "$NEW_VERSION")"

    BRANCH_NAME="feature/bump_sqlite_${from_human}_${to_human}"

    log "Branch name: ${BRANCH_NAME}"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: git checkout -b ${BRANCH_NAME}"
        return
    fi

    git checkout -b "$BRANCH_NAME"
}

step9_download_and_replace() {
    log_step "9" "Download new SQLite amalgamation zip and extract to deps/"

    local old_dir="sqlite-amalgamation-${FROM_VERSION}"
    local new_dir="sqlite-amalgamation-${NEW_VERSION}"
    local new_zip="sqlite-amalgamation-${NEW_VERSION}.zip"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would download ${new_zip} from sqlite.org"
        log_dry "Would extract ${new_zip} to deps/${new_dir}/"
        log_dry "Would git rm deps/${old_dir}/ from deps/"
        log_dry "Would place deps/${new_dir}/ in deps/"
        return
    fi

    # Fetch the download page to find the URL
    log "Fetching SQLite download page to find amalgamation zip URL..."
    local download_html
    download_html="$(curl -sL "$SQLITE_DOWNLOAD_URL" 2>/dev/null || true)"

    if [[ -z "$download_html" ]]; then
        echo "ERROR: Could not fetch SQLite download page" >&2
        exit "$EXIT_DOWNLOAD_FAIL"
    fi

    # Extract the download URL for the amalgamation zip
    # The download page has lines like:
    #   .../2025/sqlite-amalgamation-3510400.zip
    local download_url
    download_url="$(echo "$download_html" | \
        grep -oP 'https://sqlite\.org/\d{4}/sqlite-amalgamation-'"${NEW_VERSION}"'\.zip' | \
        head -1 || true)"

    # Fallback: try relative URL pattern
    if [[ -z "$download_url" ]]; then
        local year
        year="$(echo "$download_html" | \
            grep -oP '\d{4}(?=/sqlite-amalgamation-'"${NEW_VERSION}"')' | \
            head -1 || true)"

        if [[ -n "$year" ]]; then
            download_url="https://sqlite.org/${year}/sqlite-amalgamation-${NEW_VERSION}.zip"
        fi
    fi

    # Last fallback: try current year and previous year
    if [[ -z "$download_url" ]]; then
        local this_year last_year
        this_year="$(date +%Y)"
        last_year="$((this_year - 1))"

        for y in "$this_year" "$last_year"; do
            local test_url="https://sqlite.org/${y}/sqlite-amalgamation-${NEW_VERSION}.zip"
            log "Trying: ${test_url}"
            if curl -sfI "$test_url" >/dev/null 2>&1; then
                download_url="$test_url"
                break
            fi
        done
    fi

    if [[ -z "$download_url" ]]; then
        echo "ERROR: Could not find download URL for ${new_zip}" >&2
        echo "       Check https://sqlite.org/download.html manually" >&2
        exit "$EXIT_DOWNLOAD_FAIL"
    fi

    log "Download URL: ${download_url}"

    # Download
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "${tmp_dir:-}" 2>/dev/null || true' EXIT

    log "Downloading ${new_zip}..."
    if ! curl -fSL -o "${tmp_dir}/${new_zip}" "$download_url"; then
        echo "ERROR: Download failed for ${download_url}" >&2
        exit "$EXIT_DOWNLOAD_FAIL"
    fi

    log "Download complete: $(du -h "${tmp_dir}/${new_zip}" | cut -f1)"

    # Checksum verification (best-effort)
    local expected_hash
    expected_hash="$(echo "$download_html" | \
        grep -B1 "sqlite-amalgamation-${NEW_VERSION}\.zip" | \
        grep -oE '[a-f0-9]{64}' | \
        head -1 || true)"

    if [[ -n "$expected_hash" ]]; then
        log "Expected SHA3-256 hash: ${expected_hash}"

        # Try sha3sum first, then openssl
        local actual_hash=""
        if command -v sha3sum &>/dev/null; then
            actual_hash="$(sha3sum -a 256 "${tmp_dir}/${new_zip}" 2>/dev/null | awk '{print $1}' || true)"
        elif command -v keccak-256sum &>/dev/null; then
            actual_hash="$(keccak-256sum "${tmp_dir}/${new_zip}" 2>/dev/null | awk '{print $1}' || true)"
        fi

        if [[ -n "$actual_hash" ]]; then
            if [[ "$actual_hash" != "$expected_hash" ]]; then
                echo "ERROR: Checksum verification failed!" >&2
                echo "  Expected: ${expected_hash}" >&2
                echo "  Actual:   ${actual_hash}" >&2
                exit "$EXIT_CHECKSUM_FAIL"
            fi
            log "Checksum verified successfully"
        else
            log "WARNING: Could not verify checksum (no SHA3-256 tool available)"
            log "         Expected hash: ${expected_hash}"
            log "         Verify manually after the script completes."
        fi
    else
        log "WARNING: Could not find expected checksum on download page"
        log "         Skipping checksum verification."
    fi

    # Extract the zip
    log "Extracting ${new_zip}..."
    if ! unzip -o "${tmp_dir}/${new_zip}" -d "${DEPS_DIR}/"; then
        echo "ERROR: Failed to extract ${new_zip}" >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    # Remove old amalgamation directory
    if [[ -d "${DEPS_DIR}/${old_dir}" ]]; then
        log "Removing old amalgamation directory: ${old_dir}"
        git rm -r "${DEPS_DIR}/${old_dir}"
    else
        log "WARNING: Old amalgamation directory not found: ${DEPS_DIR}/${old_dir}"
    fi

    log "Amalgamation extracted to deps/${new_dir}/"
}

step10_update_gypi() {
    log_step "10" "Update deps/common-sqlite.gypi"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would update sqlite_version% from current to ${NEW_VERSION} in ${GYPI_FILE}"
        return
    fi

    sed -i "s/'sqlite_version%':'${FROM_VERSION}'/'sqlite_version%':'${NEW_VERSION}'/" "$GYPI_FILE"

    # Verify the change
    local updated_version
    updated_version="$(read_current_version)"
    if [[ "$updated_version" != "$NEW_VERSION" ]]; then
        echo "ERROR: Failed to update sqlite_version in ${GYPI_FILE}" >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    log "Updated sqlite_version% to ${NEW_VERSION}"
}

step11_update_readme() {
    log_step "11" "Update README.md"

    local to_human
    to_human="$(numeric_to_human "$NEW_VERSION")"

    if [[ "$DRY_RUN" == true ]]; then
        if grep -q "Bundles SQLite v" "$README_FILE"; then
            log_dry "Would replace SQLite version in README.md with v${to_human}"
        else
            log_dry "Would add 'Bundles SQLite v${to_human}' to README.md"
        fi
        return
    fi

    if grep -q "Bundles SQLite v" "$README_FILE"; then
        sed -i "s/Bundles SQLite v[0-9]\+\.[0-9]\+\.[0-9]\+/Bundles SQLite v${to_human}/" "$README_FILE"
        log "Replaced SQLite version in README.md with v${to_human}"
    else
        # Add after the last feature bullet point
        sed -i "/^ - /a\\ - Bundles SQLite v${to_human}, or you can build using a local SQLite" "$README_FILE"
        log "Added SQLite version to README.md: v${to_human}"
    fi
}

step12_check_other_changes() {
    log_step "12" "Check for other required changes"

    local from_human
    from_human="$(numeric_to_human "$FROM_VERSION")"
    local to_human
    to_human="$(numeric_to_human "$NEW_VERSION")"

    log "Fetching SQLite changelog from ${from_human} to ${to_human}..."

    local changes_html
    changes_html="$(curl -sL "$SQLITE_CHANGES_URL" 2>/dev/null || true)"

    if [[ -n "$changes_html" ]]; then
        # Extract changelog entries for ALL versions between from and to.
        # SQLite changes.html lists versions in reverse chronological order
        # (newest first), with each version section starting at an <h3> heading
        # like: <h3>2025-04-15 (3.51.4)</h3>
        # We capture from the to_human heading down to (but not including)
        # the from_human heading, which gives us all intermediate versions.
        local changelog_section
        changelog_section="$(echo "$changes_html" | \
            awk -v from="$from_human" -v to="$to_human" '
                /<h[23]>/ {
                    if (index($0, from) > 0 && index($0, to) == 0) { capturing = 0; next }
                    if (index($0, to) > 0) { capturing = 1 }
                }
                capturing { print }
            ' | head -100 || true)"

        if [[ -n "$changelog_section" ]]; then
            echo ""
            echo "=== SQLite Changelog: ${from_human} → ${to_human} ==="
            # Strip HTML tags for display
            echo "$changelog_section" | sed 's/<[^>]*>//g' | sed '/^$/d' | head -50
            echo "=== End of changelog excerpt ==="
        else
            log "Could not extract changelog for ${from_human} → ${to_human}"
        fi
    else
        log "WARNING: Could not fetch SQLite changelog"
    fi

    echo ""
    echo "Please review the changelog for potential manual changes in the following files:"
    echo "  - deps/sqlite3.gyp (compile flags, defines, new extensions)"
    echo "  - deps/sqlite-amalgamation-*/ (amalgamation source files)"
    echo ""

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would pause for manual review confirmation"
        return
    fi

    read -rp "Continue with build? [y/N] " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log "Aborted by user. Changes are preserved on the feature branch."
        exit "$EXIT_GENERAL_ERROR"
    fi
}

step13_run_build() {
    log_step "13" "Run build (yarn rebuild)"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: yarn rebuild"
        return
    fi

    log "Cleaning and rebuilding..."
    if ! yarn rebuild; then
        echo "ERROR: Build failed. Please fix issues before committing." >&2
        exit "$EXIT_BUILD_FAIL"
    fi

    log "Build succeeded"
}

step14_run_lint() {
    log_step "14" "Run lint (yarn lint)"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: yarn lint"
        return
    fi

    if ! yarn lint; then
        echo "ERROR: Lint failed. Please fix issues before committing." >&2
        exit "$EXIT_LINT_FAIL"
    fi

    log "Lint passed"
}

step15_run_tests() {
    log_step "15" "Run tests (yarn test)"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: yarn test"
        return
    fi

    if ! yarn test; then
        echo "ERROR: Tests failed. Please fix issues before committing." >&2
        exit "$EXIT_TEST_FAIL"
    fi

    log "Tests passed"
}

step16_commit() {
    log_step "16" "Commit changes"

    local from_human
    from_human="$(numeric_to_human "$FROM_VERSION")"
    local to_human
    to_human="$(numeric_to_human "$NEW_VERSION")"

    local commit_msg="Bumped bundled SQLite from ${from_human} to ${to_human}"

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would stage and commit with message: '${commit_msg}'"
        return
    fi

    # Stage relevant files
    git add "${GYPI_FILE}"
    git add "${DEPS_DIR}/sqlite-amalgamation-"*/
    git add "$README_FILE"

    git commit -m "$commit_msg"

    log "Committed: ${commit_msg}"
}

step17_push() {
    log_step "17" "Push to remote"

    if [[ "$NO_PUSH" == true ]]; then
        log "Push skipped (--no-push)"
        return
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: git push origin ${BRANCH_NAME}"
        return
    fi

    git push origin "$BRANCH_NAME"

    log "Pushed to origin/${BRANCH_NAME}"
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          SQLite Version Bump Script                         ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    # Step 1: Parse arguments and validate
    step1_parse_and_validate "$@"

    # Step 2: Check if source tree is clean
    step2_check_clean_tree

    # Step 3: Checkout main
    step3_checkout_main

    # Step 4: Git fetch from origin
    step4_git_fetch

    # Step 5: Check if newer version is available
    step5_check_newer_version

    # Step 6: Cooldown period check
    step6_cooldown_check

    # Step 7: Pull from origin
    step7_pull_origin

    # Step 8: Create feature branch
    step8_create_branch

    # Step 9: Download new version and remove old one
    step9_download_and_replace

    # Step 10: Update deps/common-sqlite.gypi
    step10_update_gypi

    # Step 11: Update README.md
    step11_update_readme

    # Step 12: Check for other required changes
    step12_check_other_changes

    # Step 13: Run build
    step13_run_build

    # Step 14: Run lint
    step14_run_lint

    # Step 15: Run tests
    step15_run_tests

    # Step 16: Commit
    step16_commit

    # Step 17: Push
    step17_push

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          SQLite bump completed successfully!                 ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
}

main "$@"
