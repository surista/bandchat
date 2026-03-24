# BandChat Testing Protocol

> Comprehensive testing strategy for web and mobile platforms.
> Last updated: 2026-03-23

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Testing Pyramid Strategy](#2-testing-pyramid-strategy)
3. [Server API Tests (Existing)](#3-server-api-tests-existing)
4. [Web Client Tests (New)](#4-web-client-tests-new)
5. [Mobile Tests (New)](#5-mobile-tests-new)
6. [E2E Tests (New)](#6-e2e-tests-new)
7. [Manual Testing Checklists](#7-manual-testing-checklists)
8. [Regression Testing Protocol](#8-regression-testing-protocol)
9. [CI/CD Integration](#9-cicd-integration)
10. [Platform Constraints & Workarounds](#10-platform-constraints--workarounds)

---

## 1. Current State Assessment

### What We Have

| Layer | Coverage | Details |
|-------|----------|---------|
| **Server API** | **Good** — 35 files, 374 tests | All 29 route modules tested against real PostgreSQL. Auth, authorization, plan gating, soft-delete, compliance all covered. |
| **Mobile lint** | **Basic** — ESLint only | `no-undef`, `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`. Catches broken imports and hook violations. |
| **Mobile smoke** | **Minimal** — 17 import checks | Validates that 7 components, 7 screens, 3 utilities can be imported without crashing. No functional tests. |
| **Web client** | **None** | No test framework, no test files, no test scripts. Build check (Vite) catches syntax errors only. |
| **E2E** | **None** | No Playwright, Cypress, Detox, or Maestro setup on any platform. |
| **CI/CD** | **Partial** | Server tests run on PRs. Mobile ESLint runs always. Web build check runs always. No E2E, no coverage gates. |

### What We're Missing

1. **Web component tests** — 64 components, 4 contexts, 4 hooks, 6 services with zero test coverage
2. **Mobile functional tests** — 52 screens, 14 components, 150+ API methods, 4 contexts untested
3. **Integration tests** — No tests verifying client↔server↔socket flows end-to-end
4. **Visual regression** — No screenshot comparison for UI changes
5. **Accessibility tests** — No automated WCAG checks (axe-core, etc.)
6. **Performance tests** — No Lighthouse CI, no load testing

### Risk Assessment

| Area | Risk if Untested | Likelihood of Breaking |
|------|-----------------|----------------------|
| Auth flows (login/signup/refresh/OAuth) | **Critical** — users locked out | Medium (touched rarely) |
| Messaging (send/edit/delete/react/thread) | **Critical** — core feature | High (frequently modified) |
| Socket.IO events (real-time updates) | **High** — stale UI, missing messages | High (fragile) |
| File uploads (images, attachments) | **High** — broken content sharing | Medium |
| Navigation (deep links, push tap) | **High** — dead ends, crashes | Medium |
| Song/Setlist CRUD | **Medium** — band management broken | Medium |
| Gig calendar & attendance | **Medium** — scheduling broken | Low |
| Theme system (20+ themes, dark/light) | **Low** — cosmetic only | Low |
| Admin dashboard | **Low** — developer-only | Low |

---

## 2. Testing Pyramid Strategy

```
                    ┌─────────┐
                    │  E2E /  │  ← Few, slow, high confidence
                    │ Manual  │     Critical user journeys only
                   ─┤─────────├─
                  │ Integration │  ← API + Socket + UI together
                  │   Tests     │    Key workflows
                 ─┤─────────────├─
               │   Component /   │  ← Fast, isolated, bulk of tests
               │   Unit Tests    │    Every component, hook, service
              ─┤─────────────────├─
            │    Static Analysis   │  ← Instant, catches typos/imports
            │  (ESLint, TypeScript,│    Already partially in place
            │   Build checks)      │
            └──────────────────────┘
```

### Target Coverage by Layer

| Layer | Target | Platform | Tooling |
|-------|--------|----------|---------|
| Static analysis | 100% of files | All | ESLint (existing), Vite build (existing) |
| Unit/Component | 80%+ of services, hooks, contexts; 60%+ of components | Web + Mobile | Vitest + RTL (web), Jest + RNTL (mobile) |
| Integration | Top 15 user journeys | Server | Supertest (existing), expand coverage |
| E2E | Top 8 critical flows | Web | Playwright |
| E2E | Top 8 critical flows | Mobile (Android) | Maestro |
| Manual | Full feature matrix | Both | Checklists below |

---

## 3. Server API Tests (Existing)

### Current Coverage: 35 Files, 374 Tests

Already well-covered. Here's what exists and what gaps remain:

#### Covered (Good)

| Module | Tests | Notes |
|--------|-------|-------|
| auth | ✅ | Signup, login, password validation, token refresh |
| admin | ✅ | Stats, user/workspace management, storage, backups |
| compliance | ✅ | Account deletion, privacy, data export (19K test file) |
| subscriptions | ✅ | RevenueCat webhooks, plan activation |
| softDelete | ✅ | Middleware behavior, admin bypass |
| messages | ✅ | CRUD, threading, reactions |
| channels | ✅ | Management, permissions, groups |
| songs | ✅ | CRUD, metadata enrichment |
| setlists | ✅ | Creation, song ordering |
| gigs | ✅ | Scheduling, attendance, status |
| workspaces | ✅ | Creation, member management |
| authorization | ✅ | Permission/role checking |
| planGating | ✅ | FREE vs PRO enforcement |
| All others | ✅ | reports, suggestions, push, polls, bandMembers, announcements, channelGroups, availability, achievements, kitty, recordings, practice, contacts, medleys, stagePlots, timeline, website, workspaceImport, slackImport, blocks, linkPreview, sync |

#### Gaps to Fill

| Gap | Priority | Action |
|-----|----------|--------|
| Socket.IO handler tests | **High** | Test `handlers.js` events with mock socket (message:sent, typing, presence, room join/leave, connection limiting) |
| Upload endpoint edge cases | **Medium** | Multi-file upload (new), magic byte rejection, storage quota enforcement, R2 failure handling |
| Background job tests | **Medium** | Token cleanup, backup scheduling, soft-delete purge timing |
| Google/Apple OAuth mocking | **Medium** | Currently tests hit real OAuth? Add mocked credential tests |
| Concurrent request tests | **Low** | Race conditions on storage decrement, simultaneous backups |
| Rate limiter behavior | **Low** | Verify rate limits trigger correctly per endpoint |

#### How to Run

```bash
cd server
npm test                          # Run all 35 test files (serial, ~60s)
npm run test:verbose              # With detailed output
npm run test:file -- tests/auth   # Single file
```

**Requires**: PostgreSQL test database (configured in `.env.test`)

---

## 4. Web Client Tests (New)

### Setup: Vitest + React Testing Library

Vitest is the natural choice — same Vite build pipeline, fast, ESM-native.

#### Installation

```bash
cd client
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw
```

#### Configuration

**`client/vitest.config.js`**:
```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test/**', 'node_modules/**'],
    },
  },
});
```

**`client/src/test/setup.js`**:
```js
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

**`client/src/test/mocks/handlers.js`** (MSW for API mocking):
```js
import { http, HttpResponse } from 'msw';

const API = 'http://localhost:3001/api';

export const handlers = [
  http.get(`${API}/auth/me`, () =>
    HttpResponse.json({ id: '1', email: 'test@test.com', displayName: 'Test User' })
  ),
  http.post(`${API}/auth/login`, () =>
    HttpResponse.json({ accessToken: 'test-token', user: { id: '1', displayName: 'Test' } })
  ),
  http.get(`${API}/workspaces`, () =>
    HttpResponse.json([])
  ),
  // Add handlers as needed per test file
];
```

**`client/src/test/mocks/server.js`**:
```js
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);
```

**`client/src/test/renderWithProviders.jsx`** (test utility):
```jsx
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';

export function renderWithProviders(ui, { route = '/', ...options } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            {ui}
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
    options
  );
}
```

**Add to `client/package.json`**:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Test Plan by Priority

#### Priority 1: Services & Utilities (Pure logic, no DOM)

These are the easiest to test and highest-value — they underpin everything.

| File | Test File | What to Test |
|------|-----------|-------------|
| `services/api.js` | `services/api.test.js` | Token refresh logic, request/response handling, cache invalidation, error handling (401 retry, network errors), credential inclusion |
| `services/badge.js` | `services/badge.test.js` | Badge count update, clear, favicon generation |
| `services/push.js` | `services/push.test.js` | Service worker registration, VAPID key fetch, subscribe/unsubscribe |
| `utils/formatDate.js` | `utils/formatDate.test.js` | Date formatting edge cases (today, yesterday, other year, null) |
| `utils/formatDuration.js` | `utils/formatDuration.test.js` | Seconds→"mm:ss", zero, large numbers, null |
| `utils/parseMentions.js` | `utils/parseMentions.test.js` | @mention parsing, #channel parsing, mixed content, edge cases |
| `utils/urlSafety.js` | `utils/urlSafety.test.js` | Safe URLs pass, javascript: blocked, data: blocked, relative paths |
| `utils/escapeHtml.js` | `utils/escapeHtml.test.js` | XSS prevention: `<script>`, quotes, ampersands |
| `utils/fileValidation.js` | `utils/fileValidation.test.js` | Type whitelist, size limits, empty files |
| `utils/getInitial.js` | `utils/getInitial.test.js` | Single name, two names, empty, special chars |
| `utils/currencies.js` | `utils/currencies.test.js` | Symbol lookup, formatting, unknown currency fallback |

**Example test — `api.test.js`**:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Test token refresh, cache, error handling
// Mock fetch globally, verify Authorization headers, cookie credentials
```

#### Priority 2: Hooks

| Hook | What to Test |
|------|-------------|
| `useIsAdmin` | Returns true for admin role, false for member, handles missing workspace |
| `useLongPress` | Timer fires after 500ms, cancels on move >10px, distinguishes click vs long-press |
| `useOnlineStatus` | Tracks navigator.onLine, responds to online/offline events |
| `useSwipeGesture` | Horizontal detection, velocity threshold, edge-only mode, direction lock |

#### Priority 3: Context Providers

| Context | What to Test |
|---------|-------------|
| `AuthContext` | Login sets user + token, logout clears state, silent refresh on mount, Google login flow, error states |
| `ThemeContext` | Theme switching, dark/light toggle, system sync, workspace override, persistence to localStorage |
| `ToastContext` | Show/dismiss toast, auto-dismiss timing, multiple toasts stack, success/error/warning variants |
| `SocketContext` | Connect/disconnect lifecycle, room join/leave, typing events, presence updates, reconnect on auth change |

#### Priority 4: Component Behavior (selective)

Focus on components with complex logic, not simple display components:

| Component | What to Test |
|-----------|-------------|
| `MessageInput` | Text entry, file attachment, emoji picker toggle, @mention autocomplete, send on Enter, Shift+Enter for newline |
| `MessageList` | Renders messages, unread marker, scroll to bottom, load more on scroll up, reaction display |
| `Login` | Form validation, submit calls api.login, error display, Google button renders |
| `Signup` | Password complexity validation, matching passwords, submit flow |
| `ChannelView` | Loads messages on mount, joins socket room, displays typing indicator, handles empty state |
| `SongList` | Renders song list, search filter, bulk import trigger, empty state |
| `SetlistBuilder` | Drag-drop reorder (mock dnd-kit), add/remove songs, duration calculation |
| `Modal` | Focus trap, ESC to close, ARIA attributes, portal rendering |
| `ConfirmDialog` | Confirm/cancel callbacks, displays message, keyboard handling |
| `ErrorBoundary` | Catches render errors, displays fallback UI |
| `ErrorMessage` | Shows message, retry button calls callback |

### Running Web Tests

```bash
cd client
npm test              # Single run
npm run test:watch    # Watch mode during development
npm run test:coverage # With coverage report
```

---

## 5. Mobile Tests (New)

### Constraints

- **No Mac** — Cannot run iOS simulator, no Xcode, no SwiftUI tests
- **Android only** — Emulator on Windows or physical device via Expo Go / dev build
- **Expo managed** — No native module unit testing (can't test Expo Calendar, Haptics, etc. in isolation)
- **React Native Testing Library** — Can test component rendering and interaction logic

### Setup: Jest + React Native Testing Library

#### Installation

```bash
cd mobile
npm install -D @testing-library/react-native @testing-library/jest-native jest-expo react-test-renderer
```

#### Configuration

**Update `mobile/package.json`**:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/ --quiet",
    "lint:critical": "eslint src/ --rule '{\"no-undef\": \"error\"}' --quiet"
  },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterSetup": ["./src/test/setup.js"],
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-purchases)"
    ],
    "testPathIgnorePatterns": ["/node_modules/", "/__tests__/smoke.test.js"],
    "collectCoverageFrom": [
      "src/**/*.{js,jsx}",
      "!src/test/**"
    ]
  }
}
```

**`mobile/src/test/setup.js`**:
```js
import '@testing-library/jest-native/extend-expect';

// Mock all native modules
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 0, Medium: 1, Heavy: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => ({ data: 'ExponentPushToken[test]' })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images', All: 'All' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(() => []),
  multiSet: jest.fn(),
  clear: jest.fn(),
}));

