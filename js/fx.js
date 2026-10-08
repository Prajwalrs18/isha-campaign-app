/* Flowers, confetti, claps. */
window.FX = (function () {
  var FLOWERS = ['🌸', '🌼', '🏵️', '🌺', '💮'];
  var layer;
  function petalLayer() {
    if (!layer) { layer = document.getElementById('petals'); }
    return layer;
  }
  function petal(opts) {
    var l = petalLayer(); if (!l) return;
    var s = document.createElement('span');
    s.className = 'petal';
    s.textContent = FLOWERS[Math.floor(Math.random() * FLOWERS.length)];
    var dur = (opts && opts.slow ? 9 : 4) + Math.random() * 4;
    s.style.left = (Math.random() * 100) + 'vw';
    s.style.fontSize = (16 + Math.random() * 22) + 'px';
    s.style.animationDuration = dur + 's';
    s.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
    s.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    l.appendChild(s);
    setTimeout(function () { s.remove(); }, dur * 1000 + 200);
  }
  function shower(n) { for (var i = 0; i < (n || 40); i++) setTimeout(petal, i * 60); }
  var ambientTimer = null;
  function ambient(on) {
    clearInterval(ambientTimer);
    if (on) ambientTimer = setInterval(function () { if (!document.hidden) petal({ slow: true }); }, 900);
  }

  function confetti(ms) {
    var c = document.getElementById('confetti'); if (!c) return;
    var ctx = c.getContext('2d'), W = c.width = innerWidth, H = c.height = innerHeight;
    var cols = ['#E36414', '#F4C45A', '#B8142C', '#FFF8EC', '#1F8A4C', '#FF9EB5'];
    var ps = [];
    for (var i = 0; i < 180; i++) ps.push({ x: W / 2 + (Math.random() - .5) * 80, y: H * .45, vx: (Math.random() - .5) * 14,
      vy: -Math.random() * 16 - 4, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - .5) * .3,
      c: cols[i % cols.length] });
    var end = Date.now() + (ms || 3500);
    (function frame() {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) {
        p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (Date.now() < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })();
  }

  var ac = null;
  function unlockAudio() {
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {}
  }
  function clap(seconds) {  // synthesized applause, no audio files needed
    unlockAudio(); if (!ac) return;
    var total = (seconds || 2.2), n = Math.floor(total * 14);
    for (var i = 0; i < n; i++) {
      var t = ac.currentTime + Math.random() * total;
      var len = 0.06, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
      for (var j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / d.length, 3);
      var src = ac.createBufferSource(); src.buffer = buf;
      var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100 + Math.random() * 900; f.Q.value = 1.2;
      var g = ac.createGain(); g.gain.value = 0.5 * (1 - (t - ac.currentTime) / total * 0.6);
      src.connect(f); f.connect(g); g.connect(ac.destination); src.start(t);
    }
  }
  function chime() {
    unlockAudio(); if (!ac) return;
    [523.25, 659.25, 783.99].forEach(function (fq, i) {
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.12;
      o.type = 'sine'; o.frequency.value = fq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1);
    });
  }
  function buzz(p) { try { navigator.vibrate && navigator.vibrate(p || [60, 40, 60]); } catch (e) {} }
  return { petal: petal, shower: shower, ambient: ambient, confetti: confetti, clap: clap, chime: chime, buzz: buzz, unlockAudio: unlockAudio };
})();
