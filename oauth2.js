// Copyright 2012-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const {URL} = require('url');
const opn = require('open');
const destroyer = require('server-destroy');

const {google} = require('googleapis');

const PORT = 3000;
const HOST = '127.0.0.1';
const CALLBACK_PATH = '/oauth2callback';

/**
 * To use OAuth2 authentication, we need access to a CLIENT_ID, CLIENT_SECRET, AND REDIRECT_URI.
 * To get these credentials for your application, visit https://console.cloud.google.com/apis/credentials.
 */
const keyPath = path.join(__dirname, 'oauth2.keys.json');
if (!fs.existsSync(keyPath)) {
  console.error(
    `Missing ${keyPath}. Download OAuth client credentials from Google Cloud Console and save them as oauth2.keys.json (this file is gitignored).`
  );
  process.exit(1);
}

const keys = require(keyPath).web;
if (!keys || !keys.client_id || !keys.client_secret || !keys.redirect_uris?.[0]) {
  console.error(
    'oauth2.keys.json must contain a web client with client_id, client_secret, and redirect_uris[0].'
  );
  process.exit(1);
}

/**
 * Create a new OAuth2 client with the configured keys.
 */
const oauth2Client = new google.auth.OAuth2(
  keys.client_id,
  keys.client_secret,
  keys.redirect_uris[0]
);

/**
 * This is one of the many ways you can configure googleapis to use authentication credentials.
 * In this method, we're setting a global reference for all APIs.
 */
google.options({auth: oauth2Client});

/**
 * Open an http server to accept the oauth callback. Bound to loopback only.
 */
async function authenticate(scopes) {
  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(32).toString('hex');
    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes.join(' '),
      state,
      prompt: 'consent',
    });

    const server = http
      .createServer(async (req, res) => {
        try {
          const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);
          if (requestUrl.pathname !== CALLBACK_PATH) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const returnedState = requestUrl.searchParams.get('state');
          if (!returnedState || returnedState !== state) {
            res.writeHead(400);
            res.end('Invalid OAuth state');
            reject(new Error('Invalid OAuth state'));
            server.destroy();
            return;
          }

          const code = requestUrl.searchParams.get('code');
          if (!code) {
            const error = requestUrl.searchParams.get('error') || 'missing code';
            res.writeHead(400);
            res.end(`Authorization failed: ${error}`);
            reject(new Error(`Authorization failed: ${error}`));
            server.destroy();
            return;
          }

          const {tokens} = await oauth2Client.getToken(code);
          oauth2Client.credentials = tokens; // eslint-disable-line require-atomic-updates

          // Never send tokens in the HTTP response (browser history / shoulder-surfing).
          console.log(JSON.stringify(tokens, null, 2));
          res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
          res.end('Authentication successful. You can close this window. Tokens were printed to the terminal.');

          resolve(oauth2Client);
          server.destroy();
        } catch (e) {
          if (!res.headersSent) {
            res.writeHead(500);
            res.end('Authentication error');
          }
          reject(e);
          try {
            server.destroy();
          } catch (_) {
            /* ignore */
          }
        }
      })
      .listen(PORT, HOST, () => {
        opn(authorizeUrl, {wait: false}).then(cp => cp.unref());
      });
    destroyer(server);
  });
}

const scopeArg = process.argv[2];
if (!scopeArg) {
  console.error(
    'Usage: node oauth2.js <scope>[,scope...]\n' +
      'Example: node oauth2.js drive.readonly,gmail.readonly'
  );
  process.exit(1);
}

const scopes = scopeArg.split(',').map(scope => {
  const trimmed = scope.trim();
  if (!trimmed || !/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    console.error(`Invalid scope segment: ${JSON.stringify(scope)}`);
    process.exit(1);
  }
  return `https://www.googleapis.com/auth/${trimmed}`;
});

authenticate(scopes).catch(err => {
  console.error(err);
  process.exit(1);
});
