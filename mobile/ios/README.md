# Infy iOS

Native iOS client for Infy Messenger.

## Stage 1 Scope

This stage contains the production architecture foundation, project structure, dependencies, networking layer, secure token storage, and authentication flow. Chat, realtime, offline cache, calls, media, push, AI, and calendar features are intentionally left for later approved stages.

## Generate Project

Install XcodeGen on macOS and run:

```bash
cd mobile/ios
xcodegen generate
open Infy.xcodeproj
```

The generated app targets iOS 18+, Swift 6, SwiftUI, Observation, async/await, URLSession, Keychain Services, Socket.IO Client, and WebRTC.

On a fresh Mac, use:

```bash
./scripts/bootstrap-macos.sh
```

## Local Browser Preview

Windows cannot run Xcode or iOS Simulator. For quick interaction with the Stage 1 auth surface inside Codex, run:

```bash
cd mobile/ios/Preview
node server.js
```

Open `http://127.0.0.1:4180`.

## Configuration

`project.yml` injects these build settings into `Info.plist`:

- `INFY_API_BASE_URL`
- `INFY_REALTIME_URL`
- `INFY_CERTIFICATE_PINS`

Use HTTPS and certificate pins for Release builds before App Store submission.
