#!/usr/bin/env bash
# Pulls the Level Up toolkit sources into .toolkit-cache/ (git-ignored):
#   - meta/astryx                  (design system + skill)
#   - msitarzewski/agency-agents   (specialist agents; 53 are installed in .claude/agents)
#   - Arindam200/awesome-ai-apps   (catalogue of example AI apps)
#
# Usage:
#   scripts/fetch-toolkit.sh                      # clone or update all three
#   scripts/fetch-toolkit.sh --add-agent design/design-visual-storyteller
#                                                 # also install one more agent
# Treat everything fetched as reference material: read it before reusing it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.toolkit-cache"
mkdir -p "$CACHE"

SOURCES=(
  "meta/astryx"
  "msitarzewski/agency-agents"
  "Arindam200/awesome-ai-apps"
)

for repo in "${SOURCES[@]}"; do
  dir="$CACHE/${repo//\//_}"
  if [[ -d "$dir/.git" ]]; then
    git -C "$dir" pull --ff-only --quiet && echo "updated  $repo ($(git -C "$dir" rev-parse --short HEAD))"
  else
    git clone --depth 1 --quiet "https://github.com/$repo.git" "$dir" && echo "cloned   $repo ($(git -C "$dir" rev-parse --short HEAD))"
  fi
done

if [[ "${1:-}" == "--add-agent" ]]; then
  rel="${2:?give division/file, e.g. design/design-visual-storyteller}"
  src="$CACHE/msitarzewski_agency-agents/${rel%.md}.md"
  [[ -f "$src" ]] || { echo "no such agent: $rel" >&2; exit 1; }
  slug="$(basename "${rel%.md}")"
  dest="$ROOT/.claude/agents/$slug.md"
  # Claude Code agent names must be lowercase-hyphenated: use the file slug.
  sed "0,/^name:.*/s//name: $slug/" "$src" > "$dest"
  echo "installed agent $slug -> .claude/agents/$slug.md (review it before use)"
fi
