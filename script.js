/* ============================================================
   智能性能模式 · Smart Performance Tier（稳定版）
   - 仅依赖一次性设备评分，无 FPS 自动降级
   - 桌面 Ctrl/Cmd+Shift+P 切档；移动端长按区块号 800ms 切档
   ============================================================ */
window.__perf = (function () {
  var KEY = 'caishen_perf_mode';

  var signals = {
    cores:        (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0)
                    ? navigator.hardwareConcurrency : undefined,
    memory:       (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory > 0)
                    ? navigator.deviceMemory : undefined,
    dpr:          (window.devicePixelRatio || 1),
    mobile:       /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    saveData:     !!(navigator.connection && navigator.connection.saveData),
    slowNet:      !!(navigator.connection && /(^|-)2g$/.test(navigator.connection.effectiveType || '')),
    reduceMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    viewport:     Math.min(window.innerWidth, window.innerHeight)
  };

  function scoreDevice(s) {
    var n = 100;
    // 未知 = 中性 4，不惩罚
    var cores = (typeof s.cores  === 'number' && s.cores  > 0) ? s.cores  : 4;
    var mem   = (typeof s.memory === 'number' && s.memory > 0) ? s.memory : 4;
    n -= Math.max(0, 4 - Math.min(cores, 4)) * 12;
    n -= Math.max(0, 4 - Math.min(mem,   4)) * 8;
    if (s.mobile)         n -= 12;
    if (s.viewport < 500) n -= 3;
    if (s.reduceMotion)   return 0;
    n = Math.max(0, Math.min(100, n));
    // 弱网 / 省流量 → 封顶 medium，不直接掉到 low
    if (s.saveData || s.slowNet) n = Math.min(n, 45);
    return n;
  }
  var baseScore = scoreDevice(signals);

  // 倾向高档：只有真正弱的设备才落 low
  function scoreToTier(n) {
    if (n >= 65) return 'high';
    if (n >= 40) return 'medium';
    return 'low';
  }

  var PRESETS = {
    high:   { particles: 120, dpr: 2,   smokeInterval: 850,  dustOnScroll: true,  audioEnabled: true,  animSpeed: 1 },
    medium: { particles: 70,  dpr: 1.5, smokeInterval: 1400, dustOnScroll: true,  audioEnabled: true,  animSpeed: 1 },
    low:    { particles: 28,  dpr: 1,   smokeInterval: 2400, dustOnScroll: false, audioEnabled: false, animSpeed: 1 }
  };

  var savedMode = null;
  try { savedMode = localStorage.getItem(KEY); } catch (_) {}

  var tier;
  if (signals.reduceMotion) {
    tier = 'low';
  } else if (savedMode === 'high' || savedMode === 'medium' || savedMode === 'low') {
    tier = savedMode;
  } else {
    tier = scoreToTier(baseScore);
  }

  var config = makeConfig(tier);

  function makeConfig(t) {
    var c = {};
    var p = PRESETS[t] || PRESETS.high;
    for (var k in p) if (p.hasOwnProperty(k)) c[k] = p[k];
    if (signals.mobile && t === 'high') {
      c.particles = Math.round(c.particles * 0.7);
    }
    return c;
  }

  function applyTier(t, broadcast) {
    document.documentElement.setAttribute('data-perf', t);
    if (broadcast !== false) {
      try {
        window.dispatchEvent(new CustomEvent('caishen:perf', {
          detail: { tier: t, config: config, signals: signals }
        }));
      } catch (_) {}
    }
  }

  function setTier(t, opts) {
    if (t !== 'high' && t !== 'medium' && t !== 'low') return;
    opts = opts || {};
    tier   = t;
    config = makeConfig(t);
    applyTier(t, true);

    if (opts.persist) {
      try { localStorage.setItem(KEY, t); } catch (_) {}
    }
    if (!opts.silent && window.__showToast) {
      var label = t === 'high' ? '高画质' : (t === 'medium' ? '均衡' : '流畅');
      window.__showToast('性能模式 · ' + label);
    }
  }

  function cycleTier() {
    var order = ['high', 'medium', 'low'];
    var next  = order[(order.indexOf(tier) + 1) % order.length];
    setTier(next, { persist: true });
  }

  applyTier(tier, false);

  // 桌面：Ctrl/Cmd + Shift + P
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      cycleTier();
    }
  });

  // 移动端：长按 HUD 区块号 800ms
  (function bindMobileTierToggle() {
    var hud = document.getElementById('blockNum');
    if (!hud) return;
    var pressTimer = null;
    function start() {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        cycleTier();
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (_) {} }
      }, 800);
    }
    function cancel() { clearTimeout(pressTimer); }
    hud.addEventListener('touchstart',  start,  { passive: true });
    hud.addEventListener('touchend',    cancel, { passive: true });
    hud.addEventListener('touchcancel', cancel, { passive: true });
    hud.addEventListener('touchmove',   cancel, { passive: true });
    hud.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  })();

  return {
    tier:      function () { return tier; },
    config:    function () { return config; },
    signals:   signals,
    score:     baseScore,
    setTier:   setTier,
    cycleTier: cycleTier,
    isHigh:    function () { return tier === 'high'; },
    isLow:     function () { return tier === 'low'; }
  };
})();

try {
  var _p = window.__perf;
  console.info(
    '%c[财神符] 性能模式:' + _p.tier().toUpperCase() +
    '  (score=' + _p.score +
    ', cores=' + (_p.signals.cores || '未知') +
    ', mem=' + (_p.signals.memory || '未知') + 'G' +
    ', dpr=' + _p.signals.dpr +
    ', mobile=' + _p.signals.mobile + ')',
    'color:#ffb700;font-weight:bold'
  );
  console.info('[财神符] 手动切换: Ctrl/Cmd + Shift + P / 移动端长按区块号  (或 window.__perf.setTier("low"))');
} catch (_) {}

/* ============================================================
   模态辅助 · Modal Helpers
   ============================================================ */
var __modalHelpers = (function () {
  var supportsInert = ('inert' in HTMLElement.prototype);

  function isExempt(el, exceptList) {
    if (!el || !el.tagName) return true;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return true;
    if (tag === 'CANVAS' && el.id === 'smoke-canvas') return true;
    if (el.id === 'toast') return true;
    for (var i = 0; i < exceptList.length; i++) {
      if (el === exceptList[i]) return true;
    }
    return false;
  }

  function freeze(except) {
    except = except || [];
    if (!Array.isArray(except)) except = [except];
    var frozen = [];

    if (supportsInert) {
      var kids = Array.prototype.slice.call(document.body.children);
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (isExempt(el, except)) continue;
        el.setAttribute('inert', '');
        el.setAttribute('aria-hidden', 'true');
        frozen.push(el);
      }
      var first = findFirstFocusable(except[0]);
      if (first) { try { first.focus(); } catch (_) {} }

      return function releaseInert() {
        for (var j = 0; j < frozen.length; j++) {
          frozen[j].removeAttribute('inert');
          frozen[j].removeAttribute('aria-hidden');
        }
      };
    }

    return (function () {
      var release = trapFocus(except[0]);
      var kids = Array.prototype.slice.call(document.body.children);
      var blocked = [];
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (isExempt(el, except)) continue;
        el.style.pointerEvents = 'none';
        blocked.push(el);
      }
      return function () {
        release();
        for (var j = 0; j < blocked.length; j++) {
          blocked[j].style.pointerEvents = '';
        }
      };
    })();
  }

  function findFirstFocusable(container) {
    if (!container) return null;
    var list = container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])'
    );
    return list.length ? list[0] : null;
  }

  function trapFocus(container) {
    if (!container) return function () {};
    var focusables = container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return function () {};

    var first = focusables[0];
    var last  = focusables[focusables.length - 1];

    function onKey(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    container.addEventListener('keydown', onKey);
    try { first.focus(); } catch (_) {}

    return function releaseTrap() {
      container.removeEventListener('keydown', onKey);
    };
  }

  return { freeze: freeze, supportsInert: supportsInert };
})();

/* ============================================================
   主题切换
   ============================================================ */
