#!/usr/bin/env bash
#
# check-versions.sh — Report available upgrades for versions pinned in the GitHub Actions workflows
#
# Usage: check-versions.sh [OPTIONS]
#
# Options:
#   --verbose            Show the full per-item report (default: summary only)
#   --no-network         Skip remote queries; only list the pinned values
#   -h, --help           Show this help message
#
# This script is READ-ONLY and WARNING-ONLY: it never modifies files and it
# does not fail the calling maintenance script. Network or parse failures
# degrade to per-item "skipped" notices.
#
# Pinned GitHub Actions versions (actions/checkout etc.) are not checked here
# — they are covered by Dependabot (.github/dependabot.yml).
#
set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly PROJECT_ROOT
readonly WORKFLOWS_DIR="${PROJECT_ROOT}/.github/workflows"
readonly CI_WORKFLOW="${WORKFLOWS_DIR}/ci.yml"
readonly ELECTRON_WORKFLOW="${WORKFLOWS_DIR}/test-electron-package.yml"

readonly NODE_INDEX_URL="https://nodejs.org/dist/index.json"
readonly NODE_SCHEDULE_URL="https://raw.githubusercontent.com/nodejs/release/master/schedule.json"
readonly ELECTRON_DIST_TAGS_URL="https://registry.npmjs.org/-/package/electron/dist-tags"
readonly ALPINE_RELEASES_URL="https://www.alpinelinux.org/releases.json"
readonly RUNNER_IMAGES_README_URL="https://raw.githubusercontent.com/actions/runner-images/main/README.md"
readonly UBUNTU_EOL_URL="https://endoflife.date/api/ubuntu.json"

readonly CURL_MAX_TIME=15
# Warn this long before end-of-life: Node.js prebuild ~1 month, Ubuntu runners 12 months.
readonly NODE_EOL_WARN_MONTHS=1
readonly UBUNTU_EOL_WARN_MONTHS=12

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_USAGE_ERROR=1

# ─── Defaults ─────────────────────────────────────────────────────────────────

NO_NETWORK=false
VERBOSE=false

# Report accumulators
NEWER_ITEMS=()
EOL_ITEMS=()
SKIPPED_ITEMS=()

# Fetched payloads (cached once per run)
NODE_INDEX_JSON=""
NODE_SCHEDULE_JSON=""
ELECTRON_DIST_TAGS_JSON=""
ALPINE_RELEASES_JSON=""
RUNNER_README_TEXT=""
UBUNTU_EOL_JSON=""

# ─── Helper Functions ─────────────────────────────────────────────────────────

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Report available upgrades for the versions pinned in the GitHub Actions
workflows (Node.js, Electron, Alpine, Ubuntu runners).

The check is read-only and warning-only: it never modifies anything and it
does not affect the exit status of the calling maintenance script.

