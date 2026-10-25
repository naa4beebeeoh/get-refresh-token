'use strict';

const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const script = path.join(root, 'oauth2.js');
const keyPath = path.join(root, 'oauth2.keys.json');

let failed = 0;

function pass(name) {
  console.log(`ok - ${name}`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`not ok - ${name}`);
  if (detail) {
    console.error(detail);
  }
}

function runOauth(args, {withKeys} = {}) {
  const hadKeys = fs.existsSync(keyPath);
  let previous;
  if (hadKeys) {
    previous = fs.readFileSync(keyPath);
  }

  try {
    if (withKeys === undefined) {
      if (hadKeys) {
        fs.unlinkSync(keyPath);
      }
    } else if (withKeys === null) {
      if (hadKeys) {
        fs.unlinkSync(keyPath);
      }
    } else {
      fs.writeFileSync(keyPath, JSON.stringify(withKeys));
    }

    return spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: {...process.env, OPEN_DISABLE: '1'},
    });
  } finally {
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
    }
    if (hadKeys) {
      fs.writeFileSync(keyPath, previous);
    }
  }
}

function assertExit(name, result, expectedCode, stderrIncludes) {
  if (result.error) {
    fail(name, result.error.stack || String(result.error));
    return;
  }
  if (result.status !== expectedCode) {
    fail(
      name,
      `expected exit ${expectedCode}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
    return;
  }
  if (stderrIncludes && !result.stderr.includes(stderrIncludes)) {
    fail(name, `stderr missing ${JSON.stringify(stderrIncludes)}\nstderr:\n${result.stderr}`);
    return;
  }
  pass(name);
}

// --- checks ---

const syntax = spawnSync(process.execPath, ['--check', script], {
  cwd: root,
  encoding: 'utf8',
});
if (syntax.status === 0) {
  pass('oauth2.js syntax check');
} else {
  fail('oauth2.js syntax check', syntax.stderr || syntax.stdout);
}

for (const mod of ['googleapis', 'open', 'server-destroy']) {
  try {
    require(mod);
    pass(`require('${mod}')`);
  } catch (err) {
    fail(`require('${mod}')`, err.stack);
  }
}

const source = fs.readFileSync(script, 'utf8');
if (source.includes(".listen(PORT, HOST") && source.includes("HOST = '127.0.0.1'")) {
  pass('callback server binds to loopback');
} else {
  fail('callback server binds to loopback');
}
if (source.includes('returnedState') && source.includes('state')) {
  pass('OAuth state validation present');
} else {
  fail('OAuth state validation present');
}
if (!/res\.end\(\s*JSON\.stringify\(\s*tokens/.test(source)) {
  pass('tokens are not sent in HTTP response');
} else {
  fail('tokens are not sent in HTTP response');
}

assertExit(
  'exits when oauth2.keys.json is missing',
  runOauth([], {withKeys: null}),
  1,
  'Missing'
);

assertExit(
  'exits when oauth2.keys.json is incomplete',
  runOauth(['drive.readonly'], {
    withKeys: {web: {client_id: 'x', client_secret: 'y', redirect_uris: []}},
  }),
  1,
  'oauth2.keys.json must contain'
);

const validKeys = {
  web: {
    client_id: 'test-client-id',
    client_secret: 'test-client-secret',
    redirect_uris: ['http://127.0.0.1:3000/oauth2callback'],
  },
};

assertExit(
  'exits with usage when scope arg is missing',
  runOauth([], {withKeys: validKeys}),
  1,
  'Usage:'
);

assertExit(
  'rejects invalid scope segments',
  runOauth(['drive.readonly;rm -rf /'], {withKeys: validKeys}),
  1,
  'Invalid scope segment'
);

if (failed > 0) {
  console.error(`\n${failed} sanity check(s) failed`);
  process.exit(1);
}

console.log('\nAll sanity checks passed');