jest.mock('react-native-purchases', () => ({
  configure: jest.fn(),
  getOfferings: jest.fn(() => ({ current: null })),
  purchasePackage: jest.fn(),
  getCustomerInfo: jest.fn(() => ({ entitlements: { active: {} } })),
  logIn: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => true),
  isEnrolledAsync: jest.fn(() => true),
  authenticateAsync: jest.fn(() => ({ success: true })),
}));

jest.mock('expo-calendar', () => ({
  requestCalendarPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
  getCalendarsAsync: jest.fn(() => []),
  createEventAsync: jest.fn(() => 'event-1'),
}));

jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({
  configureNext: jest.fn(),
  create: jest.fn(),
  Types: { spring: 'spring', linear: 'linear', easeInEaseOut: 'easeInEaseOut' },
  Properties: { opacity: 'opacity', scaleXY: 'scaleXY' },
  Presets: { easeInEaseOut: {}, linear: {}, spring: {} },
}));
```

**`mobile/src/test/renderWithProviders.js`**:
```js
import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';

export function renderWithProviders(ui, options = {}) {
  return render(
    <NavigationContainer>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            {ui}
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </NavigationContainer>,
    options
  );
}
```

### Test Plan by Priority

#### Priority 1: ApiService (Most critical — 150+ methods)

| What to Test | Details |
|-------------|---------|
| Token management | `loadTokens`, `setTokens`, `clearTokens` read/write AsyncStorage correctly |
| Token refresh | `refreshAccessToken` sends refresh token, updates stored tokens, retries original request |
| Request building | `request()` adds Authorization header, handles timeout, parses JSON |
| Cache behavior | `cachedRequest` returns cached data within TTL, fetches fresh after TTL, `invalidateCache` clears matching keys |
| Error handling | 401 triggers refresh, 403 surfaces error, network failure throws, timeout handled |
| Upload | `uploadFile` sends multipart/form-data, `uploadFileWithProgress` reports progress |

#### Priority 2: Utilities

| File | What to Test |
|------|-------------|
| `formatDate.js` | Same as web — date edge cases |
| `formatDuration.js` | Seconds to display string |
| `parseMentions.js` | @user and #channel extraction |
| `urlSafety.js` | Safe/unsafe URL detection |
| `haptics.js` | Calls correct Expo Haptics method per feedback type |
| `getInitial.js` | Avatar initial extraction |
| `getCurrencySymbol.js` | Currency code → symbol mapping |
| `getAvatarColor.js` | Deterministic color from name hash |
| `buildSetlistHTML.js` | HTML output contains song names, durations, venue logo |
| `buildSongListHTML.js` | HTML output contains song metadata |

#### Priority 3: Context Providers

| Context | What to Test |
|---------|-------------|
| `AuthContext` | Login/signup update user state, logout clears tokens + RevenueCat, biometric lock/unlock cycle, offline retry |
| `ThemeContext` | Theme switching updates colors object, workspace override applies, system mode follows OS, persistence to AsyncStorage |
| `ToastContext` | Toast appears with correct type/message, auto-dismisses, multiple toasts stack |
| `SocketContext` | Connect on auth, disconnect on logout, join/leave channel rooms, typing events emit correctly |

#### Priority 4: Component Behavior

| Component | What to Test |
|-----------|-------------|
| `ErrorState` | Renders title, description, icon (Ionicons), retry button calls onRetry |
| `MessageBubble` | Renders content, author, timestamp, attachments, reactions, edit indicator |
| `MessageInput` | Text input, attachment button, send button disabled when empty |
| `Badge` | Renders count, hides when zero, theme-colored |
| `ActionSheet` | Shows options, calls onSelect with correct option, cancel dismisses |
| `ChannelItem` | Renders name, unread count, muted/starred indicators |
| `OfflineBanner` | Shows when offline, hides when online |

#### Priority 5: Screen Logic (selective — complex screens only)

| Screen | What to Test |
|--------|-------------|
| `LoginScreen` | Form validation, submit calls ApiService.login, error display, navigation to signup |
| `ChannelListScreen` | Loads channels, renders starred/unread sections, band nav categories |
| `SongListScreen` | Loads songs, search filter works, empty state shows |
| `GigListScreen` | Loads gigs, filter by status, empty state |
| `SettingsScreen` | Renders all setting options, navigation to sub-screens |

### Running Mobile Tests

```bash
cd mobile
npm test              # Single run
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

