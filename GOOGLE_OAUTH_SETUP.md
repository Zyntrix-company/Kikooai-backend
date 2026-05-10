# Google OAuth Setup Guide

This document covers everything needed to wire up Google Sign-In across three layers:

1. **Google Cloud Console** — create credentials
2. **Backend (Node.js)** — already implemented (see below)
3. **Mobile App (Flutter / React Native)** — steps to do in the app

---

## Architecture Overview

```
Mobile App
  │
  │  1. User taps "Sign in with Google"
  │  2. Google Sign-In SDK shows Google's consent screen
  │  3. SDK returns an ID Token (a signed JWT from Google)
  │
  ▼
POST /api/v1/auth/google   { idToken, role?, username? }
  │
  │  4. Backend verifies ID Token with Google's servers
  │  5. Backend finds or creates the user in PostgreSQL
  │  6. Backend returns your app's own JWT + refreshToken
  │
  ▼
Mobile App stores accessToken + refreshToken
(same as email/password login — no special handling needed)
```

---

## Part 1 — Google Cloud Console

### Step 1: Create a Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project**
3. Name it (e.g. `Kikooai`) and click **Create**

### Step 2: Enable the Google Sign-In API

1. In the sidebar go to **APIs & Services → Library**
2. Search for **"Google Sign-In"** (or **"Identity Toolkit API"**)
3. Click **Enable**

### Step 3: Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (for public apps) → **Create**
3. Fill in:
   - **App name**: Kikooai
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue** through all steps (you can skip Scopes and Test users for now)
5. On the last page click **Back to Dashboard**

### Step 4: Create OAuth 2.0 Credentials

You need **one credential per platform**.

#### 4a. Android Credential

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Android**
3. **Package name**: your app's package name (e.g. `com.kikooai.app`)
4. **SHA-1 certificate fingerprint**: run this in your project root:
   ```bash
   # Debug keystore (development)
   keytool -keystore ~/.android/debug.keystore -list -v -alias androiddebugkey -storepass android
   
   # Release keystore (production) — use your own keystore file
   keytool -keystore your-release-key.jks -list -v
   ```
   Copy the `SHA1:` value.
5. Click **Create** — you do NOT get a client secret for Android, only a client ID.
6. Note down the **Android Client ID** (format: `xxxxxxxx.apps.googleusercontent.com`)

#### 4b. iOS Credential

1. **Create Credentials → OAuth client ID**
2. Application type: **iOS**
3. **Bundle ID**: your app's bundle ID (e.g. `com.kikooai.app`)
4. Click **Create**
5. Download the `GoogleService-Info.plist` — you'll need it in the Flutter/iOS project.
6. Note down the **iOS Client ID**

#### 4c. Web / Backend Credential (used by the Node.js server)

1. **Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Name: `Kikooai Backend`
4. **Authorized redirect URIs**: leave empty (not needed for mobile token verification flow)
5. Click **Create**
6. Copy the **Client ID** — this is what goes in your `.env` as `GOOGLE_CLIENT_ID`

> **Why a Web credential for a mobile app?**
> Mobile apps obtain an ID Token using their platform credential, but the backend
> verifies it against a *Web* client ID (the "audience" check). You pass the
> Web Client ID as the `serverClientId` / `SERVER_CLIENT_ID` when configuring
> the mobile SDK.

### Step 5: Add GOOGLE_CLIENT_ID to your backend .env

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

---

## Part 2 — Backend (Already Done)

The following changes have already been made to the Node.js backend:

### New migration: `014_google_oauth.sql`

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email';
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
```

Run this migration to apply it:

```bash
# Run migrations (using whatever migrate script is in the project)
node src/db/migrate.js
```

### New endpoint: `POST /api/v1/auth/google`

**Request body:**

```json
{
  "idToken": "<Google ID Token from mobile SDK>",
  "role": "student",        // required only for NEW users
  "username": "john_doe"    // required only for NEW users (3-30 alphanumeric chars)
}
```

**Response (existing user):**

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "fullname": "...", ... },
    "accessToken": "eyJ...",
    "refreshToken": "uuid-string",
    "isNewUser": false
  }
}
```

**Response (new user — HTTP 201):**

```json
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "eyJ...",
    "refreshToken": "uuid-string",
    "isNewUser": true
  }
}
```

**Error codes:**

| Code | HTTP | Meaning |
|------|------|---------|
| `INVALID_GOOGLE_TOKEN` | 401 | Token failed Google's verification |
| `MISSING_SIGNUP_FIELDS` | 422 | New user but `role` or `username` missing |
| `DUPLICATE_USERNAME` | 409 | Username already taken |
| `ACCOUNT_BANNED` | 403 | User is banned |

### Account linking

If a user previously registered with email/password and then signs in with Google
using the same email address, the backend **automatically links** their Google ID
to the existing account. No data is lost.

---

## Part 3 — Mobile App

### Flutter

#### Install packages

```yaml
# pubspec.yaml
dependencies:
  google_sign_in: ^6.2.1
  http: ^1.2.0           # or dio, whichever you use
```

```bash
flutter pub get
```

#### Android — `android/app/build.gradle`

No extra changes needed beyond the SHA-1 setup in Cloud Console above.

