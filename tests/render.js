/* render.js — renderiza quadros do jogo sem navegador (rasterizador mínimo)
   e grava PNGs em tests/out/ para inspeção visual.
   Executar: node tests/render.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

/* ---------------- rasterizador ---------------- */
function parseColor(str) {
  if (typeof str !== 'string') return [255, 0, 255, 255];
  if (str[0] === '#') {
    let h = str.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
  }
  return [255, 0, 255, 255];
}

class PixCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.imageSmoothingEnabled = false;
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.font = ''; this.textAlign = ''; this.textBaseline = '';
    this._fill = '#000'; this._rgb = [0, 0, 0, 255];
    this._stack = []; this.tx = 0; this.ty = 0; this.sx = 1; this.sy = 1;
  }
  get fillStyle() { return this._fill; }
  set fillStyle(v) { this._fill = v; this._rgb = parseColor(v); }
  save() { this._stack.push([this.tx, this.ty, this.sx, this.sy, this.globalAlpha]); }
  restore() {
    const s = this._stack.pop();
    if (s) { this.tx = s[0]; this.ty = s[1]; this.sx = s[2]; this.sy = s[3]; this.globalAlpha = s[4]; }
  }
  translate(x, y) { this.tx += x * this.sx; this.ty += y * this.sy; }
  scale(x, y) { this.sx *= x; this.sy *= y; }
  fillRect(x, y, w, h) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const buf = this.canvas._buf, W = this.canvas.width, H = this.canvas.height;
    const [r, g, b, a0] = this._rgb;
    const a = (a0 / 255) * this.globalAlpha;
    for (let yy = y; yy < y + h; yy++) {
      if (yy < 0 || yy >= H) continue;
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || xx >= W) continue;
        const i = (yy * W + xx) * 4;
        if (this.globalCompositeOperation === 'source-atop') {
          if (buf[i + 3] === 0) continue;
          buf[i] = Math.round(buf[i] * (1 - a) + r * a);
          buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a);
          buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
        } else {
          const na = a + (buf[i + 3] / 255) * (1 - a);
          if (na <= 0) continue;
          buf[i] = Math.round((r * a + buf[i] * (buf[i + 3] / 255) * (1 - a)) / na);
          buf[i + 1] = Math.round((g * a + buf[i + 1] * (buf[i + 3] / 255) * (1 - a)) / na);
          buf[i + 2] = Math.round((b * a + buf[i + 2] * (buf[i + 3] / 255) * (1 - a)) / na);
          buf[i + 3] = Math.round(na * 255);
        }
      }
    }
  }
  fillText() { /* texto do HUD flutuante: ignorado nas capturas */ }
  drawImage(img, x, y) {
    if (!img || !img._buf) return;
    const sw = img.width, sh = img.height, src = img._buf;
    const W = this.canvas.width, H = this.canvas.height, dst = this.canvas._buf;
    const x0 = Math.round(this.tx + x * this.sx);
    const y0 = Math.round(this.ty + y * this.sy);
    const a = this.globalAlpha;
    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        const px = this.sx > 0 ? x0 + i : x0 - i - 1;
        const py = this.sy > 0 ? y0 + j : y0 - j - 1;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const si = (j * sw + i) * 4;
        const sa = (src[si + 3] / 255) * a;
        if (sa <= 0) continue;
        const di = (py * W + px) * 4;
        const da = dst[di + 3] / 255;
        const na = sa + da * (1 - sa);
        if (na <= 0) continue;
        dst[di] = Math.round((src[si] * sa + dst[di] * da * (1 - sa)) / na);
        dst[di + 1] = Math.round((src[si + 1] * sa + dst[di + 1] * da * (1 - sa)) / na);
        dst[di + 2] = Math.round((src[si + 2] * sa + dst[di + 2] * da * (1 - sa)) / na);
        dst[di + 3] = Math.round(na * 255);
      }
    }
  }
}

class PixCanvas {
  constructor() { this._w = 0; this._h = 0; this._buf = null; this._ctx = null; this.style = {}; }
  get width() { return this._w; }
  set width(v) { this._w = v | 0; this._alloc(); }
  get height() { return this._h; }
  set height(v) { this._h = v | 0; this._alloc(); }
  _alloc() { this._buf = Buffer.alloc(Math.max(0, this._w * this._h * 4)); }
  getContext() { if (!this._ctx) this._ctx = new PixCtx(this); return this._ctx; }
  toDataURL() { return ''; }
}

/* ---------------- PNG ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function writePNG(file, w, h, buf) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    buf.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
}

/* ---------------- stubs ---------------- */
const mock = new Proxy(function () {}, {
  get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; return mock; },
  set() { return true; }, apply() { return mock; }, construct() { return mock; }, has() { return true; }
});
const listeners = {};
function addListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); }
function makeEl(id) {
  const classes = new Set(['hidden']);
  return {
    id, style: {}, dataset: {}, textContent: '', title: '',
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    addEventListener() {}, setAttribute() {}, getAttribute: () => null, appendChild() {},
    blur() {}, focus() {}, setPointerCapture() {}, getContext: () => mock, toDataURL: () => ''
  };
}
const elCache = new Map();
const rafQueue = [];
const gameCanvas = new PixCanvas();