---

## 6. E2E Tests (New)

### Web E2E: Playwright

Playwright runs on Windows, tests in real browsers, and is the most reliable web E2E framework.

#### Installation

```bash
cd client
npm install -D @playwright/test
npx playwright install chromium
```

#### Configuration

**`client/playwright.config.js`**:
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

#### Critical E2E Flows (8 tests)

| # | Flow | Steps | Validates |
|---|------|-------|-----------|
| 1 | **Signup → Login → Logout** | Fill signup form → verify redirect → logout → verify login page | Auth pipeline works end-to-end |
| 2 | **Create workspace → Create channel → Send message** | New workspace → name channel → type message → verify appears | Core messaging flow |
| 3 | **Thread reply + Reaction** | Click reply on message → type reply → verify thread → add reaction → verify emoji | Threading + reactions |
| 4 | **Song CRUD + Bulk import** | Create song → edit → verify fields → delete → bulk import CSV → verify list | Music management |
| 5 | **Setlist builder** | Create setlist → add songs → drag reorder → add MC → verify order + duration | Setlist core flow |
| 6 | **Gig create + Attendance** | Create gig → set date/venue → mark going → verify calendar | Gig lifecycle |
| 7 | **Search messages** | Send known message → open search → query → verify result → click to navigate | Search + navigation |
| 8 | **Settings + Theme** | Open settings → change theme → verify CSS variables change → toggle dark mode | Theme system |

