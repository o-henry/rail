#!/usr/bin/env bash
set -euo pipefail

MODE_STAGED=false
MODE_ALL=false
MODE_HISTORY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)
      MODE_STAGED=true
      shift
      ;;
    --all)
      MODE_ALL=true
      shift
      ;;
    --history)
      MODE_HISTORY=true
      shift
      ;;
    *)
      echo "unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$MODE_STAGED" == false && "$MODE_ALL" == false ]]; then
  MODE_STAGED=true
fi

# High-confidence secret patterns to reduce false positives.
PATTERNS=(
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'AIza[0-9A-Za-z_-]{35}'
  'xox[baprs]-[A-Za-z0-9-]+'
  'ghp_[A-Za-z0-9]{36}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'sk-[A-Za-z0-9]{20,}'
  '-----BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----'
  'Bearer[[:space:]]+[A-Za-z0-9._=-]{20,}'
)

# File names that should never be committed.
BLOCKED_FILE_REGEX='(^|/)(\.env(\..*)?$|id_rsa$|id_ed25519$|.*\.(pem|p12|pfx|jks|key)$)'

has_findings=0

scan_content_stream() {
  local label="$1"
  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"

  # Skip obvious binary content.
  if LC_ALL=C grep -q $'\x00' "$tmp"; then
    rm -f "$tmp"
    return
  fi

  local pattern
  for pattern in "${PATTERNS[@]}"; do
    if grep -nE "$pattern" "$tmp" >/tmp/secret_scan_hits.$$ 2>/dev/null; then
      has_findings=1
      while IFS= read -r hit; do
        echo "[secret-scan] potential secret in ${label}: ${hit}" >&2
      done < /tmp/secret_scan_hits.$$
    fi
  done

  rm -f /tmp/secret_scan_hits.$$ "$tmp"
}

scan_file_name() {
  local file="$1"
  if echo "$file" | grep -Eq "$BLOCKED_FILE_REGEX"; then
    has_findings=1
    echo "[secret-scan] blocked file name detected: $file" >&2
  fi
}

scan_staged() {
  while IFS= read -r -d '' file; do
    scan_file_name "$file"
    git show --textconv ":$file" 2>/dev/null | scan_content_stream "staged:$file"
  done < <(git diff --cached --name-only --diff-filter=ACMR -z)
}

scan_all_tracked() {
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    scan_file_name "$file"
    cat "$file" 2>/dev/null | scan_content_stream "tracked:$file"
  done < <(git ls-files)
}

scan_history() {
  local pattern_union
  pattern_union="$(IFS='|'; echo "${PATTERNS[*]}")"

  if git log -p --all --no-color | grep -nE "$pattern_union" >/tmp/secret_scan_history.$$ 2>/dev/null; then
    has_findings=1
    while IFS= read -r hit; do
      echo "[secret-scan] potential secret in git history: ${hit}" >&2
    done < /tmp/secret_scan_history.$$
  fi

  rm -f /tmp/secret_scan_history.$$
}

if [[ "$MODE_STAGED" == true ]]; then
  scan_staged
fi

if [[ "$MODE_ALL" == true ]]; then
  scan_all_tracked
fi

if [[ "$MODE_HISTORY" == true ]]; then
  scan_history
fi

if [[ "$has_findings" -ne 0 ]]; then
  echo "[secret-scan] FAILED. Remove secrets before commit/push." >&2
  exit 1
fi

echo "[secret-scan] PASS"
