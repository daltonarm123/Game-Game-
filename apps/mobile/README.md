# Mobile App

Expo React Native app for iPhone and Android.

## Prerequisites

- Node 20+
- Workspace dependencies installed from repo root
- API service running on port 8080
- For Android local builds: Android Studio SDK/emulator
- For iOS local builds: Xcode on macOS

## Environment

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_API_BASE_URL`.

Notes:
- iOS simulator default: `http://localhost:8080`
- Android emulator default: `http://10.0.2.2:8080`
- Physical phone: use your machine LAN IP (example `http://192.168.1.42:8080`)

## Run

From repo root:

- `npm --workspace apps/mobile run dev`
- `npm --workspace apps/mobile run ios`
- `npm --workspace apps/mobile run android`

Use tunnel mode if the device cannot reach the dev server:

- `npm --workspace apps/mobile run start:tunnel`

## Validate

- `npm --workspace apps/mobile run typecheck`

## EAS Builds

Login once:

- `npx eas-cli login`

Internal test builds:

- `npm --workspace apps/mobile run build:ios:preview`
- `npm --workspace apps/mobile run build:android:preview`

Production builds:

- `npm --workspace apps/mobile run build:ios:production`
- `npm --workspace apps/mobile run build:android:production`

## Store Metadata Templates

- iOS App Store Connect metadata: `apps/mobile/store/app-store-connect.json`
- Android Google Play metadata: `apps/mobile/store/google-play.json`

## Submission Checklist

- Tailored release checklist: `docs/MOBILE_RELEASE_CHECKLIST.md`

Before first production submission, replace placeholder metadata URLs/contact fields, configure signing credentials, and verify assets in a preview build.
