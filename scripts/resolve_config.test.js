// resolve_config.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolvePath, init } = require('./resolve_config');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));

test('level 1: env var wins', () => {
  const r = resolvePath({ env: { ORDER_COFFEE_CONFIG: '/custom/c.json' }, home: tmp(), skillDir: tmp() });
  assert.strictEqual(r.path, '/custom/c.json');
  assert.strictEqual(r.level, 1);
});

test('level 2: default home path when it exists', () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, '.order-coffee'));
  const p = path.join(home, '.order-coffee', 'config.json');
  fs.writeFileSync(p, '{}');
  const r = resolvePath({ env: {}, home, skillDir: tmp() });
  assert.strictEqual(r.path, p);
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.exists, true);
});

test('level 3: skillDir fallback when only it exists', () => {
  const skillDir = tmp();
  const p = path.join(skillDir, 'config.json');
  fs.writeFileSync(p, '{}');
  const r = resolvePath({ env: {}, home: tmp(), skillDir });
  assert.strictEqual(r.path, p);
  assert.strictEqual(r.level, 3);
});

test('none exist: resolves to level-2 path, exists=false', () => {
  const home = tmp();
  const r = resolvePath({ env: {}, home, skillDir: tmp() });
  assert.strictEqual(r.path, path.join(home, '.order-coffee', 'config.json'));
  assert.strictEqual(r.exists, false);
  assert.strictEqual(r.level, 2);
});

test('init creates level-2 with mode 600 and version 1', () => {
  const home = tmp();
  const r = init({ env: {}, home, skillDir: tmp() });
  assert.strictEqual(r.created, true);
  const stat = fs.statSync(r.path);
  assert.strictEqual(stat.mode & 0o777, 0o600);
  const cfg = JSON.parse(fs.readFileSync(r.path, 'utf8'));
  assert.strictEqual(cfg.version, 1);
  assert.deepStrictEqual(cfg.favorites, []);
});

test('init is idempotent when config already exists', () => {
  const home = tmp();
  const first = init({ env: {}, home, skillDir: tmp() });
  const second = init({ env: {}, home, skillDir: tmp() });
  assert.strictEqual(second.created, false);
  assert.strictEqual(second.path, first.path);
});