(function () {
  var KEY = 'caishen_theme';
  var btn = document.getElementById('themeToggle');
  if (!btn) return;
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (_) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#fff7ed' : '#060305');
    try { window.dispatchEvent(new CustomEvent('caishen:theme', { detail: { theme: t } })); } catch (_) {}
  }
  btn.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    if (window.__smokeBurst) {
      var r = btn.getBoundingClientRect();
      window.__smokeBurst(r.left + r.width / 2, r.top + r.height / 2, 8, 14, 0.22);
    }
  });
  if (window.matchMedia) {
    try {
      var mql = window.matchMedia('(prefers-color-scheme: light)');
      if (mql.addEventListener) {
        mql.addEventListener('change', function (e) {
          var saved = null;
          try { saved = localStorage.getItem(KEY); } catch (_) {}
          if (!saved) applyTheme(e.matches ? 'light' : 'dark');
        });
      }
    } catch (_) {}
  }
})();

/* ============================================================
   财神图 & 金色宝印预加载
   ============================================================ */
window.__deityState = { ready: false, usable: false, reason: 'loading' };
window.__deityImg = (function () {
  var img = new Image();
  img.decoding = 'async';
  function testUsable() {
    try {
      var c = document.createElement('canvas');
      c.width = c.height = 10;
      var x = c.getContext('2d');
      x.drawImage(img, 0, 0, 10, 10);
      c.toDataURL();
      return true;
    } catch (e) { return false; }
  }
  img.onload = function () {
    window.__deityState.ready = true;
    if (testUsable()) {
      window.__deityState.usable = true;
      window.__deityState.reason = 'ready';
      console.log('[财神符] 财神图已就绪 ✓');
    } else {
      window.__deityState.usable = false;
      window.__deityState.reason = 'tainted';
      console.warn('[财神符] 财神图会污染画布，已自动降级为"财"字替代。');
    }
  };
  img.onerror = function () {
    window.__deityState.ready = false;
    window.__deityState.usable = false;
    window.__deityState.reason = 'notfound';
    console.warn('[财神符] 找不到 images/caishen.png，已降级为"财"字替代。');
  };
  img.src = 'images/caishen.png';
  return img;
})();

/* 预加载本地金色财神宝印 */
window.__goldenSealState = { ready: false };
window.__goldenSealImg = (function () {
  var img = new Image();
  img.decoding = 'async';
  img.onload = function () {
    window.__goldenSealState.ready = true;
    console.log('[财神符] 金色财神宝印已就绪 ✓');
  };
  img.onerror = function () {
    window.__goldenSealState.ready = false;
    console.warn('[财神符] 找不到 images/golden_seal.png，将使用代码绘制的印章。');
  };
  img.src = 'images/golden_seal.png';
  return img;
})();

/* ============================================================
   Toast
   ============================================================ */
window.__showToast = (function () {
  var toast = document.getElementById('toast');
  var textEl = document.getElementById('toastText');
  var timer = null;
  return function (msg) {
    if (!toast) return;
    textEl.textContent = msg;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
  };
})();

/* ============================================================
   HUD 区块号 (纯前端终极版 - 突破 CORS 封锁)
   ============================================================ */
(function () {
  var el = document.getElementById('blockNum');
  if (!el) return;

  var RPC_URL = "https://solana-rpc.publicnode.com";
  var isFetching = false;
  var timer = null;

  async function updateBlockHeight() {
    if (isFetching) return;
    isFetching = true;

    try {
      var response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBlockHeight",
          params: []
        })
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      var data = await response.json();

      if (data.result !== undefined) {
        el.textContent = "#" + data.result.toLocaleString('en-US');
      }
    } catch (error) {
      console.warn("[财神符] 公共节点响应失败:", error.message);
      if (el.textContent === "#加载中..." || el.textContent === "") {
        el.textContent = "#--";
      }
    } finally {
      isFetching = false;
    }
  }

  function startTimer() {
    if (timer) clearInterval(timer);
    updateBlockHeight();
    timer = setInterval(updateBlockHeight, 30000);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") {
      startTimer();
    } else {
      stopTimer();
    }
  });

  startTimer();
})();

/* ============================================================
   ✦ 金属摩擦音效
   ============================================================ */
window.__metalScrape = (function () {
  var audioCtx = null;
  var noiseBuffer = null;
  var lastPlay = 0;
  var THROTTLE_MS = 90;
  var enabled = window.__perf ? window.__perf.config().audioEnabled : true;
  var userTouched = false;

  function unlockOnFirstTouch() {
    if (userTouched) return;
    userTouched = true;
    try {
      var ctx = ensureCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    } catch (_) {}
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (evt) {
    window.addEventListener(evt, unlockOnFirstTouch, { once: true, passive: true });
  });

  window.addEventListener('caishen:perf', function (e) {
    enabled = e.detail.config.audioEnabled;
  });

  function ensureCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { enabled = false; return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
    return audioCtx;
  }
  function ensureNoise(ctx) {
    if (noiseBuffer) return noiseBuffer;
    var dur = 0.12;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noiseBuffer = buf;
    return noiseBuffer;
  }
  function play() {
    if (!enabled) return;
    var ctx = ensureCtx();
    if (!ctx) return;
    var now = performance.now();
    if (now - lastPlay < THROTTLE_MS) return;
    lastPlay = now;
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = ensureNoise(ctx);
    src.playbackRate.value = 0.9 + Math.random() * 0.4;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400 + Math.random() * 600;
    hp.Q.value = 0.7;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200 + Math.random() * 1800;
    bp.Q.value = 6 + Math.random() * 3;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(5200 + Math.random() * 1200, t);
    osc.frequency.exponentialRampToValueAtTime(3600, t + 0.05);
    var oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.exponentialRampToValueAtTime(0.018, t + 0.004);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(ctx.destination);
    osc.connect(oscGain); oscGain.connect(ctx.destination);
    src.start(t, Math.random() * 0.03);
    src.stop(t + 0.12);
    osc.start(t); osc.stop(t + 0.08);
    src.onended = function () {
      try { src.disconnect(); hp.disconnect(); bp.disconnect(); g.disconnect(); } catch (_) {}
    };
    osc.onended = function () {
      try { osc.disconnect(); oscGain.disconnect(); } catch (_) {}
    };
  }
  play.setEnabled = function (v) { enabled = !!v; };
  play.isEnabled = function () { return enabled; };
  return play;
})();

/* ============================================================
   目录项悬停音效
   ============================================================ */
(function () {
  var items = document.querySelectorAll('.toc-item');
  if (!items.length) return;
  function onEnter() { if (window.__metalScrape) window.__metalScrape(); }
  items.forEach(function (item) {
    item.addEventListener('mouseenter', onEnter);
    item.addEventListener('focus', onEnter);
  });
})();

/* ============================================================
   ① 香火粒子系统
   ============================================================ */
