#!/usr/bin/env bash
#
# maintenance.sh — Full maintenance cycle: upgrade, PR, merge, release
#
# Usage: maintenance.sh [OPTIONS]
#
# Options:
#   --dry-run            Show what would be done without making changes
#   --no-push            Commit but do not push to remote
#   --no-pr              Skip PR creation (just upgrade and commit locally)
#   --no-release         Skip version bump and npm publish after merge
#   --skip-sqlite        Skip SQLite version check
#   --skip-deps          Skip dependency upgrade check
#   --skip-version-check Skip the CI version check at the end
#   --force-sqlite       Pass --force to upgrade-sqlite.sh (skip cooldown)
#   -h, --help           Show this help message
#
set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly PROJECT_ROOT
readonly UPGRADE_DEPS_SCRIPT="${SCRIPT_DIR}/upgrade-deps.sh"
readonly CHECK_VERSIONS_SCRIPT="${SCRIPT_DIR}/check-versions.sh"

# Determine the GitHub repo from the origin remote.
# This is necessary because "gh" defaults to the upstream parent repo,
# which may be archived (e.g. TryGhost/node-sqlite3). We want PRs on our fork.
GH_REPO="$(git -C "$PROJECT_ROOT" remote get-url origin | sed -E 's|.*github.com[:/]||;s|\.git$||')"
readonly GH_REPO

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1

# ─── Defaults ────────────────────────────────────────────────────────────────

DRY_RUN=false
NO_PUSH=false
NO_PR=false
NO_RELEASE=false
SKIP_SQLITE=false
SKIP_DEPS=false
SKIP_VERSION_CHECK=false
FORCE_SQLITE=false

# ─── Helper Functions ────────────────────────────────────────────────────────

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Full maintenance cycle: upgrade dependencies, create PR, merge, and release.

The script will:
  1. Run upgrade-deps.sh to check for SQLite bumps and dependency upgrades
  2. Create a pull request for the changes
  3. Wait for CI checks and merge the PR
  4. If needed, bump the patch version and push tags (for releases)
  5. Report available upgrades for versions pinned in the CI workflows

Options:
  --dry-run            Show what would be done without making changes
  --no-push            Commit but do not push to remote
  --no-pr              Skip PR creation (just upgrade and commit locally)
  --no-release         Skip version bump and npm publish after merge
  --skip-sqlite        Skip SQLite version check
  --skip-deps          Skip dependency upgrade check
  --skip-version-check Skip the CI version check at the end
  --force-sqlite       Pass --force to upgrade-sqlite.sh (skip cooldown)
  -h, --help           Show this help message

Examples:
  $(basename "$0")                      # Full maintenance cycle
  $(basename "$0") --dry-run            # Preview what would be done
  $(basename "$0") --no-pr              # Upgrade and push, but no PR/merge/release
  $(basename "$0") --no-release         # Upgrade, PR, merge, but skip release
  $(basename "$0") --skip-sqlite        # Only upgrade dependencies
  $(basename "$0") --skip-deps          # Only check SQLite
  $(basename "$0") --skip-version-check # Upgrade, PR, merge, release, but no version report

Exit Codes:
  0  Success
  1  General error
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
            --no-pr)
                NO_PR=true
                shift
                ;;
            --no-release)
                NO_RELEASE=true
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
            --skip-version-check)
                SKIP_VERSION_CHECK=true
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

# ─── Preflight Checks ─────────────────────────────────────────────────────────

