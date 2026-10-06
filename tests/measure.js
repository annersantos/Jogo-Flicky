/* measure.js — mede o layout REAL em navegador headless (antes × depois)
   1) gera tests/out/preview.html (modo toque) e preview-desktop.html
   2) gera tests/out/measure.html: iframe no tamanho EXATO + script que mede
      HUD, arena, botões, disposição (lado a lado × empilhado) e vazios
   3) fotografa o DOM com Chrome/Edge headless e imprime a tabela
   Executar: node tests/measure.js [rotulo]   (o rótulo entra na tabela)      */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

/* ---------- 1) páginas de prévisualização ---------- */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const baseUrl = 'file:///' + root.split('\\').join('/') + '/';
const withBase = html.replace('<head>', '<head>\n  <base href="' + baseUrl + '">');
const touchScript = '<script>window.matchMedia = function () { return { matches: true }; };</script>';
fs.writeFileSync(path.join(outDir, 'preview.html'),
  withBase.replace('</head>', '  ' + touchScript + '\n</head>'));
fs.writeFileSync(path.join(outDir, 'preview-desktop.html'), withBase);

/* ---------- 2) página de medição ---------- */
const measureHtml = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>measure</title>
<style>html,body{margin:0;padding:0;background:#05070d;overflow:hidden}
iframe{border:0;display:block}pre{display:none}</style></head>
<body><pre id="out">RESULT:{"ok":false,"err":"sem execucao"}</pre>
<script>
var q = new URLSearchParams(location.search);
var W = +(q.get('w') || 390), H = +(q.get('h') || 844);
var f = document.createElement('iframe');
f.src = q.get('src') || 'preview.html';
f.width = W + 'px'; f.height = H + 'px';
document.body.appendChild(f);

function n(v) { return Math.round(v * 100) / 100; }
function rect(r) { return r ? { x: n(r.x), y: n(r.y), w: n(r.width), h: n(r.height) } : null; }
function hit(a, b) {
  if (!a || !b) return false;
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function emit(obj) {
  document.getElementById('out').textContent = 'RESULT:' + JSON.stringify(obj);
}
function measure() {
  var out = { ok: false };
  try {
    var w = f.contentWindow, d = f.contentDocument;
    if (!w || !d) { out.err = 'sem acesso ao iframe'; return out; }
    var g = function (id) { return d.getElementById(id); };
    var r = function (el) { return el ? rect(el.getBoundingClientRect()) : null; };
    var stage = r(g('stage')), hud = r(g('hud')), mid = r(g('mid')), hint = r(g('hint'));
    var bl = r(g('btnLeft')), br = r(g('btnRight')), bt = r(g('btnThrow')), bj = r(g('btnJump'));
    var nodeL = g('btnLeft'), nodeR = g('btnThrow');
    var padL = nodeL && nodeL.parentNode, padR = nodeR && nodeR.parentNode;
    var cs = function (el, p) {
      try { return el ? w.getComputedStyle(el)[p] : ''; } catch (e) { return ''; }
    };
    var canvas = g('game');
    out = {
      ok: true,
      vw: w.innerWidth, vh: w.innerHeight, dpr: w.devicePixelRatio,
      touch: d.body.classList.contains('has-touch'),
      mode: (g('mid').className || '(nenhuma)'),
      bodyPad: cs(d.body, 'paddingLeft') + ' ' + cs(d.body, 'paddingTop'),
      hud: hud, mid: mid, stage: stage, hint: hint,
      hintDisplay: cs(g('hint'), 'display'),
      btn: { left: bl, right: br, throw: bt, jump: bj },
      btnSize: bl ? bl.w : 0,
      padDirL: cs(padL, 'flexDirection'), padWrapL: cs(padL, 'flexWrap'),
      padDirR: cs(padR, 'flexDirection'),
      moveSideBySide: !!(bl && br && bl.x + bl.w <= br.x + 0.5),
      actionSideBySide: !!(bt && bj && bt.x + bt.w <= bj.x + 0.5),
      moveSameRow: !!(bl && br && Math.abs(bl.y - br.y) < 1),
      overlapControls: hit(stage, bl) || hit(stage, br) || hit(stage, bt) || hit(stage, bj),
      overlapHud: hit(stage, hud),
      gapHudStage: (hud && stage) ? n(stage.y - (hud.y + hud.h)) : null,
      gapStageCtrl: (stage && bl) ? n(bl.y - (stage.y + stage.h)) : null,
      gapPair: (bl && br) ? n(br.x - (bl.x + bl.w)) : null,
      scale: stage ? n(stage.w / 480) : 0,
      panel: r(g('overlay')),
      panelBox: r(d.querySelector('#overlay .panel')),
      panelScroll: (function () {
        var p = d.querySelector('#overlay .panel p');
        if (!p) return null;
        return { txt: p.scrollHeight, box: p.clientHeight, corte: p.scrollHeight - p.clientHeight };
      })(),
      freeBelow: null
    };
    if (stage && mid) out.freeBelow = n((mid.y + mid.h) - (stage.y + stage.h));
  } catch (e) {
    out.err = String((e && e.message) || e);
  }
  return out;
}
var tries = 0;
function run() {
  tries++;
  try {
    var w = f.contentWindow;
    if (w && w.document && w.document.readyState === 'complete' && w.Flicky) {
      setTimeout(function () { emit(measure()); }, 450);
      return;
    }
  } catch (e) { /* ainda carregando */ }
  if (tries < 80) setTimeout(run, 80);
  else emit({ ok: false, err: 'timeout (Flicky indisponível)' });
}
f.addEventListener('load', function () { setTimeout(run, 60); });
setTimeout(run, 200);
</script>
</body></html>`;
fs.writeFileSync(path.join(outDir, 'measure.html'), measureHtml);

/* ---------- 3) navegador headless ---------- */
const candidates = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
].filter(Boolean);
const exe = candidates.find(p => fs.existsSync(p));
if (!exe) { console.error('nenhum Chrome/Edge encontrado'); process.exit(1); }

const label = process.argv[2] || 'medida';
const profile = path.join(os.tmpdir(), 'flicky-measure-profile');
const base = 'file:///' + path.join(outDir, 'measure.html').split('\\').join('/');

const cases = [
  { name: 'retrato 390x844 (iPhone 13)', w: 390, h: 844, src: 'preview.html' },
  { name: 'retrato 390x650 (barras abertas)', w: 390, h: 650, src: 'preview.html' },
  { name: 'retrato 360x640 (referência)', w: 360, h: 640, src: 'preview.html' },
  { name: 'paisagem 844x390 (iPhone 13)', w: 844, h: 390, src: 'preview.html' },
  { name: 'paisagem 844x330 (barras abertas)', w: 844, h: 330, src: 'preview.html' },
  { name: 'paisagem 740x360 (janela estreita)', w: 740, h: 360, src: 'preview.html' },
  { name: 'desktop 1280x720', w: 1280, h: 720, src: 'preview-desktop.html' }
];

function unescapeHtml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

const results = [];
let fail = 0;
for (const c of cases) {
  const url = base + '?w=' + c.w + '&h=' + c.h + '&src=' + c.src;
  let data = null;
  try {
    const dom = execFileSync(exe, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', '--force-device-scale-factor=1',
      '--allow-file-access-from-files',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=9000',
      '--window-size=' + Math.max(c.w + 40, 500) + ',' + Math.max(c.h + 40, 500),
      '--dump-dom', url
    ], { encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024 });
    const m = dom.match(/RESULT:(\{[\s\S]*?\})<\/pre>/);
    if (m) data = JSON.parse(unescapeHtml(m[1]));
    else data = { ok: false, err: 'sem RESULT no DOM' };
  } catch (e) {
    data = { ok: false, err: ((e && e.message) || String(e)).slice(0, 120) };
    fail++;
  }
  results.push({ c, data });
}

/* ---------- tabela ---------- */
const pad = (s, w) => String(s).padEnd(w);
console.log('\n== medição do layout — rótulo: ' + label + ' ==');
console.log(pad('cenário', 30) + pad('arena (CSS)', 16) + pad('escala', 9) +
  pad('painel', 12) + pad('botão', 7) + pad('pares', 10) + pad('modo', 12) + 'notas');
for (const { c, data } of results) {
  if (!data.ok) {
    console.log(pad(c.name, 30) + 'ERRO: ' + data.err);
    continue;
  }
  const pairs = (data.moveSideBySide ? 'L/R OK' : 'L/R EMPILHADO') + ' · ' +
    (data.actionSideBySide ? 'Ação OK' : 'Ação EMPILHADA');
  const notes = [];
  if (data.overlapControls) notes.push('CONTROLE SOBRE A ARENA');
  if (data.overlapHud) notes.push('HUD SOBRE A ARENA');
  if (data.gapHudStage != null && data.gapHudStage > 12) notes.push('vazio painel→arena ' + data.gapHudStage);
  if (data.gapStageCtrl != null && data.gapStageCtrl > 12) notes.push('vazio arena→controles ' + data.gapStageCtrl);
  if (data.hintDisplay !== 'none' && data.hint && data.hint.w > 0 && data.vh) {
    notes.push('dica ' + Math.round(data.hint.h) + 'px');
  }
  if (data.panelScroll && data.panelScroll.corte > 0) {
    notes.push('painel: texto rola ' + data.panelScroll.corte + 'px');
  }
  if (data.panel && data.panelBox && data.panelBox.h > data.panel.h) {
    notes.push('PAINEL MAIOR QUE A ARENA');
  }
  console.log(pad(c.name, 30) +
    pad(data.stage ? data.stage.w + 'x' + data.stage.h : '-', 16) +
    pad(data.scale, 9) +
    pad(data.hud ? data.hud.w + 'x' + data.hud.h : '-', 12) +
    pad(data.btnSize, 7) +
    pad(pairs, 10) +
    pad((data.mode || '').replace('has-touch', '').trim() || '(padrão)', 12) +
    notes.join(' · '));
}
console.log('');
if (fail) process.exit(1);
