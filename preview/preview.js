/* BIMC CosMedic — ad preview. Vanilla JS, no build step.
 * Reads window.CAMPAIGN (preview/manifest.js). Works from file:// and static hosting.
 * One script drives both pages: index.html (data-page="overview") and preview/ad.html (data-page="ad"). */
(function () {
  'use strict';

  var C = window.CAMPAIGN;
  var PAGE = document.body.getAttribute('data-page');
  var ROOT = PAGE === 'ad' ? '../' : '';
  var SIZE_ORDER = ['300x600', '160x600', '300x250', '728x90', '320x50'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TIMES = '×';

  /* ---------- helpers ---------- */

  function h(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  /* Manifest paths are relative to the project root; ad.html sits one level down. */
  function R(path) {
    if (!path) return path;
    if (/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(path)) return path;
    return ROOT + path;
  }

  function $(id) { return document.getElementById(id); }

  function icon(name) {
    var paths = {
      replay: '<path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.2 1.8v3.1h3.1"/>',
      open: '<path d="M6 3H3v10h10v-3"/><path d="M9 2.5h4.5V7"/><path d="M13.5 2.5 7.5 8.5"/>',
      image: '<rect x="2" y="3" width="12" height="10"/><circle cx="6" cy="6.6" r="1.1"/><path d="m2.5 12 3.6-3.4 2.4 2.2 2-1.8 3 3"/>',
      live: '<rect x="2" y="3" width="12" height="10"/><path d="M6.7 5.9v4.2L10.3 8z"/>',
      download: '<path d="M8 2v8.2"/><path d="m4.6 7 3.4 3.4L11.4 7"/><path d="M2.5 13.5h11"/>',
      code: '<path d="m5.5 4.5-3.5 3.5 3.5 3.5"/><path d="m10.5 4.5 3.5 3.5-3.5 3.5"/>',
      prev: '<path d="M13 8H3"/><path d="M7 4 3 8l4 4"/>',
      next: '<path d="M3 8h10"/><path d="M9 4l4 4-4 4"/>'
    };
    return '<svg class="ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="square" aria-hidden="true" focusable="false">' + (paths[name] || '') + '</svg>';
  }

  function btnContent(name, label) {
    return icon(name) + '<span>' + label + '</span>';
  }

  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '';
    return parseInt(m[3], 10) + ' ' + MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1];
  }

  function kb(n) { return Math.round(n) + ' KB'; }
  function kb1(n) { return (Math.round(n * 10) / 10).toFixed(1) + ' KB'; }
  function dur(ad) { return ad.durationS + 's ' + TIMES + ' ' + ad.loops + (ad.loops === 1 ? ' loop' : ' loops'); }
  function sizeLabel(ad) { return ad.width + ' ' + TIMES + ' ' + ad.height; }
  function adHref(v, s) { return (PAGE === 'ad' ? '' : 'preview/') + 'ad.html?v=' + encodeURIComponent(v) + '&s=' + encodeURIComponent(s); }
  function px(el, prop) { return parseFloat(window.getComputedStyle(el)[prop]) || 0; }
  function contentWidth(el) { return el.clientWidth - px(el, 'paddingLeft') - px(el, 'paddingRight'); }

  function failed(msg) {
    var main = document.querySelector('main') || document.body;
    main.innerHTML = '';
    main.appendChild(h('p', { class: 'notice', role: 'alert', text: msg }));
  }

  /* ---------- shared: header bits ---------- */

  function fillMasthead() {
    document.title = C.client + ' — ' + C.campaign + (PAGE === 'ad' ? ' · Ad preview' : ' · Preview');
    var logo = $('logo'), fb = $('logo-fallback');
    if (fb) fb.textContent = C.client;
    if (logo) {
      logo.addEventListener('error', function () { logo.hidden = true; if (fb) fb.hidden = false; });
      logo.src = R(C.logo);
    }
    var up = $('updated');
    if (up) { up.textContent = fmtDate(C.updated); up.setAttribute('datetime', C.updated || ''); }
  }

  /* ---------- Unit: one ad at exact size with dimension lines ---------- */

  var BOARD_GUTTER_FALLBACK = 36; /* keep in sync with --dim-col + --dim-gap in preview.css */

  function Unit(version, ad) {
    this.version = version;
    this.ad = ad;
    this.scale = 1;
    this.title = version.label + ' — ' + sizeLabel(ad);
    this.frame = null;
    this.showingBackup = false;

    var w = ad.width, hgt = ad.height;
    this.dimW = h('div', { class: 'dim dim--w', 'aria-hidden': 'true' }, [h('span', { text: w + ' px' })]);
    this.dimH = h('div', { class: 'dim dim--h', 'aria-hidden': 'true' }, [h('span', { text: hgt + (hgt < 80 ? '' : ' px') })]);
    this.stage = h('div', { class: 'stage', style: 'width:' + w + 'px;height:' + hgt + 'px' });
    this.slot = h('div', { class: 'slot', style: 'width:' + w + 'px;height:' + hgt + 'px' }, [this.stage]);
    this.backup = null;
    if (ad.backup) {
      /* src is set on first reveal so ten hidden JPGs are not downloaded up front. */
      var self = this;
      this.backup = h('img', {
        class: 'backup', width: w, height: hgt, hidden: true,
        alt: 'Static backup image — ' + this.title, decoding: 'async'
      });
      this.backup.addEventListener('error', function () {
        self.backup.hidden = true;
        self.backup.removeAttribute('src');
        if (!self.missing) {
          self.missing = h('div', { class: 'backup-missing mono', role: 'status', text: 'Backup image not available' });
          self.stage.appendChild(self.missing);
        }
        self.missing.hidden = !self.showingBackup;
      });
      this.stage.appendChild(this.backup);
    }
    this.el = h('div', { class: 'board' }, [this.dimW, this.dimH, this.slot]);
  }

  Unit.prototype.makeFrame = function () {
    var ad = this.ad;
    /* Preview only: give the ad a clickTAG so a click opens the client's site.
       In TTD the platform supplies the real one. */
    var src = R(ad.html) + (C.previewClickUrl ? '?clickTAG=' + encodeURIComponent(C.previewClickUrl) : '');
    return h('iframe', {
      class: 'frame', src: src, title: this.title,
      width: ad.width, height: ad.height, frameborder: '0', scrolling: 'no',
      allowtransparency: 'true'
    });
  };

  Unit.prototype.mount = function () {
    if (this.frame) return;
    this.frame = this.makeFrame();
    this.stage.insertBefore(this.frame, this.stage.firstChild);
  };

  Unit.prototype.setBackup = function (on) {
    if (!this.backup) return false;
    this.showingBackup = !!on;
    if (on && !this.backup.getAttribute('src') && !this.missing) this.backup.src = R(this.ad.backup);
    this.backup.hidden = !on || !!this.missing;
    if (this.missing) this.missing.hidden = !on;
    if (this.frame) this.frame.style.visibility = on ? 'hidden' : '';
    return this.showingBackup;
  };

  Unit.prototype.replay = function () {
    this.setBackup(false);
    if (!this.frame) { this.mount(); return; }
    /* Swapping the node restarts the ad reliably, also when the frame is cross-origin (file://). */
    var next = this.makeFrame();
    this.stage.replaceChild(next, this.frame);
    this.frame = next;
  };

  Unit.prototype.gutter = function () {
    var cs = window.getComputedStyle(this.el);
    var col = parseFloat(cs.getPropertyValue('--dim-col'));
    var gap = parseFloat(cs.getPropertyValue('--dim-gap'));
    return (isNaN(col) || isNaN(gap)) ? BOARD_GUTTER_FALLBACK : col + gap;
  };

  /* Scale down only when the ad cannot fit the available width (phones). Never scales up. */
  Unit.prototype.fit = function (availWidth) {
    var ad = this.ad;
    var avail = availWidth - this.gutter();
    var s = avail > 0 ? Math.min(1, avail / ad.width) : 1;
    if (s > 0.995) s = 1;
    this.scale = s;
    this.stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
    this.slot.style.width = Math.round(ad.width * s) + 'px';
    this.slot.style.height = Math.round(ad.height * s) + 'px';
    this.el.classList.toggle('is-scaled', s < 1);
    if (this.onscale) this.onscale(s);
  };

  /* Shared action buttons (Replay / Backup toggle). */
  function replayButton(unit, cls) {
    return h('button', {
      type: 'button', class: cls || 'btn', 'aria-label': 'Replay ' + unit.title,
      html: btnContent('replay', 'Replay'),
      onclick: function () { unit.replay(); if (unit.syncBackupBtn) unit.syncBackupBtn(); }
    });
  }

  function backupButton(unit, labels, cls) {
    if (!unit.backup) return null;
    var b = h('button', { type: 'button', class: cls || 'btn', 'aria-pressed': 'false' });
    function sync() {
      var on = unit.showingBackup;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML = on ? btnContent('live', labels.on) : btnContent('image', labels.off);
      b.setAttribute('aria-label', (on ? 'Show live ad ' : 'Show static backup ') + unit.title);
    }
    b.addEventListener('click', function () { unit.setBackup(!unit.showingBackup); sync(); });
    unit.syncBackupBtn = sync;
    sync();
    return b;
  }

  /* ---------- ordering ---------- */

  function sizeRank(s) {
    var i = SIZE_ORDER.indexOf(s);
    return i === -1 ? SIZE_ORDER.length : i;
  }

  function orderedAds(version) {
    return version.ads.map(function (a, i) { return { a: a, i: i }; })
      .sort(function (x, y) { return (sizeRank(x.a.size) - sizeRank(y.a.size)) || (x.i - y.i); })
      .map(function (x) { return x.a; });
  }

  /* =====================================================================
   * OVERVIEW
   * ===================================================================== */

  function initOverview() {
    fillMasthead();

    /* Hero */
    var eyebrow = $('eyebrow');
    eyebrow.textContent = C.client + ' · ' + C.platform;
    var words = String(C.campaign).split(/\s+/);
    var title = $('title');
    title.textContent = '';
    var accentAt = words.length >= 3 ? 1 : words.length - 1;
    words.forEach(function (w, i) {
      if (i > 0) title.appendChild(document.createTextNode(' '));
      title.appendChild(i === accentAt && words.length > 1 ? h('em', { text: w }) : document.createTextNode(w));
    });

    var versions = C.versions.map(function (v) { return { v: v, ads: orderedAds(v) }; });
    var allSizes = [];
    var total = 0, heaviest = 0;
    versions.forEach(function (x) {
      x.ads.forEach(function (a) {
        total++;
        if (allSizes.indexOf(a.size) === -1) allSizes.push(a.size);
        if (a.initialKB > heaviest) heaviest = a.initialKB;
      });
    });
    allSizes.sort(function (a, b) { return sizeRank(a) - sizeRank(b); });

    var ch = $('changes');
    if (ch && C.changes && C.changes.length) {
      ch.appendChild(h('p', { class: 'mono changes__label', text: 'What changed' }));
      var ol = h('ol', { class: 'changes__list' });
      C.changes.forEach(function (c) { ol.appendChild(h('li', { text: c })); });
      ch.appendChild(ol);
    }

    var dl = $('downloads');
    if (dl && C.packages && C.packages.length) {
      dl.appendChild(h('p', { class: 'mono downloads__label', text: C.revision ? 'Downloads · ' + C.revision : 'Downloads' }));
      var row = h('div', { class: 'downloads__row' });
      C.packages.forEach(function (p) {
        row.appendChild(h('a', { class: 'btn', href: R(p.path), download: '', html: btnContent('download', p.label + ' · ' + kb(p.kb)) }));
      });
      dl.appendChild(row);
    }

    var stats = $('stats');
    [['Versions', String(C.versions.length)], ['Ad units', String(total)], ['Sizes', String(allSizes.length)], ['Heaviest initial load', kb(heaviest)]]
      .forEach(function (s) {
        stats.appendChild(h('div', { class: 'stat' }, [h('dt', { class: 'mono', text: s[0] }), h('dd', { text: s[1] })]));
      });

    /* State from URL */
    var state = { v: 'all', s: 'all' };
    try {
      var q = new URLSearchParams(window.location.search);
      var qv = q.get('v'), qs = q.get('s');
      if (qv && C.versions.some(function (v) { return v.id === qv; })) state.v = qv;
      if (qs && allSizes.indexOf(qs) !== -1) state.s = qs;
    } catch (e) { /* ignore */ }

    var main = $('ads');
    var cards = [];      /* {el, unit, v, s, shown} */
    var sections = [];   /* {el, rows:[el], v} */

    versions.forEach(function (x) {
      var v = x.v;
      var tallRow = h('div', { class: 'row row--tall' });
      var wideRow = h('div', { class: 'row row--wide' });
      var panel = h('div', { class: 'panel-board' }, [tallRow, wideRow]);

      var head = h('header', { class: 'version__head' }, [
        h('div', { class: 'version__titles' }, [
          h('p', { class: 'eyebrow eyebrow--small', text: v.id }),
          h('h2', { class: 'version__name', text: v.label }),
          h('p', { class: 'version__headline', text: '“' + v.headline + '”' })
        ]),
        h('dl', { class: 'version__facts' }, [
          h('div', null, [h('dt', { class: 'mono', text: 'Call to action' }), h('dd', { text: v.cta })]),
          h('div', null, [h('dt', { class: 'mono', text: 'Frames' }), h('dd', { text: String((v.frames || []).length) })])
        ])
      ]);

      var section = h('section', { class: 'version', id: 'ver-' + v.id, 'aria-labelledby': 'h-' + v.id }, [head, panel]);
      head.querySelector('h2').id = 'h-' + v.id;
      main.appendChild(section);
      sections.push({ el: section, v: v.id, rows: [tallRow, wideRow], panel: panel });

      x.ads.forEach(function (ad) {
        var unit = new Unit(v, ad);
        var card = buildCard(v, ad, unit);
        (ad.height >= 250 ? tallRow : wideRow).appendChild(card);
        cards.push({ el: card, unit: unit, v: v.id, s: ad.size, shown: false, section: section });
      });
    });

    var empty = h('div', { class: 'empty', hidden: true }, [
      h('p', { class: 'empty__title', text: 'No ads match these filters.' }),
      h('button', { type: 'button', class: 'btn', text: 'Show all ads', onclick: function () { setState({ v: 'all', s: 'all' }); } })
    ]);
    main.appendChild(empty);

    /* Card builder */
    function buildCard(v, ad, unit) {
      var note = h('span', { class: 'card__note mono', hidden: true });
      unit.onscale = function (s) {
        note.hidden = s >= 1;
        note.textContent = s < 1 ? 'Scaled to fit · ' + Math.round(s * 100) + '%' : '';
      };

      var actions = h('div', { class: 'actions' }, [
        replayButton(unit),
        h('a', { class: 'btn', href: adHref(v.id, ad.size), 'aria-label': 'Open ' + unit.title + ' on its own', html: btnContent('open', 'Open') }),
        backupButton(unit, { on: 'Live', off: 'Backup' }),
        ad.zip ? h('a', { class: 'btn', href: R(ad.zip), download: '', 'aria-label': 'Download ' + unit.title + ' zip', html: btnContent('download', 'Download') }) : null
      ]);

      var meta = h('p', { class: 'meta' }, [
        h('span', null, [h('b', { text: 'Initial ' }), kb(ad.initialKB)]),
        h('span', null, [h('b', { text: 'Zip ' }), kb(ad.zipKB)]),
        h('span', { text: dur(ad) })
      ]);

      return h('article', { class: 'card' + (ad.width < 250 ? ' card--narrow' : ''), style: '--w:' + ad.width, 'data-v': v.id, 'data-s': ad.size, 'aria-label': unit.title }, [
        unit.el,
        h('div', { class: 'card__body' }, [
          h('div', { class: 'card__size' }, [h('span', { class: 'size-label mono', text: sizeLabel(ad) }), note]),
          meta,
          actions
        ])
      ]);
    }

    /* Lazy mount: start each ad when it comes into view so every viewer sees it from frame one. */
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var c = cards.filter(function (k) { return k.el === en.target; })[0];
          if (c) c.unit.mount();
          io.unobserve(en.target);
        });
      }, { rootMargin: '120px 0px' });
    }
    function activate(c) {
      if (io) io.observe(c.el); else c.unit.mount();
    }

    /* Fit */
    function fitAll() {
      cards.forEach(function (c) {
        if (c.el.hidden) return;
        var row = c.el.parentNode;
        c.unit.fit(contentWidth(row));
      });
    }
    var raf = 0;
    function queueFit() { cancelAnimationFrame(raf); raf = requestAnimationFrame(fitAll); }
    window.addEventListener('resize', queueFit);
    window.addEventListener('orientationchange', queueFit);

    /* Filters */
    var vfilter = $('vfilter'), sfilter = $('sfilter');
    var vChips = [], sChips = [];

    function chip(group, list, value, label, key) {
      var b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: label, 'data-value': value });
      b.addEventListener('click', function () {
        var next = { v: state.v, s: state.s };
        next[key] = value;
        setState(next);
      });
      group.appendChild(b);
      list.push(b);
    }
    chip(vfilter, vChips, 'all', 'All', 'v');
    C.versions.forEach(function (v) { chip(vfilter, vChips, v.id, v.label, 'v'); });
    chip(sfilter, sChips, 'all', 'All', 's');
    allSizes.forEach(function (s) { chip(sfilter, sChips, s, s.replace('x', ' ' + TIMES + ' '), 's'); });

    var replayAll = $('replay-all');
    replayAll.innerHTML = btnContent('replay', 'Replay all');
    replayAll.addEventListener('click', function () {
      cards.forEach(function (c) { if (!c.el.hidden) { c.unit.replay(); if (c.unit.syncBackupBtn) c.unit.syncBackupBtn(); } });
    });

    function writeUrl() {
      try {
        var q = new URLSearchParams();
        if (state.v !== 'all') q.set('v', state.v);
        if (state.s !== 'all') q.set('s', state.s);
        var qs = q.toString();
        var url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        window.history.replaceState(null, '', url);
      } catch (e) { /* file:// or sandboxed: the filter still works, just isn't reflected in the URL */ }
    }

    function render(firstRun) {
      vChips.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-value') === state.v ? 'true' : 'false'); });
      sChips.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-value') === state.s ? 'true' : 'false'); });

      var visible = 0;
      cards.forEach(function (c) {
        var show = (state.v === 'all' || c.v === state.v) && (state.s === 'all' || c.s === state.s);
        c.el.hidden = !show;
        if (show) {
          visible++;
          if (!c.shown) { c.shown = true; activate(c); }
        } else if (c.shown && c.unit.frame) {
          /* Dropped from view: unmount so it restarts cleanly when it comes back. */
          c.unit.frame.parentNode.removeChild(c.unit.frame);
          c.unit.frame = null;
          c.unit.setBackup(false);
          if (c.unit.syncBackupBtn) c.unit.syncBackupBtn();
          c.shown = false;
          if (io) io.unobserve(c.el);
        } else {
          c.shown = false;
        }
      });

      sections.forEach(function (sec) {
        var n = 0;
        sec.rows.forEach(function (row) {
          var any = Array.prototype.some.call(row.children, function (k) { return !k.hidden; });
          row.hidden = !any;
          if (any) n++;
        });
        sec.el.hidden = n === 0;
      });
      empty.hidden = visible !== 0;
      $('count').textContent = visible + ' of ' + total + ' shown';
      fitAll();
    }

    function setState(next) {
      state = next;
      writeUrl();
      render(false);
    }

    render(true);
    /* Fonts change line heights, which can change available widths; refit once everything has settled. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
    window.addEventListener('load', queueFit);
  }

  /* =====================================================================
   * SINGLE AD VIEW
   * ===================================================================== */

  function initAd() {
    fillMasthead();

    var flat = [];
    C.versions.forEach(function (v) { orderedAds(v).forEach(function (a) { flat.push({ v: v, a: a }); }); });

    var qv = null, qs = null;
    try { var q = new URLSearchParams(window.location.search); qv = q.get('v'); qs = q.get('s'); } catch (e) { /* ignore */ }
    var idx = 0;
    flat.forEach(function (x, i) { if (x.v.id === qv && x.a.size === qs) idx = i; });
    var cur = flat[idx], v = cur.v, ad = cur.a;
    var n = flat.length;
    var prev = flat[(idx - 1 + n) % n], next = flat[(idx + 1) % n];

    document.title = v.label + ' · ' + sizeLabel(ad) + ' — ' + C.client;

    var unit = new Unit(v, ad);
    var stage = $('stage');
    stage.appendChild(unit.el);
    unit.mount();

    var note = $('note');
    unit.onscale = function (s) {
      note.hidden = s >= 1;
      note.textContent = s < 1 ? 'Scaled to fit · ' + Math.round(s * 100) + '%' : '';
    };
    function fit() { unit.fit(contentWidth(stage)); }
    fit();
    window.addEventListener('resize', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener('load', fit);

    /* Pager */
    function pagerLink(el, target, dirIcon, label, dirLabel) {
      el.href = adHref(target.v.id, target.a.size);
      el.innerHTML = dirIcon === 'prev'
        ? icon('prev') + '<span class="pager__txt"><span class="mono pager__dir">' + dirLabel + '</span><span class="pager__to">' + label + '</span></span>'
        : '<span class="pager__txt"><span class="mono pager__dir">' + dirLabel + '</span><span class="pager__to">' + label + '</span></span>' + icon('next');
      el.setAttribute('aria-label', dirLabel + ' ad: ' + target.v.label + ', ' + sizeLabel(target.a));
    }
    pagerLink($('prev'), prev, 'prev', prev.v.label + ' · ' + sizeLabel(prev.a), 'Previous');
    pagerLink($('next'), next, 'next', next.v.label + ' · ' + sizeLabel(next.a), 'Next');
    var pos = String(idx + 1); if (pos.length < 2) pos = '0' + pos;
    var tot = String(n); if (tot.length < 2) tot = '0' + tot;
    $('counter').textContent = pos + ' / ' + tot;

    $('back').href = '../index.html?v=' + encodeURIComponent(v.id) + '#ver-' + encodeURIComponent(v.id);
    $('back').innerHTML = icon('prev') + '<span>All ads</span>';

    document.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { window.location.href = $('prev').href; }
      else if (e.key === 'ArrowRight') { window.location.href = $('next').href; }
    });

    /* Panel */
    var panel = $('panel');
    var spec = function (label, value) { return h('div', { class: 'spec' }, [h('dt', { class: 'mono', text: label }), h('dd', { text: value })]); };

    var actions = h('div', { class: 'panel__actions' }, [
      replayButton(unit, 'btn btn--solid btn--lg'),
      backupButton(unit, { on: 'Show live ad', off: 'Show backup' }, 'btn btn--lg'),
      h('a', { class: 'btn btn--lg', href: R(ad.html), target: '_blank', rel: 'noopener', html: btnContent('code', 'Open raw HTML') }),
      ad.zip ? h('a', { class: 'btn btn--lg', href: R(ad.zip), download: '', html: btnContent('download', 'Download zip') }) : null
    ]);

    var story = h('ol', { class: 'story' });
    (v.frames || []).forEach(function (f, i) {
      var k = String(i + 1); if (k.length < 2) k = '0' + k;
      var body = [h('span', { class: 'story__t', text: f })];
      var still = ad.statics && ad.statics[i];
      if (still) {
        body.push(h('a', { class: 'story__still', href: R(still), target: '_blank', rel: 'noopener',
          'aria-label': 'Static, frame ' + (i + 1) + ' — ' + ad.name }, [
          h('img', { src: R(still), alt: 'Frame ' + (i + 1) + ' static', loading: 'lazy', decoding: 'async' })
        ]));
        body.push(h('a', { class: 'story__dl mono', href: R(still), download: '', text: 'Download static F' + (i + 1) }));
      }
      story.appendChild(h('li', null, [h('span', { class: 'mono story__n', text: k }), h('div', { class: 'story__b' }, body)]));
    });

    panel.appendChild(h('p', { class: 'eyebrow', text: v.id + ' · ' + v.label }));
    panel.appendChild(h('h1', { class: 'panel__title' }, [sizeLabel(ad)]));
    panel.appendChild(h('p', { class: 'version__headline', text: '“' + v.headline + '”' }));
    panel.appendChild(h('p', { class: 'panel__name mono', text: ad.name }));
    panel.appendChild(actions);
    panel.appendChild(h('h2', { class: 'panel__h mono', text: 'Specifications' }));
    panel.appendChild(h('dl', { class: 'specs' }, [
      spec('Size', ad.width + ' ' + TIMES + ' ' + ad.height + ' px'),
      spec('Initial load', kb1(ad.initialKB)),
      spec('Total weight', kb1(ad.totalKB)),
      spec('Zip', kb1(ad.zipKB)),
      spec('Files', String(ad.files)),
      spec('Duration', ad.durationS + 's per play'),
      spec('Loops', String(ad.loops)),
      spec('Call to action', v.cta),
      spec('clickTAG param', C.clickTag)
    ]));
    if (v.frames && v.frames.length) {
      panel.appendChild(h('h2', { class: 'panel__h mono', text: ad.statics ? 'Storyboard · statics' : 'Storyboard' }));
      panel.appendChild(story);
    }
  }

  /* ---------- boot ---------- */

  function boot() {
    if (!C || !C.versions || !C.versions.length) {
      failed('The preview data could not be loaded. Check that manifest.js sits beside this page.');
      return;
    }
    if (PAGE === 'ad') initAd(); else initOverview();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
