/* Testes headless: física, fila por histórico, dispersão, arremesso, entrega,
   progressão da campanha (1..10), pontuação/bônus, telas e controles.
   Executar: node tests/headless.js */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------- stubs de DOM/Canvas ---------------- */
const mock = new Proxy(function () {}, {
  get(t, p) {
    if (p === Symbol.toPrimitive) return () => 0;
    if (p === 'then') return undefined;
    return mock;
  },
  set() { return true; },
  apply() { return mock; },
  construct() { return mock; },
  has() { return true; }
});

const listeners = {};
function addListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
function dispatch(type, ev) {
  (listeners[type] || []).slice().forEach(fn => fn(ev || { preventDefault() {} }));
}

function makeCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => mock, toDataURL: () => '' };
}

const elCache = new Map();

function makeEl(id) {
  const classes = new Set(['hidden']);
  const handlers = {};
  return {
    id,
    style: {},
    dataset: {},
    textContent: '',
    title: '',
    handlers,
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: c => (classes.has(c) ? classes.delete(c) : classes.add(c))
    },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    blur() {},
    focus() {},
    setPointerCapture() {},
    getContext: () => mock,
    toDataURL: () => '',
    width: 0,
    height: 0
  };
}

/* dispara um evento de um elemento do DOM (clique em botão, toque etc.) */
function fire(id, type, ev) {
  const node = elCache.get(id) || document.getElementById(id);
  const hs = (node.handlers && node.handlers[type]) || [];
  hs.forEach(fn => fn(ev || { preventDefault() {} }));
}

const rafQueue = [];

global.window = global;
global.addEventListener = (t, fn) => addListener(t, fn);
global.removeEventListener = () => {};
global.requestAnimationFrame = fn => { rafQueue.push(fn); return rafQueue.length; };
global.cancelAnimationFrame = () => {};
global.document = {
  readyState: 'complete',
  hidden: false,
  getElementById(id) {
    if (!elCache.has(id)) elCache.set(id, makeEl(id));
    return elCache.get(id);
  },
  createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl(tag); },
  addEventListener(t, fn) { addListener('doc:' + t, fn); },
  removeEventListener() {}
};

/* armazenamento em memória (localStorage) */
const storage = new Map();
global.localStorage = {
  getItem: k => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k)
};

