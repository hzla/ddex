#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_URL="${PAGES_REPO_URL:-https://github.com/hzla/ddex-pages.git}"
PAGES_BRANCH="${PAGES_BRANCH:-main}"
OUTPUT_DIR="${DDEX_OUTPUT_DIR:-dist-pages}"
COMMIT_MESSAGE="${PAGES_COMMIT_MESSAGE:-Deploy GitHub Pages build}"

repo_name_from_url() {
  local url="$1"
  local name="${url##*/}"
  name="${name%.git}"
  printf '%s' "$name"
}

REPO_NAME="$(repo_name_from_url "$REPO_URL")"
BASE_PATH="${DDEX_BASE_PATH:-/$REPO_NAME}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ddex-pages.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Building GitHub Pages output"
(
  cd "$ROOT_DIR"
  DDEX_BASE_PATH="$BASE_PATH" DDEX_OUTPUT_DIR="$OUTPUT_DIR" npm run build:pages
)

echo "Cloning $REPO_URL"
git clone "$REPO_URL" "$TMP_DIR" >/dev/null 2>&1 || {
  echo "Clone failed for $REPO_URL" >&2
  exit 1
}

if git -C "$TMP_DIR" rev-parse --verify HEAD >/dev/null 2>&1; then
  git -C "$TMP_DIR" checkout "$PAGES_BRANCH" >/dev/null 2>&1 || git -C "$TMP_DIR" checkout -b "$PAGES_BRANCH" >/dev/null 2>&1
else
  git -C "$TMP_DIR" checkout --orphan "$PAGES_BRANCH" >/dev/null 2>&1
fi

echo "Syncing $OUTPUT_DIR -> $REPO_URL ($PAGES_BRANCH)"
rsync -av --delete --exclude .git "$ROOT_DIR/$OUTPUT_DIR/" "$TMP_DIR/" >/dev/null

git -C "$TMP_DIR" add -A

if git -C "$TMP_DIR" diff --cached --quiet; then
  echo "No changes to deploy"
  exit 0
fi

git -C "$TMP_DIR" commit -m "$COMMIT_MESSAGE"

if git -C "$TMP_DIR" ls-remote --exit-code --heads origin "$PAGES_BRANCH" >/dev/null 2>&1; then
  git -C "$TMP_DIR" push origin "$PAGES_BRANCH"
else
  git -C "$TMP_DIR" push -u origin "$PAGES_BRANCH"
fi

echo "Deploy complete"
echo "Repo:   $REPO_URL"
echo "Branch: $PAGES_BRANCH"
echo "Path:   $BASE_PATH"
