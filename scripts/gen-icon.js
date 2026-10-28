// 生成菜单栏番茄图标 assets/tray.png (44×44，纯 Node，无需依赖)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 44;
const rgba = Buffer.alloc(SIZE * SIZE * 4); // 透明背景
const s = SIZE / 22; // 以 22 为基准放大

function blend(x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const er = rgba[i], eg = rgba[i + 1], eb = rgba[i + 2], ea = rgba[i + 3] / 255;
  const na = a + ea * (1 - a);
  if (na <= 0) return;
  rgba[i]     = Math.round((r * a + er * ea * (1 - a)) / na);
  rgba[i + 1] = Math.round((g * a + eg * ea * (1 - a)) / na);
  rgba[i + 2] = Math.round((b * a + eb * ea * (1 - a)) / na);
  rgba[i + 3] = Math.round(na * 255);
}

function ellipse(cx, cy, rx, ry, r, g, b, aMul) {
  const rmin = Math.min(rx, ry);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    const d = Math.sqrt(nx * nx + ny * ny);
    const edgeDist = (1 - d) * rmin; // 到边缘的像素距离（正=内部）
    const cov = Math.min(1, Math.max(0, edgeDist + 0.5)); // 约 1px 抗锯齿
    if (cov > 0) blend(x, y, r, g, b, cov * aMul);
  }
}
function rect(x0, y0, x1, y1, r, g, b, aMul) {
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) blend(x, y, r, g, b, aMul);
}

// 番茄果体
ellipse(11 * s, 14 * s, 8 * s, 8 * s, 232, 90, 80, 1);
// 高光
ellipse(9 * s, 11 * s, 2.6 * s, 1.9 * s, 255, 170, 160, 0.55);
// 叶子
ellipse(11 * s, 5.6 * s, 4.6 * s, 2.4 * s, 72, 176, 105, 1);
// 果柄
rect(10.3 * s, 2.6 * s, 11.7 * s, 4.6 * s, 60, 140, 90, 1);

// —— 最小 PNG 编码器 ——
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}
function encodePNG(w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; px.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'assets', 'tray.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encodePNG(SIZE, SIZE, rgba));
console.log('已生成图标:', out);