(function () {
  var canvas = document.getElementById('smoke-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var perf = window.__perf ? window.__perf.config() : {
    particles: 120, dpr: 2, smokeInterval: 850, dustOnScroll: true
  };
  var reduceMotion = window.__perf ? window.__perf.signals.reduceMotion : false;

  if (reduceMotion) {
    window.__spawnSmoke = function () {};
    window.__smokeBurst = function () {};
    return;
  }

  function getDpr() {
    var maxDpr = window.__perf ? window.__perf.config().dpr : 2;
    return Math.min(window.devicePixelRatio || 1, maxDpr);
  }
  var dpr = getDpr();

  var W = 0, H = 0;
  var particles = [];
  var MAX_PARTS = perf.particles;
  var BASE_SIZE = window.innerWidth < 600 ? 12 : 16;
  var SPRITE = 64;
  var dustOnScroll = perf.dustOnScroll;

  var PALETTES = {
    dark: {
      mode: 'lighter',
      stops: [
        [0,    'rgba(255, 233, 184, 1)'],
        [0.3,  'rgba(255, 183, 0, 0.65)'],
        [0.6,  'rgba(255, 45, 85, 0.25)'],
        [1,    'rgba(255, 45, 85, 0)']
      ]
    },
    light: {
      mode: 'source-over',
      stops: [
        [0,    'rgba(168, 35, 21, 0.85)'],
        [0.3,  'rgba(192, 57, 43, 0.50)'],
        [0.6,  'rgba(212, 160, 23, 0.20)'],
        [1,    'rgba(212, 160, 23, 0)']
      ]
    }
  };
  function makeSprite(palette) {
    var c = document.createElement('canvas');
    c.width = c.height = SPRITE;
    var sctx = c.getContext('2d');
    var g = sctx.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    for (var i = 0; i < palette.stops.length; i++) g.addColorStop(palette.stops[i][0], palette.stops[i][1]);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  }
  var initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  var currentPalette = PALETTES[initialTheme] || PALETTES.dark;
  var currentSprite = makeSprite(currentPalette);
  var currentMode = currentPalette.mode;
  var targetSprite = null, targetPalette = null;
  var transitionStart = 0, TRANSITION_MS = 900, isTransitioning = false;

  function switchPalette(theme) {
    var newPalette = PALETTES[theme] || PALETTES.dark;
    if (!isTransitioning && currentPalette === newPalette) return;
    if (isTransitioning && targetPalette === newPalette) return;
    targetPalette = newPalette;
    targetSprite = makeSprite(newPalette);
    transitionStart = performance.now();
    isTransitioning = true;
  }
  window.__switchParticleTheme = switchPalette;

  window.addEventListener('caishen:theme', function (e) {
    var theme = (e && e.detail && e.detail.theme) || 'dark';
    switchPalette(theme);
  });

  window.addEventListener('caishen:perf', function (e) {
    var cfg = e.detail.config;
    MAX_PARTS = cfg.particles;
    dustOnScroll = cfg.dustOnScroll;
    if (particles.length > MAX_PARTS) {
      particles.splice(0, particles.length - MAX_PARTS);
    }
    canvas.style.opacity = (e.detail.tier === 'low') ? '0.7' : '1';
    resize();
  });

  function resize() {
    dpr = getDpr();
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function spawn(x, y, opt) {
    opt = opt || {};
    if (particles.length >= MAX_PARTS) return;
    var size = (opt.size || BASE_SIZE) * (0.6 + Math.random() * 0.8);
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.35 - Math.random() * 0.6,
      size: size,
      growth: 0.14 + Math.random() * 0.22,
      life: 0,
      maxLife: 220 + Math.random() * 160,
      baseAlpha: (opt.alpha || 0.22) * (0.6 + Math.random() * 0.7),
      alpha: 0
    });
  }
  function update() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx += (Math.random() - 0.5) * 0.025;
      p.vy -= 0.0028;
      p.size += p.growth; p.life++;
      var t = p.life / p.maxLife;
      if (t >= 1) { particles.splice(i, 1); continue; }
      var fade = Math.min(1, p.life / 6) * (1 - t) * (1 - t * 0.4);
      p.alpha = p.baseAlpha * fade;
    }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (isTransitioning && targetSprite) {
      var elapsed = performance.now() - transitionStart;
      var raw = Math.min(1, elapsed / TRANSITION_MS);
      var eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      ctx.globalCompositeOperation = 'source-over';
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (p.alpha <= 0.002) continue;
        var px = p.x - p.size, py = p.y - p.size, sz = p.size * 2;
        ctx.globalAlpha = p.alpha * (1 - eased);
        ctx.drawImage(currentSprite, px, py, sz, sz);
        ctx.globalAlpha = p.alpha * eased;
        ctx.drawImage(targetSprite, px, py, sz, sz);
      }
      if (raw >= 1) {
        isTransitioning = false;
        currentSprite = targetSprite;
        currentPalette = targetPalette;
        currentMode = currentPalette.mode;
        targetSprite = null; targetPalette = null;
      }
    } else {
      ctx.globalCompositeOperation = currentMode;
      for (var j = 0; j < particles.length; j++) {
        var q = particles[j];
        if (q.alpha <= 0.002) continue;
        ctx.globalAlpha = q.alpha;
        ctx.drawImage(currentSprite, q.x - q.size, q.y - q.size, q.size * 2, q.size * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  function loop() {
    if (!document.hidden) { update(); draw(); }
    requestAnimationFrame(loop);
  }
  // 延迟启动，避开首屏资源解码窗口
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loop, { timeout: 2000 });
  } else {
    setTimeout(loop, 1500);
  }

  var lastTap = 0;
  function burst(x, y, n, size, alpha) {
    n = n || 3;
    for (var i = 0; i < n; i++) {
      spawn(x + (Math.random() - 0.5) * 34, y + (Math.random() - 0.5) * 34,
            { size: size || BASE_SIZE * 0.95, alpha: alpha || 0.18 });
    }
  }
  window.addEventListener('pointerdown', function (e) {
    var now = Date.now();
    if (now - lastTap < 55) return;
    lastTap = now;
    if (e.target && e.target.closest &&
        e.target.closest('#gate, #censer, #charmModal, #themeToggle, button, a, input, textarea, select')) return;
    burst(e.clientX, e.clientY, 2 + Math.floor(Math.random() * 3));
  }, { passive: true });

  var lastY = window.scrollY, accum = 0;
  window.addEventListener('scroll', function () {
    if (!dustOnScroll) return;
    var y = window.scrollY;
    accum += Math.abs(y - lastY);
    lastY = y;
    if (accum > 46) {
      accum = 0;
      if (particles.length < MAX_PARTS * 0.8) {
        spawn(Math.random() * W, H + 8, { size: BASE_SIZE * 0.72, alpha: 0.12 });
      }
    }
  }, { passive: true });

  setInterval(function () {
    if (document.hidden) return;
    if (particles.length > MAX_PARTS * 0.65) return;
    spawn(Math.random() * W, H + 10, { size: BASE_SIZE * 0.78, alpha: 0.10 });
  }, perf.smokeInterval);

  window.__spawnSmoke = spawn;
  window.__smokeBurst = burst;
})();

/* ============================================================
   ② 赛博庙门 · 财神锦囊 · 今日财神录
   ============================================================ */
