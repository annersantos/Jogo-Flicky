/* layout-preview.js — capturas REAIS do layout mobile e desktop
   1) gera tests/out/preview.html        = index.html + matchMedia (modo toque)
      gera tests/out/preview-desktop.html = index.html puro (desktop)
   2) gera tests/out/frame.html          = moldura com iframe no tamanho EXATO
      (o headless tem viewport mínimo de 500px; o iframe garante 390x844 de verdade)
   3) fotografia com Chrome/Edge headless                                           */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

/* --- 1) páginas de prévisualização --- */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baseUrl = 'file:///' + root.split('\\').join('/') + '/';
const withBase = html.replace('<head>', '<head>\n  <base href="' + baseUrl + '">');
if (!withBase.includes('<base href=')) {
  console.error('falha ao injetar <base> no index.html');
  process.exit(1);
}
const touchScript = '<script>window.matchMedia = function () { return { matches: true }; };</script>';
fs.writeFileSync(path.join(outDir, 'preview.html'),
  withBase.replace('</head>', '  ' + touchScript + '\n</head>'));
fs.writeFileSync(path.join(outDir, 'preview-desktop.html'), withBase);

/* --- 2) moldura com iframe no tamanho exato da viewport simulada --- */
fs.writeFileSync(path.join(outDir, 'frame.html'),
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>frame</title>' +
  '<style>html,body{margin:0;padding:0;background:#05070d;height:100%;overflow:hidden;' +
  'display:flex;align-items:center;justify-content:center}iframe{border:0;display:block}</style>' +
  '</head><body><script>' +
  "var q = new URLSearchParams(location.search);" +
  "var f = document.createElement('iframe');" +
  "f.src = q.get('src') || 'preview.html';" +
  "f.width = (q.get('w') || 390) + 'px';" +
  "f.height = (q.get('h') || 844) + 'px';" +
  'document.body.appendChild(f);' +
  '</scr' + 'ipt></body></html>');

/* --- 3) navegador headless --- */
const candidates = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
].filter(Boolean);
const exe = candidates.find(p => fs.existsSync(p));
if (!exe) {
  console.error('nenhum Chrome/Edge encontrado — capturas não geradas');
  process.exit(1);
}
console.log('navegador: ' + exe);

const shots = [
  { file: 'layout-vertical.png', w: 390, h: 844, src: 'preview.html',
    win: [700, 1100], desc: 'iPhone 13 — retrato (viewport exata 390x844)' },
  { file: 'layout-horizontal.png', w: 844, h: 390, src: 'preview.html',
    win: [1050, 640], desc: 'iPhone 13 — paisagem (viewport exata 844x390)' },
  { file: 'layout-vertical-360.png', w: 360, h: 640, src: 'preview.html',
    win: [700, 880], desc: 'referência 360 CSS px' },
  { file: 'layout-desktop.png', w: 1280, h: 720, src: 'preview-desktop.html',
    win: [1500, 950], desc: 'desktop (controles preservados)' }
];
const profile = path.join(os.tmpdir(), 'flicky-preview-profile');
const base = 'file:///' + path.join(outDir, 'frame.html').split('\\').join('/');

let fail = 0;
for (const s of shots) {
  const out = path.join(outDir, s.file);
  const url = base + '?w=' + s.w + '&h=' + s.h + '&src=' + s.src;
  try {
    execFileSync(exe, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=2500',
      '--window-size=' + s.win[0] + ',' + s.win[1],
      '--screenshot=' + out,
      url
    ], { stdio: 'ignore', timeout: 90000 });
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log('captura: ' + path.relative(root, out) + '  ' + s.w + 'x' + s.h +
      '  (' + kb + ' KB) — ' + s.desc);
  } catch (e) {
    fail++;
    console.error('falha na captura ' + s.file + ': ' + ((e && e.message) || e));
  }
}
process.exit(fail ? 1 : 0);