/* ---------------- carrega o jogo ---------------- */
const root = path.join(__dirname, '..');
for (const f of ['js/sprites.js', 'js/audio.js', 'js/levels.js', 'js/level.js', 'js/game.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}

const Flicky = global.Flicky;
const LEVEL = global.LEVEL;
const LEVELS = global.LEVELS;
const HZ = Flicky.HZ;

/* ---------------- utilitários de teste ---------------- */
let pass = 0, fail = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FALHOU: ' + msg); }
}
function section(name) { console.log('\n== ' + name + ' =='); }
function setMove(dir) {
  Flicky.input.left = dir < 0;
  Flicky.input.right = dir > 0;
}
function stopMove() { Flicky.input.left = false; Flicky.input.right = false; }
function elText(id) { return document.getElementById(id).textContent; }

function onSurface(y) {
  if (Math.abs(y - LEVEL.GROUND_TOP) < 0.01) return true;
  return LEVEL.platforms.some(p => Math.abs(y - p.y) < 0.01);
}

/* nunca abaixo do chão nem preso dentro do corpo de uma plataforma */
function settledOk(c) {
  if (c.y > LEVEL.GROUND_TOP + 0.01) return false;
  for (const p of LEVEL.platforms) {
    if (c.x > p.x && c.x < p.x + p.w && c.y > p.y + 0.5 && c.y < p.y + LEVEL.PLAT_H) return false;
  }
  return true;
}

function atSafePoint(c) {
  return LEVEL.safePoints.some(p => Math.abs(p.x - c.x) < 0.01 && Math.abs(p.y - c.y) < 0.01);
}

function teleportToChick(i) {
  const sp = LEVEL.chickSpawns[i];
  let target = null, best = 1e9;
  for (const c of Flicky.looseRef()) {
    const d = Math.abs(c.x - sp.x) + Math.abs(c.y - sp.y);
    if (d < best) { best = d; target = c; }
  }
  if (!target) return;
  Flicky.teleport(target.x, target.y);
  Flicky.tick(1);
}

/* o seguidor deve coincidir exatamente com algum ponto do percurso registrado */
function followerOnPath(f) {
  const hist = Flicky.historyRef();
  for (let j = Math.max(0, hist.length - 400); j < hist.length; j++) {
    if (Math.abs(hist[j].x - f.x) < 0.01 && Math.abs(hist[j].y - f.y) < 0.01) return true;
  }
  if (!global.__pathDiag) {
    global.__pathDiag = true;
    let best = 1e9, bi = -1;
    for (let j = 0; j < hist.length; j++) {
      const d = Math.abs(hist[j].x - f.x) + Math.abs(hist[j].y - f.y);
      if (d < best) { best = d; bi = j; }
    }
    console.log('    [diag] seguidor (' + f.x.toFixed(2) + ',' + f.y.toFixed(2) +
      ') delay=' + f.delay.toFixed(3) + ' histLen=' + hist.length +
      ' melhor=' + best.toFixed(3) + '@' + bi);
  }
  return false;
}

function driveRaf(frames, ms) {
  let t = 1000;
  for (let i = 0; i < frames; i++) {
    t += ms;
    const cbs = rafQueue.splice(0);
    if (!cbs.length) return false;
    cbs.forEach(cb => cb(t));
  }
  return true;
}

/* afasta todos os gatos para os testes de coleta/entrega */
function parkCats() {
  Flicky.catsRef().forEach(c => { c.x1 = 468; c.x2 = 468; c.x = 468; c.stun = 0; });
}

/* conclui a fase jogando: coleta tudo pela física e entrega na porta */
function completePhaseViaPlay() {
  parkCats();
  Flicky.setInvuln(1e6);
  let guard = 0;
  while (Flicky.get().loose > 0 && guard++ < 80) {
    const c = Flicky.looseRef()[0];
    Flicky.teleport(c.x, c.y);
    Flicky.tick(1);
  }
  const d = LEVEL.door;
  Flicky.teleport(d.x + d.w / 2, LEVEL.GROUND_TOP);
  Flicky.tick(3);
}

/* alcance das plataformas a partir do chão (regras do salto real) */
function bfsAllReachable() {
  const maxJump = (520 * 520) / (2 * 2000);
  const nodes = [{ x1: 0, x2: LEVEL.W, y: LEVEL.GROUND_TOP, id: 'chao' }];
  LEVEL.platforms.forEach((p, i) => nodes.push({ x1: p.x, x2: p.x + p.w, y: p.y, id: 'p' + i }));
  const gap = (a, b) => Math.max(0, Math.max(a.x1 - b.x2, b.x1 - a.x2));
  const canJump = (a, b) => {
    const dy = a.y - b.y;
    if (dy > maxJump - 8) return false;
    const g = gap(a, b);
    return dy >= 0 ? g <= 45 : g <= 85;
  };
  const seen = new Set(['chao']);
  const q = ['chao'];
  while (q.length) {
    const id = q.shift();
    const cur = nodes.find(n => n.id === id);
    if (!cur) continue;
    for (const n of nodes) {
      if (!seen.has(n.id) && canJump(cur, n)) { seen.add(n.id); q.push(n.id); }
    }
  }
  return nodes.every(n => seen.has(n.id));
}

/* posição pertence a uma superfície válida (chão ou topo de plataforma) */
function onPlatform(x, y) {
  if (Math.abs(y - LEVEL.GROUND_TOP) < 0.01) return x >= 0 && x <= LEVEL.W;
  return LEVEL.platforms.some(p => x > p.x && x < p.x + p.w && Math.abs(y - p.y) < 0.01);
}

/* ---------------- 1. inicialização (menu) ---------------- */
section('Inicialização e menu');
{
  const s = Flicky.get();
  ok(s.started === true, 'jogo inicializado');
  ok(s.state === 'menu', 'estado inicial é menu');
  ok(s.phase === 1 && s.target === 6, 'campanha inicia na fase 1 (6 filhotes)');
  ok(s.lives === 3 && s.score === 0 && s.rescued === 0, 'vidas/pontuação/resgatados iniciais');
  ok(s.record === 0, 'recorde inicial zerado');
  ok(LEVELS.total === 10, 'campanha com 10 fases');
  ok(elText('ovTitle') === 'Flicky do Jardim', 'tela inicial com título');
  ok(elText('ovBtn1') === 'Jogar', 'tela inicial com botão Jogar');
  ok(elText('ovText').includes('mover'), 'tela inicial com instruções');
  ok(elText('phase') === 'Fase 1/10', 'HUD mostra Fase 1/10');
  ok(elText('rescued') === 'Resgatados: 0/6', 'HUD mostra Resgatados: 0/6');
  ok(elText('score') === 'Pontos: 0' && elText('record') === 'Recorde: 0', 'HUD pontos/recorde');
  ['btnLeft', 'btnRight', 'btnJump', 'btnThrow'].forEach(id => {
    ok(!!document.getElementById(id), 'controle touch presente: ' + id);
  });
}

/* ---------------- 2. início da campanha (Enter) ---------------- */
section('Início da campanha');
{
  dispatch('keydown', { key: 'Enter', preventDefault() {} });
  const s = Flicky.get();
  ok(s.state === 'play', 'Enter inicia o jogo');
  ok(s.phase === 1 && s.lives === 3 && s.score === 0, 'campanha zerada na fase 1');
  ok(s.loose === 6 && s.queue === 0, '6 filhotes soltos e fila vazia');
  ok(s.history > 0, 'histórico de percurso semeado');
  ok(Math.abs(Flicky.player().x - LEVEL.spawn.x) < 0.01, 'jogador no ponto inicial');
}

/* ---------------- 3. física: salto e gravidade ---------------- */
section('Movimentação, salto e gravidade');
{
  const p0 = { x: Flicky.player().x, y: Flicky.player().y };
  ok(Math.abs(p0.y - LEVEL.GROUND_TOP) < 0.01, 'jogador inicia no chão');
  setMove(1);
  Flicky.tick(10);
  const px1 = Flicky.player().x;
  ok(px1 > p0.x + 5, 'movimentação lateral acelera (' + p0.x.toFixed(1) + ' -> ' + px1.toFixed(1) + ')');

  Flicky.input.jump = true;
  Flicky.input.jumpQueued = true;
  Flicky.tick(6);
  ok(Flicky.player().y < LEVEL.GROUND_TOP - 10, 'salto eleva o jogador (y=' + Flicky.player().y.toFixed(1) + ')');

  Flicky.input.jump = false;
  stopMove();
  Flicky.tick(120);
  const p = Flicky.player();
  ok(Math.abs(p.y - LEVEL.GROUND_TOP) < 0.01 && p.onGround, 'aterrissa de volta no chão');
  ok(p.x < LEVEL.W - 6 && p.x > 6, 'jogador permanece dentro da tela');
}

/* ---------------- 4. laço principal (rAF) ---------------- */
section('Laço principal com timestamps');
{
  Flicky.setInvuln(100000);
  setMove(1);
  const x0 = Flicky.player().x;
  const ran = driveRaf(30, 16);
  stopMove();
  ok(ran, 'laço de renderização/física executou sem erros');
  ok(Flicky.player().x > x0 + 5, 'física avança pelo laço com tempo real (' +
    x0.toFixed(1) + ' -> ' + Flicky.player().x.toFixed(1) + ')');
}

/* ---------------- 5. coleta dos filhotes ---------------- */
section('Coleta dos filhotes');
{
  for (let i = 0; i < 6; i++) teleportToChick(i);
  const s = Flicky.get();
  ok(s.queue === 6, '6 filhotes na fila após encostar em todos (queue=' + s.queue + ')');
  ok(s.loose === 0, 'nenhum filhote solto restante');
  ok(s.queue + s.loose + s.rescued === 6, 'conservação total de filhotes');
}

/* ---------------- 6. fila segue o percurso ---------------- */
section('Fila segue percurso e saltos');
{
  Flicky.teleport(30, LEVEL.GROUND_TOP);
  Flicky.tick(2);
  setMove(1);
  Flicky.input.jump = true;
  Flicky.input.jumpQueued = true;

  let minFy = 999, allOnPath = true, outOfArena = false;
  for (let i = 0; i < 45; i++) {
    Flicky.tick(1);
    for (const f of Flicky.queueRef()) {
      if (!followerOnPath(f)) allOnPath = false;
      if (f.y > LEVEL.GROUND_TOP + 0.01 || f.x < 0 || f.x > LEVEL.W) outOfArena = true;
      if (f.y < minFy) minFy = f.y;
    }
  }
  stopMove();
  setMove(-1);
  Flicky.input.jumpQueued = true;
  for (let i = 0; i < 45; i++) {
    Flicky.tick(1);
    for (const f of Flicky.queueRef()) {
      if (!followerOnPath(f)) allOnPath = false;
      if (f.y > LEVEL.GROUND_TOP + 0.01) outOfArena = true;
      if (f.y < minFy) minFy = f.y;
    }
  }
  Flicky.input.jump = false;
  stopMove();
  Flicky.tick(30);

  ok(Flicky.queueRef().length > 0, 'há seguidores durante o teste (n=' + Flicky.queueRef().length + ')');
  ok(allOnPath, 'todo seguidor coincide com o percurso registrado do jogador');
  ok(!outOfArena, 'nenhum seguidor sai da arena ou atravessa o chão');
  ok(minFy < LEVEL.GROUND_TOP - 30, 'seguidores acompanham o salto (y mín=' + minFy.toFixed(1) + ')');
  const f0 = Flicky.queueRef()[0];
  ok(Math.abs(f0.delay - 0.18) < 0.25, 'atraso do 1º seguidor converge para 0,18 s');
}

/* ---------------- 7. dispersão por gato ---------------- */
section('Dispersão da fila ao ser atingida por gato');
{
  Flicky.setInvuln(100000);
  let guard = 0;
  while (Flicky.get().queue < 3 && Flicky.get().loose > 0 && guard++ < 10) {
    const c = Flicky.looseRef()[0];
    Flicky.teleport(c.x, c.y);
    Flicky.tick(1);
  }
  Flicky.teleport(40, LEVEL.GROUND_TOP);
  Flicky.tick(160);

  const before = Flicky.get().queue;
  ok(before >= 2, 'fila com pelo menos 2 filhotes antes da dispersão (n=' + before + ')');

  setMove(1);
  Flicky.tick(60);
  const q = Flicky.queueRef();
  const victim = q[Math.min(1, q.length - 1)];
  const cat = Flicky.catsRef()[1];
  cat.x = victim.x;
  cat.y = LEVEL.GROUND_TOP;
  cat.x1 = 0;
  cat.x2 = LEVEL.W;
  Flicky.tick(2);
  stopMove();

  const after = Flicky.get();
  ok(after.queue < before, 'gato atingiu a fila e dispersou parte dela (n=' + after.queue + ')');
  ok(after.queue >= 1, 'filhotes anteriores continuam seguindo o jogador (n=' + after.queue + ')');
  ok(after.queue + after.loose + after.rescued === 6, 'conservação após dispersão');

  const c1 = Flicky.catsRef()[0], c2 = Flicky.catsRef()[1];
  c1.x1 = 470; c1.x2 = 470; c1.x = 470;
  c2.x1 = 470; c2.x2 = 470; c2.x = 470; c2.y = LEVEL.GROUND_TOP;
  Flicky.tick(300);
  ok(Flicky.looseRef().every(c => onSurface(c.y)), 'filhotes soltos aterrissam em superfícies válidas');
  ok(Flicky.looseRef().every(settledOk), 'nenhum filhote preso dentro de uma plataforma');

  let stillOnPath = true;
  setMove(-1);
  for (let i = 0; i < 30; i++) {
    Flicky.tick(1);
    for (const f of Flicky.queueRef()) if (!followerOnPath(f)) stillOnPath = false;
  }
  Flicky.input.jump = false;
  stopMove();
  ok(stillOnPath, 'sobreviventes da dispersão continuam seguindo o percurso');

  const qBefore = Flicky.get().queue, lBefore = Flicky.get().loose;
  if (lBefore > 0) {
    const c = Flicky.looseRef()[0];
    Flicky.teleport(c.x, c.y);
    Flicky.tick(1);
    const s = Flicky.get();
    ok(s.queue > qBefore && s.loose < lBefore, 'filhote solto pode ser coletado novamente');
    ok(s.queue + s.loose + s.rescued === 6, 'conservação após re-coleta');
  }

  c1.x1 = 150; c1.x2 = 430; c1.x = 170; c1.y = LEVEL.GROUND_TOP; c1.dir = 1;
  c2.x1 = 100; c2.x2 = 196; c2.x = 140; c2.y = 150; c2.dir = -1;
}

/* ---------------- 8. vidas, respawn e invulnerabilidade ---------------- */
section('Perda de vida, recuperação e invulnerabilidade');
{
  const rescuedBefore = Flicky.get().rescued;
  const qBefore = Flicky.get().queue;
  ok(qBefore > 0, 'há seguidores antes do dano (n=' + qBefore + ')');

  Flicky.setInvuln(0);
  Flicky.hurt();
  let s = Flicky.get();
  ok(s.lives === 2, 'perde uma vida (lives=' + s.lives + ')');
  ok(s.state === 'play', 'continua jogando com vidas restantes');
  ok(s.invuln > 1.5, 'invulnerabilidade de 2s ativa (invuln=' + s.invuln.toFixed(2) + ')');
  ok(s.queue === 0, 'seguidores voltam a ficar soltos após o dano');
  ok(s.loose === 6 - rescuedBefore, 'todos os não resgatados estão soltos');
  ok(s.rescued === rescuedBefore, 'resgatados permanecem resgatados');
  ok(Math.abs(Flicky.player().x - LEVEL.spawn.x) < 0.01 &&
     Math.abs(Flicky.player().y - LEVEL.spawn.y) < 0.01, 'jogador reaparece no ponto seguro');
  ok(Flicky.looseRef().every(settledOk), 'filhotes reposicionados nunca abaixo do chão/preso');
  ok(Flicky.looseRef().filter(atSafePoint).length >= qBefore,
     'seguidores voltaram para pontos seguros e alcançáveis');

  Flicky.hurt(false);
  ok(Flicky.get().lives === 2, 'invulnerabilidade protege de novo dano');
}

/* ---------------- 9. objetos arremessáveis ---------------- */
section('Objetos arremessáveis e atordoamento de gatos');
{
  Flicky.setInvuln(100000);
  ok(Flicky.get().throwables >= 1, 'fase 1 tem objetos arremessáveis (n=' + Flicky.get().throwables + ')');

  Flicky.teleport(60, LEVEL.GROUND_TOP);
  Flicky.tick(2);
  ok(Flicky.get().carried === 1, 'jogador pega o objeto ao encostar');

  Flicky.teleport(300, LEVEL.GROUND_TOP);
  Flicky.tick(2);
  ok(Flicky.get().carried === 1 && Flicky.get().throwables >= 2,
     'apenas um objeto em mãos por vez');

  const cat = Flicky.catsRef()[0];
  cat.x1 = 260; cat.x2 = 260; cat.x = 260; cat.y = LEVEL.GROUND_TOP;
  Flicky.teleport(150, LEVEL.GROUND_TOP);
  setMove(1);
  Flicky.tick(30);
  stopMove();
  Flicky.tick(4);
  const scoreBefore = Flicky.get().score;
  Flicky.input.throwQueued = true;
  Flicky.tick(90);
  let s = Flicky.get();
  ok(s.carried === 0, 'objeto foi lançado (mãos vazias)');
  ok(s.stunned === 1, 'gato atingido ficou atordoado');
  ok(s.score === scoreBefore + 100, 'acerto vale 100 pontos uma única vez (' +
     scoreBefore + ' -> ' + s.score + ')');
  ok(s.state === 'play', 'jogador continua jogando após o arremesso');

  const livesBefore = s.lives, queueBefore = s.queue;
  Flicky.teleport(cat.x, cat.y);
  Flicky.tick(10);
  s = Flicky.get();
  ok(s.lives === livesBefore, 'gato atordoado não fere o jogador');
  ok(s.queue === queueBefore, 'gato atordoado não dispersa a fila');

  cat.x1 = 100; cat.x2 = 400;
  const px = Flicky.player().x;
  let guard = 0;
  while (Flicky.get().stunned === 1 && guard++ < 500) Flicky.tick(1);
  s = Flicky.get();
  ok(s.stunned === 0, 'gato recuperou-se após o intervalo');
  ok(Math.abs(cat.x - 100) < 1 || Math.abs(cat.x - 400) < 1,
     'gato reapareceu num ponto seguro da patrulha (x=' + cat.x.toFixed(0) + ')');
  ok(Math.abs(cat.x - px) >= 140, 'gato longe do jogador ao reaparecer (d=' +
     Math.abs(cat.x - px).toFixed(0) + ')');

  Flicky.teleport(300, LEVEL.GROUND_TOP);
  Flicky.tick(2);
  if (Flicky.get().carried === 1) {
    Flicky.input.throwQueued = true;
    Flicky.tick(4);
    ok(Flicky.get().carried === 0, 'segundo lançamento executado');
    Flicky.tick(300);
    ok(Flicky.get().throwables >= 1, 'objeto que erou pousa e continua disponível');
  } else {
    ok(Flicky.get().throwables >= 1, 'objetos ainda disponíveis na fase');
  }
}

/* ---------------- 10. entrega na porta, pontuação e bônus ---------------- */
section('Entrega parcial, pontuação e bônus de tempo');
{
  Flicky.setInvuln(100000);
  parkCats();
  const s0 = Flicky.get().score;

  for (const i of [0, 1, 2]) teleportToChick(i);
  ok(Flicky.get().queue === 3, '3 filhotes coletados na 1ª viagem (queue=' + Flicky.get().queue + ')');
  Flicky.teleport(LEVEL.door.x + LEVEL.door.w / 2, LEVEL.GROUND_TOP);
  Flicky.tick(2);
  let s = Flicky.get();
  ok(s.score === s0 + 400, '3 juntos valem 400 pontos (score=' + s.score + ')');
  ok(s.rescued === 3, '3 resgatados (rescued=' + s.rescued + ')');
  ok(s.queue === 0, 'fila vazia após entrega');
  ok(s.state === 'play', 'fase continua (entrega parcial)');

  Flicky.teleport(LEVEL.spawn.x, LEVEL.GROUND_TOP);
  Flicky.tick(6);
  for (const i of [3, 4, 5]) teleportToChick(i);
  ok(Flicky.get().queue === 3, '3 filhotes coletados na 2ª viagem');
  Flicky.setElapsed(61.9);
  Flicky.teleport(LEVEL.door.x + LEVEL.door.w / 2, LEVEL.GROUND_TOP);
  Flicky.tick(2);
  s = Flicky.get();
  ok(s.rescued === 6, '6/6 resgatados');
  ok(s.state === 'complete', 'fase 1 concluída (estado complete)');
  ok(s.score === s0 + 400 + 400 + 590,
     'bônus de tempo 590 somado (' + s0 + ' + 400 + 400 + 590 = ' + s.score + ')');
  ok(elText('ovTitle') === 'Fase 1 concluída!', 'tela "Fase 1 concluída!"');
  ok(elText('ovText').includes('Bônus de tempo: +590'), 'tela mostra o bônus de tempo');
  ok(elText('ovText').includes('Pontuação acumulada: ' + s.score), 'tela mostra a pontuação acumulada');
  ok(elText('ovBtn1') === 'Próxima fase', 'botão "Próxima fase" disponível (fases 1–9)');
}

/* ---------------- 11. transição para a fase 2 ---------------- */
section('Transição de fase preserva progresso e limpa entidades');
{
  const scoreBefore = Flicky.get().score;
  const livesBefore = Flicky.get().lives;
  fire('ovBtn1', 'click');
  const s = Flicky.get();
  ok(s.state === 'play', 'próxima fase inicia jogando');
  ok(s.phase === 2, 'avançou para a fase 2 (phase=' + s.phase + ')');
  ok(s.target === 7 && s.loose === 7, 'fase 2 tem 7 filhotes');
  ok(s.score === scoreBefore, 'pontuação acumulada preservada (' + s.score + ')');
  ok(s.lives === livesBefore, 'vidas preservadas entre fases (' + s.lives + ')');
  ok(s.rescued === 0, 'resgatados zerados para a nova fase');
  ok(s.queue === 0 && s.particles === 0 && s.carried === 0 && s.stunned === 0,
     'fila, partículas, objeto em mãos e gatos limpos');
  ok(s.elapsed === 0, 'cronômetro da fase reiniciado');
  ok(s.history === 40, 'histórico de percurso re-semeado');
  ok(s.throwables >= 1, 'fase 2 tem objetos arremessáveis');
  ok(elText('phase') === 'Fase 2/10', 'HUD atualizado para Fase 2/10');
  ok(elText('rescued') === 'Resgatados: 0/7', 'HUD atualizado para Resgatados: 0/7');
}

/* ---------------- 12. pausa por tecla/foco e limpeza de comandos ---------------- */
section('Pausa (Esc/P/foco) e limpeza de comandos');
{
  Flicky.input.left = true;
  dispatch('keydown', { key: 'Escape', preventDefault() {} });
  ok(Flicky.get().state === 'pause', 'Esc pausa o jogo');
  ok(Flicky.input.left === false && Flicky.input.right === false && Flicky.input.jump === false,
     'comandos pressionados são limpos ao pausar');

  dispatch('keydown', { key: 'p', preventDefault() {} });
  ok(Flicky.get().state === 'play', 'P retoma o jogo');

  Flicky.input.right = true;
  dispatch('blur', {});
  ok(Flicky.get().state === 'pause', 'perder o foco põe em pausa');
  ok(Flicky.input.right === false, 'comandos limpos ao perder o foco');

  const x = Flicky.player().x, e = Flicky.get().elapsed;
  Flicky.tick(20);
  ok(Flicky.player().x === x && Flicky.get().elapsed === e, 'física e cronômetro congelados na pausa');

  dispatch('keydown', { key: 'Escape', preventDefault() {} });
  ok(Flicky.get().state === 'play', 'Esc retoma após pausa automática');

  fire('btnLeft', 'pointerdown', { preventDefault() {}, pointerId: 1 });
  fire('btnJump', 'pointerdown', { preventDefault() {}, pointerId: 2 });
  ok(Flicky.input.left === true && Flicky.input.jump === true,
     'toques simultâneos: mover + pular ao mesmo tempo');
  fire('btnLeft', 'pointerup', { preventDefault() {}, pointerId: 1 });
  ok(Flicky.input.left === false && Flicky.input.jump === true, 'soltar um botão não afeta o outro');
  fire('btnJump', 'pointerup', { preventDefault() {}, pointerId: 2 });
  ok(Flicky.input.jump === false, 'botão de salto liberado');

  fire('btnThrow', 'pointerdown', { preventDefault() {}, pointerId: 3 });
  ok(Flicky.input.throwQueued === true, 'botão de toque enfileira o arremesso');
  Flicky.tick(1);
  ok(Flicky.input.throwQueued === false, 'arremesso consumido no passo de física');
}

/* ---------------- 13. progressão das 10 fases + validação dos layouts ---------------- */
section('Progressão 1 -> 10, layouts, alcance e vitória');
{
  const CH = [6, 7, 8, 8, 9, 9, 10, 10, 11, 12];   // filhotes por fase (tabela)
  const CA = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5];       // gatos por fase (tabela)
  const themes = new Set();

  Flicky.loadPhase(1);
  for (let n = 1; n <= 10; n++) {
    const s = Flicky.get();
    ok(s.phase === n && s.state === 'play', 'fase ' + n + ' carregada e jogável');
    ok(s.target === CH[n - 1] && LEVEL.chickSpawns.length === CH[n - 1],
       'fase ' + n + ': ' + CH[n - 1] + ' filhotes (tabela)');
    ok(s.cats === CA[n - 1] && LEVEL.catSpawns.length === CA[n - 1],
       'fase ' + n + ': ' + CA[n - 1] + ' gatos (tabela)');
    ok(s.throwables >= 1, 'fase ' + n + ': objetos arremessáveis presentes');
    themes.add(s.theme);

    /* ---- validação dos dados do layout ---- */
    ok(bfsAllReachable(), 'fase ' + n + ': todas as plataformas alcançáveis do chão (BFS)');
    ok(LEVEL.chickSpawns.every(c => LEVEL.platforms.some(p =>
         c.x > p.x && c.x < p.x + p.w && Math.abs(c.y - p.y) < 0.01)),
       'fase ' + n + ': filhotes nascem sobre plataformas');
    ok(LEVEL.chickSpawns.every(c => c.x > 0 && c.x < LEVEL.W),
       'fase ' + n + ': filhotes dentro da arena');
    ok(LEVEL.door.y + LEVEL.door.h === LEVEL.GROUND_TOP &&
       LEVEL.door.x > 0 && LEVEL.door.x + LEVEL.door.w < LEVEL.W,
       'fase ' + n + ': porta sobre o chão e dentro da arena');
    ok(LEVEL.safePoints.every(p => onPlatform(p.x, p.y)),
       'fase ' + n + ': pontos seguros sobre superfícies válidas');
    ok(LEVEL.throwSpawns.every(t => onPlatform(t.x, t.y)),
       'fase ' + n + ': objetos sobre superfícies válidas');
    ok(LEVEL.platforms.every(p => p.x >= 0 && p.x + p.w <= LEVEL.W && p.y >= 54 && p.y < LEVEL.GROUND_TOP),
       'fase ' + n + ': plataformas dentro da arena e nas linhas de salto');
    ok(LEVEL.catSpawns.every(c => {
         const pl = LEVEL.platforms.find(p => Math.abs(p.y - c.y) < 0.01 &&
           c.x1 >= p.x && c.x2 <= p.x + p.w);
         const onGround = Math.abs(c.y - LEVEL.GROUND_TOP) < 0.01 &&
           c.x1 >= 8 && c.x2 <= LEVEL.W - 8;
         return !!(pl || onGround) && c.x >= c.x1 && c.x <= c.x2;
       }),
       'fase ' + n + ': patrulhas dos gatos contidas na superfície');
    ok(LEVEL.catSpawns.every(c =>
         !(Math.abs(c.y - LEVEL.GROUND_TOP) < 0.01 &&
           c.x1 <= LEVEL.spawn.x + 24 && c.x2 >= LEVEL.spawn.x - 24)),
       'fase ' + n + ': nenhum gato inicia sobre o ponto de nascimento');
    ok(Math.abs(LEVEL.spawn.y - LEVEL.GROUND_TOP) < 0.01 && LEVEL.spawn.x > 0,
       'fase ' + n + ': ponto inicial válido');

    /* ---- conclui a fase jogando (coleta + entrega) ---- */
    const before = Flicky.get();
    completePhaseViaPlay();
    const after = Flicky.get();
    ok(after.rescued === CH[n - 1], 'fase ' + n + ': todos os ' + CH[n - 1] + ' entregues');
    ok(after.queue === 0 && after.loose === 0, 'fase ' + n + ': fila e soltos zerados na entrega');
    ok(after.score === before.score + after.score - before.score && after.score > before.score,
       'fase ' + n + ': pontuou ao entregar');

    if (n < 10) {
      ok(after.state === 'complete', 'fase ' + n + ': tela de conclusão (não vitória)');
      ok(elText('ovBtn1') === 'Próxima fase', 'fase ' + n + ': botão "Próxima fase"');
      fire('ovBtn1', 'click');
      const nx = Flicky.get();
      ok(nx.phase === n + 1 && nx.state === 'play', 'fase ' + n + ': avançou para a ' + (n + 1));
      ok(nx.score === after.score, 'fase ' + n + ' -> ' + (n + 1) + ': pontuação preservada');
      ok(nx.lives === after.lives, 'fase ' + n + ' -> ' + (n + 1) + ': vidas preservadas');
      ok(nx.elapsed === 0 && nx.rescued === 0 && nx.history === 40 && nx.particles === 0,
         'fase ' + n + ' -> ' + (n + 1) + ': cronômetro/resgatados/histórico/partículas zerados');
    } else {
      ok(after.state === 'victory', 'vitória somente após a fase 10');
      ok(elText('ovTitle') === 'Vitória!', 'tela de vitória final exibida');
      ok(elText('ovText').includes('Pontuação total: ' + after.score),
         'vitória mostra a pontuação total');
      ok(elText('ovText').includes('Recorde: ' + after.record), 'vitória mostra o recorde');
      ok(elText('ovBtn1') === 'Jogar novamente', 'vitória oferece "Jogar novamente"');
    }
  }
  ok(themes.size === 10, 'as 10 fases usam 10 cenários temáticos distintos (' + themes.size + ')');
}