#### Running Web E2E

```bash
cd client
npx playwright test              # Headless
npx playwright test --headed     # Watch in browser
npx playwright test --ui         # Interactive UI mode
npx playwright show-report       # View results
```

**Requirements**: Server running on port 3001 with test database, client dev server on 5173.

### Mobile E2E: Maestro

Maestro is the simplest mobile E2E framework — YAML-based, works on Android emulators on Windows, no Mac needed.

#### Installation

```bash
# Install Maestro CLI (Windows via PowerShell)
curl -Ls "https://get.maestro.mobile.dev" | bash
# Or via npm:
npm install -g @mobile-dev-inc/maestro
```

#### Configuration

**`mobile/.maestro/`** directory structure:
```
mobile/.maestro/
├── flows/
│   ├── 01-login.yaml
│   ├── 02-create-workspace.yaml
│   ├── 03-send-message.yaml
│   ├── 04-songs.yaml
│   ├── 05-setlists.yaml
│   ├── 06-gigs.yaml
│   ├── 07-settings.yaml
│   └── 08-push-notification.yaml
└── config.yaml
```

#### Critical Mobile E2E Flows (8 tests)

**`01-login.yaml`**:
```yaml
appId: com.bandchat.app
---
- launchApp
- tapOn: "Email"
- inputText: "test@example.com"
- tapOn: "Password"
- inputText: "TestPass123"
- tapOn: "Sign In"
- assertVisible: "Workspaces"
```

**`02-create-workspace.yaml`**:
```yaml
appId: com.bandchat.app
---
- launchApp
- tapOn: "Create Workspace"
- inputText: "Test Band"
- tapOn: "Create"
- assertVisible: "general"
```

**`03-send-message.yaml`**:
```yaml
appId: com.bandchat.app
---
- launchApp
- tapOn: "general"
- tapOn: "Message"
- inputText: "Hello from Maestro test"
- tapOn:
    id: "send-button"
- assertVisible: "Hello from Maestro test"
```

| # | Flow | What It Validates |
|---|------|-------------------|
| 1 | Login | Auth flow, token storage, workspace redirect |
| 2 | Create workspace | Workspace creation, channel auto-generation |
| 3 | Send message | Messaging pipeline, real-time display |
| 4 | Song management | CRUD, list rendering, search |
| 5 | Setlist building | Song picker, reorder, save |
| 6 | Gig creation | Date picker, venue, attendance |
| 7 | Settings | Theme switch, profile edit, navigation |
| 8 | Notification tap | Deep link handling, channel resolution |

#### Running Mobile E2E

```bash
# Requires Android emulator running with dev build installed
cd mobile
maestro test .maestro/flows/
maestro test .maestro/flows/01-login.yaml  # Single flow
maestro studio                              # Interactive recording
```

**Requirements**: Android emulator or physical device, Expo dev build (not Expo Go — Maestro needs a standalone app).

---

## 7. Manual Testing Checklists

Use these checklists when making changes. Test on **both web and Android** unless noted.

### 7.1 Authentication

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| A1 | Sign up with valid credentials | ☐ | ☐ | Email + password (8+ chars, upper+lower+number) + display name → account created, redirected to workspaces |
| A2 | Sign up validation errors | ☐ | ☐ | Try: short password, no uppercase, no number, duplicate email, short display name → each shows error |
| A3 | Login with email/password | ☐ | ☐ | Valid credentials → logged in, token stored |
| A4 | Login with wrong password | ☐ | ☐ | Invalid password → error message, not logged in |
| A5 | Google OAuth login | ☐ | ☐ | Click Google button → OAuth flow → logged in |
| A6 | Apple Sign In | N/A | ☐ | iOS only (skip on Android) — tap Apple button → auth flow |
| A7 | Forgot password | ☐ | ☐ | Enter email → receive reset email → click link → set new password → login works |
| A8 | Token refresh | ☐ | ☐ | Wait 15+ minutes (or manually expire token) → next API call succeeds silently |
| A9 | Logout | ☐ | ☐ | Tap logout → redirected to login, token cleared, can't access protected routes |
| A10 | Session persistence | ☐ | ☐ | Login → close app/tab → reopen → still logged in |
| A11 | Biometric lock | N/A | ☐ | Enable biometric → background app 5min → reopen → biometric prompt |
| A12 | Account deletion | ☐ | ☐ | Settings > Security > Delete → enter password → confirm → account deleted, logged out |

