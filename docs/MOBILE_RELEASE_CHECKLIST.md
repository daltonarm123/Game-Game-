# Mobile Release Checklist (iOS + Android)

Owner: Engineering + Live Ops  
Last updated: 2026-06-29

## 1. Build Inputs and App Identity

- [ ] Confirm app identity values in `apps/mobile/app.json`:
  - [ ] iOS bundle ID: `com.crownforge.app`
  - [ ] Android package: `com.crownforge.app`
  - [ ] App version and release notes are updated
- [ ] Confirm app icon and splash assets exist and render correctly:
  - [ ] `apps/mobile/assets/icon.png` (1024x1024)
  - [ ] `apps/mobile/assets/adaptive-icon.png` (1024x1024)
  - [ ] `apps/mobile/assets/splash.png` (portrait)

## 2. Environment and API Reachability

- [ ] Create `apps/mobile/.env` from `apps/mobile/.env.example`
- [ ] Set `EXPO_PUBLIC_API_BASE_URL` for each target environment:
  - [ ] Internal testing
  - [ ] Staging
  - [ ] Production
- [ ] Validate login/register/refresh flows on:
  - [ ] iPhone (physical)
  - [ ] Android (physical)

## 3. Store Metadata and Compliance

- [ ] Fill and review iOS metadata template:
  - [ ] `apps/mobile/store/app-store-connect.json`
- [ ] Fill and review Android metadata template:
  - [ ] `apps/mobile/store/google-play.json`
- [ ] Verify privacy policy and support URLs are live
- [ ] Complete content rating questionnaires in both stores
- [ ] Confirm billing path and policy compliance for in-app purchases

## 4. Build and Submission Pipeline

- [ ] Log in to EAS: `npx eas-cli login`
- [ ] Confirm EAS submit placeholders are replaced in `apps/mobile/eas.json`:
  - [ ] `ascAppId`
  - [ ] `appleTeamId`
- [ ] Build preview binaries:
  - [ ] `npm --workspace apps/mobile run build:ios:preview`
  - [ ] `npm --workspace apps/mobile run build:android:preview`
- [ ] Build production binaries:
  - [ ] `npm --workspace apps/mobile run build:ios:production`
  - [ ] `npm --workspace apps/mobile run build:android:production`

## 5. Pre-Submission QA (Launch-Critical)

- [ ] Account: register, login, logout, session restore
- [ ] Core loops: build, train, explore, attack, market, alliance actions
- [ ] Error handling: API offline, timeout, invalid credentials, retries
- [ ] Performance sanity:
  - [ ] Cold start under acceptable threshold
  - [ ] No repeated crashes during 30 min play session
- [ ] Verify no blocker logs in production mode builds

## 6. Go/No-Go Gates

- [ ] `npx expo-doctor` passes
- [ ] `npm --workspace apps/mobile run typecheck` passes
- [ ] No sev-1 or sev-2 issues open for mobile launch
- [ ] Product + Engineering + Ops sign-off captured

## 7. Post-Release Plan

- [ ] Monitor crash-free sessions and authentication failure rate
- [ ] Monitor API latency and war/market endpoint error rates
- [ ] Prepare hotfix branch and rollback owner on call