(function () {
  var GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var JIANCHU = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];

  var JC_YI = [
    '出行 · 求财 · 祈福', '除旧 · 疗病 · 扫舍', '祭祀 · 开市 · 纳财', '修整 · 嫁娶 · 平治',
    '祭祀 · 嫁娶 · 修造', '捕捉 · 修造 · 纳福', '破旧 · 求医 · 布新', '安床 · 祭祀 · 祈福',
    '嫁娶 · 开市 · 入学', '纳财 · 收敛 · 感恩', '开市 · 交易 · 入学', '筑堤 · 收敛 · 静心'
  ];
  var JC_JI = [
    '动土 · 开仓 · 诉讼', '嫁娶 · 远行 · 签约', '服药 · 栽种 · 动土', '开渠 · 栽种 · 远行',
    '诉讼 · 出行 · 动土', '开市 · 出行 · 动土', '嫁娶 · 开市 · 签约', '登高 · 行船 · 远行',
    '诉讼 · 动土 · 拆卸', '开市 · 出行 · 动土', '安葬 · 动土 · 诉讼', '开市 · 出行 · 盲动'
  ];

  function getJDN(y, m, d) {
    var a  = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  function getGanzhi(date) {
    var jdn    = getJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
    var ganIdx = (jdn + 9) % 10;
    var zhiIdx = (jdn + 1) % 12;
    return { jdn: jdn, ganIdx: ganIdx, zhiIdx: zhiIdx, text: GAN[ganIdx] + ZHI[zhiIdx] + '日' };
  }
  function getMonthZhiIdx(month, day) {
    var md = month * 100 + day;
    if (md >= 204 && md < 306)   return 2;
    if (md >= 306 && md < 405)   return 3;
    if (md >= 405 && md < 506)   return 4;
    if (md >= 506 && md < 606)   return 5;
    if (md >= 606 && md < 707)   return 6;
    if (md >= 707 && md < 808)   return 7;
    if (md >= 808 && md < 908)   return 8;
    if (md >= 908 && md < 1008)  return 9;
    if (md >= 1008 && md < 1107) return 10;
    if (md >= 1107 && md < 1207) return 11;
    if (md >= 1207 || md < 106)  return 0;
    return 1;
  }
  function getJianchuIdx(dayZhiIdx, monthZhiIdx) {
    return (dayZhiIdx - monthZhiIdx + 12) % 12;
  }
  function getCaishenDirection(ganIdx) {
    return ['东北', '西南', '正北', '正西', '正南'][ganIdx % 5];
  }

  var RECORDS = [
    { bless: '恭喜发财', text: '财神到，财运到，开门见喜。' },
    { bless: '财源滚滚', text: '心诚则灵，香火自旺，财源自来。' },
    { bless: '招财进宝', text: '只迎财神，不砸财神，长红可期。' },
    { bless: '金玉满堂', text: '转发一次，上香一炷，福报自积。' },
    { bless: '日进斗金', text: '财神不渡无缘之人，今日有缘。' },
    { bless: '八方来财', text: '西方有 Doge，东方有财神。' },
    { bless: '大吉大利', text: '全球华人，同接一神。' },
    { bless: '富贵长红', text: '守住财神，账户长红。' },
    { bless: '红红火火', text: '主题曲一响，财神到现场。' },
    { bless: '钱包鼓鼓', text: '公屏接财神，钱包开门迎。' }
  ];

  var gate       = document.getElementById('gate');
  if (!gate) return;
  var SKIP_KEY   = 'caishen_entered_v9';
  var entered    = false;
  try { entered = sessionStorage.getItem(SKIP_KEY) === '1'; } catch (_) {}

  function hideGate() {
    gate.setAttribute('aria-hidden', 'true');
    gate.removeAttribute('aria-modal');
    gate.classList.add('hidden');
  }
  function dismissGate() {
    try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (_) {}
    gate.setAttribute('aria-hidden', 'true');
    gate.removeAttribute('aria-modal');
    gate.classList.add('gone');

    if (releaseFocus) { releaseFocus(); releaseFocus = null; }
    if (gateSmokeStartTimer) {
      clearTimeout(gateSmokeStartTimer);
      gateSmokeStartTimer = null;
    }
    if (gateSmokeTimer) {
      clearInterval(gateSmokeTimer);
      gateSmokeTimer = null;
    }
    document.body.classList.remove('gate-active');
    document.body.style.overflow = '';
    setTimeout(function () { gate.classList.add('hidden'); }, 1200);
  }

  if (entered) {
    hideGate();
    document.body.style.overflow = '';
    return;
  }
  document.body.style.overflow = 'hidden';
  document.body.classList.add('gate-active');

  var releaseFocus = __modalHelpers.freeze([gate]);

  var hint       = gate.querySelector('.gate-hint');
  var stage      = gate.querySelector('.fortune-stage');
  var bag        = document.getElementById('fortuneBag');
  var flash      = document.getElementById('fortuneFlash');
  var scrollCard = document.getElementById('fortuneScroll');
  var blessEl    = document.getElementById('scBless');
  var textEl     = document.getElementById('scText');
  var dirEl      = document.getElementById('scDir');
  var ganzhiEl   = document.getElementById('scGanzhi');
  var goodEl     = document.getElementById('scGood');
  var badEl      = document.getElementById('scBad');
  var enterBtn   = document.getElementById('fortuneEnter');

  var opened = false, drawn = false;

  var audioCtx = null;
  function initAudio() {
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
  }
  function playKnock() {
    if (!audioCtx) return;
    try {
      var t = audioCtx.currentTime;
      var osc1 = audioCtx.createOscillator();
      var gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(190, t);
      osc1.frequency.exponentialRampToValueAtTime(58, t + 0.16);
      gain1.gain.setValueAtTime(0.13, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc1.connect(gain1); gain1.connect(audioCtx.destination);
      osc1.start(t); osc1.stop(t + 0.24);

      var t2 = t + 0.30;
      var osc2 = audioCtx.createOscillator();
      var gain2 = audioCtx.createGain();
      var filter2 = audioCtx.createBiquadFilter();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(120, t2);
      osc2.frequency.exponentialRampToValueAtTime(38, t2 + 0.6);
      filter2.type = 'lowpass';
      filter2.frequency.value = 420;
      filter2.Q.value = 1.4;
      gain2.gain.setValueAtTime(0.0001, t2);
      gain2.gain.exponentialRampToValueAtTime(0.09, t2 + 0.025);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.95);
      osc2.connect(filter2); filter2.connect(gain2); gain2.connect(audioCtx.destination);
      osc2.start(t2); osc2.stop(t2 + 1.0);
    } catch (_) {}
  }
  function playWoodfish() {
    if (!audioCtx) return;
    try {
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.09);
      gain.gain.setValueAtTime(0.10, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.16);
    } catch (_) {}
  }

  function gateSmoke() {
    if (drawn) return;
    var cx = window.innerWidth / 2;
    var cy = window.innerHeight * 0.55;
    if (window.__smokeBurst) window.__smokeBurst(cx + (Math.random() - 0.5) * 180, cy + (Math.random() - 0.5) * 80, 3, 18, 0.15);
  }
  var gateSmokeInterval   = (window.__perf && window.__perf.isLow()) ? 1600 : 620;
  var gateSmokeStartTimer = null;
  var gateSmokeTimer      = null;

  // 延迟 1200ms 启动，避开首屏资源解码窗口
  gateSmokeStartTimer = setTimeout(function () {
    gateSmokeStartTimer = null;
    if (drawn) return;
    gateSmoke();
    gateSmokeTimer = setInterval(gateSmoke, gateSmokeInterval);
  }, 1200);

  window.addEventListener('caishen:perf', function (e) {
    if (!gateSmokeTimer) return;
    if (e.detail.tier === 'low' && gateSmokeInterval < 1600) {
      clearInterval(gateSmokeTimer);
      gateSmokeInterval = 1600;
      gateSmokeTimer = setInterval(gateSmoke, gateSmokeInterval);
    }
  });

  gate.addEventListener('click', function openOnce() {
    if (opened) return;
    opened = true;
    initAudio(); playKnock();

    if (gate.animate) {
      try {
        gate.animate([
          { transform: 'translateX(0)' },
          { transform: 'translateX(-3px)' },
          { transform: 'translateX(3px)' },
          { transform: 'translateX(0)' }
        ], { duration: 220, easing: 'ease-out' });
      } catch (_) {}
    }

    setTimeout(function () {
      gate.classList.add('open');
      hint.style.opacity = '0';

      var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      if (window.__smokeBurst) {
        for (var i = 0; i < 3; i++) {
          (function (k) {
            setTimeout(function () { window.__smokeBurst(cx, cy, 14, 26, 0.28); }, k * 100);
          })(i);
        }
      }
      setTimeout(function () {
        for (var j = 0; j < 8; j++) {
          (function (kk) {
            setTimeout(function () {
              var yy = 80 + Math.random() * (window.innerHeight - 160);
              window.__smokeBurst(cx + (Math.random() - 0.5) * 40, yy, 2, 20, 0.22);
            }, kk * 40);
          })(j);
        }
      }, 500);

      setTimeout(function () { stage.classList.add('show'); }, 1200);
    }, 160);
  });

  function pickRecord() {
    var today  = new Date();
    var gz     = getGanzhi(today);
    var mz     = getMonthZhiIdx(today.getMonth() + 1, today.getDate());
    var jcIdx  = getJianchuIdx(gz.zhiIdx, mz);
    var dir    = getCaishenDirection(gz.ganIdx);
    var idx    = gz.jdn % RECORDS.length;
    var r      = RECORDS[idx];
    return {
      bless:   r.bless,
      text:    r.text,
      dir:     dir,
      ganzhi:  gz.text,
      jianchu: JIANCHU[jcIdx],
      good:    JC_YI[jcIdx],
      bad:     JC_JI[jcIdx]
    };
  }
  function render(record) {
    blessEl.textContent  = record.bless;
    textEl.textContent   = record.text;
    dirEl.textContent    = record.dir;
    ganzhiEl.textContent = record.ganzhi + ' · ' + record.jianchu + '日';
    goodEl.textContent   = record.good;
    badEl.textContent    = record.bad;
  }

  function openBag() {
    if (drawn) return;
    drawn = true;
    initAudio(); playWoodfish();

    render(pickRecord());

    if (window.__smokeBurst) {
      var r = bag.getBoundingClientRect();
      window.__smokeBurst(r.left + r.width / 2, r.top + r.height / 2, 10, 18, 0.20);
    }

    flash.classList.add('on');
    setTimeout(function () { flash.classList.remove('on'); }, 600);

    bag.classList.add('opening');
    bag.style.pointerEvents = 'none';

    setTimeout(function () {
      scrollCard.classList.add('show');
      try { scrollCard.focus(); } catch (_) {}
    }, 260);
  }
  bag.addEventListener('click', function (e) { e.stopPropagation(); openBag(); });
  bag.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBag(); }
  });

  enterBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    initAudio(); playWoodfish();
    dismissGate();

    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    if (window.__smokeBurst) {
      for (var i = 0; i < 5; i++) {
        (function (k) {
          setTimeout(function () {
            window.__smokeBurst(cx + (Math.random() - 0.5) * 360, cy + (Math.random() - 0.5) * 260, 7, 22, 0.18);
          }, k * 90);
        })(i);
      }
    }
  });

  scrollCard.addEventListener('click', function (e) { e.stopPropagation(); });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !gate.classList.contains('gone')) {
      dismissGate();
    }
  });
})();