### 7.2 Messaging

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| M1 | Send text message | ☐ | ☐ | Type in input → send → message appears in channel |
| M2 | Send with Enter, newline with Shift+Enter | ☐ | N/A | Enter sends, Shift+Enter creates newline |
| M3 | Edit message | ☐ | ☐ | Long-press/right-click own message → Edit → change text → save → "(edited)" shown |
| M4 | Delete message | ☐ | ☐ | Long-press/right-click own message → Delete → confirm → message removed |
| M5 | Send image (single) | ☐ | ☐ | Attach image → send → image renders with thumbnail |
| M6 | Send multiple images (up to 5) | ☐ | ☐ | Select 5 images → send → all render, gallery view works |
| M7 | Send file attachment | ☐ | ☐ | Attach PDF/doc → send → file card with download link |
| M8 | @mention user | ☐ | ☐ | Type @name → autocomplete appears → select → mention highlighted in sent message |
| M9 | #channel reference | ☐ | ☐ | Type #channel → autocomplete → select → clicking reference navigates to channel |
| M10 | Link preview | ☐ | ☐ | Send message with URL → preview card appears after short delay |
| M11 | Dismiss link preview | ☐ | ☐ | Author clicks X on preview → preview hidden, persists on reload |
| M12 | Add reaction | ☐ | ☐ | Click/long-press → emoji picker → select → reaction appears under message |
| M13 | Remove reaction | ☐ | ☐ | Click own reaction → reaction removed |
| M14 | Swipe to react | N/A | ☐ | Swipe left on message → thumbs up toggled |
| M15 | Reply in thread | ☐ | ☐ | Click reply → thread panel opens → send reply → appears in thread |
| M16 | Thread reply with formatting toolbar | ☐ | ☐ | Open thread → verify formatting toolbar appears in reply input |
| M17 | Pin message | ☐ | ☐ | Long-press → Pin → message appears in pinned messages panel |
| M18 | Save message (bookmark) | ☐ | ☐ | Long-press → Save → appears in Saved Messages view |
| M19 | Real-time delivery | ☐ | ☐ | Open same channel on two devices → send from one → appears on other within 2s |
| M20 | Typing indicator | ☐ | ☐ | User A types → User B sees "A is typing..." |
| M21 | Unread badge | ☐ | ☐ | Receive message in other channel → badge count increments → open channel → badge clears |
| M22 | Message search | ☐ | ☐ | Send unique message → search for it → result found → click → navigates to message |
| M23 | All Messages timeline | ☐ | ☐ | Open All Messages → shows messages from all channels in order |
| M24 | Empty channel state | ☐ | ☐ | New channel with no messages → shows helpful empty state |
| M25 | Report message | ☐ | ☐ | Long-press → Report → select reason → confirm → report submitted |
| M26 | Block user | ☐ | ☐ | Profile → Block → user's messages hidden → Settings > Blocked > Unblock |

### 7.3 Channels & Workspace

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| C1 | Create channel | ☐ | ☐ | New channel → name → public/private toggle → create → appears in sidebar |
| C2 | Create private channel | ☐ | ☐ | Create private → only added members see it |
| C3 | Create DM | ☐ | ☐ | New message → select user → send → DM appears in DMs section |
| C4 | Star channel | ☐ | ☐ | Star → appears in Starred section → unstar → returns to normal |
| C5 | Mute channel | ☐ | ☐ | Mute → no unread badges for muted channel → unmute restores |
| C6 | Channel groups (admin) | ☐ | ☐ | Create group → drag channel into group → collapse/expand → rename → delete |
| C7 | Channel members panel | ☐ | ☐ | Open members → see list → add member → remove member |
| C8 | Channel settings | ☐ | ☐ | Edit name, description, topic → save → changes reflected |
| C9 | Delete channel (admin) | ☐ | ☐ | Delete → confirm → channel removed, members redirected |
| C10 | Pin setlist to channel | ☐ | ☐ | Pin → expandable song list in channel header → unpin removes |
| C11 | Mark all read | ☐ | ☐ | Multiple unread channels → mark all read → all badges clear |
| C12 | Join workspace via invite | ☐ | ☐ | Share invite link → open → join → workspace appears in list |
| C13 | Leave workspace | ☐ | ☐ | Settings > Leave → confirm → workspace removed from list |
| C14 | Workspace switcher | ☐ | ☐ | Multiple workspaces → switch between → correct channels load |
| C15 | Unread badges on workspace list | ☐ | ☐ | Unread messages → workspace card shows badge count → enter workspace → clears |
| C16 | Per-workspace theme | ☐ | ☐ | Set different theme per workspace → switching workspaces changes theme |

### 7.4 Songs

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| S1 | Create song | ☐ | ☐ | Add song → title + artist → save → appears in list |
| S2 | Edit song metadata | ☐ | ☐ | Edit → change BPM, key, duration, notes → save → changes reflected |
| S3 | Add lyrics | ☐ | ☐ | Edit → add lyrics text → save → lyrics viewable |
| S4 | Delete song | ☐ | ☐ | Delete → confirm → removed from list and any setlists |
| S5 | Bulk import | ☐ | ☐ | Paste song list or CSV → import → all songs created → metadata enrichment starts |
| S6 | Metadata enrichment | ☐ | ☐ | After import → songs get album art, BPM, key, Spotify/YouTube links populated |
| S7 | Search/filter songs | ☐ | ☐ | Type in search → list filters in real-time |
| S8 | Song attachments | ☐ | ☐ | Upload PDF (chord chart) → appears in attachments → delete removes |
| S9 | Compact view toggle | ☐ | ☐ | Toggle compact → list shows minimal info → toggle back → full details |
| S10 | PDF export song list | ☐ | ☐ | Export → PDF generated with all songs formatted |
| S11 | Empty state | ☐ | ☐ | No songs → helpful empty state with "Add Song" CTA |

### 7.5 Setlists

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| SL1 | Create setlist | ☐ | ☐ | Name → create → empty setlist opens |
| SL2 | Add songs to setlist | ☐ | ☐ | Open setlist → add song → appears with position number |
| SL3 | Reorder songs (drag-drop) | ☐ | ☐ | Drag song to new position → order updates → duration recalculates |
| SL4 | Add MC section | ☐ | ☐ | Add MC → label + duration → appears between songs |
| SL5 | Add set break | ☐ | ☐ | Add break → divides setlist into sets |
| SL6 | Remove song from setlist | ☐ | ☐ | Remove → song removed, positions renumber |
| SL7 | Duplicate setlist | ☐ | ☐ | Duplicate → new copy with "(Copy)" suffix |
| SL8 | Set performers | ☐ | ☐ | Assign band members to setlist → displayed in print view |
| SL9 | Print/PDF export | ☐ | ☐ | Web: Print dialog opens. Mobile: PDF generated via expo-print |
| SL10 | Venue logo on print | ☐ | ☐ | Gig with venue logo → print → logo appears on PDF |
| SL11 | Delete setlist | ☐ | ☐ | Delete → confirm → removed from list |
| SL12 | Pin setlist to channel | ☐ | ☐ | Pin → expandable in channel → songs listed |