Checked pins:
  PREBUILD_NODE_VERSION / DEFAULT_NODE_VERSION   .github/workflows/ci.yml
  electron_version default                       .github/workflows/test-electron-package.yml
  ALPINE_VARIANT                                 .github/workflows/ci.yml
  ubuntu-* runner labels                         all .github/workflows/*.yml

Pinned GitHub Actions versions are covered by Dependabot instead.

Output:
  By default only the actionable summary is printed (newer versions, EOL
  warnings, skipped items). Use --verbose for the full per-item report.

Options:
  --verbose            Show the full per-item report table
  --no-network         Skip remote queries; only list the pinned values
                       (implies --verbose)
  -h, --help           Show this help message

Exit Codes:
  0  Report printed (warnings included)
  1  Usage error or required tool missing
EOF
}

log() {
    echo "[check-versions] $*"
}

# Detail report line with a fixed-width label column (verbose output only;
# the compact summary is built from the NEWER_ITEMS/EOL_ITEMS accumulators).
report() {
    [[ "$VERBOSE" == true ]] || return 0
    printf '  %-22s %s\n' "$1" "$2"
}

# Continuation detail line without a label (verbose output only).
note() {
    [[ "$VERBOSE" == true ]] || return 0
    printf '  %-22s %s\n' "" "$1"
}

# Report an item that could not be checked (counted for the summary).
skipped() {
    report "$1" "skipped (${2})"
    SKIPPED_ITEMS+=("$1")
}

# Fetch a URL to stdout with one retry. Empty output on failure.
fetch_url() {
    local url="$1"
    local body
    for _attempt in 1 2; do
        if body="$(curl --location --fail --silent --show-error --max-time "$CURL_MAX_TIME" "$url" 2>/dev/null)" && [[ -n "$body" ]]; then
            printf '%s' "$body"
            return 0
        fi
    done
    return 1
}

# Evaluate a JavaScript expression against the JSON payload on stdin.
# The expression (with \`payload\` bound to the parsed JSON) is passed via the
# JQ_EXPR environment variable to avoid shell quoting issues. Prints the
# result (one line per array element); exits non-zero on any failure.
json_query() {
    local expr="$1"
    # shellcheck disable=SC2016  # JS expression uses $ only inside the JS itself
    JQ_EXPR="$expr" node -e '
        const chunks = [];
        process.stdin.on("data", c => chunks.push(c));
        process.stdin.on("end", () => {
            try {
                const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                const fn = new Function("payload", "return (" + process.env.JQ_EXPR + ");");
                const result = fn(payload);
                if (result === undefined || result === null) process.exit(3);
                if (Array.isArray(result)) result.forEach(r => console.log(r));
                else console.log(String(result));
            } catch (e) {
                process.exit(3);
            }
        });
    ' 2>/dev/null
}

# Parse the actions/runner-images README (stdin) into "version|label,label" rows.
parse_runner_readme() {
    # shellcheck disable=SC2016
    node -e '
        const chunks = [];
        process.stdin.on("data", c => chunks.push(c));
        process.stdin.on("end", () => {
            try {
                const text = Buffer.concat(chunks).toString("utf8");
                for (const line of text.split("\n")) {
                    if (!line.startsWith("| Ubuntu")) continue;
                    const versionMatch = line.match(/\| Ubuntu ([0-9.]+)/);
                    if (!versionMatch) continue;
                    const labels = [...line.matchAll(/`(ubuntu-[a-z0-9.]+)`/g)].map(m => m[1]);
                    console.log(versionMatch[1] + "|" + labels.join(","));
                }
            } catch (e) {
                process.exit(3);
            }
        });
    ' 2>/dev/null
}

# Approximate whole months from today until a yyyy-mm-dd date (negative if past).
months_until() {
    local date_str="$1"
    local target today
    if ! target="$(date -d "$date_str" +%s 2>/dev/null)"; then
        return 1
    fi
    today="$(date +%s)"
    echo $(( ( (10#$target - 10#$today) / 86400 ) / 30 ))
}

# Major version of a version string ("v26.10.0" or "44.5.1" → "26" / "44").
major_of() {
    local v="${1#v}"
    echo "${v%%.*}"
}

# True if dotted-numeric version $1 is greater than version $2.
version_gt() {
    [[ "$1" != "$2" && "$(printf '%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" ]]
}

# Join arguments with ", ".
join_comma() {
    local out="" item
    for item in "$@"; do
        if [[ -z "$out" ]]; then
            out="$item"
        else
            out="${out}, ${item}"
        fi
    done
    echo "$out"
}

# Read a 'NAME: value' env pin from a workflow file (single-quoted value).
read_env_pin() {
    local name="$1"
    local file="$2"
    local out
    out="$(grep -E "^[[:space:]]*${name}:" "$file" 2>/dev/null | head -1 | grep -oE "'[^']+'" | tr -d "'" || true)"
    echo "$out"
}

# Read the electron_version input default from the Electron test workflow.
read_electron_pin() {
    local out
    out="$(grep -A3 "electron_version:" "$ELECTRON_WORKFLOW" 2>/dev/null | grep -E "^[[:space:]]*default:" | head -1 | grep -oE "'[^']+'" | tr -d "'" || true)"
    echo "$out"
}

# All ubuntu-* runner labels referenced in the workflows.
collect_ubuntu_labels() {
    local out
    out="$( { grep -rhoE 'ubuntu-(latest|[0-9]+(\.[0-9]+)?(-arm)?)' "$WORKFLOWS_DIR"/*.yml 2>/dev/null || true; } | sort -u )"
    echo "$out"
}

# ─── Argument Parsing ─────────────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --verbose)
                VERBOSE=true
                shift
                ;;
            --no-network)
                # Listing the pinned values is the whole point of --no-network.
                NO_NETWORK=true
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit "$EXIT_SUCCESS"
                ;;
            -*)
                echo "ERROR: Unknown option: $1" >&2
                usage >&2
                exit "$EXIT_USAGE_ERROR"
                ;;
            *)
                echo "ERROR: Unexpected argument: $1" >&2
                usage >&2
                exit "$EXIT_USAGE_ERROR"
                ;;
        esac
    done
}

# ─── Source Loading ───────────────────────────────────────────────────────────

load_sources() {
    NODE_INDEX_JSON="$(fetch_url "$NODE_INDEX_URL")" || NODE_INDEX_JSON=""
    NODE_SCHEDULE_JSON="$(fetch_url "$NODE_SCHEDULE_URL")" || NODE_SCHEDULE_JSON=""
    ELECTRON_DIST_TAGS_JSON="$(fetch_url "$ELECTRON_DIST_TAGS_URL")" || ELECTRON_DIST_TAGS_JSON=""
    ALPINE_RELEASES_JSON="$(fetch_url "$ALPINE_RELEASES_URL")" || ALPINE_RELEASES_JSON=""
    RUNNER_README_TEXT="$(fetch_url "$RUNNER_IMAGES_README_URL")" || RUNNER_README_TEXT=""
    UBUNTU_EOL_JSON="$(fetch_url "$UBUNTU_EOL_URL")" || UBUNTU_EOL_JSON=""
}

# ─── Checks ───────────────────────────────────────────────────────────────────

check_node() {
    local default_pin prebuild_pin
    default_pin="$(read_env_pin DEFAULT_NODE_VERSION "$CI_WORKFLOW")"
    prebuild_pin="$(read_env_pin PREBUILD_NODE_VERSION "$CI_WORKFLOW")"

    if [[ "$NO_NETWORK" == true ]]; then
        report "Node.js (default)" "${default_pin:-not found} (not checked — network disabled)"
        report "Node.js (prebuild)" "${prebuild_pin:-not found} (not checked — network disabled)"
        return 0
    fi

    if [[ -z "$NODE_INDEX_JSON" ]]; then
        skipped "Node.js" "nodejs.org unreachable"
        return 0
    fi

    # --- Default Node version ---
    local newest newest_major latest_of_default
    newest="$(printf '%s' "$NODE_INDEX_JSON" | json_query 'payload[0].version' || true)"
    newest_major="$(major_of "$newest")"
    if [[ -n "$default_pin" && -n "$newest" ]]; then
        latest_of_default="$(printf '%s' "$NODE_INDEX_JSON" | json_query "payload.find(e => parseInt(e.version.slice(1)) === ${default_pin}).version" || true)"
        if [[ "$default_pin" == "$newest_major" ]]; then
            report "Node.js (default)" "${default_pin} → ${latest_of_default:-$newest} (current major, up to date)"
        else
            report "Node.js (default)" "${default_pin} → ${newest_major}  ⚠ newer Node major available"
            NEWER_ITEMS+=("Node.js default (${newest_major})")
        fi
    else
        skipped "Node.js (default)" "pin not found or index.json unparsable"
    fi

    # --- Prebuild Node version (binary compatibility floor: a supported LTS line) ---
    # Policy: the prebuild pin is fine as long as its major is still supported
    # (it does NOT need to be the newest LTS major). A warning appears ~1 month
    # before the pinned major reaches EOL; only after EOL does the newest LTS
    # major become the available prebuild version.
    if [[ -z "$prebuild_pin" ]]; then
        skipped "Node.js (prebuild)" "pin not found in workflows"
        return 0
    fi
    if [[ -z "$NODE_SCHEDULE_JSON" ]]; then
        skipped "Node.js (prebuild)" "release schedule unreachable"
        return 0
    fi

    local newest_lts lts_major
    newest_lts="$(printf '%s' "$NODE_INDEX_JSON" | json_query 'payload.find(e => e.lts).version' || true)"
    lts_major="$(major_of "$newest_lts")"

    local codename="" name_note="" eol_date=""
    codename="$(printf '%s' "$NODE_SCHEDULE_JSON" | json_query "payload[\"v${prebuild_pin}\"].codename" || true)"
    eol_date="$(printf '%s' "$NODE_SCHEDULE_JSON" | json_query "payload[\"v${prebuild_pin}\"].end" || true)"
    if [[ -n "$codename" ]]; then
        name_note=" '${codename}'"
    fi
    if [[ -z "$eol_date" ]]; then
        skipped "Node.js (prebuild)" "no EOL date for Node ${prebuild_pin} in schedule"
        return 0
    fi

    local months
    if ! months="$(months_until "$eol_date")"; then
        skipped "Node.js (prebuild)" "EOL date unparsable (${eol_date})"
        return 0
    fi

    if (( months < 0 )); then
        # Past EOL: the newest LTS major is the available prebuild version.
        report "Node.js (prebuild)" "${prebuild_pin} → ${lts_major:-newest LTS}  ⚠ Node ${prebuild_pin}${name_note} reached EOL ${eol_date} — upgrade the prebuild"
        NEWER_ITEMS+=("Node.js prebuild (${lts_major:-newest LTS})")
    elif (( months <= NODE_EOL_WARN_MONTHS )); then
        # Approaching EOL: warn, but the pin is still fine — not an
        # available version yet.
        local when
        if (( months == 0 )); then
            when="within a month"
        else
            when="in ~${months} month(s)"
        fi
        report "Node.js (prebuild)" "${prebuild_pin}  ⚠ Node ${prebuild_pin}${name_note} reaches EOL ${eol_date} (${when}) — plan the upgrade to the next LTS major"
        EOL_ITEMS+=("Node.js prebuild (${prebuild_pin}) — reaches EOL ${eol_date} (${when})")
    else
        # Supported with time to spare: up to date, even if a newer LTS
        # major exists.
        report "Node.js (prebuild)" "${prebuild_pin}${name_note} (EOL ${eol_date}) — up to date"
    fi
}

check_electron() {
    local pin
    pin="$(read_electron_pin)"
    if [[ -z "$pin" ]]; then
        skipped "Electron" "pin not found in workflows"
        return 0
    fi
    if [[ "$NO_NETWORK" == true ]]; then
        report "Electron" "${pin} (not checked — network disabled)"
        return 0
    fi
    if [[ -z "$ELECTRON_DIST_TAGS_JSON" ]]; then
        skipped "Electron" "registry.npmjs.org unreachable"
        return 0
    fi

    local latest latest_major latest_of_pin
    latest="$(printf '%s' "$ELECTRON_DIST_TAGS_JSON" | json_query 'payload["latest"]' || true)"
    latest_major="$(major_of "$latest")"
    latest_of_pin="$(printf '%s' "$ELECTRON_DIST_TAGS_JSON" | json_query "payload[\"${pin}-x-y\"]" || true)"
    if [[ -z "$latest" ]]; then
        skipped "Electron" "dist-tags unparsable"
        return 0
    fi

    local detail="latest: ${latest}"
    if [[ -n "$latest_of_pin" ]]; then
        detail="${detail}; latest ${pin}.x: ${latest_of_pin}"
    fi

    if [[ "$pin" != "$latest_major" ]]; then
        report "Electron" "${pin} → ${latest_major}  ⚠ newer major available (${detail})"
        NEWER_ITEMS+=("Electron (${latest_major})")
    else
        report "Electron" "${pin} (up to date, ${detail})"
    fi
}

check_alpine() {
    local pin
    pin="$(read_env_pin ALPINE_VARIANT "$CI_WORKFLOW")"
    if [[ -z "$pin" ]]; then
        skipped "Alpine variant" "pin not found in workflows"
        return 0
    fi
    if [[ "$NO_NETWORK" == true ]]; then
        report "Alpine variant" "${pin} (not checked — network disabled)"
        return 0
    fi
    if [[ -z "$ALPINE_RELEASES_JSON" ]]; then
        skipped "Alpine variant" "alpinelinux.org unreachable"
        return 0
    fi

    local latest
    latest="$(printf '%s' "$ALPINE_RELEASES_JSON" | json_query 'payload["latest_stable"]' || true)"
    latest="${latest#v}"
    if [[ -z "$latest" ]]; then
        skipped "Alpine variant" "releases.json unparsable"
        return 0
    fi

    local pin_ver="${pin#alpine}"
    if [[ "$pin_ver" != "$latest" ]]; then
        report "Alpine variant" "${pin} → alpine${latest}  ⚠ newer stable release available"
        NEWER_ITEMS+=("Alpine (${latest})")
    else
        report "Alpine variant" "${pin} (up to date)"
    fi
}

check_ubuntu() {
    mapfile -t labels <<< "$(collect_ubuntu_labels)"

    local uses_latest=false
    local pinned_labels=() pinned_versions=()
    local label ver
    for label in "${labels[@]}"; do
        if [[ -z "$label" ]]; then
            continue
        fi
        if [[ "$label" == "ubuntu-latest" ]]; then
            uses_latest=true
        else
            pinned_labels+=("$label")
            ver="${label#ubuntu-}"
            ver="${ver%-arm}"
            if [[ " ${pinned_versions[*]-} " != *" ${ver} "* ]]; then
                pinned_versions+=("$ver")
            fi
        fi
    done

    local pinned_str
    pinned_str="$(join_comma "${pinned_labels[@]}")"

    if [[ "$NO_NETWORK" == true ]]; then
        local all_str
        all_str="$(join_comma "${labels[@]}")"
        report "Ubuntu runners" "${all_str:-none} (not checked — network disabled)"
        return 0
    fi

    local readme_rows=""
    if [[ -n "$RUNNER_README_TEXT" ]]; then
        readme_rows="$(printf '%s' "$RUNNER_README_TEXT" | parse_runner_readme || true)"
    fi
    if [[ -z "$readme_rows" ]]; then
        skipped "Ubuntu runners" "runner-images README unreachable or unparsable"
        return 0
    fi

    local latest_resolves=""
    local available_versions=()
    local row_version row_labels
    while IFS='|' read -r row_version row_labels; do
        if [[ -z "$row_version" ]]; then
            continue
        fi
        if [[ "$row_labels" == *"ubuntu-latest"* ]]; then
            latest_resolves="$row_version"
        fi
        if [[ " ${available_versions[*]-} " != *" ${row_version} "* ]]; then
            available_versions+=("$row_version")
        fi
    done <<< "$readme_rows"

    if [[ ${#available_versions[@]} -eq 0 ]]; then
        skipped "Ubuntu runners" "no Ubuntu runner images parsed from README"
        return 0
    fi

    local newest_available
    newest_available="$(printf '%s\n' "${available_versions[@]}" | sort -V | tail -1)"

    local max_pinned=""
    if [[ ${#pinned_versions[@]} -gt 0 ]]; then
        max_pinned="$(printf '%s\n' "${pinned_versions[@]}" | sort -V | tail -1)"
    fi

    if [[ -n "$latest_resolves" ]]; then
        report "Ubuntu runners" "ubuntu-latest currently resolves to ${latest_resolves} (pinned images: ${pinned_str:-none})"
    else
        report "Ubuntu runners" "pinned images: ${pinned_str:-none} (ubuntu-latest resolution unknown)"
    fi

    if [[ -n "$max_pinned" ]] && version_gt "$newest_available" "$max_pinned"; then
        note "ℹ ubuntu-${newest_available} runner image is available"
        NEWER_ITEMS+=("Ubuntu runners (${newest_available} image available)")
    fi

    if [[ "$uses_latest" == true && -n "$latest_resolves" && -n "$max_pinned" && "$latest_resolves" != "$max_pinned" ]]; then
        note "⚠ ubuntu-latest resolves to ${latest_resolves} but the matrix pins ${max_pinned} — workflows using ubuntu-latest will drift"
        NEWER_ITEMS+=("Ubuntu runners (align matrix: latest is ${latest_resolves})")
    fi

    local ver
    for ver in "${pinned_versions[@]}"; do
        if [[ " ${available_versions[*]-} " != *" ${ver} "* ]]; then
            note "⚠ ubuntu-${ver} is pinned but no runner image exists anymore"
            NEWER_ITEMS+=("Ubuntu runners (replace ${ver})")
        fi
    done

    if [[ -n "$UBUNTU_EOL_JSON" ]]; then
        local eol months
        for ver in "${pinned_versions[@]}"; do
            eol="$(printf '%s' "$UBUNTU_EOL_JSON" | json_query "payload.find(e => e.cycle === \"${ver}\").eol" || true)"
            if [[ -z "$eol" ]]; then
                continue
            fi
            if months="$(months_until "$eol")"; then
                if (( months < 0 )); then
                    note "⚠ Ubuntu ${ver} standard support ended ${eol} — upgrade required"
                    EOL_ITEMS+=("Ubuntu runners (${ver}) — support ended ${eol}")
                elif (( months <= UBUNTU_EOL_WARN_MONTHS )); then
                    note "⚠ Ubuntu ${ver} standard support ends ${eol} (in ${months} months)"
                    EOL_ITEMS+=("Ubuntu runners (${ver}) — support ends ${eol}")
                else
                    note "(${ver} standard support ends ${eol} — no action needed)"
                fi
            fi
        done
    fi
}

# ─── Summary ──────────────────────────────────────────────────────────────────

print_summary() {
    echo ""
    if [[ ${#SKIPPED_ITEMS[@]} -gt 0 ]]; then
        echo "ℹ ${#SKIPPED_ITEMS[@]} item(s) could not be checked (details: --verbose)"
    fi
    if [[ ${#EOL_ITEMS[@]} -gt 0 ]]; then
        echo "⚠ ${#EOL_ITEMS[@]} pinned item(s) approaching or past end-of-life:"
        local item
        for item in "${EOL_ITEMS[@]}"; do
            echo "    - ${item}"
        done
    fi
    if [[ ${#NEWER_ITEMS[@]} -gt 0 ]]; then
        echo "⚠ ${#NEWER_ITEMS[@]} newer version(s) available:"
        for item in "${NEWER_ITEMS[@]}"; do
            echo "    - ${item}"
        done
    fi
    if [[ "$NO_NETWORK" == true ]]; then
        echo "ℹ No remote check was performed (--no-network)"
    elif [[ ${#EOL_ITEMS[@]} -eq 0 && ${#NEWER_ITEMS[@]} -eq 0 && ${#SKIPPED_ITEMS[@]} -eq 0 ]]; then
        echo "✓ All pinned CI versions are up to date"
    fi
    if [[ "$VERBOSE" != true ]]; then
        echo "ℹ Full per-item report: $(basename "$0") --verbose"
    fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║          CI Version Check                                    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"

    cd "$PROJECT_ROOT"

    parse_args "$@"

    if [[ "$NO_NETWORK" != true ]]; then
        if ! command -v curl &>/dev/null; then
            echo "ERROR: 'curl' is required for the version check." >&2
            exit "$EXIT_USAGE_ERROR"
        fi
        if ! command -v node &>/dev/null; then
            echo "ERROR: 'node' is required for JSON parsing." >&2
            exit "$EXIT_USAGE_ERROR"
        fi
        log "Fetching version information..."
        load_sources
    else
        log "Network disabled (--no-network) — reporting pinned values only"
    fi

    echo ""
    check_node
    check_electron
    check_alpine
    check_ubuntu
    print_summary

    exit "$EXIT_SUCCESS"
}

main "$@"
