#!/usr/bin/env node
'use strict';
/**
 * Gera os icones PNG do PWA sem nenhuma dependencia externa.
 *
 * Uso: node tools/gen-icons.js
 *
 * Desenha um cap de graduacao (mortarboard) branco sobre um fundo azul em
 * gradiente. Saidas:
 *   icons/icon-192.png          -> icone "any"
 *   icons/icon-512.png          -> icone "any"
 *   icons/icon-maskable-512.png -> icone "maskable" (fundo full bleed)
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'icons');

/* ------------------------------------------------------------------ *
 * Codificador PNG minimo (RGBA, 8 bits, sem filtro)
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * Geometria
 * ------------------------------------------------------------------ */

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return Math.hypot(x - px, y - py);
}

function insideRoundedRect(x, y, size, radius) {
  const inner = size - radius;
  const cx = Math.min(Math.max(x, radius), inner);
  const cy = Math.min(Math.max(y, radius), inner);
  return Math.hypot(x - cx, y - cy) <= radius;
}

/* ------------------------------------------------------------------ *
 * Desenho do icone
 * ------------------------------------------------------------------ */

const DESIGN = 512;          // espaco de design (sempre 512x512)
const SCALE = 1.16;          // ampliacao do glifo em relacao ao centro
const CENTER = DESIGN / 2;

const CAP_BOARD = [
  [256, 176],
  [372, 236],
  [256, 296],
  [140, 236],
];
const CAP_BODY = [
  [186, 268],
  [326, 268],
  [296, 332],
  [216, 332],
];
const TASSEL_FROM = [372, 236];
const TASSEL_TO = [372, 316];
const TASSEL_RADIUS = 16;

function scalePoint([x, y]) {
  return [CENTER + (x - CENTER) * SCALE, CENTER + (y - CENTER) * SCALE];
}

function insideGlyph(x, y) {
  const [gx, gy] = [
    CENTER + (x - CENTER) / SCALE,
    CENTER + (y - CENTER) / SCALE,
  ];
  if (pointInPolygon(gx, gy, CAP_BOARD)) return true;
  if (pointInPolygon(gx, gy, CAP_BODY)) return true;
  if (distanceToSegment(gx, gy, TASSEL_FROM[0], TASSEL_FROM[1], TASSEL_TO[0], TASSEL_TO[1]) <= 7) return true;
  if (Math.hypot(gx - TASSEL_TO[0], gy - TASSEL_TO[1]) <= TASSEL_RADIUS) return true;
  return false;
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const GRADIENT_FROM = [58, 125, 221];
const GRADIENT_TO = [20, 47, 97];

function backgroundColor(x, y, size) {
  const t = Math.min(1, Math.max(0, (x / size + y / size) / 2));
  return mix(GRADIENT_FROM, GRADIENT_TO, t);
}

/**
 * @param {number} size lado do PNG em px
 * @param {boolean} maskable true = fundo quadrado full bleed (icone maskable)
 */
function renderIcon(size, maskable) {
  const samples = 3; // supersampling 3x3 -> antialiasing
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;

          const inBg = maskable
            ? px >= 0 && py >= 0 && px < size && py < size
            : insideRoundedRect(px, py, size, radius);
          if (!inBg) continue;

          if (insideGlyph(px, py)) {
            r += 255;
            g += 255;
            b += 255;
          } else {
            const [cr, cg, cb] = backgroundColor(px, py, size);
            r += cr;
            g += cg;
            b += cb;
          }
          a += 255;
        }
      }

      const total = samples * samples;
      const offset = (y * size + x) * 4;
      const alpha = a / total;
      if (alpha > 0) {
        // media ponderada apenas pelas amostras dentro da forma
        const covered = a / 255;
        rgba[offset] = Math.round(r / covered);
        rgba[offset + 1] = Math.round(g / covered);
        rgba[offset + 2] = Math.round(b / covered);
        rgba[offset + 3] = Math.round(alpha);
      }
    }
  }

  return encodePng(size, size, rgba);
}

function write(name, buffer) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, buffer);
  console.log(`  ${path.relative(process.cwd(), file)}  (${(buffer.length / 1024).toFixed(1)} KB)`);
}

console.log('Gerando icones do PWA...');
write('icon-192.png', renderIcon(192, false));
write('icon-512.png', renderIcon(512, false));
write('icon-maskable-512.png', renderIcon(512, true));
console.log('Pronto.');
