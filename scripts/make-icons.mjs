// Erzeugt die App-Icons (PNG) ohne externe Abhängigkeiten: grüner Hintergrund, weißes „C1“, gelber Stern.
// Aufruf: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 7×9-Bitmap-Glyphen
const GLYPH = {
  C: ["0111110", "1100011", "1100000", "1100000", "1100000", "1100000", "1100000", "1100011", "0111110"],
  1: ["0001100", "0011100", "0111100", "0001100", "0001100", "0001100", "0001100", "0001100", "0111111"],
};

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function render(size) {
  const green = [88, 204, 2], white = [255, 255, 255], gold = [255, 200, 0];
  const cell = Math.floor(size / 22); // Pixelgröße der Glyphen
  const text = ["C", "1"];
  const gw = 7 * cell, gap = cell * 2;
  const totalW = text.length * gw + gap;
  const x0 = Math.floor((size - totalW) / 2), y0 = Math.floor(size * 0.36);
  const starC = [size * 0.5, size * 0.2], starR = size * 0.09;
  return png(size, (x, y) => {
    // Stern (5 Zacken) über dem Text
    const dx = x - starC[0], dy = y - starC[1];
    const ang = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
    const k = Math.cos(((ang + Math.PI / 2) * 5) % (2 * Math.PI)) * 0.5 + 0.5;
    if (r < starR * (0.5 + 0.5 * k)) return gold;
    for (let i = 0; i < text.length; i++) {
      const gx = x - (x0 + i * (gw + gap)), gy = y - y0;
      if (gx >= 0 && gy >= 0 && gx < gw && gy < 9 * cell) {
        if (GLYPH[text[i]][Math.floor(gy / cell)][Math.floor(gx / cell)] === "1") return white;
      }
    }
    return green;
  });
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(join(root, "icons", name), render(size));
}
writeFileSync(join(root, "icons", "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#58cc02"/><text x="32" y="44" font-family="Arial,sans-serif" font-weight="900" font-size="28" text-anchor="middle" fill="#fff">C1</text><circle cx="32" cy="13" r="5" fill="#ffc800"/></svg>`);
console.log("Icons erzeugt.");