/* ---------------- 14. game over, nova campanha e recorde ---------------- */
section('Game over, nova campanha e recorde');
{
  /* da vitória: "Jogar novamente" volta à fase 1 */
  fire('ovBtn1', 'click');
  let s = Flicky.get();
  ok(s.state === 'play' && s.phase === 1 && s.lives === 3 && s.score === 0,
     'vitória -> Jogar novamente reinicia na fase 1 com 3 vidas e 0 pontos');

  const recordBefore = s.record;
  ok(recordBefore > 0, 'recorde acumulado durante a campanha (' + recordBefore + ')');
  ok(global.localStorage.getItem('flicky.recorde') === String(recordBefore),
     'recorde salvo no localStorage');

  Flicky.setInvuln(0); Flicky.hurt();
  Flicky.setInvuln(0); Flicky.hurt();
  Flicky.setInvuln(0); Flicky.hurt();
  s = Flicky.get();
  ok(s.lives === 0 && s.state === 'over', 'zerar as 3 vidas gera Game Over');
  ok(elText('ovTitle') === 'Game Over', 'tela de Game Over exibida');
  ok(elText('ovBtn1') === 'Nova campanha', 'game over oferece "Nova campanha"');
  ok(s.record === recordBefore, 'recorde mantido no game over');

  fire('ovBtn1', 'click');               // Nova campanha -> fase 1
  s = Flicky.get();
  ok(s.state === 'play' && s.phase === 1, 'nova campanha começa na fase 1');
  ok(s.lives === 3 && s.score === 0 && s.rescued === 0, 'nova campanha restaura vidas e pontuação');
  ok(s.loose === 6 && s.queue === 0 && s.throwables >= 1 && s.cats === 2,
     'nova campanha restaura todas as entidades da fase 1');
  ok(s.elapsed === 0 && s.history === 40 && s.particles === 0, 'temporizadores e efeitos zerados');
  ok(s.record === recordBefore, 'recorde não é apagado pela nova campanha');
  ok(global.localStorage.getItem('flicky.recorde') === String(recordBefore),
     'recorde continua no localStorage após reinício');
}

