/* sprites.js — pixel art gerada por código (sem arquivos externos) */
(function (global) {
  'use strict';

  var COL = {
    ink: '#17223b',
    blue: '#4da3ff',
    blueDark: '#2f6fd0',
    yellow: '#ffd34d',
    orange: '#ff9f1c',
    white: '#ffffff',
    chick: '#ffdf5e',
    chickShade: '#f0b429',
    cat: '#ff9f45',
    catShade: '#e06c2f',
    nose: '#ff5a8a'
  };

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    if (g) g.imageSmoothingEnabled = false;
    return c;
  }

  /* primitivas com bordas duras (estilo pixel art) */
  function box(g, x, y, w, h, c) {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  function ell(g, cx, cy, rx, ry, c) {
    g.fillStyle = c;
    var x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    var y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) g.fillRect(x, y, 1, 1);
      }
    }
  }
  /* elipse com contorno de 1px */
  function blob(g, cx, cy, rx, ry, c, outline) {
    ell(g, cx, cy, rx + 1, ry + 1, outline || COL.ink);
    ell(g, cx, cy, rx, ry, c);
  }

  /* ---------- PÁSSARO (jogador) 16x16, pés em y=15, virado para a direita ---------- */
  function drawBird(g, pose) {
    var bob = (pose === 'walk2') ? 1 : 0;
    var cx = 8, cy = 7.8 + bob * 0.5;
    // contorno e corpo
    blob(g, cx, cy, 6.6, 6.0, COL.blue);
    // barriga
    ell(g, cx + 0.5, cy + 2.4, 4.0, 2.7, COL.yellow);
    // asa
    if (pose === 'jump') {
      ell(g, cx - 2.2, cy - 1.6, 3.4, 2.6, COL.blueDark);
      box(g, cx - 5.5, cy - 3.5, 3, 2, COL.blueDark);
    } else {
      ell(g, cx - 1.8, cy + 1.4, 3.1, 2.3, COL.blueDark);
      box(g, cx - 4.5, cy + 0.6, 3, 2, COL.blueDark);
    }
    // olho
    ell(g, cx + 2.6, cy - 1.9, 2.0, 2.1, COL.white);
    box(g, cx + 3.0, cy - 2.4, 1.5, 2.4, COL.ink);
    // bico
    box(g, cx + 5.4, cy - 0.2, 3, 1, COL.yellow);
    box(g, cx + 5.4, cy + 0.8, 3, 1, COL.orange);
    // pernas
    if (pose === 'jump') {
      box(g, cx - 2.5, cy + 5.2, 3, 1.6, COL.orange);
      box(g, cx + 1.0, cy + 5.2, 3, 1.6, COL.orange);
    } else if (pose === 'walk1') {
      box(g, cx - 3.4, cy + 5.6, 1.4, 2, COL.orange);
      box(g, cx + 2.4, cy + 5.6, 1.4, 2, COL.orange);
      box(g, cx - 4.4, cy + 7.2, 3, 1.2, COL.orange);
      box(g, cx + 1.4, cy + 7.2, 3, 1.2, COL.orange);
    } else if (pose === 'walk2') {
      box(g, cx - 1.2, cy + 5.4 + bob, 1.4, 2, COL.orange);
      box(g, cx + 0.6, cy + 5.4 + bob, 1.4, 2, COL.orange);
      box(g, cx - 2.2, cy + 7.0 + bob, 5, 1.2, COL.orange);
    } else {
      box(g, cx - 2.2, cy + 5.6, 1.4, 2, COL.orange);
      box(g, cx + 1.4, cy + 5.6, 1.4, 2, COL.orange);
      box(g, cx - 3.2, cy + 7.2, 3, 1.2, COL.orange);
      box(g, cx + 0.4, cy + 7.2, 3, 1.2, COL.orange);
    }
  }

  /* ---------- FILHOTE 12x12, pés em y=11 ---------- */
  function drawChick(g, frame) {
    var bob = (frame === 2) ? 1 : 0;
    var cx = 6, cy = 5.6 + bob * 0.5;
    blob(g, cx, cy, 4.4, 4.2, COL.chick);
    ell(g, cx - 1.6, cy + 1.2, 2.0, 1.6, COL.chickShade);
    ell(g, cx + 2.0, cy - 1.2, 1.4, 1.5, COL.white);
    box(g, cx + 2.4, cy - 1.7, 1.2, 2.0, COL.ink);
    box(g, cx + 3.8, cy + 0.4, 2.4, 1.2, COL.orange);
    if (frame === 2) {
      box(g, cx - 1.8, cy + 4.6, 1.2, 1.6, COL.orange);
      box(g, cx + 1.0, cy + 4.6, 1.2, 1.6, COL.orange);
    } else {
      box(g, cx - 2.6, cy + 4.6, 1.2, 1.6, COL.orange);
      box(g, cx + 1.8, cy + 4.6, 1.2, 1.6, COL.orange);
    }
  }

  /* ---------- GATO 18x14, pés em y=13, virado para a direita ---------- */
  function drawCat(g, frame) {
    // corpo
    blob(g, 9, 8, 6.4, 3.8, COL.cat);
    ell(g, 9, 9.7, 5.0, 1.7, COL.catShade);
    box(g, 5.5, 5.4, 1.3, 2.6, COL.catShade);
    box(g, 8.0, 5.0, 1.3, 2.6, COL.catShade);
    // cauda erguida (desenhada após o corpo para aparecer)
    box(g, 0, 2, 3, 7, COL.ink);
    box(g, 0.7, 2.7, 1.8, 5.6, COL.catShade);
    box(g, 1.6, 1.4, 2.4, 2.4, COL.ink);
    box(g, 2.2, 2.0, 1.3, 1.5, COL.catShade);
    // orelhas
    box(g, 9.5, 0, 3, 4, COL.ink);
    box(g, 10.3, 0.9, 1.5, 2.2, COL.nose);
    box(g, 14.5, 0, 3, 4, COL.ink);
    box(g, 15.3, 0.9, 1.5, 2.2, COL.nose);
    // cabeça
    blob(g, 13.0, 6.4, 3.7, 3.3, COL.cat);
    ell(g, 13.0, 7.6, 2.7, 1.5, COL.catShade);
    // olho
    ell(g, 14.8, 5.3, 1.4, 1.6, COL.white);
    box(g, 15.2, 4.7, 1.3, 1.9, COL.ink);
    // nariz, boca e bigodes
    box(g, 16.4, 6.7, 1.4, 1.3, COL.nose);
    box(g, 15.4, 8.2, 2.2, 1, COL.ink);
    box(g, 16.6, 5.6, 1.4, 1, COL.ink);
    // patas com contorno
    var legs = (frame === 2) ? [3.6, 11.0] : [5.2, 9.4];
    for (var i = 0; i < legs.length; i++) {
      var lx = legs[i];
      box(g, lx, 10.6, 3, 3.4, COL.ink);
      box(g, lx + 0.7, 10.9, 1.7, 2.1, COL.catShade);
      box(g, lx + 0.5, 12.7, 2.1, 1.2, '#ffd9b0');
    }
  }

  /* ---------- OBJETO ARREMESSÁVEL (noz/avelã) 10x10, repouso em y=9 ---------- */
  function drawSeed(g) {
    // contorno e corpo
    blob(g, 5, 5.6, 3.6, 3.4, '#d9873f');
    ell(g, 5.4, 6.8, 2.4, 1.7, '#b8642a');
    // brilho
    box(g, 3.2, 4.0, 1.6, 1.4, '#f5b877');
    // casca/capuz
    box(g, 1.4, 1.6, 7.2, 3, '#7a4a2b');
    box(g, 2.0, 3.6, 6.0, 1, '#5f3a20');
    box(g, 1.4, 1.6, 7.2, 1, '#17223b');
    box(g, 1.4, 4.2, 7.2, 1, '#17223b');
    box(g, 1.4, 1.6, 1, 3, '#17223b');
    box(g, 7.6, 1.6, 1, 3, '#17223b');
    // textura do capuz
    box(g, 3.4, 2.4, 1.4, 1.2, '#96613a');
    box(g, 5.8, 2.4, 1.4, 1.2, '#96613a');
    // cabinho
    box(g, 4.4, 0, 1.6, 1.6, '#5f3a20');
    // contorno do corpo
    box(g, 1.6, 6.0, 1, 2.4, '#17223b');
    box(g, 7.4, 6.0, 1, 2.4, '#17223b');
    box(g, 3.0, 8.6, 4, 1, '#17223b');
  }

  function sprite(w, h, draw) {
    var c = makeCanvas(w, h);
    draw(c.getContext('2d'), w, h);
    return c;
  }

  function build() {
    var S = {
      bird: {
        idle: sprite(16, 16, function (g) { drawBird(g, 'idle'); }),
        walk1: sprite(16, 16, function (g) { drawBird(g, 'walk1'); }),
        walk2: sprite(16, 16, function (g) { drawBird(g, 'walk2'); }),
        jump: sprite(16, 16, function (g) { drawBird(g, 'jump'); })
      },
      chick: {
        a: sprite(12, 12, function (g) { drawChick(g, 1); }),
        b: sprite(12, 12, function (g) { drawChick(g, 2); })
      },
      cat: {
        a: sprite(18, 14, function (g) { drawCat(g, 1); }),
        b: sprite(18, 14, function (g) { drawCat(g, 2); })
      },
      seed: sprite(10, 10, function (g) { drawSeed(g); })
    };
    S.icons = {
      bird: S.bird.idle,
      seed: S.seed,
      speakerOn: sprite(12, 12, function (g) {
        box(g, 1, 4, 2, 4, '#ffd34d');
        box(g, 3, 3, 2, 6, '#ffd34d');
        box(g, 5, 1, 2, 10, '#ffd34d');
        ell(g, 8.5, 6, 2.2, 3.0, '#ff9f1c');
        ell(g, 9.5, 6, 1.2, 2.0, '#17223b');
      }),
      speakerOff: sprite(12, 12, function (g) {
        box(g, 1, 4, 2, 4, '#8fa6c4');
        box(g, 3, 3, 2, 6, '#8fa6c4');
        box(g, 5, 1, 2, 10, '#8fa6c4');
        ell(g, 8.5, 6, 2.2, 3.0, '#8fa6c4');
        box(g, 7, 5, 4, 1.4, '#ff5a5a');
        box(g, 8.3, 3.8, 1.4, 4, '#ff5a5a');
      })
    };
    return S;
  }

  /* aplica um tom (usado no dano) mantendo a silhueta */
  function tint(src, color, alpha) {
    var c = makeCanvas(src.width, src.height);
    var g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalAlpha = alpha;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    return c;
  }

  global.SPRITES = { build: build, tint: tint, COL: COL, makeCanvas: makeCanvas, box: box, ell: ell };
})(window);