### 7.6 Gigs & Calendar

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| G1 | Create gig | ☐ | ☐ | New gig → title, date, type (Gig/Rehearsal/Other), venue → save |
| G2 | Gig time fields | ☐ | ☐ | Set sound check, doors, stage times → displayed correctly |
| G3 | Add venue to gig | ☐ | ☐ | Select or create venue → venue info shows on gig |
| G4 | Gig attendance | ☐ | ☐ | Mark Going/Maybe/Not Going → status saved, summary shows |
| G5 | Link setlist to gig | ☐ | ☐ | Add setlist → appears on gig detail → reorder multiple setlists |
| G6 | Complete gig | ☐ | ☐ | Mark complete → select songs played → gig moves to completed |
| G7 | Gig photos | ☐ | ☐ | Upload photo → appears in gallery → delete removes |
| G8 | Duplicate gig | ☐ | ☐ | Duplicate → new gig with same details, different date |
| G9 | Lock gig (admin) | ☐ | ☐ | Lock → non-admins can't edit → unlock restores editing |
| G10 | Calendar filters | ☐ | ☐ | Filter by type (Gig/Rehearsal) → only matching shown |
| G11 | Upcoming/Past split | ☐ | ☐ | Calendar shows upcoming and past sections separately |
| G12 | Next gig banner | ☐ | ☐ | Upcoming gig → banner in sidebar/header with date + venue |
| G13 | iCal feed | N/A | ☐ | Generate token → subscribe URL → events appear in device calendar |
| G14 | Add to device calendar | N/A | ☐ | Tap "Add to Calendar" → creates event in native calendar app |
| G15 | Cross-workspace gig view | ☐ | ☐ | Multiple workspaces with gigs → "All Gigs" shows combined calendar |

### 7.7 Band Management

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| B1 | Band members list | ☐ | ☐ | View members with instruments, roles, avatar |
| B2 | Create band member | ☐ | ☐ | Add → name, instruments, email → appears in list |
| B3 | Availability | ☐ | ☐ | Set available/maybe/not available for dates → grid shows colors |
| B4 | Contacts | ☐ | ☐ | CRUD external contacts (venues, promoters) → categorized |
| B5 | Announcements | ☐ | ☐ | Admin creates → members see → acknowledge → expiry hides |
| B6 | Polls | ☐ | ☐ | Create poll → vote → results update → close poll |
| B7 | Timeline | ☐ | ☐ | Events listed chronologically → auto-generate from gig history |
| B8 | Achievements | ☐ | ☐ | View definitions → check for new → awarded shows on profile |
| B9 | Band Kitty | ☐ | ☐ | Log income/expense → balance updates → currency formatting correct |
| B10 | Medleys | ☐ | ☐ | Create medley → add songs → reorder → appears in setlist options |
| B11 | Recordings | ☐ | ☐ | Upload recording → play back → associate with song |
| B12 | Practice dashboard | ☐ | ☐ | Log session → streak increments → timezone-correct day boundary |
| B13 | Stage plots | ☐ | ☐ | Create → drag equipment icons → add text labels → save → PDF export |
| B14 | Venues | ☐ | ☐ | CRUD venues → logo upload → appears in gig venue picker |

### 7.8 Settings & Admin

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| T1 | Change display name | ☐ | ☐ | Edit profile → new name → save → updated everywhere |
| T2 | Change avatar | ☐ | ☐ | Upload image → crop → save → new avatar shown |
| T3 | Change password | ☐ | ☐ | Enter current + new → save → login with new password works |
| T4 | Change email | ☐ | ☐ | Request change → verify new email → email updated |
| T5 | Theme switching | ☐ | ☐ | Select each of 20+ themes → colors apply correctly |
| T6 | Dark/Light toggle | ☐ | ☐ | Toggle → all UI elements switch → no broken contrast |
| T7 | System theme sync | ☐ | ☐ | Enable → change OS theme → app follows |
| T8 | Per-workspace theme | ☐ | ☐ | Set workspace A to Midnight, B to Ocean → switching applies correct theme |
| T9 | Notification preferences | ☐ | ☐ | Toggle DM/mention/gig notifications → only selected arrive |
| T10 | Notification snooze | ☐ | ☐ | Snooze for 1hr → no notifications → unsnoozed after period |
| T11 | Workspace members (admin) | ☐ | ☐ | View members → change role → remove member → member loses access |
| T12 | Invite management | ☐ | ☐ | Generate code → share → recipient joins → regenerate code invalidates old |
| T13 | Data export | ☐ | ☐ | Export user data → JSON downloaded with all personal data |
| T14 | Workspace export | ☐ | ☐ | Export workspace → JSON with channels, messages, songs, gigs |
| T15 | Push notifications | ☐ | ☐ | New message from another user → push arrives → tap opens channel |
| T16 | Upgrade screen | ☐ | ☐ | View plan info → see features → trigger purchase flow |
| T17 | Slack import | ☐ | N/A | Upload Slack export ZIP → parse → select channels → import → messages appear |
| T18 | Workspace import | ☐ | ☐ | Upload workspace backup → parse → restore → data visible |

### 7.9 Navigation & Deep Links

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| N1 | Direct URL to channel | ☐ | N/A | Navigate to /workspace/:id/channel/:id → loads correct channel |
| N2 | Deep link to workspace | N/A | ☐ | Open bandchat://workspace/:id → opens workspace |
| N3 | Deep link to channel | N/A | ☐ | Open bandchat://workspace/:id/channel/:id → opens channel |
| N4 | Invite deep link | ☐ | ☐ | Open /join/:code or bandchat://invite/:code → join dialog |
| N5 | Push notification tap | N/A | ☐ | Tap push → opens correct workspace + channel |
| N6 | DM push notification | N/A | ☐ | Tap DM push → opens DM with correct display name |
| N7 | Back navigation | ☐ | ☐ | Navigate deep → back button returns to previous screen correctly |
| N8 | Swipe back (mobile) | N/A | ☐ | Swipe from left edge → goes back |
| N9 | Band nav categories | ☐ | ☐ | Music/Gigs/People/Community sections → collapse/expand → navigate to each |
| N10 | Protected routes | ☐ | ☐ | Logged out → try protected URL → redirect to login → after login → redirect back |