/* ---------------- 15. pausa por botão e som ---------------- */
section('Botão "Reiniciar campanha" e alternância de som');
{
  Flicky.setInvuln(100000);
  dispatch('keydown', { key: 'Escape', preventDefault() {} });
  ok(Flicky.get().state === 'pause', 'pausa aberta pelo teclado');
  ok(elText('ovTitle') === 'Pausa' && elText('ovBtn1') === 'Continuar',
     'tela de pausa com botão "Continuar"');
  ok(elText('ovBtn2') === 'Reiniciar campanha', 'pausa oferece "Reiniciar campanha"');

  fire('ovBtn2', 'click');
  let s = Flicky.get();
  ok(s.state === 'play' && s.phase === 1 && s.lives === 3 && s.score === 0,
     '"Reiniciar campanha" restaura fase 1, 3 vidas e pontuação 0');
  ok(s.loose === 6 && s.queue === 0, '"Reiniciar campanha" restaura as entidades');

  const SFX = global.SFX;
  const was = SFX.isEnabled();
  fire('btnMute', 'click');
  ok(SFX.isEnabled() === !was, 'botão de som desativa/ativa');
  fire('btnMute', 'click');
  ok(SFX.isEnabled() === was, 'botão de som restaura o estado');
}

/* ---------------- 16. entrada unificada: teclado + toque com origens ---------------- */
section('Entrada unificada (teclado + toque por origem)');
{
  // teclado pressiona, toque também → soltar o teclado NÃO zera a ação
  dispatch('keydown', { key: 'ArrowRight', preventDefault() {} });
  ok(Flicky.input.right === true, 'teclado: seta direita ativa');
  fire('btnRight', 'pointerdown', { preventDefault() {}, pointerId: 10 });
  ok(Flicky.input.right === true, 'toque: mesmo botão ativo junto');
  dispatch('keyup', { key: 'ArrowRight', preventDefault() {} });
  ok(Flicky.input.right === true, 'soltar a tecla mantém a ação (toque segura)');
  fire('btnRight', 'pointerup', { preventDefault() {}, pointerId: 10 });
  ok(Flicky.input.right === false, 'soltar o toque com tecla solta encerra a ação');

  // caso inverso: toque pressiona, teclado também → soltar o toque NÃO zera
  fire('btnLeft', 'pointerdown', { preventDefault() {}, pointerId: 11 });
  dispatch('keydown', { key: 'ArrowLeft', preventDefault() {} });
  fire('btnLeft', 'pointerup', { preventDefault() {}, pointerId: 11 });
  ok(Flicky.input.left === true, 'soltar o toque mantém a ação (tecla segura)');
  dispatch('keyup', { key: 'ArrowLeft', preventDefault() {} });
  ok(Flicky.input.left === false, 'soltar a tecla encerra a ação');
}

