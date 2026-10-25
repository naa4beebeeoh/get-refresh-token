# get-refresh-token

Local Node.js helper that runs Google's OAuth 2.0 authorization code flow with offline access and prints the resulting tokens (including a refresh token) to your terminal.

## What it does

1. Loads a Google OAuth web client from `oauth2.keys.json` (gitignored).
2. Opens your browser to Google's consent screen for the scopes you pass in.
3. Listens on `http://127.0.0.1:3000/oauth2callback` for the redirect.
4. Validates OAuth `state`, exchanges the auth code for tokens, and prints the token JSON to stdout.
5. Tokens are never sent in the browser response—only a short success message.

## Setup

1. Create an OAuth 2.0 **Web application** client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add this authorized redirect URI:

   ```
   http://127.0.0.1:3000/oauth2callback
   ```

3. Download the client JSON and save it as `oauth2.keys.json` in the repo root. It must include a `web` object with `client_id`, `client_secret`, and `redirect_uris[0]`.
4. Install dependencies:

   ```bash
   npm install
   ```

## Usage

Pass one or more Google API scope suffixes (comma-separated). Each is expanded to `https://www.googleapis.com/auth/<suffix>`:

```bash
node oauth2.js drive.readonly
node oauth2.js drive.readonly,gmail.readonly
```

After you approve access in the browser, the terminal prints something like:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "scope": "...",
  "token_type": "Bearer",
  "expiry_date": 1234567890123
}
```

`prompt: 'consent'` and `access_type: 'offline'` are set so Google is more likely to return a refresh token.

## Tests

```bash
npm test
```

Runs sanity checks (syntax, dependency load, security-related assertions, and CLI validation). CI runs the same checks on pull requests.