### 7.10 Edge Cases & Error Handling

| # | Test Case | Web | Android | Steps |
|---|-----------|-----|---------|-------|
| E1 | Network disconnect | ☐ | ☐ | Disconnect network → offline banner shows → reconnect → banner hides, state syncs |
| E2 | File too large | ☐ | ☐ | Try uploading >15MB file → error message, upload blocked |
| E3 | Invalid file type | ☐ | ☐ | Try uploading .exe → rejected with error |
| E4 | Concurrent edits | ☐ | ☐ | Two users edit same song → both saves succeed, last write wins |
| E5 | Long message | ☐ | ☐ | Send very long message (5000+ chars) → renders correctly, no overflow |
| E6 | Special characters | ☐ | ☐ | Send message with <script>, emojis, unicode, RTL text → renders safely |
| E7 | Empty states | ☐ | ☐ | Each list view with no data → shows helpful empty state with CTA |
| E8 | Rapid actions | ☐ | ☐ | Quickly tap send 5 times → only one message sent (no duplicates) |
| E9 | Token expiry during action | ☐ | ☐ | Token expires mid-session → action retries with fresh token → succeeds |
| E10 | Deleted workspace member | ☐ | ☐ | Admin removes user while they're online → user kicked, redirect to workspace list |
| E11 | Soft-deleted workspace | ☐ | ☐ | Admin deletes workspace → all members see removed, can't access |
| E12 | Plan downgrade | ☐ | ☐ | PRO → FREE → gated features show upgrade prompt |

---

## 8. Regression Testing Protocol

### When to Test What

Use this matrix to determine which checklists to run based on what changed:

| Change Area | Automated Tests to Run | Manual Checklists to Run |
|-------------|----------------------|-------------------------|
| **Server auth routes** | `npm test -- tests/auth` | A1–A12 |
| **Server message routes** | `npm test -- tests/messages` | M1–M26 |
| **Server any route** | `npm test` (all server tests) | Related checklist section |
| **Socket handlers** | Socket handler tests (when added) | M19–M21, E1, E10 |
| **Web auth components** | `cd client && npm test -- auth` | A1–A12 |
| **Web messaging components** | `cd client && npm test -- Message` | M1–M26 |
| **Web any component** | `cd client && npm test` | Related section + N7, N9, N10 |
| **Mobile auth screens** | `cd mobile && npm test -- Login` | A1–A12 (Android only) |
| **Mobile messaging screens** | `cd mobile && npm test -- Channel Message` | M1–M26 (Android only) |
| **Mobile any screen** | `cd mobile && npm test` | Related section (Android only) |
| **Prisma schema change** | All server tests + manual CRUD tests | Full manual test of affected models |
| **CSS/theme changes** | Visual spot-check | T5–T8, verify 3+ themes |
| **Package dependency update** | All tests + build check | Smoke test core flows |
| **Navigation changes** | E2E tests | N1–N10 |
| **File upload changes** | Upload tests | M5–M7, G7, S8, E2–E3 |

### Pre-Release Checklist

Run before every App Store / Play Store submission or production deploy:

```
PRE-RELEASE REGRESSION TEST
============================

Date: ___________
Version: ___________
Tester: ___________

AUTOMATED (must all pass):
☐ Server tests: cd server && npm test (374 tests)
☐ Web build: cd client && npm run build (no errors)
☐ Web tests: cd client && npm test (when implemented)
☐ Mobile lint: cd mobile && npm run lint (no errors)
☐ Mobile tests: cd mobile && npm test (when implemented)
☐ Web E2E: cd client && npx playwright test (when implemented)

MANUAL SMOKE TEST (15 minutes — critical path):
☐ Login (web + Android)
☐ Send message in channel (web + Android)
☐ Send image attachment (web + Android)
☐ Reply in thread (web + Android)
☐ Create song (web + Android)
☐ Create setlist, add songs (web + Android)
☐ Create gig (web + Android)
☐ Switch themes (web + Android)
☐ Push notification received + tap navigates (Android)
☐ Deep link opens correct screen (Android)
☐ Search finds message (web + Android)
☐ Logout + login (web + Android)

PLATFORM-SPECIFIC:
☐ Web: Check 3 browsers (Chrome, Firefox, Safari/Edge)
☐ Web: Responsive — test at 375px, 768px, 1440px
☐ Android: Test on emulator + physical device
☐ Android: Keyboard doesn't cover inputs
☐ Android: Back button navigates correctly
☐ Android: Empty states render right-side-up (not flipped in inverted FlatList)

RESULT: ☐ PASS  ☐ FAIL (list failures below)
Notes:
```

### Post-Deploy Verification

After Railway/Vercel deploy completes:

```
POST-DEPLOY CHECK (5 minutes):
☐ Web loads at bandchat.vercel.app
☐ Login works
☐ Send a message
☐ Real-time delivery works (second device/tab)
☐ Push notification arrives
☐ No console errors
```

---

## 9. CI/CD Integration

### Current CI (`.github/workflows/ci.yml`)

```
Push to main / PR:
  1. Mobile ESLint
  2. Web Build Check
  3. Server Tests (PR only)
```

### Proposed CI Expansion

```yaml
# .github/workflows/ci.yml (proposed additions)

jobs:
  # EXISTING
  mobile-lint:
    # ... (keep as-is)

  web-build:
    # ... (keep as-is)

  server-tests:
    # ... (keep as-is, but run on push too, not just PRs)

  # NEW: Web unit tests
  web-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: client/package-lock.json }
      - run: cd client && npm ci
      - run: cd client && npm test

  # NEW: Mobile unit tests
  mobile-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: mobile/package-lock.json }
      - run: cd mobile && npm install --legacy-peer-deps
      - run: cd mobile && npm test

  # NEW: Web E2E (run on PRs only — slow)
  web-e2e:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: bandchat_test
        options: >-
          --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: cd server && npm ci && npx prisma generate && npx prisma db push
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/bandchat_test
      - run: cd server && node src/index.js &
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/bandchat_test
          JWT_SECRET: test-secret-minimum-32-characters-long
          JWT_REFRESH_SECRET: test-refresh-secret-32-characters
          NODE_ENV: test
          PORT: 3001
      - run: cd client && npm ci
      - run: cd client && npx playwright install --with-deps chromium
      - run: cd client && npx playwright test
        env:
          VITE_API_URL: http://localhost:3001
```