/* ---------------- 17. multitoque: andar+saltar e andar+arremessar ---------------- */
section('Multitoque: andar com pular e andar com arremessar');
{
  // prepara: jogador no chão
  var guard = 0;
  while (!Flicky.player().onGround && guard++ < 400) Flicky.tick(1);
  var x0 = Flicky.player().x;

  // 2 dedos: direita + salto ao mesmo tempo
  fire('btnRight', 'pointerdown', { preventDefault() {}, pointerId: 21 });
  fire('btnJump', 'pointerdown', { preventDefault() {}, pointerId: 22 });
  ok(Flicky.input.right === true && Flicky.input.jump === true,
     'dedo 1 segura mover e dedo 2 segura pular');
  Flicky.tick(12);
  var p = Flicky.player();
  ok(p.y < LEVEL.GROUND_TOP - 10, 'salto executou enquanto andava (y=' + p.y.toFixed(1) + ')');
  ok(p.x > x0 + 3, 'movimento lateral contou durante o salto (x=' + p.x.toFixed(1) + ')');
  fire('btnRight', 'pointerup', { preventDefault() {}, pointerId: 21 });
  fire('btnJump', 'pointerup', { preventDefault() {}, pointerId: 22 });
  ok(Flicky.input.right === false && Flicky.input.jump === false,
     'soltar os dois dedos encerra as duas ações');
  guard = 0;
  while (!Flicky.player().onGround && guard++ < 400) Flicky.tick(1);

  // 2 dedos: direita + arremesso ao mesmo tempo
  if (Flicky.get().carried !== 1) {
    var idle = null;
    for (var ti = 0; ti < Flicky.throwablesRef().length; ti++) {
      if (Flicky.throwablesRef()[ti].state === 'idle') { idle = Flicky.throwablesRef()[ti]; break; }
    }
    if (idle) { Flicky.teleport(idle.x, idle.y); Flicky.tick(2); }
  }
  ok(Flicky.get().carried === 1, 'objeto coletado para o teste de arremesso');
  var s0 = Flicky.get();
  fire('btnRight', 'pointerdown', { preventDefault() {}, pointerId: 23 });
  fire('btnThrow', 'pointerdown', { preventDefault() {}, pointerId: 24 });
  ok(Flicky.input.right === true && Flicky.input.throwQueued === true,
     'dedo 1 segura mover e dedo 2 dispara arremesso');
  Flicky.tick(6);
  ok(Flicky.get().carried === 0 && Flicky.get().flying >= 1,
     'objeto lançado durante a movimentação');
  fire('btnRight', 'pointerup', { preventDefault() {}, pointerId: 23 });
  fire('btnThrow', 'pointerup', { preventDefault() {}, pointerId: 24 });
  ok(Flicky.input.right === false, 'movimento parou ao soltar o dedo');
  Flicky.tick(240);                  // objeto pousa
}

