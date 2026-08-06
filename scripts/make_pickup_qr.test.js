// make_pickup_qr.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodeQR, decodeQR, verifyImage, makeAndVerify } = require('./make_pickup_qr');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));

test('makeAndVerify passes for a real takeOrderId', async () => {
  const dir = tmp();
  const out = path.join(dir, 'ok.png');
  const res = await makeAndVerify('amGpKIVlAAk=', out);
  assert.strictEqual(res.ok, true);
  assert.ok(fs.existsSync(out), 'verified PNG should remain');
  assert.strictEqual(decodeQR(out), 'amGpKIVlAAk=');
});

test('makeAndVerify with a pickup icon still round-trips (scannable)', async () => {
  const dir = tmp();
  const out = path.join(dir, 'pickup.png');
  const res = await makeAndVerify('amGpKIVlAAk=', out, 'pickup');
  assert.strictEqual(res.ok, true, res.reason);
  assert.strictEqual(decodeQR(out), 'amGpKIVlAAk=');
});

test('makeAndVerify with a pay icon still round-trips (scannable)', async () => {
  const dir = tmp();
  const out = path.join(dir, 'pay.png');
  const res = await makeAndVerify('https://pay.example/abc?t=xyz', out, 'pay');
  assert.strictEqual(res.ok, true, res.reason);
  assert.strictEqual(decodeQR(out), 'https://pay.example/abc?t=xyz');
});

test('verifyImage fails and deletes PNG when decoded != expected', async () => {
  const dir = tmp();
  const out = path.join(dir, 'bad.png');
  await encodeQR('PAYLOAD_A', out);              // the image really encodes A ...
  const res = verifyImage('PAYLOAD_B', out);     // ... but we expected B
  assert.strictEqual(res.ok, false);
  assert.ok(!fs.existsSync(out), 'unverified PNG must be deleted');
});

test('verifyImage fails and deletes PNG when the image has no QR', () => {
  const dir = tmp();
  const junk = path.join(dir, 'junk.png');
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 8, height: 8 });
  fs.writeFileSync(junk, PNG.sync.write(png));
  const res = verifyImage('anything', junk);
  assert.strictEqual(res.ok, false);
  assert.ok(!fs.existsSync(junk), 'undecodable PNG must be deleted');
});

test('decodeQR throws on a non-QR image path', () => {
  const dir = tmp();
  const junk = path.join(dir, 'junk2.png');
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 8, height: 8 });
  fs.writeFileSync(junk, PNG.sync.write(png));
  assert.throws(() => decodeQR(junk));
});