preflight_checks() {
    log "Running preflight checks..."

    # Check connectivity to the git remote (needed for git push).
    # ssh-add -l only verifies a key is loaded in the agent, not that it
    # actually works with the remote.  Use git ls-remote to test the real
    # authentication path — this covers SSH keys, HTTPS credential helpers,
    # and any other auth mechanism configured for the remote.
    if [[ "$NO_PUSH" != true ]]; then
        if ! git -C "$PROJECT_ROOT" ls-remote origin HEAD &>/dev/null; then
            echo "ERROR: Cannot reach the git remote. Check your SSH key or credentials." >&2
            echo "       For SSH: ensure your key is loaded (ssh-add) and added to your account." >&2
            echo "       Or use --no-push to skip pushing." >&2
            exit "$EXIT_GENERAL_ERROR"
        fi
        log "Remote auth: OK"
    else
        log "Remote auth: skipped (--no-push)"
    fi

    # Check gh CLI authentication (needed for PR create, merge, and release)
    if [[ "$NO_PR" != true ]]; then
        if ! command -v gh &>/dev/null; then
            echo "ERROR: 'gh' CLI not found. Install it or use --no-pr." >&2
            exit "$EXIT_GENERAL_ERROR"
        fi
        if ! gh auth status &>/dev/null; then
            echo "ERROR: 'gh' not authenticated. Run 'gh auth login' first, or use --no-pr." >&2
            exit "$EXIT_GENERAL_ERROR"
        fi
        log "gh auth: OK"
    else
        log "gh auth: skipped (--no-pr)"
    fi
}

# ─── Step Implementations ────────────────────────────────────────────────────

step1_upgrade() {
    log_step "1" "Upgrade dependencies and SQLite"

    local upgrade_args=()
    if [[ "$DRY_RUN" == true ]]; then upgrade_args+=(--dry-run); fi
    if [[ "$NO_PUSH" == true ]]; then upgrade_args+=(--no-push); fi
    if [[ "$SKIP_SQLITE" == true ]]; then upgrade_args+=(--skip-sqlite); fi
    if [[ "$SKIP_DEPS" == true ]]; then upgrade_args+=(--skip-deps); fi
    if [[ "$FORCE_SQLITE" == true ]]; then upgrade_args+=(--force-sqlite); fi

    if ! "$UPGRADE_DEPS_SCRIPT" "${upgrade_args[@]}"; then
        echo "ERROR: Dependency upgrade failed." >&2
        exit "$EXIT_GENERAL_ERROR"
    fi
}