/* ---------------- 18. cancelamento de toques e limpeza por estado ---------------- */
section('Cancelamento: pointercancel, pausa e retomada sem comandos presos');
{
  fire('btnLeft', 'pointerdown', { preventDefault() {}, pointerId: 31 });
  ok(Flicky.input.left === true, 'toque ativo');
  fire('btnLeft', 'pointercancel', { preventDefault() {}, pointerId: 31 });
  ok(Flicky.input.left === false, 'pointercancel interrompe o comando');

  fire('btnLeft', 'pointerdown', { preventDefault() {}, pointerId: 32 });
  ok(Flicky.input.left === true, 'toque reativado');
  dispatch('keydown', { key: 'Escape', preventDefault() {} });
  ok(Flicky.get().state === 'pause' && Flicky.input.left === false,
     'pausa limpa o comando pressionado');
  fire('btnLeft', 'pointerup', { preventDefault() {}, pointerId: 32 });   // solto atrasado
  ok(Flicky.input.left === false, 'pointerup atrasado após a pausa não reativa nada');

  fire('btnRight', 'pointerdown', { preventDefault() {}, pointerId: 33 });
  ok(Flicky.input.right === false, 'toque durante a pausa é ignorado');
  dispatch('keydown', { key: 'Escape', preventDefault() {} });
  ok(Flicky.get().state === 'play', 'retomada pelo teclado');
  fire('btnRight', 'pointerdown', { preventDefault() {}, pointerId: 34 });
  ok(Flicky.input.right === true, 'toque volta a funcionar após retomar');
  fire('btnRight', 'pointerup', { preventDefault() {}, pointerId: 34 });
  ok(Flicky.input.right === false, 'liberado corretamente');
  fire('btnRight', 'pointercancel', { preventDefault() {}, pointerId: 33 }); // id antigo
  ok(Flicky.input.right === false, 'cancelamento de id antigo é inofensivo');
}

