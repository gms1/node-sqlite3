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
#   --force-sqlite       Pass --force to upgrade-sqlite.sh (skip cooldown)
#   -h, --help           Show this help message
#
set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly UPGRADE_DEPS_SCRIPT="${SCRIPT_DIR}/upgrade-deps.sh"

# Determine the GitHub repo from the origin remote.
# This is necessary because "gh" defaults to the upstream parent repo,
# which may be archived (e.g. TryGhost/node-sqlite3). We want PRs on our fork.
readonly GH_REPO="$(git -C "$PROJECT_ROOT" remote get-url origin | sed -E 's|.*github.com[:/]||;s|\.git$||')"

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

Options:
  --dry-run            Show what would be done without making changes
  --no-push            Commit but do not push to remote
  --no-pr              Skip PR creation (just upgrade and commit locally)
  --no-release         Skip version bump and npm publish after merge
  --skip-sqlite        Skip SQLite version check
  --skip-deps          Skip dependency upgrade check
  --force-sqlite       Pass --force to upgrade-sqlite.sh (skip cooldown)
  -h, --help           Show this help message

Examples:
  $(basename "$0")                      # Full maintenance cycle
  $(basename "$0") --dry-run            # Preview what would be done
  $(basename "$0") --no-pr              # Upgrade and push, but no PR/merge/release
  $(basename "$0") --no-release         # Upgrade, PR, merge, but skip release
  $(basename "$0") --skip-sqlite        # Only upgrade dependencies
  $(basename "$0") --skip-deps          # Only check SQLite

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

    # Check SSH key availability (needed for git push)
    if [[ "$NO_PUSH" != true ]]; then
        if ! ssh-add -l &>/dev/null; then
            echo "ERROR: No SSH key loaded in ssh-agent. Run 'ssh-add' first, or use --no-push." >&2
            exit "$EXIT_GENERAL_ERROR"
        fi
        log "SSH key: OK"
    else
        log "SSH key: skipped (--no-push)"
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

    # Wait for checks to complete
    if ! gh pr checks "$pr_number" --repo "$GH_REPO" --watch 2>/dev/null; then
        echo "ERROR: CI checks failed for PR #$pr_number." >&2
        echo "       Fix the issues and re-run this script, or merge manually." >&2
        exit "$EXIT_GENERAL_ERROR"
    fi

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

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          Maintenance Script                                  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    parse_args "$@"

    # Preflight: verify SSH key and gh auth before starting
    preflight_checks

    # Step 1: Run upgrade-deps.sh (handles SQLite bumps and dependency upgrades)
    step1_upgrade

    # Steps 2-4: PR, merge, release
    step2_create_pr
    step3_merge_pr
    step4_release

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          Maintenance completed successfully!                  ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
}

main "$@"