#### iOS — `ios/Runner/Info.plist`

Add your reversed iOS Client ID (from `GoogleService-Info.plist`):

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <!-- Reversed iOS Client ID from GoogleService-Info.plist -->
      <string>com.googleusercontent.apps.YOUR_IOS_CLIENT_ID</string>
    </array>
  </dict>
</array>
```

#### Flutter sign-in code

```dart
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

final GoogleSignIn _googleSignIn = GoogleSignIn(
  // This MUST be your Web Client ID from Google Cloud Console
  serverClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
);

Future<void> signInWithGoogle({ String? role, String? username }) async {
  try {
    final GoogleSignInAccount? account = await _googleSignIn.signIn();
    if (account == null) return; // user cancelled

    final GoogleSignInAuthentication auth = await account.authentication;
    final String idToken = auth.idToken!;

    final response = await http.post(
      Uri.parse('https://your-api.com/api/v1/auth/google'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'idToken': idToken,
        if (role != null) 'role': role,
        if (username != null) 'username': username,
      }),
    );

    final body = jsonDecode(response.body);

    if (response.statusCode == 200 || response.statusCode == 201) {
      final data = body['data'];
      final bool isNewUser = data['isNewUser'];
      final String accessToken = data['accessToken'];
      final String refreshToken = data['refreshToken'];

      // Store tokens securely (flutter_secure_storage recommended)
      // ...

      if (isNewUser) {
        // Navigate to profile completion screen if needed
      } else {
        // Navigate to home screen
      }
    } else {
      // Handle errors: body['code'], body['message']
      print('Error: ${body['code']} — ${body['message']}');
    }
  } catch (e) {
    print('Google Sign-In failed: $e');
  }
}
```

#### Recommended flow for new users

When `isNewUser: true` is returned, you may want to ask the user for their `role`
and `username` before calling the backend. Keep the `idToken` in memory (it's
valid for 1 hour) and re-send it with those fields:

```dart
// Show a screen to collect role + username
// Then call:
await signInWithGoogle(role: selectedRole, username: chosenUsername);
```

---

### React Native

#### Install packages

```bash
npm install @react-native-google-signin/google-signin
# or
yarn add @react-native-google-signin/google-signin
```

Follow the [library's setup guide](https://github.com/react-native-google-signin/google-signin) for
Android (`google-services.json`) and iOS (`GoogleService-Info.plist`).

#### Android — `android/app/google-services.json`

Download from Cloud Console:
1. **APIs & Services → Credentials** → click on your Android credential
2. Download `google-services.json`
3. Place it at `android/app/google-services.json`

#### iOS — `ios/GoogleService-Info.plist`

Download from Cloud Console and add it to Xcode:
1. Open Xcode → drag `GoogleService-Info.plist` into the `Runner` target

#### React Native sign-in code

```javascript
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

// Call once at app startup (e.g., in App.js)
GoogleSignin.configure({
  // Web Client ID from Google Cloud Console
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
});

async function signInWithGoogle(role, username) {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const { idToken } = userInfo.data;  // v13+ API

    const response = await fetch('https://your-api.com/api/v1/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        ...(role && { role }),
        ...(username && { username }),
      }),
    });

    const body = await response.json();

    if (response.ok) {
      const { accessToken, refreshToken, isNewUser } = body.data;
      // Store tokens (react-native-keychain or AsyncStorage)
      if (isNewUser) {
        // Navigate to onboarding / profile completion
      } else {
        // Navigate to home
      }
    } else {
      console.error(body.code, body.message);
    }
  } catch (error) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      console.log('User cancelled sign-in');
    } else if (error.code === statusCodes.IN_PROGRESS) {
      console.log('Sign-in already in progress');
    } else {
      console.error(error);
    }
  }
}
```

---

## Token Storage (Both Platforms)

Never store tokens in plain AsyncStorage or SharedPreferences.

| Platform | Recommended package |
|----------|---------------------|
| Flutter  | `flutter_secure_storage` |
| React Native | `react-native-keychain` |

---

## Checklist

### Google Cloud Console
- [ ] Project created
- [ ] OAuth consent screen configured
- [ ] Android OAuth Client ID created (with correct SHA-1)
- [ ] iOS OAuth Client ID created (with correct Bundle ID)
- [ ] Web OAuth Client ID created (for backend)
- [ ] `google-services.json` downloaded for Android
- [ ] `GoogleService-Info.plist` downloaded for iOS

### Backend
- [ ] `GOOGLE_CLIENT_ID` set in `.env` (Web Client ID)
- [ ] Migration `014_google_oauth.sql` has been run on the database
- [ ] Server restarted after env change

### Flutter
- [ ] `google_sign_in` package added
- [ ] `serverClientId` set to Web Client ID
- [ ] `CFBundleURLSchemes` added to `Info.plist` (iOS)
- [ ] Tokens stored with `flutter_secure_storage`

### React Native
- [ ] `@react-native-google-signin/google-signin` installed and linked
- [ ] `google-services.json` in `android/app/`
- [ ] `GoogleService-Info.plist` in iOS Xcode project
- [ ] `webClientId` set to Web Client ID in `GoogleSignin.configure()`
- [ ] Tokens stored with `react-native-keychain`