### CI Gate Policy

| Check | Required to Merge? | When |
|-------|-------------------|------|
| Mobile ESLint | **Yes** | Always |
| Web Build | **Yes** | Always |
| Server Tests | **Yes** | Always (change from PR-only) |
| Web Unit Tests | **Yes** (when added) | Always |
| Mobile Unit Tests | **Yes** (when added) | Always |
| Web E2E | **No** (advisory) | PRs only |

---

## 10. Platform Constraints & Workarounds

### No Mac — What This Means

| Capability | Status | Workaround |
|-----------|--------|-----------|
| iOS Simulator | ❌ Not available | Use Android emulator + physical iOS device (Expo Go or dev build via EAS) |
| Xcode builds | ❌ Not available | Use EAS Build (cloud) for iOS builds: `eas build --platform ios` |
| iOS E2E tests | ❌ Cannot run locally | Test on physical iOS device manually. Maestro E2E on Android only. |
| SwiftUI tests | ❌ Not applicable | BandChat is React Native (Expo managed), not SwiftUI |
| iOS-specific bugs | ⚠️ Hard to reproduce | Use EAS Build → TestFlight → test on physical device. Report-based triage. |
| Safari on iOS | ⚠️ Can't test locally | Test web app in Safari on physical iOS device |

### Android Testing on Windows

```
SETUP:
1. Install Android Studio → SDK Manager → install Android 14 (API 34)
2. AVD Manager → create Pixel 7 emulator (or similar)
3. Start emulator
4. cd mobile && npx expo start → press 'a' for Android

FOR E2E:
1. Build dev client: eas build --platform android --profile development
2. Install APK on emulator: adb install path/to/app.apk
3. Run Maestro: maestro test .maestro/flows/
```

### Physical Device Testing

```
iOS (via Expo Go or TestFlight):
1. Install Expo Go from App Store
2. cd mobile && npx expo start → scan QR code
   OR
3. eas build --platform ios --profile preview → install via TestFlight

Android (via Expo Go):
1. Install Expo Go from Play Store
2. cd mobile && npx expo start → scan QR code
   OR
3. eas build --platform android --profile preview → install APK
```

### What Each Testing Method Catches

| Method | Catches | Misses |
|--------|---------|--------|
| **Server unit tests** | API logic, auth, validation, DB operations | Client rendering, UX issues |
| **Web component tests** | Component logic, state management, rendering | Real browser behavior, CSS, network |
| **Mobile component tests** | Component logic, state, mocked native modules | Actual native behavior, gestures, haptics |
| **Web E2E (Playwright)** | Full browser flows, real network, CSS rendering | Mobile-specific issues, native features |
| **Mobile E2E (Maestro)** | Full Android flows, real touch, real navigation | iOS behavior, iOS-only features |
| **Manual testing** | Everything visible | Automation gaps, regression if not re-tested |
| **ESLint** | Broken imports, undefined vars, hook violations | Logic bugs, runtime errors |
| **Build check** | Syntax errors, missing dependencies | Runtime behavior |

---

## Appendix A: Test File Naming Conventions

```
# Server (existing pattern)
server/tests/{routeModule}.test.js

# Web (new)
client/src/services/__tests__/api.test.js
client/src/hooks/__tests__/useIsAdmin.test.js
client/src/context/__tests__/AuthContext.test.jsx
client/src/components/auth/__tests__/Login.test.jsx
client/src/components/messages/__tests__/MessageInput.test.jsx
client/src/utils/__tests__/formatDate.test.js
client/e2e/auth.spec.js
client/e2e/messaging.spec.js

# Mobile (new)
mobile/src/services/__tests__/ApiService.test.js
mobile/src/utils/__tests__/formatDate.test.js
mobile/src/context/__tests__/AuthContext.test.js
mobile/src/components/__tests__/ErrorState.test.js
mobile/src/screens/__tests__/LoginScreen.test.js
mobile/.maestro/flows/*.yaml
```

## Appendix B: Implementation Roadmap

Prioritized order for building out the test suite:

| Phase | Scope | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1** | Web + Mobile utility tests (formatDate, parseMentions, urlSafety, etc.) | 1 day | Catch logic regressions in shared code |
| **Phase 2** | Web + Mobile API service tests (token refresh, caching, error handling) | 2 days | Catch auth and data-fetching regressions |
| **Phase 3** | Web + Mobile context tests (Auth, Theme, Toast, Socket) | 2 days | Catch state management regressions |
| **Phase 4** | Server Socket.IO handler tests | 1 day | Catch real-time messaging regressions |
| **Phase 5** | Web component tests (top 15 components) | 3 days | Catch UI rendering regressions |
| **Phase 6** | Mobile component tests (top 15 screens) | 3 days | Catch mobile UI regressions |
| **Phase 7** | Web E2E with Playwright (8 critical flows) | 2 days | Catch full-flow regressions in browser |
| **Phase 8** | Mobile E2E with Maestro (8 critical flows) | 2 days | Catch full-flow regressions on Android |
| **Phase 9** | CI/CD integration (run all tests in pipeline) | 1 day | Enforce quality gates on every PR |

**Total: ~17 days to full coverage**

Start with Phases 1–3 (5 days) to get the highest-value coverage fastest.

## Appendix C: Quick Reference Commands

```bash
# Run everything (from project root)
cd server && npm test && cd ../client && npm test && npm run build && cd ../mobile && npm run lint && npm test

# Server only
cd server && npm test
cd server && npm run test:file -- tests/messages.test.js

# Web only
cd client && npm test
cd client && npm run test:watch
cd client && npm run test:coverage
cd client && npx playwright test

# Mobile only
cd mobile && npm test
cd mobile && npm run lint
cd mobile && maestro test .maestro/flows/

# Pre-commit (runs automatically via Husky)
npx lint-staged
```
