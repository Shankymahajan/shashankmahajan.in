(function () {
  if (window.__sfxInit) return;
  window.__sfxInit = true;
  var muted = false;
  try { muted = localStorage.getItem("sfx-muted") === "1"; } catch (e) {}
  var ac = null, noiseBuf = null, music = null;

  function ctx() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ac = new AC();
    }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }

  // ── mouse-click sound: short filtered noise burst + tiny tick ──
  function makeNoise(a) {
    if (noiseBuf) return noiseBuf;
    var n = Math.floor(a.sampleRate * 0.03);
    noiseBuf = a.createBuffer(1, n, a.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
    return noiseBuf;
  }
  function click() {
    if (muted) return;
    var a = ctx(); if (!a) return;
    var t = a.currentTime;
    // downstroke: noise burst through bandpass
    var src = a.createBufferSource(); src.buffer = makeNoise(a);
    var bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.9;
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t); src.stop(t + 0.035);
    // subtle body tick
    var o = a.createOscillator(), og = a.createGain();
    o.type = "square"; o.frequency.setValueAtTime(1700, t);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.06, t + 0.001);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    o.connect(og).connect(a.destination); o.start(t); o.stop(t + 0.025);
  }

  function haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  document.addEventListener("pointerdown", function (e) {
    var el = e.target && e.target.closest && e.target.closest("a,button,[role=button],image-slot");
    if (el) { click(); haptic(20); }
  }, true);

  // subtle scroll haptic, throttled
  var lastHaptic = 0;
  window.addEventListener("scroll", function () {
    var now = performance.now();
    if (now - lastHaptic < 320) return;
    lastHaptic = now; haptic(10);
  }, { passive: true });

  // ── hero ambient music (only on pages that opt in) ──
  function getHero() { return document.querySelector("[data-hero-music]"); }
  function startMusic() {
    if (!getHero() || music) return;
    var a = ctx(); if (!a) return;
    var master = a.createGain(); master.gain.value = 0; master.connect(a.destination);
    var lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4200; lp.connect(master);

    // ── subtle: gentle plucked arpeggio, slower ~92 BPM, no drums ──
    var step16 = 60 / 92 / 4; // seconds per 16th note
    // A major pentatonic, sparse & airy
    var A = 220, seq = [
      A, 0, A * 1.25, 0, A * 1.5, 0, A * 2, 0,
      A * 1.5, 0, A * 1.25, 0, A, 0, A * 1.5, 0
    ];
    var bass = [110, 0, 0, 0, 0, 0, 0, 0, 82.41, 0, 0, 0, 0, 0, 0, 0];
    var i16 = 0, next = a.currentTime + 0.06;

    function pluck(f, t, dur, gainv) {
      var o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f;
      var f2 = a.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = 2200;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gainv, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f2).connect(g).connect(lp); o.start(t); o.stop(t + dur + 0.02);
    }
    function bassNote(f, t) {
      var o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step16 * 6);
      o.connect(g).connect(lp); o.start(t); o.stop(t + step16 * 6 + 0.02);
    }
    var timer = setInterval(function () {
      if (!ac) return;
      while (next < ac.currentTime + 0.12) {
        var s = i16 % 16;
        var nf = seq[s]; if (nf) pluck(nf, next, step16 * 3.2, 0.09);
        if (bass[s]) bassNote(bass[s], next);
        i16++; next += step16;
      }
    }, 25);

    music = { master: master, timer: timer };
    updateMusicGain();
  }
  function heroVisibility() {
    var heroEl = getHero();
    if (!heroEl) return 0;
    var r = heroEl.getBoundingClientRect();
    var h = r.height || 1;
    var vis = Math.max(0, Math.min(1, (r.bottom) / h)); // 1 at top, →0 as it scrolls away
    return vis * vis; // steeper falloff so it dissolves quickly on scroll
  }
  function updateMusicGain() {
    if (!music) return;
    var target = muted ? 0 : 0.28 * heroVisibility();
    music.master.gain.setTargetAtTime(target, ac.currentTime, 0.15);
  }
  window.addEventListener("scroll", updateMusicGain, { passive: true });
  // try to start right away, else on first gesture; retry until the hero exists in the DOM
  var kick = function () {
    startMusic();
    if (music) {
      window.removeEventListener("pointerdown", kick, true);
      window.removeEventListener("keydown", kick, true);
    }
  };
  window.addEventListener("pointerdown", kick, true);
  window.addEventListener("keydown", kick, true);
  var tries = 0;
  var poll = setInterval(function () {
    tries++;
    if (getHero()) { kick(); }
    if (music || tries > 60) clearInterval(poll);
  }, 200);
  window.__startHeroMusic = kick;

  // ── mute toggle ──
  function mount() {
    var btn = document.createElement("button");
    btn.setAttribute("aria-label", "Toggle sound");
    btn.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:99990;width:46px;height:46px;border-radius:50%;border:3px solid #14110f;background:#f4efe2;color:#14110f;font-size:20px;line-height:1;cursor:pointer;box-shadow:4px 4px 0 #14110f;display:flex;align-items:center;justify-content:center;";
    function paint() { btn.textContent = muted ? "🔇" : "🔊"; }
    paint();
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      muted = !muted;
      try { localStorage.setItem("sfx-muted", muted ? "1" : "0"); } catch (er) {}
      paint(); updateMusicGain();
      if (!muted) { if (window.__startHeroMusic) window.__startHeroMusic(); click(); }
    });
    btn.addEventListener("pointerdown", function (e) { e.stopPropagation(); }, true);
    document.body.appendChild(btn);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