/* ---------------- 19. botão de pausa, som persistente e textos de toque ---------------- */
section('Botão de pausa, persistência do som e instruções de toque');
{
  ok(!!document.getElementById('btnPause'), 'botão de pausa presente no HUD');
  fire('btnPause', 'click');
  ok(Flicky.get().state === 'pause', 'botão de pausa pausa (toque)');
  ok(elText('ovTitle') === 'Pausa', 'tela de pausa exibida pelo botão');
  fire('btnPause', 'click');
  ok(Flicky.get().state === 'play', 'botão de pausa retoma (toque)');

  // preferência de som gravada em localStorage
  var was = global.SFX.isEnabled();
  fire('btnMute', 'click');
  ok(global.localStorage.getItem('flicky.som') === (was ? '0' : '1'),
     'preferência de som gravada em flicky.som');
  ok(global.SFX.isEnabled() === !was, 'som alternado');
  fire('btnMute', 'click');
  ok(global.SFX.isEnabled() === was && global.localStorage.getItem('flicky.som') === (was ? '1' : '0'),
     'preferência restaurada e gravada');

  // sem suporte de tela cheia → botão permanece oculto (detecção de recurso)
  ok(document.getElementById('btnFull').classList.contains('hidden'),
     'botão de tela cheia oculto quando a API não existe');

  // instruções em modo toque (simula aparelho com tela sensível ao toque)
  window.matchMedia = function () { return { matches: true }; };
  ok(Flicky.isTouch() === true, 'detecção de entrada por toque');
  dispatch('keydown', { key: 'Escape', preventDefault() {} });   // pausa p/ ver textos
  Flicky.refreshUI();
  ok(elText('ovText').includes('Toque em "Continuar"'), 'tela de pausa com instrução de toque');
  ok(document.getElementById('hint').textContent.includes('Vire o celular'),
     'dica inferior adaptada para toque (só dica de rotação)');
  delete window.matchMedia;
  Flicky.refreshUI();
  ok(elText('ovText').includes('Esc, P'), 'texto volta ao modo teclado');
  dispatch('keydown', { key: 'Escape', preventDefault() {} });
  ok(Flicky.get().state === 'play', 'jogo retomado ao final do teste');
}

/* ---------------- 20. pausa ao trocar de aplicativo ---------------- */
section('Pausa ao ocultar a aba e retorno aguardando o jogador');
{
  var guard = 0;
  while (!Flicky.player().onGround && guard++ < 400) Flicky.tick(1);
  fire('btnLeft', 'pointerdown', { preventDefault() {}, pointerId: 41 });
  ok(Flicky.input.left === true, 'toque ativo antes de trocar de aplicativo');

  document.hidden = true;
  dispatch('doc:visibilitychange', {});
  ok(Flicky.get().state === 'pause', 'aba oculta → pausa automática');
  ok(elText('ovTitle') === 'Pausa', 'tela de pausa visível ao retornar');
  ok(Flicky.input.left === false, 'comandos limpos ao ocultar (sem botão preso)');

  document.hidden = false;
  dispatch('doc:visibilitychange', {});
  ok(Flicky.get().state === 'pause', 'ao voltar permanece pausado (aguarda o jogador)');
  fire('btnLeft', 'pointerup', { preventDefault() {}, pointerId: 41 });   // dedo solto no app
  ok(Flicky.input.left === false, 'pointerup atrasado não deixa comando ativo');
  fire('ovBtn1', 'click');
  ok(Flicky.get().state === 'play', 'jogador continua pelo botão "Continuar"');
}

/* ---------------- 21. redimensionar/girar preserva a partida (DPR com teto) ---------------- */
section('Resize/rotação: escala de exibição sem reiniciar a partida');
{
  var snap = Flicky.get();
  var px = Flicky.player().x, py = Flicky.player().y;

  window.devicePixelRatio = 3;                    // exagerado de propósito
  Flicky.resize();
  var cv = document.getElementById('game');
  ok(cv.width === 480 * 2 && cv.height === 270 * 2,
     'DPR limitado ao teto (backbuffer ' + cv.width + 'x' + cv.height + ')');
  var s = Flicky.get();
  ok(s.phase === snap.phase && s.score === snap.score && s.lives === snap.lives &&
     s.rescued === snap.rescued && s.queue === snap.queue && s.loose === snap.loose,
     'redimensionar não altera fase/pontos/vidas/resgates/fila');
  ok(Flicky.player().x === px && Flicky.player().y === py,
     'redimensionar não move nenhuma entidade');

  window.devicePixelRatio = 1;
  Flicky.resize();
  ok(cv.width === 480 && cv.height === 270, 'volta ao tamanho lógico 480x270 (DPR 1)');

  dispatch('resize', {});                          // agendado por rAF
  dispatch('orientationchange', {});               // giro: só re-layout
  var s2 = Flicky.get();
  ok(s2.phase === snap.phase && s2.score === snap.score && s2.lives === snap.lives,
     'eventos de resize/rotação não tocam no estado do jogo');
  ok(driveRaf(2, 16), 'laço segue executando após redimensionar (sem erros)');
  var s3 = Flicky.get();
  ok(s3.phase === snap.phase && s3.score === snap.score && s3.lives === snap.lives,
     'quadros seguintes mantêm a partida intacta');
}