global.window = global;
global.addEventListener = (t, fn) => addListener(t, fn);
global.removeEventListener = () => {};
global.requestAnimationFrame = fn => { rafQueue.push(fn); return 1; };
global.cancelAnimationFrame = () => {};
global.document = {
  readyState: 'complete',
  hidden: false,
  getElementById(id) {
    if (id === 'game') return gameCanvas;
    if (!elCache.has(id)) elCache.set(id, makeEl(id));
    return elCache.get(id);
  },
  createElement(tag) { return tag === 'canvas' ? new PixCanvas() : makeEl(tag); },
  addEventListener(t, fn) { addListener('doc:' + fn, fn); },
  removeEventListener() {}
};

const root = path.join(__dirname, '..');
for (const f of ['js/sprites.js', 'js/audio.js', 'js/levels.js', 'js/level.js', 'js/game.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}

const Flicky = global.Flicky;
const LEVEL = global.LEVEL;
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

let t = 1000;
function frame(name) {
  t += 16.7;
  const cbs = rafQueue.splice(0);
  cbs.forEach(cb => cb(t));
  // garante mais um quadro de desenho
  t += 16.7;
  const cbs2 = rafQueue.splice(0);
  cbs2.forEach(cb => cb(t));
  const file = path.join(outDir, name);
  writePNG(file, gameCanvas.width, gameCanvas.height, gameCanvas._buf);
  console.log('gravado: ' + path.relative(root, file) + ' (' + gameCanvas.width + 'x' + gameCanvas.height + ')');
}

/* 1. cena inicial (menu sobre a fase 1) */
frame('01-inicio.png');
Flicky.startCampaign();          // entra em "play" para simular a jogatina

/* zooms de inspeção (personagens e cenário) */
function zoom(name, x, y, w, h, s) {
  const W = gameCanvas.width, H = gameCanvas.height;
  const buf = Buffer.alloc(w * s * h * s * 4);
  for (let j = 0; j < h * s; j++) {
    for (let i = 0; i < w * s; i++) {
      const sx = Math.min(W - 1, x + Math.floor(i / s));
      const sy = Math.min(H - 1, y + Math.floor(j / s));
      const di = (j * (w * s) + i) * 4, si = (sy * W + sx) * 4;
      gameCanvas._buf.copy(buf, di, si, si + 4);
    }
  }
  writePNG(path.join(outDir, name), w * s, h * s, buf);
  console.log('zoom: ' + path.relative(root, path.join(outDir, name)));
}
zoom('z1-jogador.png', 6, 226, 52, 40, 8);
zoom('z2-gato.png', 146, 226, 52, 40, 8);
zoom('z3-filhote.png', 56, 176, 44, 34, 8);
zoom('z4-plataforma.png', 8, 184, 140, 64, 4);
zoom('z5-porta.png', 214, 194, 58, 58, 6);

/* 2. coleta três filhotes e mostra a fila seguindo em movimento */
Flicky.setInvuln(1000000);
// afasta o gato da plataforma durante a coleta (evita dispersão na captura)
const cat2 = Flicky.catsRef()[1];
cat2.x1 = 460; cat2.x2 = 460; cat2.x = 460;
for (const i of [0, 1, 2]) {
  let target = null, best = 1e9;
  const sp = LEVEL.chickSpawns[i];
  for (const c of Flicky.looseRef()) {
    const d = Math.abs(c.x - sp.x) + Math.abs(c.y - sp.y);
    if (d < best) { best = d; target = c; }
  }
  if (target) { Flicky.teleport(target.x, target.y); Flicky.tick(1); }
}
console.log('após coletas: queue=' + Flicky.get().queue + ' loose=' + Flicky.get().loose);
/* aguarda o histórico "esvaziar" os pontos de teleporte num local seguro */
Flicky.teleport(34, LEVEL.GROUND_TOP);
Flicky.tick(170);
cat2.x1 = 100; cat2.x2 = 196; cat2.x = 140; cat2.y = 150; cat2.dir = -1;

/* 2. move-se com a fila seguindo os saltos */
Flicky.input.right = true;
Flicky.input.jump = true;
Flicky.input.jumpQueued = true;
for (let i = 0; i < 26; i++) Flicky.tick(1);
frame('02-fila-seguindo.png');
Flicky.input.right = false;
Flicky.input.jump = false;
Flicky.tick(170);

/* 3. aproximação da porta com a fila atrás (gato afastado para a captura) */
const cat1 = Flicky.catsRef()[0];
cat1.x1 = 300; cat1.x2 = 430; cat1.x = 330;
Flicky.teleport(60, LEVEL.GROUND_TOP);
Flicky.tick(120);                     // fila converge
for (let i = 0; i < 110; i++) { Flicky.input.right = true; Flicky.tick(1); }
Flicky.input.right = false;
frame('03-porta.png');

/* 4. arremesso: pega o objeto e lança em direção ao gato */
Flicky.loadPhase(1);
Flicky.setInvuln(1000000);
Flicky.teleport(60, LEVEL.GROUND_TOP);
Flicky.tick(4);
Flicky.teleport(170, LEVEL.GROUND_TOP);
Flicky.tick(4);
Flicky.input.right = true;
Flicky.tick(16);
Flicky.input.right = false;
Flicky.tick(2);
Flicky.input.throwQueued = true;
Flicky.tick(10);
frame('04-arremesso.png');
console.log('arremesso: ' + JSON.stringify(Flicky.get()));

/* 5-7. cenários das fases 4, 8 e 10 */
Flicky.loadPhase(4); Flicky.tick(40); frame('05-fase4-telhados.png');
Flicky.loadPhase(8); Flicky.tick(40); frame('06-fase8-noite.png');
Flicky.loadPhase(10); Flicky.tick(40); frame('07-fase10-fuga.png');

console.log('estatísticas: ' + JSON.stringify(Flicky.get()));
