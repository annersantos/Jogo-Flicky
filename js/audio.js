/* audio.js — efeitos sonoros sintetizados com Web Audio API (sem arquivos externos) */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var initialized = false;

  function init() {
    if (initialized) {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.3;
      master.connect(ctx.destination);
      initialized = true;
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* áudio indisponível */ }
  }

  /* nota simples com varredura de frequência */
  function tone(freq, endFreq, dur, type, vol, delay) {
    if (!enabled || !ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.35, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* ruído curto (ruído de passo/impacto) */
  function noise(dur, vol, delay) {
    if (!enabled || !ctx) return;
    var t0 = ctx.currentTime + (delay || 0);
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var gain = ctx.createGain();
    gain.gain.value = vol || 0.2;
    src.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  var SFX = {
    jump: function () { tone(320, 620, 0.13, 'square', 0.30); },
    collect: function () {
      tone(700, 900, 0.07, 'square', 0.26);
      tone(1050, 1300, 0.09, 'square', 0.24, 0.06);
    },
    deliver: function (n) {
      n = Math.min(n || 1, 6);
      var notes = [523, 659, 784, 1046, 1174, 1318];
      for (var i = 0; i < Math.min(2 + n, 6); i++) {
        tone(notes[i], notes[i] * 1.02, 0.12, 'square', 0.26, i * 0.07);
      }
    },
    hurt: function () {
      tone(420, 90, 0.4, 'sawtooth', 0.3);
      noise(0.18, 0.18);
    },
    scatter: function () {
      tone(260, 140, 0.16, 'triangle', 0.28);
      noise(0.1, 0.12, 0.02);
    },
    throw: function () {
      tone(680, 240, 0.14, 'sawtooth', 0.22);
      noise(0.06, 0.10, 0.02);
    },
    hit: function () {
      tone(520, 160, 0.12, 'square', 0.28);
      noise(0.14, 0.18, 0.03);
      tone(180, 90, 0.2, 'triangle', 0.22, 0.08);
    },
    respawn: function () {
      tone(300, 520, 0.1, 'triangle', 0.2);
      tone(520, 300, 0.1, 'triangle', 0.18, 0.1);
    },
    phase: function () {
      var notes = [523, 659, 784, 1046];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], notes[i] * 1.01, 0.13, 'square', 0.24, i * 0.09);
      }
    },
    win: function () {
      var notes = [523, 659, 784, 1046, 784, 1046, 1318];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], notes[i] * 1.01, 0.16, 'square', 0.26, i * 0.12);
      }
    },
    gameOver: function () {
      var notes = [440, 392, 330, 262, 196];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], notes[i] * 0.9, 0.22, 'sawtooth', 0.26, i * 0.16);
      }
    },
    click: function () { tone(880, 880, 0.05, 'square', 0.2); }
  };

  function play(name, arg) {
    if (!enabled) return;
    if (!ctx) init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    var fn = SFX[name];
    if (fn) fn(arg);
  }

  function setEnabled(v) {
    enabled = !!v;
    if (master) master.gain.value = enabled ? 0.3 : 0.0;
  }

  function isEnabled() { return enabled; }

  global.SFX = { init: init, play: play, setEnabled: setEnabled, isEnabled: isEnabled };
})(window);
