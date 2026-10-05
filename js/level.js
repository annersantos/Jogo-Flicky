/* level.js — carregador central de fases + cenários temáticos (com cache)
   A fase é apenas DADOS (js/levels.js). Aqui ficam:
   - LEVEL.load(indice): ativa a fase 1..10 e devolve a configuração
   - getters que expõem a fase ativa (platforms, door, spawn, chicks, cats...)
   - buildScenery(): pré-renderiza o cenário da fase ativa (paleta do tema) */
(function (global) {
  'use strict';

  var ell = global.SPRITES.ell;
  var box = global.SPRITES.box;
  var LEVELS = global.LEVELS;

  var W = 480, H = 270;
  var GROUND_TOP = 246;
  var PLAT_H = 8;

  var active = LEVELS.get(1);
  var activeIndex = 1;
  var sceneryCache = {};

  /* ================= paletas reutilizáveis ================= */

  var PLAT_PALS = {
    grass: { line: '#22693c', top: '#43c76a', edge: '#2f9e53', body: '#8a5a3b', body2: '#6d4229', out: '#4f2f1b' },
    moss:  { line: '#2c5e3a', top: '#5cd07c', edge: '#3a9e58', body: '#7a4a2b', body2: '#5f3a20', out: '#3d2413' },
    roof:  { line: '#7a2424', top: '#e05b4a', edge: '#c0453a', body: '#a83b32', body2: '#8a2f2a', out: '#541d17' },
    wood:  { line: '#6d4229', top: '#c99b6a', edge: '#a87c50', body: '#8a5a3b', body2: '#6d4229', out: '#4f2f1b' },
    crate: { line: '#7a4a2b', top: '#d9a55c', edge: '#b8823f', body: '#a06a34', body2: '#7f5227', out: '#55351a' },
    metal: { line: '#2b4257', top: '#a8cbe6', edge: '#6f97b5', body: '#51718c', body2: '#3d5a75', out: '#1f2d3d' },
    conc:  { line: '#232c44', top: '#8fa6c4', edge: '#5b6a8d', body: '#414d6b', body2: '#333d57', out: '#161d2f' },
    stone: { line: '#454e68', top: '#a7b0c8', edge: '#7f89a3', body: '#6a738c', body2: '#55607a', out: '#2f3548' }
  };

  var DOOR_PALS = {
    stone:   { frame: '#3b4a63', frame2: '#556b8f', inner: '#141225', inner2: '#2a2350', floor: '#4a3b7a', floor2: '#6b57a8', corner: '#7f8fb5', step: '#556b8f', step2: '#3b4a63' },
    wood:    { frame: '#6d4229', frame2: '#a87c50', inner: '#241708', inner2: '#3d2a12', floor: '#6d4229', floor2: '#a87c50', corner: '#d9a55c', step: '#a87c50', step2: '#6d4229' },
    metalD:  { frame: '#2f4457', frame2: '#51718c', inner: '#0d141c', inner2: '#1f2d3d', floor: '#3d5a75', floor2: '#6f97b5', corner: '#a8cbe6', step: '#51718c', step2: '#2f4457' },
    neon:    { frame: '#2b3350', frame2: '#4a5580', inner: '#0a0e1e', inner2: '#1b2340', floor: '#33406e', floor2: '#5a6bb0', corner: '#8f9fe0', step: '#4a5580', step2: '#2b3350' }
  };

  /* pseudo-random determinístico (cenário estável entre execuções) */
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ================= primitivas compartilhadas ================= */

  function skyBands(g, colors, max) {
    var top = max || GROUND_TOP;
    for (var y = 0; y < top; y += 10) {
      g.fillStyle = colors[Math.min(colors.length - 1, Math.floor(y / (top / colors.length)))];
      g.fillRect(0, y, W, 10);
    }
  }

  function drawCloud(g, x, y, s, col) {
    col = col || '#ffffff';
    ell(g, x, y, 14 * s, 6 * s, col);
    ell(g, x - 10 * s, y + 2 * s, 9 * s, 5 * s, col);
    ell(g, x + 11 * s, y + 2 * s, 9 * s, 5 * s, col);
    ell(g, x + 3 * s, y - 5 * s, 9 * s, 5 * s, col === '#ffffff' ? '#f2fbff' : col);
  }

  function drawTree(g, x, baseY, scale, leaf, leaf2) {
    var s = scale || 1;
    g.fillStyle = '#7a4a2b';
    g.fillRect(Math.round(x - 3 * s), Math.round(baseY - 26 * s), Math.round(6 * s), Math.round(26 * s));
    ell(g, x, baseY - 34 * s, 15 * s, 13 * s, leaf);
    ell(g, x - 9 * s, baseY - 27 * s, 9 * s, 8 * s, leaf);
    ell(g, x + 9 * s, baseY - 28 * s, 9 * s, 8 * s, leaf);
    ell(g, x - 3 * s, baseY - 38 * s, 8 * s, 6 * s, leaf2);
    ell(g, x + 6 * s, baseY - 34 * s, 7 * s, 6 * s, leaf2);
  }

  function drawHouse(g, x, baseY, w, h, body, roof) {
    g.fillStyle = body;
    g.fillRect(x, baseY - h, w, h);
    g.fillStyle = '#00000022';
    g.fillRect(x, baseY - h, w, 2);
    g.fillStyle = roof;
    var steps = Math.ceil(h * 0.45);
    var full = w + 12;
    for (var i = 0; i < steps; i++) {
      var ww = full * (i + 1) / steps;
      var xx = x - 6 + (full - ww) / 2;
      g.fillRect(Math.round(xx), Math.round(baseY - h - steps + i), Math.round(ww), 1);
    }
    g.fillStyle = '#ffe9a8';
    g.fillRect(x + 5, baseY - h + 7, 8, 8);
    g.fillStyle = '#8a5a3b';
    g.fillRect(x + 5, baseY - h + 11, 8, 4);
    if (w > 30) {
      g.fillStyle = '#ffe9a8';
      g.fillRect(x + w - 13, baseY - h + 7, 8, 8);
      g.fillStyle = '#8a5a3b';
      g.fillRect(x + w - 13, baseY - h + 11, 8, 4);
    }
    g.fillStyle = '#6d4229';
    g.fillRect(x + Math.floor(w / 2) - 4, baseY - 16, 9, 16);
    g.fillStyle = '#ffd34d';
    g.fillRect(x + Math.floor(w / 2) + 2, baseY - 9, 2, 2);
  }

  function drawPlatform(g, p, pal) {
    g.fillStyle = '#00000030';
    g.fillRect(p.x + 2, p.y + PLAT_H, p.w, 4);
    g.fillStyle = pal.line;
    g.fillRect(p.x, p.y, p.w, 1);
    g.fillStyle = pal.top;
    g.fillRect(p.x, p.y + 1, p.w, 3);
    g.fillStyle = pal.edge;
    for (var x = p.x + 2; x < p.x + p.w - 2; x += 7) g.fillRect(x, p.y + 3, 3, 1);
    g.fillStyle = pal.body;
    g.fillRect(p.x, p.y + 4, p.w, PLAT_H - 4);
    g.fillStyle = pal.body2;
    for (var dx = p.x + 3; dx < p.x + p.w - 3; dx += 9) g.fillRect(dx, p.y + 5, 3, 2);
    g.fillStyle = pal.out;
    g.fillRect(p.x, p.y + PLAT_H - 1, p.w, 1);
    g.fillRect(p.x, p.y + 1, 1, PLAT_H - 1);
    g.fillRect(p.x + p.w - 1, p.y + 1, 1, PLAT_H - 1);
  }

  function drawDoorFrame(g, d, pal) {
    var x = d.x, y = d.y, w = d.w, h = d.h;
    g.fillStyle = pal.frame;
    g.fillRect(x - 4, y - 8, w + 8, h + 8);
    g.fillRect(x - 1, y - 12, w + 2, 5);
    g.fillStyle = pal.frame2;
    g.fillRect(x - 1, y - 7, w + 2, h + 7);
    g.fillRect(x + 1, y - 10, w - 2, 4);
    g.fillStyle = pal.inner;
    g.fillRect(x + 2, y + 2, w - 4, h - 2);
    g.fillStyle = pal.inner2;
    g.fillRect(x + 2, y + 2, w - 4, 5);
    g.fillStyle = pal.floor;
    g.fillRect(x + 2, y + h - 9, w - 4, 7);
    g.fillStyle = pal.floor2;
    g.fillRect(x + 2, y + h - 9, w - 4, 2);
    g.fillStyle = pal.step;
    g.fillRect(x - 6, y + h, w + 12, 4);
    g.fillStyle = pal.step2;
    g.fillRect(x - 6, y + h + 3, w + 12, 1);
    g.fillStyle = pal.corner;
    g.fillRect(x - 4, y - 8, 5, 5);
    g.fillRect(x + w - 1, y - 8, 5, 5);
  }

  /* ================= temas de cenário ================= */
  /* cada tema: sky(g) -> céu/celeste, decor(g) -> plano médio,
     ground(g) -> faixa do chão, plat (paleta), door (paleta) */

  var THEMES = {

    /* 1. jardim inicial (visual original preservado) */
    garden: {
      plat: PLAT_PALS.grass, door: DOOR_PALS.stone,
      sky: function (g) {
        var bands = ['#6ec6ff', '#7ecdff', '#8ed5ff', '#9fdcff', '#b0e3ff', '#c2eaff'];
        skyBands(g, bands);
        ell(g, 418, 34, 17, 17, '#fff3b0');
        ell(g, 418, 34, 13, 13, '#ffe066');
        drawCloud(g, 70, 40, 1);
        drawCloud(g, 210, 28, 0.8);
        drawCloud(g, 330, 58, 0.7);
      },
      decor: function (g) {
        g.fillStyle = '#a4e39c';
        g.fillRect(0, 196, W, GROUND_TOP - 196);
        g.fillStyle = '#8fd98c';
        for (var fy = 200; fy < GROUND_TOP; fy += 8) g.fillRect(0, fy, W, 2);
        ell(g, 90, 236, 110, 52, '#7ec98f');
        ell(g, 300, 240, 130, 60, '#75c188');
        ell(g, 460, 244, 90, 44, '#7ec98f');
        drawHouse(g, 30, GROUND_TOP, 44, 44, '#ffe6c4', '#e05b4a');
        drawHouse(g, 300, GROUND_TOP, 40, 40, '#ffd9c0', '#c0567a');
        drawHouse(g, 400, GROUND_TOP, 46, 48, '#e8f2c9', '#5a8fd0');
        drawTree(g, 150, GROUND_TOP, 1.1, '#2f9e53', '#43c76a');
        drawTree(g, 250, GROUND_TOP, 0.9, '#2f9e53', '#43c76a');
        drawTree(g, 462, GROUND_TOP, 1.0, '#2f9e53', '#43c76a');
        g.fillStyle = '#c99b6a';
        for (var x = 0; x < W; x += 14) {
          g.fillRect(x + 2, GROUND_TOP - 20, 4, 20);
          g.fillRect(x + 2, GROUND_TOP - 18, 4, 3);
        }
        g.fillStyle = '#b07f52';
        g.fillRect(0, GROUND_TOP - 15, W, 3);
        g.fillRect(0, GROUND_TOP - 8, W, 3);
        for (var b = 0; b < W; b += 60) {
          ell(g, b + 20, GROUND_TOP - 5, 14, 8, '#3fb25f');
          ell(g, b + 30, GROUND_TOP - 3, 10, 6, '#2f9e53');
        }
      },
      ground: function (g) {
        g.fillStyle = '#2f7a44';
        g.fillRect(0, GROUND_TOP, W, 3);
        g.fillStyle = '#43c76a';
        g.fillRect(0, GROUND_TOP + 3, W, 5);
        g.fillStyle = '#8a5a3b';
        g.fillRect(0, GROUND_TOP + 8, W, H - GROUND_TOP - 8);
        g.fillStyle = '#6d4229';
        for (var gy = GROUND_TOP + 10; gy < H; gy += 6) {
          for (var gx = (gy % 12); gx < W; gx += 16) g.fillRect(gx, gy, 3, 2);
        }
        g.fillStyle = '#7a4a2b';
        g.fillRect(0, H - 4, W, 4);
      }
    },

    /* 2. vila colorida */
    vila: {
      plat: PLAT_PALS.grass, door: DOOR_PALS.wood,
      sky: function (g) {
        skyBands(g, ['#59c8ff', '#6fd2ff', '#87dbff', '#9fe4ff', '#b7ecff', '#cfefff']);
        ell(g, 60, 40, 15, 15, '#fff3b0');
        ell(g, 60, 40, 11, 11, '#ffe066');
        drawCloud(g, 180, 44, 1.1);
        drawCloud(g, 330, 30, 0.9);
        drawCloud(g, 430, 66, 0.7);
      },
      decor: function (g) {
        g.fillStyle = '#bde9b0';
        g.fillRect(0, 200, W, GROUND_TOP - 200);
        ell(g, 120, 244, 130, 56, '#8fd98c');
        ell(g, 380, 246, 150, 62, '#84d184');
        var houses = [
          [10, '#ffe1f0', '#d94f8c'], [78, '#fff3c4', '#e0a02b'],
          [250, '#dff5ff', '#3f8fd0'], [330, '#ffe9c9', '#e0663f'],
          [408, '#e6ffd9', '#4faf52']
        ];
        for (var i = 0; i < houses.length; i++) {
          drawHouse(g, houses[i][0], GROUND_TOP, 40, 38 + (i % 3) * 6, houses[i][1], houses[i][2]);
        }
        drawTree(g, 168, GROUND_TOP, 0.9, '#2f9e53', '#5cd07c');
        drawTree(g, 300, GROUND_TOP, 0.8, '#2f9e53', '#5cd07c');
        // canteiros de flores
        var r = rng(7);
        for (var f = 0; f < 26; f++) {
          var fx = Math.floor(r() * W), fy = GROUND_TOP - 4 - Math.floor(r() * 4);
          ell(g, fx, fy, 2, 2, ['#ff5a8a', '#ffd34d', '#c07ae0', '#ff9f1c'][f % 4]);
        }
      },
      ground: function (g) {
        g.fillStyle = '#5f8f52';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#8fa8a0';
        g.fillRect(0, GROUND_TOP + 4, W, H - GROUND_TOP - 4);
        g.fillStyle = '#7c948d';
        for (var gy = GROUND_TOP + 6; gy < H; gy += 8) {
          for (var gx = ((gy / 2) % 16); gx < W; gx += 16) g.fillRect(gx, gy, 13, 5);
        }
        g.fillStyle = '#687d77';
        g.fillRect(0, H - 3, W, 3);
      }
    },

    /* 3. bosque */
    forest: {
      plat: PLAT_PALS.moss, door: DOOR_PALS.wood,
      sky: function (g) {
        skyBands(g, ['#8ad07a', '#9bd98a', '#aee29b', '#c0eab0', '#d2f2c6', '#e2f7da']);
        ell(g, 380, 30, 14, 14, '#f7ffd0');
        ell(g, 380, 30, 10, 10, '#eaff9a');
      },
      decor: function (g) {
        // dossel de copas no topo
        for (var c = 0; c < 14; c++) {
          ell(g, c * 38 + 10, -4, 34, 26, c % 2 ? '#1f7a3f' : '#27904b');
          ell(g, c * 38 + 24, 8, 26, 18, c % 2 ? '#27904b' : '#31a457');
        }
        // troncos distantes
        g.fillStyle = '#5f3a20';
        for (var t = 0; t < 8; t++) g.fillRect(20 + t * 64, 96, 8, GROUND_TOP - 96);
        // arbustos e sombras
        ell(g, 60, 236, 70, 40, '#3fb25f');
        ell(g, 240, 242, 90, 46, '#37a356');
        ell(g, 430, 238, 80, 42, '#3fb25f');
        for (var b = 0; b < W; b += 48) {
          ell(g, b + 14, GROUND_TOP - 6, 16, 9, '#2f9e53');
          ell(g, b + 30, GROUND_TOP - 4, 12, 7, '#258a45');
        }
        drawTree(g, 138, GROUND_TOP, 1.3, '#1f7a3f', '#31a457');
        drawTree(g, 352, GROUND_TOP, 1.2, '#1f7a3f', '#31a457');
        // cogumelos
        g.fillStyle = '#e05b4a';
        g.fillRect(96, GROUND_TOP - 8, 10, 5);
        g.fillStyle = '#ffe9c9';
        g.fillRect(99, GROUND_TOP - 3, 4, 3);
      },
      ground: function (g) {
        g.fillStyle = '#1f7a3f';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#37a356';
        g.fillRect(0, GROUND_TOP + 4, W, 4);
        g.fillStyle = '#6d4229';
        g.fillRect(0, GROUND_TOP + 8, W, H - GROUND_TOP - 8);
        g.fillStyle = '#5f3a20';
        for (var gy = GROUND_TOP + 10; gy < H; gy += 6) {
          for (var gx = (gy % 14); gx < W; gx += 18) g.fillRect(gx, gy, 4, 2);
        }
        // folhas caídas
        g.fillStyle = '#d9a55c';
        for (var l = 0; l < 16; l++) g.fillRect((l * 29) % W, GROUND_TOP + 12 + (l % 3) * 6, 3, 2);
        g.fillStyle = '#4f2f1b';
        g.fillRect(0, H - 4, W, 4);
      }
    },

    /* 4. telhados da vila (entardecer) */
    rooftops: {
      plat: PLAT_PALS.roof, door: DOOR_PALS.wood,
      sky: function (g) {
        skyBands(g, ['#ff9f5a', '#ff8b66', '#f57d84', '#e06fa0', '#c467b8', '#a863cc']);
        ell(g, 240, 150, 40, 40, '#ffd9a0');
        ell(g, 240, 150, 30, 30, '#ffb45a');
        drawCloud(g, 80, 50, 0.9, '#ffd9c9');
        drawCloud(g, 400, 36, 0.8, '#ffd0c4');
        // pássaros distantes
        g.fillStyle = '#8a3f5f';
        for (var i = 0; i < 3; i++) {
          g.fillRect(120 + i * 14, 60 + i * 6, 4, 1);
          g.fillRect(118 + i * 14, 59 + i * 6, 2, 1);
          g.fillRect(124 + i * 14, 59 + i * 6, 2, 1);
        }
      },
      decor: function (g) {
        g.fillStyle = '#7a4a6b';
        g.fillRect(0, 214, W, GROUND_TOP - 214);
        // silhueta de telhados ao fundo
        var r = rng(21);
        for (var x = -10; x < W; ) {
          var w = 40 + Math.floor(r() * 34), h = 26 + Math.floor(r() * 22);
          g.fillStyle = r() > 0.5 ? '#6b3f60' : '#7a4a6b';
          g.fillRect(x, GROUND_TOP - h, w, h);
          for (var s = 0; s < h / 3; s++) {
            g.fillRect(x - 4 + s, GROUND_TOP - h - h / 3 + s, w + 8 - 2 * s, 3);
          }
          // janelas acesas
          g.fillStyle = '#ffd98a';
          g.fillRect(x + 6, GROUND_TOP - h + 8, 5, 6);
          if (w > 50) g.fillRect(x + w - 14, GROUND_TOP - h + 8, 5, 6);
          x += w + 8;
        }
        // chaminés
        g.fillStyle = '#5f3a4f';
        g.fillRect(60, 190, 12, 30);
        g.fillRect(356, 184, 12, 36);
      },
      ground: function (g) {
        g.fillStyle = '#4a3550';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#5c4563';
        g.fillRect(0, GROUND_TOP + 4, W, H - GROUND_TOP - 4);
        // calçada e asfalto
        g.fillStyle = '#7a6a85';
        g.fillRect(0, GROUND_TOP + 10, W, 6);
        g.fillStyle = '#3a3044';
        g.fillRect(0, GROUND_TOP + 16, W, H - GROUND_TOP - 16);
        g.fillStyle = '#ffd34d';
        for (var x = 6; x < W; x += 34) g.fillRect(x, H - 10, 16, 3);
      }
    },

    /* 5. parque ao entardecer */
    dusk: {
      plat: PLAT_PALS.wood, door: DOOR_PALS.stone,
      sky: function (g) {
        skyBands(g, ['#ff8f5a', '#f57d74', '#e06f94', '#c46bb0', '#9a68c4', '#7166d0']);
        ell(g, 96, 190, 30, 30, '#ffd9a0');
        ell(g, 96, 190, 22, 22, '#ff9f5a');
        drawCloud(g, 300, 46, 1.0, '#ffd0c9');
        drawCloud(g, 420, 70, 0.7, '#ffc4c4');
        // estrelas tênues
        g.fillStyle = '#ffe9f0';
        for (var i = 0; i < 10; i++) g.fillRect((i * 47 + 13) % W, 12 + (i % 4) * 9, 1, 1);
      },
      decor: function (g) {
        g.fillStyle = '#6b5a8f';
        g.fillRect(0, 218, W, GROUND_TOP - 218);
        ell(g, 140, 244, 110, 44, '#5a4d80');
        ell(g, 380, 246, 130, 50, '#52467a');
        // árvores em silhueta
        drawTree(g, 40, GROUND_TOP, 1.2, '#3a3060', '#4a4078');
        drawTree(g, 210, GROUND_TOP, 1.0, '#3a3060', '#4a4078');
        drawTree(g, 452, GROUND_TOP, 1.1, '#3a3060', '#4a4078');
        // postes de luz acesos
        for (var p = 0; p < 3; p++) {
          var px = 120 + p * 150;
          g.fillStyle = '#2f2a4a';
          g.fillRect(px, GROUND_TOP - 44, 3, 44);
          g.fillRect(px - 4, GROUND_TOP - 46, 11, 3);
          ell(g, px + 1, GROUND_TOP - 42, 6, 6, '#ffe9a8');
          g.fillStyle = '#00000022';
          g.fillRect(px - 7, GROUND_TOP - 39, 17, 22);
        }
        // bancos
        g.fillStyle = '#4a3b6b';
        g.fillRect(300, GROUND_TOP - 8, 26, 3);
        g.fillRect(302, GROUND_TOP - 5, 3, 5);
        g.fillRect(321, GROUND_TOP - 5, 3, 5);
      },
      ground: function (g) {
        g.fillStyle = '#3a5a4a';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#4a6b58';
        g.fillRect(0, GROUND_TOP + 4, W, 4);
        g.fillStyle = '#8f7a5f';
        g.fillRect(0, GROUND_TOP + 8, W, H - GROUND_TOP - 8);
        g.fillStyle = '#7a6852';
        for (var gy = GROUND_TOP + 10; gy < H; gy += 6) {
          for (var gx = (gy % 12); gx < W; gx += 15) g.fillRect(gx, gy, 3, 2);
        }
        g.fillStyle = '#5a4d80';
        g.fillRect(0, H - 4, W, 4);
      }
    },

    /* 6. armazém (interior) */
    warehouse: {
      plat: PLAT_PALS.crate, door: DOOR_PALS.wood,
      sky: function (g) {
        skyBands(g, ['#7a6a55', '#84745e', '#8e7e68', '#988872', '#a2927c', '#ac9c86']);
        // janelas altas com feixe de luz
        for (var i = 0; i < 4; i++) {
          var wx = 40 + i * 118;
          g.fillStyle = '#5c5040';
          g.fillRect(wx, 16, 54, 40);
          g.fillStyle = '#ffe9a8';
          g.fillRect(wx + 3, 19, 48, 34);
          g.fillStyle = '#5c5040';
          g.fillRect(wx + 26, 19, 3, 34);
          g.fillRect(wx + 3, 34, 48, 3);
          // feixe
          g.fillStyle = '#fff3c433';
          g.beginPath && g.beginPath();
          g.fillRect(wx + 6, 56, 42, 70);
          g.fillRect(wx + 14, 126, 26, 40);
        }
      },
      decor: function (g) {
        // prateleiras de fundo
        g.fillStyle = '#6a5a45';
        for (var s = 0; s < 3; s++) {
          var sy = 90 + s * 46;
          g.fillRect(0, sy, W, 5);
          g.fillStyle = '#5c5040';
          for (var p = 10; p < W; p += 90) g.fillRect(p, sy, 5, GROUND_TOP - sy);
          g.fillStyle = '#6a5a45';
        }
        // caixas empilhadas
        var r = rng(11);
        for (var b = 0; b < 12; b++) {
          var bx = Math.floor(r() * (W - 30)), bs = 14 + Math.floor(r() * 10);
          var by = GROUND_TOP - bs;
          g.fillStyle = '#a06a34';
          g.fillRect(bx, by, bs + 6, bs);
          g.fillStyle = '#7f5227';
          g.fillRect(bx, by + 3, bs + 6, 2);
          g.fillRect(bx + Math.floor((bs + 6) / 2) - 1, by, 2, bs);
        }
        // floco de "destaque" nas caixas
        g.fillStyle = '#d9a55c';
        g.fillRect(10, 150, 30, 3);
        g.fillRect(440, 176, 30, 3);
      },
      ground: function (g) {
        g.fillStyle = '#5c5040';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#8a6a45';
        g.fillRect(0, GROUND_TOP + 4, W, H - GROUND_TOP - 4);
        g.fillStyle = '#74583a';
        for (var y = GROUND_TOP + 6; y < H; y += 8) g.fillRect(0, y, W, 2);
        g.fillStyle = '#5f4730';
        for (var x = ((GROUND_TOP % 26)); x < W; x += 26) g.fillRect(x, GROUND_TOP + 4, 2, H - GROUND_TOP - 4);
        g.fillStyle = '#4a3826';
        g.fillRect(0, H - 4, W, 4);
      }
    },

    /* 7. fábrica */
    factory: {
      plat: PLAT_PALS.metal, door: DOOR_PALS.metalD,
      sky: function (g) {
        skyBands(g, ['#2f4457', '#35495e', '#3b4e65', '#41536c', '#475873', '#4d5d7a']);
        // faixa de aviso
        g.fillStyle = '#e0b33f';
        g.fillRect(0, 0, W, 8);
        g.fillStyle = '#23303f';
        for (var s = -8; s < W; s += 16) {
          g.fillRect(s, 0, 8, 8);
        }
        // janelas industriais
        for (var i = 0; i < 5; i++) {
          var wx = 20 + i * 96;
          g.fillStyle = '#1f2d3d';
          g.fillRect(wx, 18, 60, 34);
          g.fillStyle = '#a8cbe6';
          g.fillRect(wx + 3, 21, 54, 28);
          g.fillStyle = '#1f2d3d';
          for (var q = 1; q < 3; q++) g.fillRect(wx + 3 + q * 18, 21, 2, 28);
          g.fillRect(wx + 3, 34, 54, 2);
        }
      },
      decor: function (g) {
        // tubulações
        g.fillStyle = '#51718c';
        g.fillRect(0, 74, W, 7);
        g.fillStyle = '#3d5a75';
        g.fillRect(0, 78, W, 3);
        for (var v = 0; v < 5; v++) {
          var vx = 60 + v * 96;
          g.fillStyle = '#51718c';
          g.fillRect(vx, 81, 7, GROUND_TOP - 81);
          g.fillStyle = '#3d5a75';
          g.fillRect(vx + 4, 81, 3, GROUND_TOP - 81);
          ell(g, vx + 3, 86, 7, 6, '#6f97b5');
        }
        // engrenagens
        function gear(cx, cy, r, col) {
          ell(g, cx, cy, r, r, col);
          ell(g, cx, cy, r - 4, r - 4, '#1f2d3d');
          for (var t = 0; t < 8; t++) {
            var a = t * Math.PI / 4;
            g.fillRect(Math.round(cx + Math.cos(a) * r) - 2, Math.round(cy + Math.sin(a) * r) - 2, 5, 5);
          }
        }
        gear(356, 122, 15, '#6f97b5');
        gear(390, 138, 10, '#8fa6c4');
        gear(84, 132, 12, '#6f97b5');
        // chaminés com fumaça
        g.fillStyle = '#23303f';
        g.fillRect(180, 150, 18, GROUND_TOP - 150);
        g.fillRect(230, 162, 14, GROUND_TOP - 162);
        ell(g, 189, 144, 12, 8, '#5b6a8d');
        ell(g, 200, 132, 14, 9, '#4a5570');
        ell(g, 237, 156, 10, 7, '#5b6a8d');
      },
      ground: function (g) {
        g.fillStyle = '#1f2d3d';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#3d5a75';
        g.fillRect(0, GROUND_TOP + 4, W, H - GROUND_TOP - 4);
        g.fillStyle = '#2b4257';
        for (var x = 0; x < W; x += 10) g.fillRect(x, GROUND_TOP + 6, 4, H - GROUND_TOP - 6);
        for (var y = GROUND_TOP + 10; y < H; y += 10) g.fillRect(0, y, W, 3);
        g.fillStyle = '#e0b33f';
        g.fillRect(0, H - 6, W, 3);
        g.fillStyle = '#23303f';
        for (var s2 = -8; s2 < W; s2 += 16) g.fillRect(s2, H - 6, 8, 3);
      }
    },

    /* 8. cidade noturna */
    night: {
      plat: PLAT_PALS.conc, door: DOOR_PALS.neon,
      sky: function (g) {
        skyBands(g, ['#0a1026', '#0e1530', '#121b3a', '#162144', '#1a274e', '#1f2d58']);
        // estrelas
        var r = rng(5);
        g.fillStyle = '#eaf2ff';
        for (var i = 0; i < 70; i++) {
          var sx = Math.floor(r() * W), sy = Math.floor(r() * 150);
          g.fillRect(sx, sy, 1, 1);
          if (i % 9 === 0) { g.fillRect(sx - 1, sy, 3, 1); g.fillRect(sx, sy - 1, 1, 3); }
        }
        // lua
        ell(g, 400, 44, 20, 20, '#f4f0d8');
        ell(g, 392, 40, 6, 6, '#d8d2b4');
        ell(g, 406, 50, 4, 4, '#d8d2b4');
        drawCloud(g, 150, 40, 0.8, '#2b3350');
      },
      decor: function (g) {
        // skyline com janelas acesas
        var r = rng(31);
        for (var x = -6; x < W; ) {
          var bw = 34 + Math.floor(r() * 40);
          var bh = 70 + Math.floor(r() * 80);
          var top = GROUND_TOP - bh;
          g.fillStyle = r() > 0.5 ? '#161d33' : '#1b2340';
          g.fillRect(x, top, bw, bh);
          // janelas
          for (var wy = top + 6; wy < GROUND_TOP - 8; wy += 10) {
            for (var wx = x + 4; wx < x + bw - 6; wx += 9) {
              var lit = r() > 0.45;
              g.fillStyle = lit ? (r() > 0.5 ? '#ffd98a' : '#9fdcff') : '#0d1226';
              g.fillRect(wx, wy, 5, 6);
            }
          }
          x += bw + 4;
        }
        // letreiro neon
        g.fillStyle = '#ff5a8a';
        g.fillRect(296, 120, 46, 4);
        g.fillRect(296, 128, 30, 3);
        g.fillStyle = '#5ae0ff';
        g.fillRect(60, 140, 40, 4);
        // caixa d'água
        g.fillStyle = '#0d1226';
        g.fillRect(20, 120, 22, 14);
        g.fillRect(24, 134, 3, 12);
        g.fillRect(35, 134, 3, 12);
      },
      ground: function (g) {
        g.fillStyle = '#0d1226';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#1f2740';
        g.fillRect(0, GROUND_TOP + 4, W, 5);
        g.fillStyle = '#161d33';
        g.fillRect(0, GROUND_TOP + 9, W, H - GROUND_TOP - 9);
        // faixa central refletiva
        g.fillStyle = '#2b3350';
        for (var x = 4; x < W; x += 28) g.fillRect(x, H - 11, 14, 3);
        g.fillStyle = '#5a6bb0';
        g.fillRect(0, H - 4, W, 4);
      }
    },

    /* 9. torre dos pássaros */
    tower: {
      plat: PLAT_PALS.stone, door: DOOR_PALS.stone,
      sky: function (g) {
        skyBands(g, ['#3a4160', '#414868', '#485070', '#4f5778', '#565f80', '#5d6788']);
        // faixas de pedra
        g.fillStyle = '#333a56';
        for (var y = 8; y < GROUND_TOP; y += 24) g.fillRect(0, y, W, 2);
        for (var yy = 8; yy < GROUND_TOP; yy += 24) {
          for (var xx = ((yy / 3) % 32); xx < W; xx += 32) g.fillRect(xx, yy, 2, 24);
        }
      },
      decor: function (g) {
        // janelas em arco com luz
        for (var i = 0; i < 4; i++) {
          var wx = 52 + i * 118, wy = 40;
          g.fillStyle = '#2f3548';
          g.fillRect(wx, wy, 30, 54);
          ell(g, wx + 15, wy, 15, 12, '#2f3548');
          g.fillStyle = '#ffe9a8';
          g.fillRect(wx + 3, wy + 4, 24, 46);
          ell(g, wx + 15, wy + 3, 12, 9, '#ffe9a8');
          g.fillStyle = '#2f3548';
          g.fillRect(wx + 14, wy + 4, 2, 46);
          g.fillRect(wx + 3, wy + 24, 24, 2);
        }
        // estandartes
        var cols = ['#e05b4a', '#4da3ff', '#ffd34d', '#43c76a'];
        for (var b = 0; b < 4; b++) {
          var bx = 30 + b * 120;
          g.fillStyle = '#2f3548';
          g.fillRect(bx, 104, 3, 40);
          g.fillStyle = cols[b];
          g.fillRect(bx + 3, 104, 16, 26);
          g.fillRect(bx + 3, 130, 8, 6);
          g.fillRect(bx + 11, 130, 8, 6);
          g.fillStyle = '#ffffff55';
          g.fillRect(bx + 7, 110, 8, 8);
        }
        // trepadeiras
        g.fillStyle = '#2f7a44';
        for (var v = 0; v < 5; v++) {
          var vx = 60 + v * 96;
          for (var k = 0; k < 8; k++) ell(g, vx + (k % 2 ? 3 : -3), 160 + k * 10, 5, 4, '#37a356');
        }
        // tochas
        for (var t = 0; t < 2; t++) {
          var tx = 200 + t * 80;
          g.fillStyle = '#2f3548';
          g.fillRect(tx, 176, 3, 12);
          ell(g, tx + 1, 172, 4, 6, '#ff9f1c');
          ell(g, tx + 1, 174, 2, 4, '#ffe066');
        }
      },
      ground: function (g) {
        g.fillStyle = '#2f3548';
        g.fillRect(0, GROUND_TOP, W, 4);
        g.fillStyle = '#6a738c';
        g.fillRect(0, GROUND_TOP + 4, W, H - GROUND_TOP - 4);
        g.fillStyle = '#55607a';
        for (var y = GROUND_TOP + 6; y < H; y += 9) {
          g.fillRect(0, y, W, 2);
          for (var x = ((y % 18)); x < W; x += 24) g.fillRect(x, y, 2, 9);
        }
        g.fillStyle = '#2f3548';
        g.fillRect(0, H - 4, W, 4);
      }
    },

    /* 10. jardim da grande fuga (festivo) */
    finale: {
      plat: PLAT_PALS.grass, door: DOOR_PALS.stone,
      sky: function (g) {
        skyBands(g, ['#4fc3ff', '#66cdff', '#7ed7ff', '#96e0ff', '#aee9ff', '#c6f2ff']);
        ell(g, 420, 36, 16, 16, '#fff3b0');
        ell(g, 420, 36, 12, 12, '#ffe066');
        drawCloud(g, 90, 44, 1.0);
        drawCloud(g, 250, 30, 0.8);
        drawCloud(g, 360, 62, 0.7);
      },
      decor: function (g) {
        g.fillStyle = '#a4e39c';
        g.fillRect(0, 202, W, GROUND_TOP - 202);
        ell(g, 110, 242, 120, 54, '#7ec98f');
        ell(g, 350, 244, 140, 58, '#75c188');
        drawHouse(g, 24, GROUND_TOP, 42, 42, '#ffe6c4', '#e05b4a');
        drawHouse(g, 380, GROUND_TOP, 44, 46, '#ffd9c0', '#c0567a');
        drawTree(g, 140, GROUND_TOP, 1.1, '#2f9e53', '#43c76a');
        drawTree(g, 300, GROUND_TOP, 1.0, '#2f9e53', '#43c76a');
        drawTree(g, 458, GROUND_TOP, 0.9, '#2f9e53', '#43c76a');
        // bandeirolas (bunting)
        var cols = ['#ff5a8a', '#ffd34d', '#4da3ff', '#43c76a', '#ff9f1c'];
        for (var line = 0; line < 2; line++) {
          var y0 = 26 + line * 26;
          g.fillStyle = '#3a5a4a';
          for (var sx = 0; sx < W; sx += 2) {
            var sag = Math.sin((sx / W) * Math.PI) * (10 + line * 4);
            g.fillRect(sx, y0 + sag, 2, 1);
          }
          for (var f = 0; f < 16; f++) {
            var fx = 12 + f * 30, fsag = Math.sin((fx / W) * Math.PI) * (10 + line * 4);
            g.fillStyle = cols[(f + line) % cols.length];
            g.fillRect(fx, y0 + fsag + 1, 8, 7);
            g.fillRect(fx + 2, y0 + fsag + 8, 4, 3);
          }
        }
        // confete no ar
        var r = rng(77);
        for (var c = 0; c < 40; c++) {
          g.fillStyle = cols[c % cols.length];
          g.fillRect(Math.floor(r() * W), 70 + Math.floor(r() * 150), 2, 2);
        }
      },
      ground: function (g) {
        g.fillStyle = '#2f7a44';
        g.fillRect(0, GROUND_TOP, W, 3);
        g.fillStyle = '#43c76a';
        g.fillRect(0, GROUND_TOP + 3, W, 5);
        g.fillStyle = '#8a5a3b';
        g.fillRect(0, GROUND_TOP + 8, W, H - GROUND_TOP - 8);
        g.fillStyle = '#6d4229';
        for (var gy = GROUND_TOP + 10; gy < H; gy += 6) {
          for (var gx = (gy % 12); gx < W; gx += 16) g.fillRect(gx, gy, 3, 2);
        }
        // confete no chão
        var cols = ['#ff5a8a', '#ffd34d', '#4da3ff', '#43c76a'];
        for (var c = 0; c < 24; c++) g.fillRect((c * 37) % W, GROUND_TOP + 12 + (c % 4) * 6, 3, 2);
        g.fillStyle = '#7a4a2b';
        g.fillRect(0, H - 4, W, 4);
      }
    }
  };

  /* ================= montagem do cenário ================= */

  function buildSceneryFor(lv, index) {
    if (sceneryCache[index]) return sceneryCache[index];
    var c = global.SPRITES.makeCanvas(W, H);
    var g = c.getContext('2d');
    var th = THEMES[lv.tema] || THEMES.garden;
    th.sky(g);
    th.decor(g);
    th.ground(g);
    for (var i = 0; i < lv.platforms.length; i++) drawPlatform(g, lv.platforms[i], th.plat);
    drawDoorFrame(g, lv.door, th.door);
    sceneryCache[index] = c;
    return c;
  }

  /* ================= API pública ================= */

  function load(n) {
    activeIndex = Math.max(1, Math.min(LEVELS.total, n | 0));
    active = LEVELS.get(activeIndex);
    return active;
  }

  function current() { return active; }

  function buildScenery() { return buildSceneryFor(active, activeIndex); }

  var LEVEL = {
    W: W, H: H,
    GROUND_TOP: GROUND_TOP,
    PLAT_H: PLAT_H,
    total: LEVELS.total,
    load: load,
    current: current,
    buildScenery: buildScenery,
    themeNames: Object.keys(THEMES)
  };

  /* a fase ativa é exposta via getters (nunca guardada em cópia) */
  function delegate(key, get) {
    Object.defineProperty(LEVEL, key, { get: get, enumerable: true });
  }
  delegate('platforms', function () { return active.platforms; });
  delegate('door', function () { return active.door; });
  delegate('spawn', function () { return active.spawn; });
  delegate('catSpawns', function () { return active.cats; });
  delegate('chickSpawns', function () { return active.chicks; });
  delegate('safePoints', function () { return active.safePoints; });
  delegate('throwSpawns', function () { return active.throwables; });
  delegate('nome', function () { return active.nome; });
  delegate('tema', function () { return active.tema; });
  delegate('speedMul', function () { return active.speedMul; });
  delegate('chaseRange', function () { return active.chaseRange; });
  delegate('target', function () { return active.chicks.length; });

  global.LEVEL = LEVEL;
})(window);