/* ============================================================
   ③ 进度条 + 回到顶部
   ============================================================ */
(function () {
  var bar = document.getElementById('progress');
  var toTop = document.getElementById('toTop');
  var ticking = false;
  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var top = doc.scrollTop || document.body.scrollTop;
    var pct = max > 0 ? (top / max) * 100 : 0;
    if (bar) bar.style.width = pct + '%';
    if (toTop) {
      if (top > 420) toTop.classList.add('show');
      else toTop.classList.remove('show');
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  onScroll();
})();

/* ============================================================
   ④ 香炉进度
   ============================================================ */
(function () {
  var SECTIONS = ['s0', 's1', 's2', 's3', 's4', 's5'];
  var STORE_KEY = 'caishen_read_progress_v1';
  var censer = document.getElementById('censer');
  if (!censer) return;
  var censerSticks = censer.querySelectorAll('.censer-sticks span');
  var censerCount = censer.querySelector('.censer-count b');
  var read = {};
  try { read = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (_) { read = {}; }
  if (Array.isArray(read)) {
    var obj = {};
    read.forEach(function (id) { obj[id] = true; });
    read = obj;
  }
  var isFull = false;
  function getCount() {
    var n = 0;
    SECTIONS.forEach(function (id) { if (read[id]) n++; });
    return n;
  }
  function updateUI() {
    var n = getCount();
    censerCount.textContent = n;
    for (var i = 0; i < censerSticks.length; i++) {
      if (i < n) censerSticks[i].classList.add('lit');
      else censerSticks[i].classList.remove('lit');
    }
    SECTIONS.forEach(function (id) {
      var link = document.querySelector('.toc-item[data-target="' + id + '"]');
      if (link) {
        if (read[id]) link.classList.add('done');
        else link.classList.remove('done');
        var stateText = link.querySelector('.toc-state-text');
        if (stateText) stateText.textContent = read[id] ? '已接' : '未接';
      }
    });
    var tocNum = document.getElementById('tocProgressNum');
    if (tocNum) tocNum.textContent = n;
    var wasFull = isFull;
    isFull = n === SECTIONS.length;
    if (isFull) censer.classList.add('full');
    else censer.classList.remove('full');
    censer.setAttribute('aria-label',
      isFull ? '香火已满 6/6，点击领取财神符' : '阅读进度 ' + n + '/6，读完可领财神符');
    var ctaBtn = document.getElementById('charmCtaBtn');
    var ctaHint = document.getElementById('charmCtaHint');
    if (ctaBtn && ctaHint) {
      if (isFull) {
        ctaBtn.disabled = false;
        ctaBtn.innerHTML = '<i class="fas fa-scroll" aria-hidden="true"></i> 领取财神符';
        ctaHint.textContent = '香火已满，财神符可领。';
      } else {
        ctaBtn.disabled = true;
        ctaBtn.innerHTML = '<i class="fas fa-lock" aria-hidden="true"></i> 未解锁（' + n + '/6）';
        ctaHint.textContent = '读完 6 章内容，即可生成属于你的财神符。';
      }
    }
    if (!wasFull && isFull) {
      setTimeout(function () {
        if (window.__showToast) window.__showToast('香火已满 · 财神降临');
      }, 400);
      if (window.__smokeBurst) {
        var r = censer.getBoundingClientRect();
        var ccx = r.left + r.width / 2;
        var ccy = r.top + r.height / 2;
        for (var k = 0; k < 4; k++) {
          (function (kk) {
            setTimeout(function () { window.__smokeBurst(ccx, ccy, 9, 20, 0.24); }, kk * 120);
          })(k);
        }
      }
    }
    if (window.__showToast && n > 0 && n < SECTIONS.length) {
      if (updateUI._last !== n) window.__showToast('香火 +1（' + n + '/6）');
    }
    updateUI._last = n;
  }
  function markRead(id) {
    if (read[id]) return;
    read[id] = true;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(read)); } catch (_) {}
    if (window.__smokeBurst && censer) {
      var rect = censer.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      window.__smokeBurst(cx, cy, 9, 16, 0.22);
    }
    updateUI();
    var item = document.querySelector('.toc-item[data-target="' + id + '"]');
    if (item) {
      var sym = item.querySelector('.toc-sym');
      if (sym) {
        sym.classList.remove('shake');
        void sym.offsetWidth;
        sym.classList.add('shake');
        setTimeout(function () { sym.classList.remove('shake'); }, 400);
      }
      setTimeout(function () {
        item.classList.remove('flash');
        void item.offsetWidth;
        item.classList.add('flash');
        setTimeout(function () { item.classList.remove('flash'); }, 950);
      }, 220);
      if (window.__metalScrape) setTimeout(function () { window.__metalScrape(); }, 40);
    }
  }
  updateUI._last = null;
  updateUI();
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) markRead(e.target.id);
      });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    SECTIONS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  } else {
    window.addEventListener('scroll', function () {
      var doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 150) {
        SECTIONS.forEach(function (id) { if (!read[id]) { read[id] = true; } });
        try { localStorage.setItem(STORE_KEY, JSON.stringify(read)); } catch (_) {}
        updateUI();
      }
    }, { passive: true });
  }
  function onCenserClick() {
    if (isFull) {
      if (window.__openCharm) window.__openCharm();
    } else {
      var n = getCount();
      var remain = SECTIONS.length - n;
      if (window.__showToast) window.__showToast('再读完 ' + remain + ' 章，即可领取财神符');
      censer.style.transform = 'translateY(-4px) scale(.98)';
      setTimeout(function () { censer.style.transform = ''; }, 180);
    }
  }
  censer.addEventListener('click', onCenserClick);
  censer.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCenserClick(); }
  });
})();

/* ============================================================
   ⑤ 财神符生成 (V3.0 终极赛博重构 · 大印居中镇底 · 9:16 全屏)
   ============================================================ */