step2_create_pr() {
    log_step "2" "Create pull request"

    if [[ "$NO_PR" == true ]]; then
        log "PR creation skipped (--no-pr)"
        return
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would create a pull request for the current branch"
        return
    fi

    # Check if we're on a feature branch
    local current_branch
    current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

    if [[ ! "$current_branch" == feature/* ]]; then
        log "Not on a feature branch (on: ${current_branch}), skipping PR creation"
        return
    fi

    # Push to remote (upgrade-deps.sh may have already pushed, but this is idempotent)
    git push -u origin "$current_branch"

    # Determine PR title based on changed files
    local pr_title="chore: upgrade dependencies"
    if git diff main...HEAD --name-only 2>/dev/null | grep -q "deps/common-sqlite.gypi"; then
        pr_title="chore: upgrade SQLite and dependencies"
    fi

    local pr_body="Automated dependency upgrade via \`maintenance.sh\`."

    local pr_url
    pr_url="$(gh pr create --repo "$GH_REPO" --title "$pr_title" --body "$pr_body" --base main 2>&1)" || {
        echo "ERROR: Failed to create pull request." >&2
        echo "$pr_url" >&2
        exit "$EXIT_GENERAL_ERROR"
    }

    log "Created PR: $pr_url"
}

step3_merge_pr() {
    log_step "3" "Wait for CI checks and merge PR"

    if [[ "$NO_PR" == true ]]; then
        log "Merge skipped (--no-pr)"
        return
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would wait for CI checks and merge the PR"
        return
    fi

    # Get the PR number for the current branch
    local current_branch
    current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

    if [[ ! "$current_branch" == feature/* ]]; then
        log "Not on a feature branch, skipping merge"
        return
    fi

    local pr_number
    pr_number="$(gh pr list --repo "$GH_REPO" --head "$current_branch" --json number -q '.[0].number' 2>/dev/null || true)"

    if [[ -z "$pr_number" ]]; then
        echo "ERROR: Could not find PR number for branch: $current_branch" >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    log "Waiting for CI checks on PR #$pr_number..."

    # Get the PR head SHA — workflow runs are keyed by commit, not PR.
    local head_sha
    head_sha="$(gh pr view "$pr_number" --repo "$GH_REPO" --json headRefOid -q '.headRefOid' 2>/dev/null || true)"

    if [[ -z "$head_sha" ]]; then
        echo "ERROR: Could not determine head SHA for PR #$pr_number." >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    # Wait for CI by polling the workflow RUN objects for the PR head SHA
    # instead of statusCheckRollup.  statusCheckRollup only contains check
    # runs for jobs that have already STARTED, so jobs queued behind a busy
    # runner (e.g. the 12-job build matrix) are invisible to it — any fixed
    # stabilization window can be exceeded by runner allocation delays,
    # causing premature merges.  A workflow run stays queued/in_progress
    # until ALL its jobs are done, making it a reliable completion signal.
    local poll_interval=30
    local startup_max=300   # 5 min max to wait for runs to appear
    local run_max_wait=3600 # 60 min max to wait for runs to complete
    local startup_elapsed=0
    local elapsed=0

    # Phase 1: Wait for at least one workflow run to appear for this commit.
    while [[ $startup_elapsed -lt $startup_max ]]; do
        local run_count
        run_count="$(gh run list --repo "$GH_REPO" --commit "$head_sha" \
            --json databaseId --limit 100 --jq 'length' 2>/dev/null || echo 0)"

        if [[ "$run_count" -gt 0 ]]; then
            log "CI workflow runs registered (${run_count} run(s) for ${head_sha:0:12})"
            break
        fi

        log "No CI workflow runs registered yet (${startup_elapsed}s elapsed)..."
        sleep "$poll_interval"
        startup_elapsed=$((startup_elapsed + poll_interval))
    done

    if [[ $startup_elapsed -ge $startup_max ]]; then
        echo "ERROR: No CI workflow runs appeared for PR #$pr_number after $((startup_max / 60)) minutes." >&2
        echo "       This may indicate the CI workflow was not triggered." >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    # Phase 2: Wait for all workflow runs for this commit to complete.
    while [[ $elapsed -lt $run_max_wait ]]; do
        # Fail fast if any run completed with a non-success conclusion
        local failed_runs
        failed_runs="$(gh run list --repo "$GH_REPO" --commit "$head_sha" \
            --json status,conclusion,name --limit 100 \
            --jq '.[] | select(.status == "completed") | select(.conclusion != "success" and .conclusion != "skipped" and .conclusion != "neutral") | .name' \
            2>/dev/null || true)"

        if [[ -n "$failed_runs" ]]; then
            echo "ERROR: CI checks failed for PR #$pr_number:" >&2
            echo "$failed_runs" >&2
            echo "       Fix the issues and re-run this script, or merge manually." >&2
            exit "$EXIT_GENERAL_ERROR"
        fi

        # Any run still queued or in progress?
        local active_runs
        active_runs="$(gh run list --repo "$GH_REPO" --commit "$head_sha" \
            --json status,name --limit 100 \
            --jq '.[] | select(.status != "completed") | .name' \
            2>/dev/null || true)"

        if [[ -n "$active_runs" ]]; then
            log "CI still running (${elapsed}s elapsed): $(echo "$active_runs" | tr '\n' ', ' | sed 's/,$//')"
            sleep "$poll_interval"
            elapsed=$((elapsed + poll_interval))
            continue
        fi

        # All runs completed successfully
        break
    done

    if [[ $elapsed -ge $run_max_wait ]]; then
        echo "ERROR: Timed out waiting for CI checks on PR #$pr_number after $((run_max_wait / 60)) minutes." >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

    log "All CI workflow runs completed successfully"

    log "CI checks passed, merging PR #$pr_number"
    gh pr merge "$pr_number" --repo "$GH_REPO" --squash --delete-branch

    log "Pulling merged changes..."
    git checkout main
    git pull origin main
}

step4_release() {
    log_step "4" "Determine if release is needed"

    if [[ "$NO_RELEASE" == true ]]; then
        log "Release step skipped (--no-release)"
        return
    fi

    if [[ "$NO_PR" == true ]]; then
        log "Release step skipped (no PR was created)"
        return
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would check if a release is needed and potentially bump patch version"
        return
    fi

    # Ensure we're on main after the merge
    local current_branch
    current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    if [[ "$current_branch" != "main" ]]; then
        log "Not on main branch (on: ${current_branch}), skipping release"
        return
    fi

    # Check if release is needed:
    #   - SQLite bump (deps/common-sqlite.gypi changed)
    #   - Runtime dependency changes (dependencies or optionalDependencies in package.json)
    local needs_release=false

    # Check for SQLite bump in recent merge commit
    if git log -1 --name-only --pretty=format: | grep -q "deps/common-sqlite.gypi"; then
        log "SQLite bump detected in merged commit"
        needs_release=true
    fi

    # Check if runtime dependencies changed
    if git log -1 --name-only --pretty=format: | grep -q "package.json"; then
        # Check if runtime dependencies (not just devDependencies) changed
        if git diff HEAD~1 -- package.json | grep -qE '^\+.*"(node-addon-api|node-gyp-build|node-gyp)"'; then
            log "Runtime dependency change detected"
            needs_release=true
        fi
    fi

    if [[ "$needs_release" == false ]]; then
        log "No release needed — changes are dev-only"
        return
    fi

    log "Bumping patch version..."
    local old_version
    old_version="$(node -p "require('${PROJECT_ROOT}/package.json').version")"
    npm version patch --no-git-tag-version
    local new_version
    new_version="$(node -p "require('${PROJECT_ROOT}/package.json').version")"

    git add package.json
    git commit -m "chore: release v${new_version}"
    git tag "v${new_version}"
    git push origin main --tags

    log "Version bumped: ${old_version} → ${new_version}"
    log "Tag v${new_version} pushed to origin"
    log ""
    log "CI will create a pre-release with binaries at:"
    log "  https://github.com/gms1/node-sqlite3/releases"
    log ""
    log "After reviewing the pre-release, publish to npm with:"
    log "  gh workflow run publish.yml --repo ${GH_REPO} -f tag=v${new_version}"
}

step5_check_versions() {
    log_step "5" "Check for available CI version upgrades"

    if [[ "$SKIP_VERSION_CHECK" == true ]]; then
        log "Version check skipped (--skip-version-check)"
        return
    fi

    if [[ ! -x "$CHECK_VERSIONS_SCRIPT" ]]; then
        # The version check is informational — a missing or non-executable
        # script must never fail the maintenance cycle.
        log "WARNING: Version check script not found or not executable: ${CHECK_VERSIONS_SCRIPT}"
        return
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_dry "Would run: ${CHECK_VERSIONS_SCRIPT}"
        return
    fi

    # The check is warning-only: it always exits 0 when it produces a report,
    # and any failure here is reported but does not affect the maintenance result.
    if ! "$CHECK_VERSIONS_SCRIPT"; then
        log "WARNING: Version check reported an error (maintenance result is unaffected)"
    fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          Maintenance Script                                  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    cd "$PROJECT_ROOT"

    parse_args "$@"

    # Preflight: verify SSH key and gh auth before starting
    preflight_checks

    # Step 1: Run upgrade-deps.sh (handles SQLite bumps and dependency upgrades)
    step1_upgrade

    # Steps 2-4: PR, merge, release
    step2_create_pr
    step3_merge_pr
    step4_release

    # Step 5: Report available upgrades for versions pinned in the CI workflows
    step5_check_versions

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          Maintenance completed successfully!                  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
}

main "$@"
