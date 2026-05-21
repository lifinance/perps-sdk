#!/usr/bin/env sh
# Reject staged package.json changes that add `link:` path entries — those
# are dev-only filesystem overrides and must never land on a branch.
#
# pnpm-lock.yaml legitimately materialises workspace deps as `link:../foo`
# entries; that file is intentionally excluded.
#
# Bypass with `git commit --no-verify` if you really mean it.

set -e

files=$(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '(^|/)package\.json$' \
  || true)

[ -z "$files" ] && exit 0

bad=""
for f in $files; do
  hits=$(git diff --cached -U0 -- "$f" \
    | grep -E '^\+[^+].*link:[./]' \
    || true)
  if [ -n "$hits" ]; then
    bad="$bad
--- $f ---
$hits"
  fi
done

if [ -n "$bad" ]; then
  printf 'pre-commit: refusing to commit local "link:" path changes.\n' >&2
  printf 'These are dev-only filesystem overrides and must never land on a branch.\n' >&2
  printf '\n' >&2
  printf 'Revert with:   git checkout -- <file>\n' >&2
  printf 'Bypass with:   git commit --no-verify   (only if intentional)\n' >&2
  printf '%s\n' "$bad" >&2
  exit 1
fi
