#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build a .deb for hostinger-electron.
#
# Primary path: electron-builder (handles bundling Electron + packaging).
#   ./build-deb.sh                 # host arch
#   ./build-deb.sh amd64           # explicit arch
#   ./build-deb.sh arm64
#   ./build-deb.sh armhf
#
# Output lands in dist/.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")"

arch="${1:-host}"
version="$(node -p "require('./package.json').version")"

echo "building .deb for hostinger-electron $version ($arch)"

if [ ! -d node_modules ]; then
  echo ">> installing dependencies (npm install)"
  npm install
fi

case "$arch" in
  host)         archflag="" ;;
  amd64|x64)    archflag="--x64" ;;
  arm64|aarch64) archflag="--arm64" ;;
  armhf|armv7l) archflag="--armv7l" ;;
  *) echo "unsupported architecture: $arch"; exit 1 ;;
esac

# shellcheck disable=SC2086
npx electron-builder --linux deb $archflag

echo ">> done. artifacts in dist/:"
ls -1 dist/*.deb 2>/dev/null || true