(function () {
  var modal = document.getElementById('charmModal');
  var img = document.getElementById('charmImg');
  var downloadBtn = document.getElementById('charmDownload');
  var shareBtn = document.getElementById('charmShare');
  var closeBtn = modal ? modal.querySelector('.charm-close') : null;
  var ctaBtn = document.getElementById('charmCtaBtn');
  if (!modal) return;
  var currentDataUrl = null;
  var releaseModalFocus = null;
  window.addEventListener('caishen:theme', function () { currentDataUrl = null; });

  function getFortune() {
    var GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
    var ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    function getJDN(y, m, d) {
      var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
      return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
           + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
    }
    var today = new Date();
    var jdn = getJDN(today.getFullYear(), today.getMonth() + 1, today.getDate());
    var ganIdx = (jdn + 9) % 10;
    var zhiIdx = (jdn + 1) % 12;
    var BLESS = ['恭喜发财','财源滚滚','招财进宝','金玉满堂','日进斗金','八方来财','大吉大利','富贵长红','红红火火','钱包鼓鼓'];
    return {
      label: BLESS[Math.floor(Math.random() * BLESS.length)],
      text: GAN[ganIdx] + ZHI[zhiIdx] + '日 · 财神方位' + ['东北','西南','正北','正西','正南'][ganIdx % 5]
    };
  }

  // 3D 金属浮雕文字引擎 (赛博融合)
  function draw3DText(ctx, text, x, y, font, color, glowColor, depth, isDark) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. 深度阴影层
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(text, x + depth, y + depth);

    // 2. 赛博发光层
    ctx.shadowColor = glowColor; ctx.shadowBlur = isDark ? 45 : 20;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);

    // 3. 金属高光层
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(text, x - 2, y - 2);
    ctx.restore();
  }

  function drawSeal(ctx, cx, cy, size, T) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(255, 45, 85, 0.15)';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeStyle = T.borderOuter; ctx.lineWidth = 3;
    ctx.shadowColor = T.borderOuter; ctx.shadowBlur = 15;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.shadowBlur = 0;
    ctx.fillStyle = T.borderOuter;
    ctx.font = '900 ' + Math.round(size * 0.4) + 'px "Noto Serif SC", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('财', 0, -size * 0.15);
    ctx.fillText('神', 0, size * 0.22);
    ctx.restore();
  }

  function drawDeity(ctx, cx, cy, size, T, isDark) {
    // 赛博能量背景光环
    var glow = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.85);
    glow.addColorStop(0, isDark ? 'rgba(255, 183, 0, 0.6)' : 'rgba(212, 160, 23, 0.4)');
    glow.addColorStop(0.4, isDark ? 'rgba(255, 45, 85, 0.2)' : 'rgba(192, 57, 43, 0.1)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2); ctx.fill();

    // 赛博符文环 (多圈同心圆 + 数据节点)
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(255, 183, 0, 0.8)' : 'rgba(184, 134, 11, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 24]);
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.72, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = isDark ? 'rgba(255, 45, 85, 0.5)' : 'rgba(192, 57, 43, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 18]);
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.64, 0, Math.PI * 2); ctx.stroke();

    // 数据流节点 (模拟算力中心)
    ctx.setLineDash([]);
    ctx.fillStyle = isDark ? 'rgba(255, 183, 0, 0.8)' : 'rgba(184, 134, 11, 0.8)';
    for (var i = 0; i < 16; i++) {
      var angle = (i / 16) * Math.PI * 2;
      var nx = cx + Math.cos(angle) * size * 0.72;
      var ny = cy + Math.sin(angle) * size * 0.72;
      ctx.beginPath(); ctx.arc(nx, ny, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 绘制财神像
    var state = window.__deityState || {};
    if (state.usable && window.__deityImg) {
      try {
        ctx.save();
        ctx.shadowColor = isDark ? 'rgba(255, 183, 0, 1)' : 'rgba(184, 134, 11, 0.8)';
        ctx.shadowBlur = 50; ctx.shadowOffsetY = 15;
        ctx.drawImage(window.__deityImg, cx - size / 2, cy - size / 2, size, size);
        ctx.restore(); return;
      } catch (e) {}
    }
    // 回退方案
    var r = size * 0.4;
    ctx.fillStyle = isDark ? '#ffb700' : '#d4a017';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a0609';
    ctx.font = '900 ' + Math.round(size * 0.5) + 'px "Noto Serif SC", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('财', cx, cy);
  }

  function addCanvasNoise(ctx, W, H) {
    var imageData = ctx.getImageData(0, 0, W, H);
    var data = imageData.data;
    for (var i = 0; i < data.length; i += 4) {
      if (Math.random() < 0.04) {
        var noise = (Math.random() - 0.5) * 35;
        data[i] += noise; data[i+1] += noise; data[i+2] += noise;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // 精准农历计算工具（基于浏览器内置 Intl 农历日历，100% 准确）
  function getLunarDate(date) {
    try {
      var parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).formatToParts(date);

      var lunarYear = '', lunarMonth = '', lunarDayNum = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type === 'yearName') lunarYear = p.value;
        else if (p.type === 'month') lunarMonth = p.value;
        else if (p.type === 'day') lunarDayNum = parseInt(p.value, 10);
      }

      var chineseDays = [
        '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
        '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
        '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'
      ];
      var lunarDay = chineseDays[lunarDayNum - 1] || '初' + lunarDayNum;

      return {
        year: lunarYear,
        month: lunarMonth,
        day: lunarDay
      };
    } catch (e) {
      console.warn('[财神符] Intl 农历计算失败，使用兜底', e);
      return { year: '丙午', month: '九月', day: '初五' };
    }
  }

  function generateCharm() {
    var W = 1080, H = 1920;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
    var fortune = getFortune();

    // 获取农历
    var today = new Date();
    var lunar = getLunarDate(today);
    var weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    var weekday = weekdays[today.getDay()];
    var dateStr = today.getFullYear() + '年' + (today.getMonth() + 1) + '月' + today.getDate() + '日 ' + weekday;

    var T = {
      bgFrom: isDark ? '#080205' : '#fff7ed',
      bgMid: isDark ? '#12060c' : '#fff9ec',
      bgTo: isDark ? '#040102' : '#fce8c4',
      gridColor: isDark ? 'rgba(255, 45, 85, 0.08)' : 'rgba(192, 57, 43, 0.08)',
      gridColor2: isDark ? 'rgba(255, 183, 0, 0.04)' : 'rgba(212, 160, 23, 0.05)',
      borderOuter: isDark ? '#ff2d55' : '#c0392b',
      borderInner: isDark ? 'rgba(255, 183, 0, 0.8)' : 'rgba(184, 134, 11, 0.8)',
      cornerColor: isDark ? '#ffb700' : '#b8860b',
      titleColor: isDark ? '#ffe9b8' : '#8e1c10',
      titleGlow: isDark ? '#ffb700' : '#d4a017',
      signColor: isDark ? '#fff3d0' : '#5a2e0e',
      signGlow: isDark ? '#ff2d55' : '#a82315',
      textMuted: isDark ? 'rgba(255, 183, 0, 0.6)' : 'rgba(142, 28, 16, 0.7)'
    };

    // 1. 背景
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, T.bgFrom); bg.addColorStop(.4, T.bgMid); bg.addColorStop(1, T.bgTo);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 2. 网格
    ctx.save();
    ctx.strokeStyle = T.gridColor2; ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 30) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 30) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    ctx.strokeStyle = T.gridColor; ctx.lineWidth = 2;
    for (var gx2 = 0; gx2 < W; gx2 += 120) { ctx.beginPath(); ctx.moveTo(gx2, 0); ctx.lineTo(gx2, H); ctx.stroke(); }
    for (var gy2 = 0; gy2 < H; gy2 += 120) { ctx.beginPath(); ctx.moveTo(0, gy2); ctx.lineTo(W, gy2); ctx.stroke(); }
    ctx.restore();

    // 3. 氛围光
    var topGlow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.55);
    topGlow.addColorStop(0, isDark ? 'rgba(255, 45, 85, 0.45)' : 'rgba(212, 160, 23, 0.35)');
    topGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow; ctx.fillRect(0, 0, W, H);

    var bottomGlow = ctx.createRadialGradient(W / 2, H, 0, W / 2, H, H * 0.4);
    bottomGlow.addColorStop(0, isDark ? 'rgba(255, 183, 0, 0.15)' : 'rgba(192, 57, 43, 0.1)');
    bottomGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bottomGlow; ctx.fillRect(0, 0, W, H);

    // 4. 外框
    ctx.save();
    ctx.strokeStyle = T.borderOuter; ctx.lineWidth = 3;
    ctx.shadowColor = T.borderOuter; ctx.shadowBlur = 30;
    ctx.strokeRect(50, 50, W - 100, H - 100);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = T.borderInner; ctx.lineWidth = 2;
    ctx.strokeRect(75, 75, W - 150, H - 150);
    ctx.strokeStyle = T.cornerColor; ctx.lineWidth = 6;
    var cl = 60;
    ctx.beginPath();
    ctx.moveTo(50, 50 + cl); ctx.lineTo(50, 50); ctx.lineTo(50 + cl, 50);
    ctx.moveTo(W - 50 - cl, 50); ctx.lineTo(W - 50, 50); ctx.lineTo(W - 50, 50 + cl);
    ctx.moveTo(50, H - 50 - cl); ctx.lineTo(50, H - 50); ctx.lineTo(50 + cl, H - 50);
    ctx.moveTo(W - 50 - cl, H - 50); ctx.lineTo(W - 50, H - 50); ctx.lineTo(W - 50, H - 50 - cl);
    ctx.stroke();
    ctx.restore();

    // 5. 顶部代码
    ctx.fillStyle = T.cornerColor;
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('// $ CAISHEN.DAO · ON-CHAIN TALISMAN', W / 2, 140);

    // 6. 财神像
    drawDeity(ctx, W / 2, 460, 560, T, isDark);

    // 7. 主标题
    draw3DText(ctx, '财 神 符', W / 2, 840,
      '900 150px "Noto Serif SC", "Songti SC", serif',
      T.titleColor, T.titleGlow, 12, isDark);

    // 8. 分割线
    ctx.save();
    ctx.strokeStyle = isDark ? '#ff2d55' : '#c0392b';
    ctx.lineWidth = 4;
    ctx.shadowColor = isDark ? '#ff2d55' : '#c0392b';
    ctx.shadowBlur = 25;
    ctx.beginPath(); ctx.moveTo(W / 2 - 350, 940); ctx.lineTo(W / 2 + 350, 940); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = T.cornerColor;
    ctx.save(); ctx.translate(W / 2, 940); ctx.rotate(Math.PI / 4); ctx.fillRect(-10, -10, 20, 20); ctx.restore();

    // 9. 信息框
    var boxW = W - 160;
    var boxH = 220;
    var boxX = (W - boxW) / 2;
    var boxY = 990;

    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(255, 183, 0, 0.05)' : 'rgba(255, 255, 255, 0.6)';
    ctx.strokeStyle = isDark ? 'rgba(255, 183, 0, 0.4)' : 'rgba(192, 57, 43, 0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 24); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = isDark ? 'rgba(255, 45, 85, 0.3)' : 'rgba(212, 160, 23, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(boxX + 15, boxY + 15, boxW - 30, boxH - 30, 16); ctx.stroke();
    ctx.restore();

    // 10. 祝福语（红红火火放大）
    ctx.fillStyle = isDark ? '#ff2d55' : '#c0392b';
    ctx.font = '700 40px "JetBrains Mono", monospace';
    ctx.fillText('[ ' + fortune.label + ' ]', W / 2, 1040);

    draw3DText(ctx, fortune.text, W / 2, 1125,
      '800 64px "Noto Serif SC", "Songti SC", serif',
      T.signColor, T.signGlow, 6, isDark);

    // 11. 随机吉祥话
    var SLOGANS = [
      '五路财神 · 八方来财', '招财进宝 · 日进斗金', '金库充盈 · 银库满仓',
      '财星高照 · 鸿运当头', '正财偏财 · 滚滚而来', '福禄双全 · 富贵盈门'
    ];
    var randomSlogan = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
    draw3DText(ctx, randomSlogan, W / 2, 1290,
      '700 52px "Noto Serif SC", "Songti SC", serif',
      T.titleColor, T.titleGlow, 4, isDark);

    ctx.fillStyle = T.textMuted;
    ctx.font = '500 36px "Noto Serif SC", serif';
    ctx.fillText('财神到，财运到', W / 2, 1370);

    // 12. 日期（公历+农历，去掉落款，优化间距）
    ctx.fillStyle = T.cornerColor;
    ctx.font = '700 34px "Noto Serif SC", "Songti SC", serif';
    ctx.fillText(dateStr, W / 2, 1440);

    ctx.fillStyle = T.titleColor;
    ctx.font = '700 34px "Noto Serif SC", "Songti SC", serif';
    ctx.fillText('农历 ' + lunar.year + '年 ' + lunar.month + ' ' + lunar.day, W / 2, 1500);

    // 13. 金色大印（尺寸 300，底部留白 80px，与日期间距舒适）
    var sealSize = 300;
    var sealX = (W - sealSize) / 2;
    var sealY = 1540;

    if (window.__goldenSealState && window.__goldenSealState.ready && window.__goldenSealImg) {
      ctx.save();
      ctx.shadowColor = isDark ? 'rgba(255, 183, 0, 1)' : 'rgba(184, 134, 11, 0.9)';
      ctx.shadowBlur = isDark ? 60 : 30;
      ctx.drawImage(window.__goldenSealImg, sealX, sealY, sealSize, sealSize);
      ctx.restore();
    } else {
      drawSeal(ctx, W / 2, sealY + sealSize / 2, sealSize * 0.8, T);
    }

    // 14. 噪点
    addCanvasNoise(ctx, W, H);

    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('[财神符] 导出失败：', e);
      throw new Error('画布导出失败，请用 http(s):// 打开页面后重试');
    }
  }

  function openCharm() {
    var state = window.__deityState || {};
    if (!state.ready && state.reason === 'loading') {
      if (window.__showToast) window.__showToast('正在请财神入符…');
      var waitStart = Date.now();
      var check = setInterval(function () {
        var s = window.__deityState || {};
        if (s.ready || s.reason !== 'loading' || Date.now() - waitStart > 1500) {
          clearInterval(check); doOpen();
        }
      }, 80);
      return;
    }
    doOpen();
  }

  function doOpen() {
    try {
      currentDataUrl = generateCharm();
      img.src = currentDataUrl;
    } catch (err) {
      console.error('[财神符] 生成失败：', err);
      var msg = (err && err.message) ? err.message.split('\n')[0] : '生成失败';
      if (window.__showToast) window.__showToast(msg);
      return;
    }
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    if (!releaseModalFocus) { releaseModalFocus = __modalHelpers.freeze([modal]); }
    if (window.__smokeBurst) {
      var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      for (var i = 0; i < 3; i++) {
        (function (k) {
          setTimeout(function () {
            window.__smokeBurst(cx + (Math.random() - 0.5) * 320, cy + (Math.random() - 0.5) * 320, 5, 20, 0.20);
          }, k * 100);
        })(i);
      }
    }
  }

  function closeCharm() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
    if (releaseModalFocus) { releaseModalFocus(); releaseModalFocus = null; }
  }

  window.__openCharm = openCharm;
  if (closeBtn) closeBtn.addEventListener('click', closeCharm);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeCharm(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeCharm();
  });

  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      if (!currentDataUrl) return;
      var a = document.createElement('a');
      a.href = currentDataUrl;
      a.download = '财神符-' + Date.now() + '.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      if (window.__showToast) window.__showToast('财神符已保存');
    });
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (!currentDataUrl) return;
      if (navigator.share && navigator.canShare) {
        try {
          fetch(currentDataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
            var file = new File([blob], '财神符.png', { type: 'image/png' });
            var shareData = {
              title: '$财神DAO · 我的财神符',
              text: '财神到，财运到。只迎财神，不砸财神。',
              files: [file]
            };
            if (navigator.canShare(shareData)) return navigator.share(shareData);
            return navigator.share({ title: shareData.title, text: shareData.text, url: location.href });
          }).catch(function () { copyFallback(); });
          return;
        } catch (_) {}
      }
      copyFallback();
    });
  }

  function copyFallback() {
    var text = '$财神DAO · 全球华人第一文化 Meme IP\n财神到，财运到。只迎财神，不砸财神。\n' + location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (window.__showToast) window.__showToast('文案已复制，去分享吧');
      }).catch(function () {
        if (window.__showToast) window.__showToast('请长按图片保存后分享');
      });
    } else {
      if (window.__showToast) window.__showToast('请长按图片保存后分享');
    }
  }

  if (ctaBtn) {
    ctaBtn.addEventListener('click', function () {
      if (ctaBtn.disabled) return;
      openCharm();
    });
  }
})();