/* ---------------- 22. marcação: controles fora da arena + exigências estáticas ---------------- */
section('Marcação e estilo: controles fora da arena, viewport e segurança');
{
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

  ok(!/user-scalable\s*=\s*no/.test(html) && !/maximum-scale/.test(html),
     'viewport não bloqueia o zoom global');
  ok(html.includes('viewport-fit=cover'), 'viewport-fit=cover para áreas seguras');
  ok(html.includes('width=device-width'), 'viewport com largura do dispositivo');

  var stageAt = html.indexOf('<div id="stage">');
  var touchAt = html.indexOf('<div id="touch"');
  ok(stageAt >= 0 && touchAt > stageAt, 'bloco de controles existe');
  var slice = html.slice(stageAt, touchAt);
  var opens = (slice.match(/<div/g) || []).length;
  var closes = (slice.match(/<\/div>/g) || []).length;
  ok(opens === closes, 'controles estão FORA do #stage (arena nunca encoberta)');

  ok(css.includes('touch-action: none') && css.includes('#game'),
     'touch-action: none na superfície do jogo');
  ok(css.includes('safe-area-inset'), 'áreas seguras via env(safe-area-inset-*)');
  ok(css.includes('aspect-ratio: 16 / 9'), 'proporção original da arena preservada');
  ok(css.includes('min-width: 48px') && css.includes('min-height: 48px'),
     'alvos de toque mínimos 48x48 CSS');
  ok(css.includes('orientation: landscape') && css.includes('orientation: portrait'),
     'layouts separados por orientação');
  ok(css.includes('has-touch'), 'controles de toque condicionados a entrada por toque');
  ok(css.includes('.pressed'), 'resposta visual de botão pressionado (não só :hover)');
}

/* ---------------- 23. layout da arena: escala min(), disposição automática, rotação ---------------- */
section('Layout: escala min(larg/alt), disposição automática e rotação segura');
{
  // --- matemática pura (a mesma executada no navegador) ---
  var L1 = Flicky.computeLayout(378, 683, 62, 8, false);
  ok(L1.mode === 'below' && L1.w === 370 && L1.h === 208,
     'retrato iPhone 13: arena na largura total (' + L1.w + 'x' + L1.h + ', controles abaixo)');

  var L2 = Flicky.computeLayout(738, 294, 64, 8, true);
  ok(L2.mode === 'sides' && L2.w === 508 && L2.h === 286,
     'paisagem iPhone 13: controles laterais (' + L2.w + 'x' + L2.h + ')');
  var abaixo = Flicky.computeLayout(738, 294, 64, 8, false);
  ok(L2.scale > abaixo.scale, 'laterais escolhidas por dar a MAIOR arena');

  var L3 = Flicky.computeLayout(500, 400, 56, 8, true);
  ok(L3.mode === 'below' && L3.scale > 0, 'janela estreita/alta: controles abaixo é maior → escolhido');

  var L4 = Flicky.computeLayout(1200, 600, 0, 8, true);
  ok(L4.mode === 'below' && L4.w === 1052 && L4.h === 592,
     'desktop sem controles: min(' + L4.w + '/480, ' + L4.h + '/270) da área disponível');

  var todos = [L1, L2, L3, L4], ratioOk = true;
  for (var li = 0; li < todos.length; li++) {
    if (Math.abs(todos[li].w / todos[li].h - 16 / 9) > 0.01) ratioOk = false;
  }
  ok(ratioOk, 'todas as escalas preservam a proporção 16/9 (sem distorção)');

  // --- aplicação no DOM com retângulos simulados (como no navegador) ---
  var midEl = document.getElementById('mid');
  var stageEl = document.getElementById('stage');
  var btnEl = document.getElementById('btnLeft');
  var savedW = window.innerWidth, savedH = window.innerHeight;
  window.innerWidth = 390; window.innerHeight = 844;            // retrato iPhone 13
  midEl.getBoundingClientRect = function () { return { width: 378, height: 683 }; };
  btnEl.getBoundingClientRect = function () { return { width: 62, height: 62 }; };

  var antes = Flicky.get();
  var px = Flicky.player().x, py = Flicky.player().y;

  Flicky.layout();
  ok(stageEl.style.width === '370px' && stageEl.style.height === '208px',
     'tamanho visual aplicado no #stage (370x208 CSS px, separado do canvas)');
  ok(!midEl.classList.contains('mid-sides'), 'retrato: controles logo abaixo da arena');
  ok(Flicky.get().phase === antes.phase && Flicky.get().score === antes.score &&
     Flicky.get().lives === antes.lives &&
     Flicky.player().x === px && Flicky.player().y === py,
     'aplicar layout não altera fase, pontos, vidas nem posições');

  // --- giro do aparelho: troca de disposição sem comando preso ---
  fire('btnRight', 'pointerdown', { preventDefault() {}, pointerId: 61 });
  ok(Flicky.input.right === true, 'toque ativo antes do giro');
  window.innerWidth = 844; window.innerHeight = 390;            // paisagem iPhone 13
  midEl.getBoundingClientRect = function () { return { width: 738, height: 294 }; };
  btnEl.getBoundingClientRect = function () { return { width: 64, height: 64 }; };
  Flicky.layout();
  ok(midEl.classList.contains('mid-sides'), 'paisagem: disposição lateral aplicada');
  ok(stageEl.style.width === '508px' && stageEl.style.height === '286px',
     'arena recalculada no giro (508x286)');
  ok(Flicky.input.right === false, 'giro limpa os comandos (nada fica preso)');
  ok(Flicky.get().phase === antes.phase && Flicky.get().score === antes.score &&
     Flicky.get().lives === antes.lives &&
     Flicky.player().x === px && Flicky.player().y === py,
     'girar preserva a partida completa');

  // volta ao retrato → volta para controles abaixo
  window.innerWidth = 390; window.innerHeight = 844;
  midEl.getBoundingClientRect = function () { return { width: 378, height: 683 }; };
  btnEl.getBoundingClientRect = function () { return { width: 62, height: 62 }; };
  Flicky.layout();
  ok(!midEl.classList.contains('mid-sides'), 'volta ao retrato: controles abaixo de novo');

  // sem medidas de layout → não lança erro nem mexe no estado
  delete midEl.getBoundingClientRect;
  delete btnEl.getBoundingClientRect;
  window.innerWidth = savedW; window.innerHeight = savedH;
  var st = Flicky.get();
  Flicky.layout();
  ok(Flicky.get().state === st.state && Flicky.get().phase === st.phase,
     'layout sem retângulos (testes/desconhecido) é inofensivo');

  // --- regressões estáticas das correções de CSS ---
  var css2 = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  ok(!/grid-template-rows:\s*minmax\(0,\s*1fr\)/.test(css2),
     'eliminada a linha 1fr que criava os grandes vazios');
  ok(css2.includes('justify-content: flex-start') && css2.includes('align-content: start'),
     'sem centralização vertical em área grande (toque empilhado de cima)');
  ok(css2.includes('mid-sides'), 'disposição lateral por classe (escolha automática)');
  ok(css2.includes('100dvh'), 'altura dinâmica (dvh) para as barras do navegador');
  ok(css2.includes('body.has-touch #record { display: none; }'),
     'HUD compacto: recorde sai do painel (fica no menu)');
  ok(css2.includes('clamp(56px, 16vw, 72px)') && css2.includes('clamp(56px, 13vh, 72px)'),
     'botões de ação entre 56 e 72 px conforme o espaço');
}


console.log('\n---------------------------------------------');
console.log('Resultados: ' + pass + ' passaram, ' + fail + ' falharam');
if (fail > 0) {
  console.log('\nFalhas:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('TODOS OS TESTES PASSARAM');
