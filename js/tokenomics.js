/* ==========================================================================
   财神DAO · 代币经济方案 — 主脚本（纯中文版）
   仅保留：主题切换、复制、环形图联动、TOC 高亮、FAQ、返回顶部
   ========================================================================== */

(function () {
  'use strict';

  var htmlEl = document.documentElement;
  var themeBtn = document.getElementById('themeToggle');

  /* ---------- theme-color meta ---------- */
  var themeColorMeta = document.createElement('meta');
  themeColorMeta.name = 'theme-color';
  document.head.appendChild(themeColorMeta);

  function setThemeColor(isDark) {
    themeColorMeta.content = isDark ? '#0a0e14' : '#ffffff';
  }

  /* ---------- Toast ---------- */
  var toast = document.getElementById('toast');
  var toastTimer = null;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  /* ---------- 复制工具 ---------- */
  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    try { document.execCommand('copy'); cb && cb(); } catch (e) {}
    document.body.removeChild(ta);
  }

  function copyText(text, cb) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(cb).catch(function () { fallbackCopy(text, cb); });
    } else {
      fallbackCopy(text, cb);
    }
  }

  /* ---------- 合约地址复制 ---------- */
  var copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    var icoCopy  = copyBtn.querySelector('.ico-copy');
    var icoCheck = copyBtn.querySelector('.ico-check');
    copyBtn.addEventListener('click', function () {
      copyText(copyBtn.getAttribute('data-addr'), function () {
        icoCopy.style.display = 'none';
        icoCheck.style.display = 'block';
        copyBtn.classList.add('copied');
        showToast('合约地址已复制');
        setTimeout(function () {
          icoCopy.style.display = 'block';
          icoCheck.style.display = 'none';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });
  }

  /* ---------- 邀请码复制 ---------- */
  document.querySelectorAll('.ch-copy').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      copyText(b.getAttribute('data-copy'), function () {
        b.classList.add('copied');
        showToast('邀请码已复制');
        setTimeout(function () { b.classList.remove('copied'); }, 1500);
      });
    });
  });

  /* ---------- 环形图联动高亮 ---------- */
  var donutSegs = document.querySelectorAll('.donut-seg');
  var legendItems = document.querySelectorAll('.lg-item[data-seg]');

  function highlightSeg(idx) {
    donutSegs.forEach(function (seg) {
      if (seg.getAttribute('data-seg') === idx) {
        seg.classList.remove('dim');
        seg.classList.add('highlight');
      } else {
        seg.classList.add('dim');
        seg.classList.remove('highlight');
      }
    });
  }
  function clearSegHighlight() {
    donutSegs.forEach(function (seg) {
      seg.classList.remove('dim');
      seg.classList.remove('highlight');
    });
  }

  if (donutSegs.length) {
    legendItems.forEach(function (item) {
      var idx = item.getAttribute('data-seg');
      item.addEventListener('mouseenter', function () { highlightSeg(idx); });
      item.addEventListener('mouseleave', clearSegHighlight);
      item.addEventListener('focus', function () { highlightSeg(idx); });
      item.addEventListener('blur', clearSegHighlight);
    });
    donutSegs.forEach(function (seg) {
      var idx = seg.getAttribute('data-seg');
      seg.addEventListener('mouseenter', function () { highlightSeg(idx); });
      seg.addEventListener('mouseleave', clearSegHighlight);
      seg.addEventListener('focus', function () { highlightSeg(idx); });
      seg.addEventListener('blur', clearSegHighlight);
    });
  }

  /* ---------- TOC 滚动高亮 ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));
  if (links.length) {
    var sections = links
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);

    if (sections.length && ('IntersectionObserver' in window)) {
      var linkMap = {};
      links.forEach(function (a) { linkMap[a.getAttribute('href')] = a; });

      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            links.forEach(function (a) { a.classList.remove('active'); });
            var a = linkMap['#' + entry.target.id];
            if (a) {
              a.classList.add('active');
              var toc = a.parentElement;
              if (toc && toc.scrollWidth > toc.clientWidth) {
                var target = a.offsetLeft - toc.clientWidth / 2 + a.offsetWidth / 2;
                toc.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
              }
            }
          }
        });
      }, { rootMargin: '-56px 0px -70% 0px', threshold: 0 });

      sections.forEach(function (s) { obs.observe(s); });
    }
  }

  /* ---------- 主题 ---------- */
  var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  var STORAGE_KEY = 'gof-theme';

  function currentTheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return darkMQ.matches ? 'dark' : 'light';
  }

  function applyDonutTheme(isDark) {
    donutSegs.forEach(function (seg) {
      var darkStroke = seg.getAttribute('data-dark-stroke');
      var baseStroke = seg.getAttribute('data-base-stroke') || seg.getAttribute('stroke');
      seg.setAttribute('stroke', (isDark && darkStroke) ? darkStroke : baseStroke);
    });
  }

  function applyUI() {
    var t = currentTheme();
    if (themeBtn) {
      themeBtn.setAttribute('data-icon', t);
      var label = t === 'dark' ? '切换到浅色模式' : '切换到深色模式';
      themeBtn.setAttribute('aria-label', label);
      themeBtn.title = label;
    }
    applyDonutTheme(t === 'dark');
    setThemeColor(t === 'dark');
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      applyUI();
    });
  }

  function onSystemChange() {
    if (!document.documentElement.hasAttribute('data-theme')) applyUI();
  }
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', onSystemChange);
  else if (darkMQ.addListener) darkMQ.addListener(onSystemChange);

  applyUI();

  /* ---------- FAQ 全部展开/收起 ---------- */
  var faqBtn = document.getElementById('faqToggleAll');
  var faqItems = document.querySelectorAll('.faq-item');

  if (faqBtn) {
    faqBtn.addEventListener('click', function () {
      var faqAllOpen = faqBtn.getAttribute('data-open') !== 'true';
      faqBtn.setAttribute('data-open', faqAllOpen);

      faqItems.forEach(function (d) { d.open = faqAllOpen; });

      var span = faqBtn.querySelector('span');
      if (span) span.textContent = faqAllOpen ? '收起全部' : '展开全部';

      var svg = faqBtn.querySelector('svg');
      if (svg) svg.style.transform = faqAllOpen ? 'rotate(180deg)' : '';
    });
  }

  /* ---------- 返回顶部 ---------- */
  var backTop = document.getElementById('backTop');
  if (backTop) {
    var onScroll = function () {
      if (window.scrollY > 600) backTop.classList.add('show');
      else backTop.classList.remove('show');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 表格滚动提示 ---------- */
  document.querySelectorAll('.scroll-hint').forEach(function (el) {
    var check = function () {
      if (el.scrollWidth > el.clientWidth && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) {
        el.classList.remove('at-end');
      } else {
        el.classList.add('at-end');
      }
    };
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();
  });

})();