/* ============================================================
   ⑥ 社交图片加载失败回退
   ============================================================ */
(function () {
  var imgs = document.querySelectorAll('.social-img');
  if (!imgs.length) return;

  function showFallback(img) {
    img.style.display = 'none';
    var sib = img.nextElementSibling;
    if (sib && sib.classList.contains('social-img-fallback')) {
      sib.style.display = 'inline-block';
    }
  }

  imgs.forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) {
      showFallback(img);
      return;
    }
    img.addEventListener('error', function () { showFallback(img); });
  });
})();

/* ============================================================
   ✦ 文化基因组扫描仪
   ============================================================ */
(function () {
  var scanner = document.getElementById('cultureScanner');
  if (!scanner) return;
  var rows = scanner.querySelectorAll('.scan-row');
  var result = scanner.querySelector('.scanner-result');
  var played = false;
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  function animateRow(row, delay) {
    setTimeout(function () {
      row.classList.add('active');
      var fill = row.querySelector('.scan-fill');
      var pctB = row.querySelector('.scan-pct b');
      if (fill) fill.style.width = '100%';
      if (pctB) {
        if (reduceMotion) { pctB.textContent = '100'; return; }
        var start = performance.now();
        var dur = 1150;
        function tick(now) {
          var t = Math.min(1, (now - start) / dur);
          var eased = 1 - Math.pow(1 - t, 3);
          pctB.textContent = Math.round(eased * 100);
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
    }, delay);
  }
  function play() {
    if (played) return;
    played = true;
    rows.forEach(function (row, i) { animateRow(row, i * 680); });
    setTimeout(function () {
      if (result) result.classList.add('show');
    }, rows.length * 680 + 380);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { play(); io.disconnect(); }
      });
    }, { threshold: 0.28 });
    io.observe(scanner);
  } else { play(); }
})();

