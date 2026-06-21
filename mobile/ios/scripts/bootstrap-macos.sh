#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Infy iOS requires macOS for Xcode, iOS SDK, and iOS Simulator." >&2
  exit 1
fi

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Install Xcode from the App Store, then run:" >&2
  echo "  sudo xcode-select --switch /Applications/Xcode.app" >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

brew bundle --file=- <<'BREWFILE'
brew "xcodegen"
brew "xcbeautify"
BREWFILE

cd "$(dirname "$0")/.."
xcodegen generate
xcodebuild -project Infy.xcodeproj -scheme Infy -destination 'platform=iOS Simulator,name=iPhone 16' build | xcbeautify

echo "Infy iOS toolchain is ready."

