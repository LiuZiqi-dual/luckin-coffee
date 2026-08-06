// make_pickup_qr.js — encode a QR (default content = takeMealCodeInfo.takeOrderId)
// then verify by decoding the written PNG back and comparing char-for-char.
// The verify step guards against a lossy/corrupt QR round-trip: if the written
// image does not decode back to exactly the expected string, the PNG is deleted
// so an unverified image can never be sent to the user.
//
// Optional center icon distinguishes the two codes this skill produces:
//   pickup -> coffee mug   (取餐码)
//   pay    -> ¥ mark       (支付码)
// When an icon is requested the QR uses error-correction level H (~30%), so the
// small centered logo stays scannable; the same verify gate still runs, so an
// icon that ever broke decoding would just fall back to text.
const fs = require('fs');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

// 16x16 glyphs ('#' = drawn). Kept small so the recovered center stays tiny.
const ICONS = {
  pickup: {
    color: [90, 62, 43], // coffee brown
    rows: [
      '................',
      '................',
      '...#.....#......',
      '..#.#...#.#.....',
      '...#.....#......',
      '.##########.....',
      '.#........#.##..',
      '.#........#.#.#.',
      '.#........#.#.#.',
      '.#........#.##..',
      '.#........#.....',
      '.#........#.....',
      '..#......#......',
      '...######.......',
      '................',
      '................',
    ],
  },
  pay: {
    color: [30, 125, 50], // pay green
    rows: [
      '................',
      '................',
      '...#........#...',
      '....#......#....',
      '.....#....#.....',
      '......#..#......',
      '.......##.......',
      '...##########...',
      '.......##.......',
      '...##########...',
      '.......##.......',
      '.......##.......',
      '................',
      '................',
      '................',
      '................',
    ],
  },
};

function encodeQR(payload, outPath, { ecc = 'M' } = {}) {
  return QRCode.toFile(outPath, payload, { errorCorrectionLevel: ecc, margin: 2, width: 400 });
}

function setPx(data, width, x, y, r, g, b) {
  const i = (width * y + x) << 2;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
}

// Paint a white pad + the icon glyph into the QR center. No-op for unknown types.
function overlayIcon(pngPath, iconType) {
  const icon = ICONS[iconType];
  if (!icon) return;
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const { width, height, data } = png;
  const pad = Math.round(width * 0.20);
  const px0 = Math.floor((width - pad) / 2);
  const py0 = Math.floor((height - pad) / 2);
  for (let y = py0; y < py0 + pad; y++) {
    for (let x = px0; x < px0 + pad; x++) setPx(data, width, x, y, 255, 255, 255);
  }
  const n = icon.rows.length;              // 16
  const gsize = Math.round(pad * 0.72);
  const gx0 = Math.floor((width - gsize) / 2);
  const gy0 = Math.floor((height - gsize) / 2);
  const cell = gsize / n;
  const [r, g, b] = icon.color;
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      if (icon.rows[iy][ix] !== '#') continue;
      const sx0 = gx0 + Math.floor(ix * cell), sx1 = gx0 + Math.floor((ix + 1) * cell);
      const sy0 = gy0 + Math.floor(iy * cell), sy1 = gy0 + Math.floor((iy + 1) * cell);
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) setPx(data, width, x, y, r, g, b);
    }
  }
  fs.writeFileSync(pngPath, PNG.sync.write(png));
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

// Encode `content` to outPath (with optional center icon), then verify the round-trip.
async function makeAndVerify(content, outPath, iconType) {
  await encodeQR(content, outPath, { ecc: iconType ? 'H' : 'M' });
  if (iconType) overlayIcon(outPath, iconType);
  return verifyImage(content, outPath);
}

function safeUnlink(p) { try { fs.unlinkSync(p); } catch (_) {} }

module.exports = { encodeQR, decodeQR, verifyImage, makeAndVerify, overlayIcon, ICONS };

if (require.main === module) {
  const [content, outPath, iconArg] = process.argv.slice(2);
  if (!content || !outPath) { console.error('usage: node make_pickup_qr.js <content> <out.png> [pickup|pay]'); process.exit(2); }
  const iconType = iconArg || 'pickup';
  makeAndVerify(content, outPath, iconType).then(r => {
    if (r.ok) { console.log('QR_OK>>>' + outPath); process.exit(0); }
    console.log('QR_FAIL>>>' + r.reason); process.exit(1);
  });
}
