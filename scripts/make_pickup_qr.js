// make_pickup_qr.js — encode a pickup QR (content = takeMealCodeInfo.takeOrderId)
// then verify by decoding the written PNG back and comparing char-for-char.
// The verify step guards against a lossy/corrupt QR round-trip: if the written
// image does not decode back to exactly the expected string, the PNG is deleted
// so an unverified image can never be sent to the user.
const fs = require('fs');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

function encodeQR(payload, outPath) {
  return QRCode.toFile(outPath, payload, { errorCorrectionLevel: 'M', margin: 2, width: 400 });
}

function decodeQR(pngPath) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, { inversionAttempts: 'attemptBoth' });
  if (!res) throw new Error('NO_QR_FOUND');
  return res.data;
}

// Decode pngPath and require it to equal `expected` char-for-char.
// On any mismatch / decode failure, delete the PNG and return {ok:false}.
function verifyImage(expected, pngPath) {
  let decoded;
  try { decoded = decodeQR(pngPath); }
  catch (e) { safeUnlink(pngPath); return { ok: false, reason: 'decode failed: ' + e.message }; }
  if (decoded === expected) return { ok: true };
  safeUnlink(pngPath);
  return { ok: false, reason: 'mismatch: decoded ' + JSON.stringify(decoded) + ' != ' + JSON.stringify(expected) };
}

// Encode takeOrderId to outPath, then verify the written image round-trips.
async function makeAndVerify(takeOrderId, outPath) {
  await encodeQR(takeOrderId, outPath);
  return verifyImage(takeOrderId, outPath);
}

function safeUnlink(p) { try { fs.unlinkSync(p); } catch (_) {} }

module.exports = { encodeQR, decodeQR, verifyImage, makeAndVerify };

if (require.main === module) {
  const [takeOrderId, outPath] = process.argv.slice(2);
  if (!takeOrderId || !outPath) { console.error('usage: node make_pickup_qr.js <takeOrderId> <out.png>'); process.exit(2); }
  makeAndVerify(takeOrderId, outPath).then(r => {
    if (r.ok) { console.log('QR_OK>>>' + outPath); process.exit(0); }
    console.log('QR_FAIL>>>' + r.reason); process.exit(1);
  });
}
