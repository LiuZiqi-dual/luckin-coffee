// resolve_config.js — resolve/create the order-coffee config file.
// Config holds ONLY store preferences + coords. Never tokens/phone/payment.
const fs = require('fs');
const os = require('os');
const path = require('path');

function level2Path(home) { return path.join(home, '.order-coffee', 'config.json'); }

// 3-level priority: $ORDER_COFFEE_CONFIG (1) -> ~/.order-coffee/config.json (2)
// -> <skillDir>/config.json (3). If none exist, return the level-2 path as the
// default creation target (exists:false).
function resolvePath({ env = process.env, home = os.homedir(), skillDir = __dirname } = {}) {
  if (env.ORDER_COFFEE_CONFIG) return { path: env.ORDER_COFFEE_CONFIG, exists: fs.existsSync(env.ORDER_COFFEE_CONFIG), level: 1 };
  const l2 = level2Path(home);
  if (fs.existsSync(l2)) return { path: l2, exists: true, level: 2 };
  const l3 = path.join(skillDir, 'config.json');
  if (fs.existsSync(l3)) return { path: l3, exists: true, level: 3 };
  return { path: l2, exists: false, level: 2 };
}

function init(opts = {}) {
  const r = resolvePath(opts);
  if (r.exists) return { path: r.path, created: false };
  fs.mkdirSync(path.dirname(r.path), { recursive: true });
  const skeleton = { version: 1, homeRegion: null, favorites: [] };
  fs.writeFileSync(r.path, JSON.stringify(skeleton, null, 2), { mode: 0o600 });
  fs.chmodSync(r.path, 0o600); // enforce even if umask altered the create mode
  return { path: r.path, created: true };
}

function load(opts = {}) {
  const r = resolvePath(opts);
  if (!r.exists) return {};
  return JSON.parse(fs.readFileSync(r.path, 'utf8'));
}

module.exports = { resolvePath, init, load };

if (require.main === module) {
  const cmd = process.argv[2];
  const si = process.argv.indexOf('--skill-dir');
  const opts = si > -1 ? { skillDir: process.argv[si + 1] } : {};
  if (cmd === 'path') { const r = resolvePath(opts); console.log('CONFIG>>>' + r.path + ' exists=' + r.exists); }
  else if (cmd === 'init') { const r = init(opts); console.log('CONFIG>>>' + r.path + ' created=' + r.created); }
  else if (cmd === 'load') { console.log(JSON.stringify(load(opts))); }
  else { console.error('usage: node resolve_config.js <path|init|load> [--skill-dir <dir>]'); process.exit(2); }
}
