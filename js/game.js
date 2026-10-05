/* game.js — laço principal, física, entidades, campanha (10 fases) e interface
   Estados: menu | play | pause | complete | over | victory               */
(function () {
  'use strict';

  var LEVEL = window.LEVEL, LEVELS = window.LEVELS, SFX = window.SFX, SPRITES = window.SPRITES;

  /* ---------------- constantes ---------------- */
  var STEP = 1 / 120;              // passo de tempo fixo (consistente em qualquer FPS)
  var HZ = 1 / STEP;
  var GRAV = 2000;
  var SPEED = 145;
  var ACC_GROUND = 1600, ACC_AIR = 1000, FRIC = 1800;
  var JUMP_V = 520, JUMP_CUT = -190;
  var COYOTE = 0.10, BUFFER = 0.12;
  var FOLLOW_DELAY = 0.18;         // atraso entre filhotes da fila
  var HISTORY_MAX = 360;           // ~3s de histórico (acomoda filas longas)
  var INVULN = 2;                  // invulnerabilidade após dano
  var CAT_PATROL = 42, CAT_CHASE = 66;
  var STUN_T = 2.5;                // gato atordoado fora de ação
  var THR_V = 360, THR_GRAV = 1200;// objeto arremessado
  var PW = 10, PH = 13;            // hitbox do jogador
  var CW = 14, CH = 10;            // hitbox do gato
  var KW = 7, KH = 8;              // hitbox do filhote
  var TW = 9, TH = 9;              // hitbox do objeto
  var REC_KEY = 'flicky.recorde';

  /* ---------------- estado da campanha ---------------- */
  var canvas, ctx, scenery, sprites, birdHurt, catGhost;
  var state = 'menu';              // menu | play | pause | complete | over | victory
  var score = 0, lives = 3, rescued = 0, record = 0;
  var phase = 1, target = 6, phaseStartScore = 0;
  var LV = null;                   // configuração da fase ativa
  var player = null, queue = [], loose = [], cats = [], throwables = [];
  var carried = null;              // objeto em mãos (1 por vez)
  var particles = [], texts = [];
  var history = [];
  var invuln = 0, gameTime = 0, safeIdx = 0;
  var last = 0, acc = 0, started = false, booted = false;

  var input = {
    left: false, right: false, jump: false, throw: false,
    jumpQueued: false, throwQueued: false
  };

  /* entrada unificada: cada ação guarda as origens (teclado + ponteiro);
     o valor final é a união — soltar uma origem não apaga a outra */
  var SRC_NAMES = ['left', 'right', 'jump', 'throw'];
  var src = {};
  for (var si = 0; si < SRC_NAMES.length; si++) {
    src[SRC_NAMES[si]] = { kbd: false, ptr: false };
  }
  /* acompanhamento individual de toques: ponteiro -> ação, por ação -> conjunto */
  var ptrAction = {};
  var ptrSet = { left: {}, right: {}, jump: {}, throw: {} };
  var ptrN = { left: 0, right: 0, jump: 0, throw: 0 };
  var touchBtns = [];            // botões com estado visual .pressed

  /* referências de UI */
  var el = {};

  /* ---------------- utilidades ---------------- */
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function playerBox() {
    return { x: player.x - PW / 2, y: player.y - PH, w: PW, h: PH };
  }
  function catBox(c) {
    return { x: c.x - CW / 2, y: c.y - CH, w: CW, h: CH };
  }
  function chickBox(c) {
    return { x: c.x - KW / 2, y: c.y - KH, w: KW, h: KH };
  }
  function seedBox(o) {
    return { x: o.x - TW / 2, y: o.y - TH, w: TW, h: TH };
  }
  function hit(a, b) {
    return overlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
  }

  function makeChick(x, y, dir) {
    return { x: x, y: y, vx: 0, vy: 0, dir: dir || 1, onGround: true, anim: 0, fearCd: 0, knockCd: 0 };
  }

  var CONFETTI = ['#ffd34d', '#ff5a8a', '#4da3ff', '#43c76a', '#ff9f1c'];

  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() * 2 - 1) * 70,
        vy: -Math.random() * 90 - 20,
        life: 0.55 + Math.random() * 0.3,
        c: color, s: 2
      });
    }
  }

  function confetti(x, y, n) {
    for (var i = 0; i < n; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() * 2 - 1) * 110,
        vy: -Math.random() * 150 - 40,
        life: 0.9 + Math.random() * 0.6,
        c: CONFETTI[i % CONFETTI.length], s: 2
      });
    }
  }

  function addText(x, y, t, c) {
    texts.push({ x: x, y: y, t: t, c: c || '#fff', life: 1.1 });
  }

  function seedHistory() {
    history.length = 0;
    for (var i = 0; i < 40; i++) history.push({ x: player.x, y: player.y, dir: player.dir });
  }

  function clearInput() {
    input.left = false; input.right = false;
    input.jump = false; input.throw = false;
    input.jumpQueued = false; input.throwQueued = false;
    for (var i = 0; i < SRC_NAMES.length; i++) {
      var a = SRC_NAMES[i];
      src[a].kbd = false; src[a].ptr = false;
      ptrSet[a] = {}; ptrN[a] = 0;
    }
    ptrAction = {};
    for (var b = 0; b < touchBtns.length; b++) {
      var n = touchBtns[b];
      if (n && n.classList) n.classList.remove('pressed');
    }
  }

  /* define uma ação vinda de uma origem; a borda false→true dispara o evento */
  function setAction(name, on, origin) {
    var s = src[name];
    if (!s || s[origin] === on) return;
    s[origin] = on;
    var val = s.kbd || s.ptr;
    if (name === 'jump') {
      if (val && !input.jump && state === 'play') input.jumpQueued = true;
      input.jump = val;
    } else if (name === 'throw') {
      if (val && !input.throw && state === 'play') input.throwQueued = true;
      input.throw = val;
    } else {
      input[name] = val;
    }
  }

  /* ---- ponteiros (toque): um dedo por ação, com captura ---- */
  function ptrDown(action, id) {
    var set = ptrSet[action];
    if (set[id]) return false;
    set[id] = 1; ptrN[action]++;
    return true;
  }
  function ptrUp(action, id) {
    var set = ptrSet[action];
    if (!set[id]) return false;
    delete set[id];
    ptrN[action] = ptrN[action] > 0 ? ptrN[action] - 1 : 0;
    return true;
  }

  /* ---------------- recorde (localStorage) ---------------- */
  function loadRecord() {
    try {
      var v = global2().localStorage && global2().localStorage.getItem(REC_KEY);
      var n = parseInt(v, 10);
      return isNaN(n) || n < 0 ? 0 : n;
    } catch (e) { return 0; }
  }
  function saveRecord() {
    try {
      var ls = global2().localStorage;
      if (ls && ls.setItem) ls.setItem(REC_KEY, String(record));
    } catch (e) { /* armazenamento indisponível */ }
  }
  function global2() { return typeof window !== 'undefined' ? window : {}; }

  function addScore(v) {
    score += v;
    if (score > record) { record = score; saveRecord(); }
    updateHUD();
  }

  /* ---------------- carregamento de fase ---------------- */
  function loadPhase(n) {
    phase = Math.max(1, Math.min(LEVELS.total, n | 0));
    LV = LEVEL.load(phase);
    target = LV.chicks.length;
    rescued = 0;
    phaseStartScore = score;
    invuln = 0; gameTime = 0; safeIdx = 0;
    player = {
      x: LV.spawn.x, y: LV.spawn.y, vx: 0, vy: 0, dir: 1,
      onGround: true, anim: 0, jumping: false, coyote: COYOTE, buffer: 0, hurtTimer: 0
    };
    queue = [];
    loose = LV.chicks.map(function (s) { return makeChick(s.x, s.y, 1); });
    cats = LV.cats.map(function (s) {
      return {
        x: s.x, y: s.y, sx: s.x, sy: s.y,
        x1: s.x1, x2: s.x2, dir: s.dir, anim: 0,
        stun: 0, mul: LV.speedMul, chase: LV.chaseRange
      };
    });
    throwables = LV.throwables.map(function (s) {
      return { x: s.x, y: s.y, vx: 0, vy: 0, dir: 1, state: 'idle', onGround: true, fly: 0 };
    });
    carried = null;
    particles = []; texts = [];
    clearInput();
    seedHistory();
    scenery = LEVEL.buildScenery();
    updateHUD();
  }

  /* inicia a campanha do zero (fase 1, 3 vidas, pontuação 0) */
  function startCampaign() {
    score = 0; lives = 3;
    loadPhase(1);
    state = 'play';
    hideOverlay();
    SFX.play('click');
  }

  /* carrega uma fase qualquer mantendo pontos/vidas (usado por "Próxima fase") */
  function startPhase(n) {
    loadPhase(n);
    state = 'play';
    hideOverlay();
  }

  function nextPhase() {
    if (state !== 'complete') return;
    if (phase >= LEVELS.total) return;
    startPhase(phase + 1);
    SFX.play('phase');
  }

  /* ---------------- conclusão da fase / bônus de tempo ---------------- */
  function completePhase() {
    if (state !== 'play') return;
    var secs = Math.floor(gameTime);
    var phasePts = score - phaseStartScore;
    var bonus = Math.max(0, 120 - secs) * 10;
    addScore(bonus);
    var data = { phasePts: phasePts, bonus: bonus, secs: secs };
    confetti(LEVEL.W / 2, 120, 26);
    addText(player.x, player.y - 18, '+' + bonus + ' bônus', '#ffe066');
    if (phase >= LEVELS.total) {
      state = 'victory';
      SFX.play('win');
      showOverlay('victory', data);
    } else {
      state = 'complete';
      SFX.play('phase');
      showOverlay('complete', data);
    }
    updateHUD();
  }

  /* ---------------- reinício / vidas ---------------- */
  function followersToSafePoints() {
    while (queue.length) {
      var f = queue.shift();
      var sp = LV.safePoints[safeIdx % LV.safePoints.length];
      safeIdx++;
      loose.push(makeChick(sp.x, sp.y, 1));
    }
  }

  function hurtPlayer() {
    if (invuln > 0 || state !== 'play') return;
    lives--;
    SFX.play('hurt');
    burst(player.x, player.y - 7, '#ff5a5a', 12);
    if (lives <= 0) {
      lives = 0;
      state = 'over';
      updateHUD();
      showOverlay('over');
      SFX.play('gameOver');
      return;
    }
    followersToSafePoints();
    player.x = LV.spawn.x; player.y = LV.spawn.y;
    player.vx = 0; player.vy = 0;
    player.dir = 1; player.jumping = false;
    player.onGround = true; player.hurtTimer = 0.45;
    invuln = INVULN;
    seedHistory();
    updateHUD();
  }

  /* ---------------- colisão com superfícies ---------------- */
  function landOn(e, prevBottom, halfW) {
    e.onGround = false;
    if (e.y > LEVEL.GROUND_TOP) {
      e.y = LEVEL.GROUND_TOP; e.vy = 0; e.onGround = true;
    }
    if (e.vy >= 0) {
      var ps = LEVEL.platforms;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (prevBottom <= p.y + 0.6 && e.y >= p.y &&
            e.x > p.x - halfW && e.x < p.x + p.w + halfW) {
          e.y = p.y; e.vy = 0; e.onGround = true;
        }
      }
    }
  }

  /* ---------------- entrada (teclado + toque na mesma camada de ações) ---------------- */
  function isLeftKey(k) { return k === 'ArrowLeft' || k === 'a' || k === 'A'; }
  function isRightKey(k) { return k === 'ArrowRight' || k === 'd' || k === 'D'; }
  function isJumpKey(k) { return k === ' ' || k === 'Spacebar' || k === 'w' || k === 'W' || k === 'ArrowUp'; }
  function isThrowKey(k) { return k === 'x' || k === 'X' || k === 'j' || k === 'J'; }
  function isPauseKey(k) { return k === 'Escape' || k === 'p' || k === 'P'; }

  function setupInput() {
    window.addEventListener('keydown', function (e) {
      var k = e.key;
      // menu inicial: Enter/Espaço começam a campanha
      if (state === 'menu' && (k === 'Enter' || isJumpKey(k))) {
        e.preventDefault();
        SFX.init();
        startCampaign();
        return;
      }
      if (isPauseKey(k)) { e.preventDefault(); SFX.init(); togglePause(); return; }
      if (k === 'm' || k === 'M') { toggleMute(); return; }
      // fora do jogo nenhuma ação é registrada (nada fica "pendurado")
      if (state !== 'play') return;
      if (isLeftKey(k)) {
        setAction('left', true, 'kbd');
        e.preventDefault(); SFX.init();
      } else if (isRightKey(k)) {
        setAction('right', true, 'kbd');
        e.preventDefault(); SFX.init();
      } else if (isJumpKey(k)) {
        setAction('jump', true, 'kbd');
        e.preventDefault(); SFX.init();
      } else if (isThrowKey(k)) {
        setAction('throw', true, 'kbd');
        e.preventDefault(); SFX.init();
      }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key;
      if (isLeftKey(k)) setAction('left', false, 'kbd');
      else if (isRightKey(k)) setAction('right', false, 'kbd');
      else if (isJumpKey(k)) setAction('jump', false, 'kbd');
      else if (isThrowKey(k)) setAction('throw', false, 'kbd');
    });
    // gestos iniciais liberam o áudio
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function () { SFX.init(); }, { once: true });
    });
    window.addEventListener('contextmenu', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('#stage, #touch, #hud')) e.preventDefault();
    });
  }

  /* botão de toque: pressão contínua, captura de ponteiro, múltiplos dedos */
  function bindTouch(id, action) {
    var node = document.getElementById(id);
    if (!node || !node.addEventListener) return;
    touchBtns.push(node);

    function down(e) {
      if (e && e.preventDefault) e.preventDefault();
      SFX.init();
      if (state !== 'play') return;               // só age durante a partida
      var pid = (e && e.pointerId != null) ? e.pointerId : 'm';
      if (ptrAction[pid]) return;                 // este dedo já está em uso
      if (!ptrDown(action, pid)) return;
      ptrAction[pid] = action;
      try { if (node.setPointerCapture) node.setPointerCapture(pid); } catch (err) { /* noop */ }
      if (node.classList) node.classList.add('pressed');
      setAction(action, true, 'ptr');
    }
    function up(e) {
      if (e && e.preventDefault) e.preventDefault();
      var pid = (e && e.pointerId != null) ? e.pointerId : 'm';
      var act = ptrAction[pid];
      if (!act) return;                          // toque já liberado/limpo
      delete ptrAction[pid];
      ptrUp(act, pid);
      if (ptrN[act] === 0) {                     // último dedo deste botão
        setAction(act, false, 'ptr');
        if (node.classList) node.classList.remove('pressed');
      }
    }
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
  }

  function setupTouch() {
    bindTouch('btnLeft', 'left');
    bindTouch('btnRight', 'right');
    bindTouch('btnJump', 'jump');
    bindTouch('btnThrow', 'throw');
  }

  /* ---------------- física do jogador ---------------- */
  function updatePlayer(dt) {
    var p = player;
    var target_v = 0;
    if (input.left && !input.right) target_v = -SPEED;
    if (input.right && !input.left) target_v = SPEED;
    var accv = p.onGround ? (target_v !== 0 ? ACC_GROUND : FRIC) : ACC_AIR;
    if (p.vx < target_v) p.vx = Math.min(target_v, p.vx + accv * dt);
    else if (p.vx > target_v) p.vx = Math.max(target_v, p.vx - accv * dt);
    p.x += p.vx * dt;
    if (p.x < PW / 2) { p.x = PW / 2; p.vx = 0; }
    if (p.x > LEVEL.W - PW / 2) { p.x = LEVEL.W - PW / 2; p.vx = 0; }

    // salto (buffer + coyote + altura variável)
    if (input.jumpQueued) { p.buffer = BUFFER; input.jumpQueued = false; }
    if (p.onGround) p.coyote = COYOTE; else p.coyote -= dt;
    if (p.onGround && input.jump) p.buffer = BUFFER;
    p.buffer -= dt;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -JUMP_V;
      p.buffer = 0; p.coyote = 0;
      p.onGround = false; p.jumping = true;
      SFX.play('jump');
      burst(p.x, p.y, '#ffffff', 3);
    }
    if (p.jumping && !input.jump && p.vy < JUMP_CUT) {
      p.vy = JUMP_CUT;
      p.jumping = false;
    }

    var prevBottom = p.y;
    p.vy += GRAV * dt;
    if (p.vy > 720) p.vy = 720;
    p.y += p.vy * dt;
    landOn(p, prevBottom, PW / 2);
    if (p.onGround) p.jumping = false;

    if (Math.abs(p.vx) > 8) p.dir = p.vx > 0 ? 1 : -1;
    p.anim += dt * (p.onGround ? 1 : 0.4);
    if (p.hurtTimer > 0) p.hurtTimer -= dt;
  }

  /* ---------------- histórico e fila de seguidores ---------------- */
  function recordHistory() {
    history.push({ x: player.x, y: player.y, dir: player.dir });
    if (history.length > HISTORY_MAX) history.shift();
  }

  function updateFollowers(dt) {
    for (var i = 0; i < queue.length; i++) {
      var f = queue[i];
      var tgt = (i + 1) * FOLLOW_DELAY;
      f.delay += (tgt - f.delay) * Math.min(1, dt * 6);
      var idx = history.length - 1 - Math.round(f.delay * HZ);
      if (idx < 0) idx = 0;
      var s = history[idx];
      f.x = s.x; f.y = s.y; f.dir = s.dir;
      f.anim += dt;
    }
  }

  /* ---------------- filhotes soltos ---------------- */
  function updateChick(c, dt) {
    if (c.fearCd > 0) c.fearCd -= dt;
    if (c.knockCd > 0) c.knockCd -= dt;
    if (c.fearCd <= 0 && c.onGround) {
      for (var i = 0; i < cats.length; i++) {
        var ct = cats[i];
        if (ct.stun > 0) continue;
        if (Math.abs(ct.x - c.x) < 46 && Math.abs(ct.y - c.y) < 26) {
          c.vx = (c.x < ct.x ? -85 : 85);
          c.vy = -230;
          c.onGround = false;
          c.fearCd = 1.4;
          break;
        }
      }
    }
    var prevBottom = c.y;
    c.vy += GRAV * dt;
    if (c.vy > 720) c.vy = 720;
    c.x += c.vx * dt;
    c.vx *= 1 - Math.min(1, dt * (c.onGround ? 7 : 1.4));
    if (c.x < 5) { c.x = 5; c.vx = 0; c.dir = 1; }
    if (c.x > LEVEL.W - 5) { c.x = LEVEL.W - 5; c.vx = 0; c.dir = -1; }
    c.y += c.vy * dt;
    landOn(c, prevBottom, KW / 2);
    if (c.vx > 8) c.dir = 1; else if (c.vx < -8) c.dir = -1;
    c.anim += dt;
  }

  /* ---------------- objetos arremessáveis ---------------- */
  function doThrow() {
    if (!carried || state !== 'play') return;
    var o = carried;
    o.state = 'flying';
    o.vx = player.dir * THR_V;
    o.vy = -70;
    o.fly = 0;
    o.onGround = false;
    o.dir = player.dir;
    carried = null;
    SFX.play('throw');
    burst(player.x + player.dir * 8, player.y - 12, '#f5b877', 4);
  }

  function hitCat(c, o) {
    c.stun = STUN_T;
    addScore(100);
    SFX.play('hit');
    burst(c.x, c.y - 6, '#8fa6c4', 10);
    addText(c.x, c.y - 16, '+100', '#9fdcff');
  }

  function respawnCat(c) {
    // ponto seguro: o extremo da patrulha mais afastado do jogador
    var d1 = Math.abs(c.x1 - player.x), d2 = Math.abs(c.x2 - player.x);
    var x = d1 >= d2 ? c.x1 : c.x2;
    c.x = x; c.y = c.sy;
    c.dir = (x === c.x1) ? 1 : -1;
    c.stun = 0;
    burst(c.x, c.y - 6, '#8fa6c4', 8);
    SFX.play('respawn');
  }

  function updateThrowables(dt) {
    var pb = playerBox();
    for (var i = throwables.length - 1; i >= 0; i--) {
      var o = throwables[i];

      if (o.state === 'carried') {
        o.x = player.x + player.dir * 5;
        o.y = player.y - 15;
        continue;
      }

      if (o.state === 'flying') {
        var prevBottom = o.y;
        o.fly += dt;
        o.vy += THR_GRAV * dt;
        if (o.vy > 560) o.vy = 560;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.x < 5) { o.x = 5; o.vx = 0; }
        if (o.x > LEVEL.W - 5) { o.x = LEVEL.W - 5; o.vx = 0; }
        if (o.vx > 8) o.dir = 1; else if (o.vx < -8) o.dir = -1;
        landOn(o, prevBottom, TW / 2);
        if (o.onGround) { o.state = 'idle'; o.vx = 0; o.vy = 0; }
        else if (o.fly > 6) { o.state = 'idle'; }

        // acerto em gato (uma única vez por acerto)
        var sb = seedBox(o);
        var struck = false;
        for (var c = 0; c < cats.length; c++) {
          if (cats[c].stun > 0) continue;
          if (hit(sb, catBox(cats[c]))) {
            hitCat(cats[c], o);
            throwables.splice(i, 1);
            struck = true;
            break;
          }
        }
        if (struck) continue;
      }

      // coleta ao encostar (apenas 1 objeto em mãos)
      if (o.state === 'idle' && !carried && hit(pb, seedBox(o))) {
        o.state = 'carried';
        carried = o;
        SFX.play('collect');
        burst(o.x, o.y - 4, '#f5b877', 5);
      }
    }
  }

  /* ---------------- gatos ---------------- */
  function updateCat(c, dt) {
    if (c.stun > 0) {
      c.stun -= dt;
      c.anim += dt;
      if (c.stun <= 0) respawnCat(c);
      return;
    }
    var chase = Math.abs(player.y - c.y) < 28 && Math.abs(player.x - c.x) < c.chase;
    var speed = (chase ? CAT_CHASE : CAT_PATROL) * c.mul;
    if (chase) c.dir = player.x < c.x ? -1 : 1;
    var nx = c.x + c.dir * speed * dt;
    if (nx <= c.x1) { nx = c.x1; if (!chase) c.dir = 1; }
    if (nx >= c.x2) { nx = c.x2; if (!chase) c.dir = -1; }
    c.x = nx;
    c.anim += dt;
  }

  /* ---------------- coleta / dispersão / entrega ---------------- */
  function tryCollect() {
    var pb = playerBox();
    for (var i = loose.length - 1; i >= 0; i--) {
      if (hit(pb, chickBox(loose[i]))) {
        var c = loose[i];
        var idx = history.length - 1 - Math.round(0.02 * HZ);
        if (idx < 0) idx = 0;
        var s = history[idx];
        queue.push({ delay: 0.02, x: s.x, y: s.y, dir: s.dir, anim: 0 });
        loose.splice(i, 1);
        SFX.play('collect');
        burst(c.x, c.y - 5, '#ffd34d', 6);
        updateHUD();
      }
    }
  }

  function scatterFrom(k, catX) {
    var removed = queue.splice(k);
    for (var i = 0; i < removed.length; i++) {
      var f = removed[i];
      var dir = f.x < catX ? -1 : 1;
      var c = makeChick(f.x, f.y, dir);
      c.vx = dir * 75;
      c.vy = -170;
      c.onGround = false;
      c.knockCd = 0.4;
      loose.push(c);
    }
    if (removed.length) {
      SFX.play('scatter');
      burst(catX, player.y - 6, '#ff8fab', 8);
    }
  }

  function tryDeliver() {
    if (state !== 'play' || !queue.length) return;
    var d = LEVEL.door;
    var pb = playerBox();
    if (!overlap(pb.x, pb.y, pb.w, pb.h, d.x - 2, d.y, d.w + 4, d.h)) return;
    var n = queue.length;
    var pts = 100 * n + 50 * (n - 1);
    addScore(pts);
    rescued += n;
    queue.length = 0;
    SFX.play('deliver', n);
    burst(d.x + d.w / 2, d.y + 8, '#ffd34d', 14);
    addText(d.x + d.w / 2, d.y - 6, '+' + pts, '#ffe066');
    updateHUD();
    if (rescued >= target) completePhase();
  }

  function checkCollisions() {
    var pb = playerBox();
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      if (cat.stun > 0) continue;             // fora de ação não fere ninguém
      var cb = catBox(cat);
      if (hit(pb, cb)) {
        if (invuln <= 0) { hurtPlayer(); return; }
      }
      for (var q = 0; q < queue.length; q++) {
        if (hit(cb, chickBox(queue[q]))) { scatterFrom(q, cat.x); break; }
      }
      for (var l = 0; l < loose.length; l++) {
        var lc = loose[l];
        if (lc.knockCd <= 0 && hit(cb, chickBox(lc))) {
          lc.vx = (lc.x < cat.x ? -95 : 95);
          lc.vy = -190;
          lc.onGround = false;
          lc.knockCd = 0.6;
          burst(lc.x, lc.y - 4, '#ffdf5e', 4);
        }
      }
    }
  }

  /* ---------------- passo de simulação ---------------- */
  function step(dt) {
    gameTime += dt;
    if (invuln > 0) invuln -= dt;
    if (input.throwQueued) { input.throwQueued = false; doThrow(); }
    updatePlayer(dt);
    recordHistory();
    updateFollowers(dt);
    updateThrowables(dt);
    for (var i = 0; i < loose.length; i++) updateChick(loose[i], dt);
    for (var c = 0; c < cats.length; c++) updateCat(cats[c], dt);
    tryCollect();
    tryDeliver();
    checkCollisions();

    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.vy += GRAV * 0.45 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(p, 1);
    }
    for (var t = texts.length - 1; t >= 0; t--) {
      texts[t].y -= 16 * dt;
      texts[t].life -= dt;
      if (texts[t].life <= 0) texts.splice(t, 1);
    }
  }

  /* ---------------- desenho ---------------- */
  function drawSprite(spr, x, feetY, dir) {
    var w = spr.width, h = spr.height;
    var dx = Math.round(x - w / 2), dy = Math.round(feetY - h);
    if (dir >= 0) {
      ctx.drawImage(spr, dx, dy);
    } else {
      ctx.save();
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, 0, 0);
      ctx.restore();
    }
  }

  function drawDoorGlow() {
    var d = LEVEL.door;
    if (!queue.length) return;
    var a = (Math.sin(gameTime * 6) + 1) / 2;
    ctx.globalAlpha = 0.22 + a * 0.4;
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(d.x + 3, d.y + 8, d.w - 6, d.h - 12);
    ctx.globalAlpha = 1;
    if (Math.floor(gameTime * 3) % 2 === 0) {
      var ax = Math.round(d.x + d.w / 2), ay = Math.round(d.y - 13);
      ctx.fillStyle = '#ffe066';
      for (var i = 0; i < 4; i++) ctx.fillRect(ax - i, ay + i, 2 * i + 1, 1);
      ctx.fillRect(ax - 4, ay + 4, 9, 3);
    }
  }

  function drawPopup(t) {
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17223b';
    ctx.fillText(t.t, Math.round(t.x) + 1, Math.round(t.y) + 1);
    ctx.fillStyle = t.c;
    ctx.fillText(t.t, Math.round(t.x), Math.round(t.y));
  }

  function render() {
    if (!ctx || !scenery) return;
    ctx.imageSmoothingEnabled = false;      // redimensionamento zera o contexto
    ctx.drawImage(scenery, 0, 0);
    drawDoorGlow();

    // filhotes soltos
    for (var i = 0; i < loose.length; i++) {
      var c = loose[i];
      var fr = (Math.floor(c.anim * 5) % 2) ? sprites.chick.b : sprites.chick.a;
      drawSprite(fr, c.x, c.y, c.dir);
    }
    // fila (da cauda para a frente)
    for (var q = queue.length - 1; q >= 0; q--) {
      var f = queue[q];
      var ff = (Math.floor(f.anim * 6) % 2) ? sprites.chick.b : sprites.chick.a;
      drawSprite(ff, f.x, f.y, f.dir);
    }
    // gatos (atordoados viram fantasma piscante)
    for (var k = 0; k < cats.length; k++) {
      var ct = cats[k];
      var base = (Math.floor(ct.anim * 7) % 2) ? sprites.cat.b : sprites.cat.a;
      if (ct.stun > 0) {
        ctx.globalAlpha = 0.30 + 0.25 * Math.abs(Math.sin(gameTime * 9));
        drawSprite(catGhost[(Math.floor(ct.anim * 7) % 2) ? 'b' : 'a'], ct.x, ct.y, ct.dir);
        ctx.globalAlpha = 1;
      } else {
        drawSprite(base, ct.x, ct.y, ct.dir);
      }
    }
    // objetos (repouso e arremessados)
    for (var s = 0; s < throwables.length; s++) {
      var o = throwables[s];
      if (o.state === 'carried') continue;
      drawSprite(sprites.seed, o.x, o.y, o.dir);
    }
    // jogador (pisca durante a invulnerabilidade)
    var blink = invuln > 0 && Math.floor(gameTime / 0.08) % 2 === 1;
    if (!blink && player) {
      var pose = 'idle';
      if (!player.onGround) pose = 'jump';
      else if (Math.abs(player.vx) > 8) pose = (Math.floor(player.anim * 8) % 2) ? 'walk1' : 'walk2';
      var spr = player.hurtTimer > 0 ? birdHurt : sprites.bird[pose];
      drawSprite(spr, player.x, player.y, player.dir);
    }
    // objeto em mãos (sobre a cabeça)
    if (carried) drawSprite(sprites.seed, carried.x, carried.y, player.dir);
    // partículas
    for (var p = 0; p < particles.length; p++) {
      var pt = particles[p];
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 2));
      ctx.fillStyle = pt.c;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.s, pt.s);
    }
    ctx.globalAlpha = 1;
    // textos flutuantes
    for (var t = 0; t < texts.length; t++) {
      ctx.globalAlpha = Math.max(0, Math.min(1, texts[t].life));
      drawPopup(texts[t]);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- dimensionamento do canvas (devicePixelRatio com teto) ---------------- */
  var DPR_CAP = 2;                       // limite configurável de nitidez/custo
  var resizePending = false;

  /* Redimensiona o backbuffer mantendo a resolução lógica 480×270 intacta.
     Só mexe no canvas — nenhum estado da partida é alterado. */
  function resizeCanvas() {
    if (!canvas || !ctx) return;
    var dpr = 1;
    try { dpr = window.devicePixelRatio || 1; } catch (e) { dpr = 1; }
    if (!(dpr > 0)) dpr = 1;
    if (dpr > DPR_CAP) dpr = DPR_CAP;
    var w = LEVEL.W, h = LEVEL.H;
    try {
      if (canvas.getBoundingClientRect) {
        var r = canvas.getBoundingClientRect();
        if (r && r.width > 4 && r.height > 4) { w = r.width; h = r.height; }
      }
    } catch (e) { /* sem medida de layout (testes) → mantém 480×270 */ }
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    // escala do mundo de jogo (480×270) para o backbuffer, sem suavização
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(bw / LEVEL.W, 0, 0, bh / LEVEL.H, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    render();                            // cena redesenhada na hora (nunca some)
  }

  function scheduleResize() {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(function () {
      resizePending = false;
      updateLayout();                 // escala da arena no espaço realmente disponível
      resizeCanvas();                 // backbuffer acompanha o tamanho visual
    });
  }

  /* ---------------- layout: escala visual da arena (min da largura/altura) ----------------
     O tamanho VISUAL do #stage (CSS px) é definido aqui; a resolução interna de
     renderização continua sendo a do canvas (visual × dpr com teto) em resizeCanvas(). */
  var STAGE_BORDER = 8;               // moldura do #stage (4px por lado)
  var layoutMode = null;              // 'below' | 'sides' | null (ainda não calculado)

  /* puro: escolhe a disposição e a escala maiores preservando 16/9 */
  function computeLayout(availW, availH, ctrl, gap, landscape) {
    var LW = LEVEL.W, LH = LEVEL.H;
    var hasCtrl = ctrl > 0;
    // controles abaixo: arena pega a largura toda e a altura menos o bloco de botões
    var sBelow = Math.min(
      (availW - STAGE_BORDER) / LW,
      (availH - (hasCtrl ? ctrl + gap : 0) - STAGE_BORDER) / LH
    );
    // controles nas laterais: arena perde as faixas dos botões, ganha a altura toda
    var sSides = hasCtrl
      ? Math.min(
          (availW - 2 * ctrl - 2 * gap - STAGE_BORDER) / LW,
          (availH - STAGE_BORDER) / LH
        )
      : sBelow;
    var mode = 'below', scale = sBelow;
    if (landscape && hasCtrl && sSides > sBelow) { mode = 'sides'; scale = sSides; }
    if (!(scale > 0)) scale = 0;
    return { scale: scale, w: Math.round(LW * scale), h: Math.round(LH * scale), mode: mode };
  }

  function measureRect(el) {
    try {
      if (el && el.getBoundingClientRect) {
        var r = el.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) return r;
      }
    } catch (e) { /* sem medida de layout */ }
    return null;
  }

  /* aplica o cálculo ao #stage; só mexe em estilos/classe — nunca no estado do jogo */
  function updateLayout() {
    var mid = document.getElementById('mid');
    var stageEl = document.getElementById('stage');
    if (!mid || !stageEl || !stageEl.style) return;
    var rect = measureRect(mid);
    if (!rect) return;                             // sem layout real (testes headless)
    // tamanho real dos botões de toque (0 quando ocultos → sem controles na conta)
    var ctrl = 0;
    var sample = document.getElementById('btnLeft');
    var sr = measureRect(sample);
    if (sr) ctrl = Math.max(sr.width, sr.height);
    var gap = ctrl > 0 ? 8 : 0;
    var landscape = window.innerWidth != null && window.innerHeight != null &&
      window.innerWidth >= window.innerHeight;
    var L = computeLayout(rect.width, rect.height, ctrl, gap, landscape);
    if (!(L.scale > 0)) return;
    stageEl.style.width = L.w + 'px';
    stageEl.style.height = L.h + 'px';
    if (mid.classList) {
      if (L.mode === 'sides') mid.classList.add('mid-sides');
      else mid.classList.remove('mid-sides');
    }
    // giro ou troca de disposição: nenhum comando pode ficar preso
    if (layoutMode !== null && layoutMode !== L.mode) clearInput();
    layoutMode = L.mode;
  }

  /* ---------------- detecção de entrada por toque ---------------- */
  function isTouchDevice() {
    try {
      if (window.navigator && window.navigator.maxTouchPoints > 0) return true;
      if (window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches) return true;
    } catch (e) { /* sem detecção */ }
    return false;
  }

  function controlsText() {
    if (isTouchDevice()) {
      return 'Colete os filhotes e leve-os à porta para resgatá-los.\n' +
        'Toque em ◀ ▶ para mover · ▲ pular · ➤ lançar\n' +
        'Combine os botões com dois dedos · ⏸ pausa · □ som\n' +
        '10 fases · 3 vidas · cuidado com os gatos!\n' +
        'Recorde: ' + record;
    }
    return 'Colete os filhotes e leve-os à porta para resgatá-los.\n' +
      'Setas ou A/D: mover · Espaço/W/↑: pular\n' +
      'X ou J: lançar objeto · Esc ou P: pausa · M: som\n' +
      '10 fases · 3 vidas · cuidado com os gatos!\n' +
      'Recorde: ' + record;
  }

  function pauseText() {
    var head = 'Fase ' + phase + '/' + LEVELS.total + ' · Pontos: ' + score + '\n';
    return head + (isTouchDevice()
      ? 'Toque em "Continuar" para voltar à partida.'
      : 'Pressione Esc, P ou o botão para continuar.');
  }

  function hintText() {
    // no toque: só a dica de rotação (instruções de controle ficam no menu/pausa)
    if (isTouchDevice()) {
      return 'Vire o celular para jogar com a tela maior';
    }
    return 'Setas ou A/D: mover · Espaço, W ou ↑: pular · X ou J: arremessar' +
      ' · Esc ou P: pausa · M: som';
  }

  /* reaplica textos sensíveis ao tipo de dispositivo (usado no boot e pelos testes) */
  function refreshUI() {
    if (el.hint) el.hint.textContent = hintText();
    if (state === 'menu') showOverlay('menu');
    else if (state === 'pause') showOverlay('pause');
  }

  /* ---------------- tela cheia (recurso opcional, com detecção) ---------------- */
  function setupFullscreen() {
    var docEl = document.documentElement;
    var supported = !!(docEl && docEl.requestFullscreen && document.exitFullscreen);
    if (supported && el.full) el.full.classList.remove('hidden');
  }

  function toggleFullscreen() {
    try {
      var p = null;
      if (document.fullscreenElement) {
        if (document.exitFullscreen) p = document.exitFullscreen();
      } else if (document.documentElement && document.documentElement.requestFullscreen) {
        p = document.documentElement.requestFullscreen();
      }
      if (p && typeof p.catch === 'function') p.catch(function () { /* não permitido */ });
    } catch (e) { /* API indisponível: o jogo segue funcionando */ }
  }

  /* ---------------- preferência de som (localStorage) ---------------- */
  function loadMutePref() {
    try {
      var v = global2().localStorage && global2().localStorage.getItem('flicky.som');
      if (v === '0') SFX.setEnabled(false);
      else SFX.setEnabled(true);
    } catch (e) { /* sem armazenamento */ }
  }
  function saveMutePref() {
    try {
      var ls = global2().localStorage;
      if (ls && ls.setItem) ls.setItem('flicky.som', SFX.isEnabled() ? '1' : '0');
    } catch (e) { /* sem armazenamento */ }
  }

  /* ---------------- interface ---------------- */
  function updateHUD() {
    if (el.score) el.score.textContent = 'Pontos: ' + score;
    if (el.record) el.record.textContent = 'Recorde: ' + record;
    if (el.phase) el.phase.textContent = 'Fase ' + phase + '/' + LEVELS.total;
    if (el.rescued) el.rescued.textContent = 'Resgatados: ' + rescued + '/' + target;
    if (el.lives) {
      for (var i = 0; i < el.lives.length; i++) {
        var n = el.lives[i];
        if (!n || !n.style) continue;
        n.style.opacity = lives > i ? '1' : '0.18';
        n.style.filter = lives > i ? 'none' : 'grayscale(1)';
      }
    }
  }

  function updateMuteIcon() {
    var on = SFX.isEnabled();
    if (el.muteLabel) el.muteLabel.textContent = on ? 'Som ligado' : 'Som desligado';
    if (el.mute) {
      el.mute.setAttribute('aria-label', on ? 'Desativar som' : 'Ativar som');
      el.mute.title = on ? 'Desativar som' : 'Ativar som';
    }
    if (el.muteIcon && sprites) {
      var icon = on ? sprites.icons.speakerOn : sprites.icons.speakerOff;
      var url = icon.toDataURL ? icon.toDataURL() : '';
      if (url) el.muteIcon.src = url;
    }
  }

  function toggleMute() {
    SFX.setEnabled(!SFX.isEnabled());
    saveMutePref();
    updateMuteIcon();
  }

  function updatePauseBtn() {
    if (!el.pause) return;
    var playing = state === 'play';
    var label = playing ? 'Pausar' : 'Continuar';
    if (el.pause.setAttribute) el.pause.setAttribute('aria-label', label);
    el.pause.title = label;
  }

  var overlayKind = null;

  function showOverlay(kind, data) {
    overlayKind = kind;
    if (!el.overlay) return;
    el.overlay.classList.remove('hidden');
    el.ovBtn1.classList.remove('hidden');
    el.ovBtn2.classList.add('hidden');
    if (kind === 'menu') {
      el.ovTitle.textContent = 'Flicky do Jardim';
      el.ovText.textContent = controlsText();
      el.ovBtn1.textContent = 'Jogar';
    } else if (kind === 'pause') {
      el.ovTitle.textContent = 'Pausa';
      el.ovText.textContent = pauseText();
      el.ovBtn1.textContent = 'Continuar';
      el.ovBtn2.classList.remove('hidden');
      el.ovBtn2.textContent = 'Reiniciar campanha';
    } else if (kind === 'complete') {
      el.ovTitle.textContent = 'Fase ' + phase + ' concluída!';
      el.ovText.textContent =
        'Pontos da fase: ' + data.phasePts + '\n' +
        'Bônus de tempo: +' + data.bonus + ' (120 − ' + data.secs + ' s) × 10\n' +
        'Pontuação acumulada: ' + score;
      el.ovBtn1.textContent = 'Próxima fase';
    } else if (kind === 'victory') {
      el.ovTitle.textContent = 'Vitória!';
      el.ovText.textContent =
        'Fase ' + phase + ' concluída — campanha vencida!\n' +
        'Pontos da fase: ' + data.phasePts + ' · Bônus: +' + data.bonus + '\n' +
        'Pontuação total: ' + score + '\nRecorde: ' + record;
      el.ovBtn1.textContent = 'Jogar novamente';
    } else if (kind === 'over') {
      el.ovTitle.textContent = 'Game Over';
      el.ovText.textContent =
        'Suas vidas acabaram na fase ' + phase + '/' + LEVELS.total + '.\n' +
        'Pontuação: ' + score + '\nRecorde: ' + record;
      el.ovBtn1.textContent = 'Nova campanha';
    }
    updatePauseBtn();
  }

  function hideOverlay() {
    overlayKind = null;
    if (el.overlay) el.overlay.classList.add('hidden');
    updatePauseBtn();
  }

  function pauseGame() {
    if (state !== 'play') return;
    state = 'pause';
    clearInput();
    showOverlay('pause');
  }

  function resumeGame() {
    if (state !== 'pause') return;
    state = 'play';
    hideOverlay();
    last = 0; acc = 0;
  }

  function togglePause() {
    if (state === 'play') pauseGame();
    else if (state === 'pause') resumeGame();
  }

  function primaryAction() {
    if (overlayKind === 'pause') resumeGame();
    else if (overlayKind === 'complete') nextPhase();
    else startCampaign();          // menu | over | victory
  }

  function secondaryAction() {
    if (overlayKind === 'pause') startCampaign();
  }

  /* ---------------- laço principal ---------------- */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;
    if (state === 'play') {
      acc += dt;
      var n = 0;
      while (acc >= STEP && n < 40) { step(STEP); acc -= STEP; n++; }
      if (acc > STEP * 40) acc = 0;
    } else {
      acc = 0;                                  // congela física/cronômetro
    }
    render();
  }

  /* ---------------- inicialização ---------------- */
  function bindButton(id, fn) {
    var b = document.getElementById(id);
    if (!b || !b.addEventListener) return;
    b.addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      SFX.init();
      fn();
      if (b.blur) b.blur();
    });
  }

  function boot() {
    if (booted) return;              // nunca duplica laço/eventos
    booted = true;

    canvas = document.getElementById('game');
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (ctx) ctx.imageSmoothingEnabled = false;

    sprites = SPRITES.build();
    birdHurt = SPRITES.tint(sprites.bird.jump, '#ff5a5a', 0.5);
    catGhost = {
      a: SPRITES.tint(sprites.cat.a, '#5a6bb0', 0.6),
      b: SPRITES.tint(sprites.cat.b, '#5a6bb0', 0.6)
    };

    el = {
      score: document.getElementById('score'),
      record: document.getElementById('record'),
      phase: document.getElementById('phase'),
      rescued: document.getElementById('rescued'),
      mute: document.getElementById('btnMute'),
      muteIcon: document.getElementById('muteIcon'),
      muteLabel: document.getElementById('muteLabel'),
      pause: document.getElementById('btnPause'),
      full: document.getElementById('btnFull'),
      hint: document.getElementById('hint'),
      overlay: document.getElementById('overlay'),
      ovTitle: document.getElementById('ovTitle'),
      ovText: document.getElementById('ovText'),
      ovBtn1: document.getElementById('ovBtn1'),
      ovBtn2: document.getElementById('ovBtn2'),
      lives: [
        document.getElementById('life0'),
        document.getElementById('life1'),
        document.getElementById('life2')
      ]
    };

    // entrada por toque? → libera os botões e o layout de celular
    if (isTouchDevice() && document.body && document.body.classList) {
      document.body.classList.add('has-touch');
    }

    var url = sprites.icons.bird.toDataURL ? sprites.icons.bird.toDataURL() : '';
    if (url) {
      for (var i = 0; i < el.lives.length; i++) {
        if (el.lives[i]) el.lives[i].src = url;
      }
    }

    record = loadRecord();
    loadMutePref();
    setupInput();
    setupTouch();
    bindButton('btnMute', toggleMute);
    bindButton('btnPause', togglePause);
    bindButton('btnFull', toggleFullscreen);
    bindButton('ovBtn1', primaryAction);
    bindButton('ovBtn2', secondaryAction);
    setupFullscreen();

    // perda de foco / aba oculta / saída da página → pausa + limpa comandos
    function pauseFromOutside() {
      if (state === 'play') pauseGame(); else clearInput();
      last = 0; acc = 0;
    }
    window.addEventListener('blur', pauseFromOutside);
    window.addEventListener('pagehide', pauseFromOutside);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        pauseFromOutside();
        SFX.suspend();                 // áudio pausado junto com a aba
      } else {
        SFX.resume();                  // retoma quando o usuário voltar
        last = 0; acc = 0;             // evita salto de tempo ao retornar
      }
    });

    // redimensionar/girar o aparelho recalcula só a escala de exibição
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', function () {
      clearInput();                    // rotação: nenhum comando preso
      scheduleResize();
    });
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener('resize', scheduleResize);
    }

    updateLayout();                    // tamanho visual da arena (min largura/altura)
    resizeCanvas();                    // backbuffer devicePixelRatio (teto DPR_CAP)
    loadPhase(1);
    state = 'menu';
    showOverlay('menu');
    refreshUI();                       // dica conforme teclado ou toque
    updateMuteIcon();
    updatePauseBtn();
    started = true;
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* API de depuração usada pelos testes headless */
  window.Flicky = {
    STEP: STEP,
    HZ: HZ,
    tick: function (n) {
      var count = n || 1;
      for (var i = 0; i < count; i++) if (state === 'play') step(STEP);
    },
    get: function () {
      var flying = 0, stunned = 0;
      for (var i = 0; i < throwables.length; i++) if (throwables[i].state === 'flying') flying++;
      for (var j = 0; j < cats.length; j++) if (cats[j].stun > 0) stunned++;
      return {
        state: state, phase: phase, target: target,
        score: score, lives: lives, rescued: rescued, record: record,
        queue: queue.length, loose: loose.length, history: history.length,
        invuln: invuln, particles: particles.length, started: started,
        elapsed: gameTime, throwables: throwables.length, carried: carried ? 1 : 0,
        flying: flying, cats: cats.length, stunned: stunned,
        levelName: LV ? LV.nome : '', theme: LV ? LV.tema : ''
      };
    },
    player: function () { return player; },
    queueRef: function () { return queue; },
    looseRef: function () { return loose; },
    catsRef: function () { return cats; },
    historyRef: function () { return history; },
    throwablesRef: function () { return throwables; },
    teleport: function (x, y) {
      player.x = x; player.y = y;
      player.vx = 0; player.vy = 0;
      player.onGround = false;
      player.jumping = false;
    },
    setInvuln: function (v) { invuln = v; },
    setElapsed: function (s) { gameTime = s; },
    hurt: function (force) { if (force !== false) invuln = 0; hurtPlayer(); },
    restart: function () { startCampaign(); },      // reinicia a campanha
    startCampaign: startCampaign,
    loadPhase: function (n) { startPhase(n); },     // carrega fase (testes)
    nextPhase: nextPhase,
    throwNow: function () { doThrow(); },
    resize: resizeCanvas,                           // redimensiona sem tocar no estado
    layout: updateLayout,                           // recalcula tamanho/disposição da arena
    computeLayout: computeLayout,                   // matemática pura (testes)
    refreshUI: refreshUI,                           // reaplica textos/toque-ou-teclado
    isTouch: isTouchDevice,
    input: input
  };
})();