/* ============================================================
   ✦ 缘起 · 请柬
   ============================================================ */
(function () {
  var root = document.getElementById('csInvitation');
  if (!root) return;
  var lines = root.querySelectorAll('.inv-line');
  var dual = root.querySelector('.inv-dual');
  var played = false;
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  function schedule() {
    root.classList.add('stamped');
    if (reduceMotion) { root.classList.add('seen'); return; }
    lines.forEach(function (line, i) {
      setTimeout(function () {
        line.style.opacity = '1';
        line.style.transform = 'translateY(0)';
      }, 450 + i * 350);
    });
    if (dual) {
      var dualDelay = 450 + lines.length * 350 + 150;
      setTimeout(function () { root.classList.add('seen'); }, dualDelay);
    } else {
      root.classList.add('seen');
    }
  }
  function play() { if (played) return; played = true; schedule(); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { play(); io.disconnect(); }
      });
    }, { threshold: 0.25 });
    io.observe(root);
  } else { play(); }
})();

/* ============================================================
   ✦ 赛博财神庙
   ============================================================ */
(function () {
  var root = document.getElementById('cyberTemple');
  if (!root) return;
  var played = false;
  function play() { if (played) return; played = true; root.classList.add('seen'); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { play(); io.disconnect(); }
      });
    }, { threshold: 0.22 });
    io.observe(root);
  } else { play(); }
  var pillars = root.querySelectorAll('.ct-pillar');
  pillars.forEach(function (p) {
    p.addEventListener('click', function () {
      if (window.__metalScrape) window.__metalScrape();
      p.classList.remove('ct-pillar-pulse');
      void p.offsetWidth;
      p.classList.add('ct-pillar-pulse');
      setTimeout(function () { p.classList.remove('ct-pillar-pulse'); }, 700);
    });
  });
})();

/* ============================================================
   ✦ 链上映射桥
   ============================================================ */
(function () {
  var root = document.getElementById('mappingBridge');
  if (!root) return;
  var rows = root.querySelectorAll('.mb-row');
  var counter = document.getElementById('mbCount');
  var played = false;
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  function bumpCounter(n) {
    if (!counter) return;
    counter.textContent = n;
    counter.classList.remove('bump');
    void counter.offsetWidth;
    counter.classList.add('bump');
    setTimeout(function () { counter.classList.remove('bump'); }, 550);
  }
  function play() {
    if (played) return;
    played = true;
    if (reduceMotion) {
      rows.forEach(function (row) { row.classList.add('lit'); });
      if (counter) counter.textContent = String(rows.length);
      return;
    }
    rows.forEach(function (row, i) {
      var delay = 200 + i * 620;
      setTimeout(function () {
        row.classList.add('lit');
        bumpCounter(i + 1);
      }, delay);
    });
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { play(); io.disconnect(); }
      });
    }, { threshold: 0.2 });
    io.observe(root);
  } else { play(); }
  rows.forEach(function (row) {
    row.addEventListener('click', function () {
      var pulse = row.querySelector('.mb-track-pulse');
      if (!pulse || !row.classList.contains('lit')) return;
      pulse.style.animation = 'none';
      void pulse.offsetWidth;
      pulse.style.animation = '';
      var chainIcon = row.querySelector('.mb-side-chain .mb-icon');
      if (chainIcon) {
        chainIcon.classList.remove('scan-replay');
        void chainIcon.offsetWidth;
        chainIcon.classList.add('scan-replay');
        setTimeout(function () { chainIcon.classList.remove('scan-replay'); }, 800);
      }
      if (window.__metalScrape) window.__metalScrape();
    });
  });
})();

/* ============================================================
   ✦ 三炷香
   ============================================================ */
(function () {
  var shrine = document.getElementById('faithShrine');
  if (!shrine) return;
  var cards = shrine.querySelectorAll('.faith-card');
  var counter = document.getElementById('fsCount');
  var seal = shrine.querySelector('.fs-base-seal');
  var played = false;
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
  function bumpCounter(n) {
    if (!counter) return;
    counter.textContent = n;
    counter.classList.remove('bump');
    void counter.offsetWidth;
    counter.classList.add('bump');
    setTimeout(function () { counter.classList.remove('bump'); }, 600);
  }
  function play() {
    if (played) return;
    played = true;
    if (reduceMotion) {
      cards.forEach(function (c) { c.classList.add('seen', 'lit'); });
      if (counter) counter.textContent = String(cards.length);
      shrine.classList.add('done');
      return;
    }
    cards.forEach(function (card, i) {
      var base = 150 + i * 700;
      setTimeout(function () { card.classList.add('seen'); }, base);
      setTimeout(function () {
        card.classList.add('lit');
        bumpCounter(i + 1);
      }, base + 280);
    });
    setTimeout(function () { shrine.classList.add('done'); }, 150 + cards.length * 700 + 1500);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { play(); io.disconnect(); }
      });
    }, { threshold: 0.22 });
    io.observe(shrine);
  } else { play(); }
  function replay() {
    if (seal) {
      seal.classList.remove('stamped');
      void seal.offsetWidth;
      seal.classList.add('stamped');
      setTimeout(function () { seal.classList.remove('stamped'); }, 500);
    }
    if (window.__metalScrape) window.__metalScrape();
    shrine.classList.add('resetting');
    cards.forEach(function (c) { c.classList.remove('seen', 'lit'); });
    shrine.classList.remove('done');
    if (counter) counter.textContent = '0';
    void shrine.offsetWidth;
    shrine.classList.remove('resetting');
    played = false;
    play();
  }
  if (seal) {
    seal.addEventListener('click', replay);
    seal.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); replay(); }
    });
  }
  cards.forEach(function (card) {
    card.addEventListener('click', function () {
      if (!card.classList.contains('lit')) return;
      var smokes = card.querySelectorAll('.incense-smoke');
      smokes.forEach(function (s) {
        s.style.animation = 'none';
        void s.offsetWidth;
        s.style.animation = '';
      });
      var tip = card.querySelector('.incense-tip');
      if (tip) {
        tip.style.animation = 'none';
        void tip.offsetWidth;
        tip.style.animation = '';
      }
      if (window.__metalScrape) window.__metalScrape();
    });
  });
})();

/* ============================================================
   ✦ Hero Chips · 复制 / 跳转
   ============================================================ */
(function () {
  var chips = document.querySelectorAll('.hero-chip[data-action]');
  if (!chips.length) return;

  function showCopied(chip) {
    var label = chip.querySelector('.hero-chip-label');
    if (!label) return;
    var original = label.textContent;
    chip.classList.add('is-copied');
    label.textContent = '已复制 ✓';
    setTimeout(function () {
      chip.classList.remove('is-copied');
      label.textContent = original;
    }, 1500);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand failed'));
      } catch (e) { reject(e); }
    });
  }

  chips.forEach(function (chip) {
    function activate() {
      var action = chip.getAttribute('data-action');

      if (action === 'copy') {
        var text = chip.getAttribute('data-copy');
        if (!text) return;
        copyText(text).then(function () {
          showCopied(chip);
          if (window.__showToast) window.__showToast('合约地址已复制');
        }).catch(function () {
          if (window.__showToast) window.__showToast('复制失败，请长按手动复制');
        });

      } else if (action === 'link') {
        var href = chip.getAttribute('data-href');
        var target = chip.getAttribute('data-target');
        if (!href) return;
        if (target === '_blank') {
          window.open(href, '_blank', 'noopener,noreferrer');
        } else {
          location.href = href;
        }
      }
    }

    chip.addEventListener('click', activate);
    chip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
})();
