#!/usr/bin/env bash
# Build the site for GitHub Pages and push it to the gh-pages branch.
#
# The built site (app/dist) includes the card scans (~120 MB webp), which are kept out of
# the main branch on purpose; gh-pages is the only place they are committed.
#
# Usage: scripts/deploy_pages.sh            (from the repo root; needs git + node + a pushable origin)
set -euo pipefail
# Git Bash on Windows rewrites "/jime-cards-ru/" into "C:/Program Files/Git/jime-cards-ru/"
# when it is passed to a native program — turn that conversion off.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
REPO_NAME=$(basename -s .git "$REMOTE")
BASE="/${REPO_NAME}/"
# commit identity for the gh-pages repo: same as this repo (a noreply address keeps GitHub's
# email-privacy check happy)
GIT_NAME=$(git config user.name)
GIT_EMAIL=$(git config user.email)

echo "== building with BASE_PATH=${BASE}"
(cd app && BASE_PATH="$BASE" npm run build)

echo "== publishing app/dist to gh-pages of $REMOTE"
cd app/dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git -c core.safecrlf=false -c "user.name=$GIT_NAME" -c "user.email=$GIT_EMAIL" commit -q -m "Deploy site $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -f "$REMOTE" gh-pages
rm -rf .git
echo "== done: https://$(echo "$REMOTE" | sed -E 's#.*github.com[:/]([^/]+)/.*#\1#').github.io${BASE}"
