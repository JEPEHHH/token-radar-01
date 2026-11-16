// Token Radar — radar-2 client. Reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, its filters, a per-protocol detail view with the model's own factors, and each
// protocol's farm plan. No fetch, no network: every byte it shows arrives in data.js.
(function () {
  'use strict';

  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D) {
    app.innerHTML = '<p class="empty">No data: data.js was not found beside the page.</p>';
    return;
  }

  var state = { tab: 'board', q: '', category: 'all', chain: 'all', sort: 'rank', dir: 1, selected: null };
  var watchSet = {};
  (D.watchlist || []).forEach(function (s) { watchSet[s] = 1; });
  var PRE = D.rows.slice();
  var LIVE = (D.live || []).slice();

  // ---------- formatting ----------
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function age(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    return Math.round(days) + 'd';
  }
  function mult(n) { return n.toFixed(3) + '×'; }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  // ---------- model, recomputed in the page ----------
  // The page recomputes every row's implied value from the row's own factors and the snapshot figures,
  // so the number on screen is the arithmetic in this function, not a figure trusted from the file.
  function recompute(r) {
    var base = r.tvl_usd * D.model.base_multiple;
    return Math.max(1, Math.round(base * r.growth_multiplier * r.maturity_multiplier * r.sector_multiplier * r.chain_multiplier));
  }
  function agrees(r) {
    var got = recompute(r);
    return Math.abs(got - r.implied_value_usd) / r.implied_value_usd < 0.0005;
  }

  // ---------- the two sets: pre-token rows and trading protocols ----------
  function scope() {
    if (state.tab === 'watchlist') return PRE.filter(function (r) { return watchSet[r.slug] === 1; });
    if (state.tab === 'early') return PRE.filter(function (r) { return watchSet[r.slug] !== 1; });
    if (state.tab === 'trading') return LIVE;
    return PRE;
  }

  var SORTS = {
    rank: function (r) { return r.rank === undefined ? 1e9 : r.rank; },
    implied: function (r) { return -(r.implied_value_usd || r.mcap_usd || 0); },
    tvl: function (r) { return -r.tvl_usd; },
    growth: function (r) { return -(r.change_7d === null ? -999 : r.change_7d); },
    age: function (r) { return r.age_days === null || r.age_days === undefined ? 1e9 : -r.age_days; },
    farm: function (r) { return (r.farm_cost_usd || 0) * 1000 + (r.farm_days || 0); },
    name: function (r) { return r.name.toLowerCase(); }
  };

  function visible() {
    var q = state.q.trim().toLowerCase();
    var rows = scope().filter(function (r) {
      if (state.category !== 'all' && (r.category || 'untagged') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (q && (r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1 && (r.category || '').toLowerCase().indexOf(q) === -1)) return false;
      return true;
    });
    var key = SORTS[state.sort] || SORTS.rank;
    rows.sort(function (a, b) {
      var x = key(a), y = key(b);
      if (x < y) return -1 * state.dir;
      if (x > y) return 1 * state.dir;
      return String(a.slug) < String(b.slug) ? -1 : 1;
    });
    return rows;
  }

  // ---------- masthead ----------
  function masthead() {
    var top = PRE[0] || { implied_value_usd: 0, name: 'n/a' };
    var m = D.model;
    var head = el('header', 'masthead');
    head.appendChild(el('div', '', '' +
      '<div class="brand">' +
        '<span class="kicker">make.fun · token launch radar</span>' +
        '<span class="tag">' + esc(D.model_version) + '</span>' +
      '</div>' +
      '<h1>Token <em>Radar</em></h1>' +
      '<p class="thesis">Protocols that record <b>no token</b>, ranked by what a launch would be worth at their own ' +
      'figures: TVL, the seven-day change and how long they have run without a token. ' +
      'Trading protocols are kept apart, at the market\'s own values. Snapshot of <b>' + esc(D.as_of) + '</b>.</p>'));
    var stats = el('div', 'stats');
    [
      { n: D.rows.length, l: 'pre-token rows', c: '' },
      { n: (D.watchlist || []).length, l: 'on the watchlist', c: 'alt' },
      { n: D.trading_size, l: 'protocols trading', c: 'alt2' },
      { n: usd(top.implied_value_usd), l: 'top implied value', c: '' },
    ].forEach(function (s) {
      var box = el('div', 'stat ' + s.c, '<span class="n">' + esc(s.n) + '</span><span class="l">' + s.l + '</span>');
      stats.appendChild(box);
    });
    head.appendChild(stats);
    app.appendChild(head);
  }

  // ---------- controls ----------
  function controls() {
    var cats = {}, chains = {};
    PRE.forEach(function (r) {
      cats[r.category || 'untagged'] = (cats[r.category || 'untagged'] || 0) + 1;
      (r.chains || []).forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
    });
    var catList = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    var chainList = Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a]; });

    var bar = el('div', 'controls');
    var tabs = el('div', 'tabs');
    [
      ['board', 'Board', D.rows.length],
      ['watchlist', 'Watchlist', (D.watchlist || []).length],
      ['early', 'Early radar', D.rows.length - (D.watchlist || []).length],
      ['trading', 'Trading', LIVE.length],
    ].forEach(function (t) {
      var b = el('button', 'tab', esc(t[1]) + '<b>' + t[2] + '</b>');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-tab', t[0]);
      b.setAttribute('aria-selected', String(state.tab === t[0]));
      b.addEventListener('click', function () { state.tab = t[0]; state.selected = null; render(); });
      tabs.appendChild(b);
    });
    bar.appendChild(tabs);

    var qField = el('div', 'field', '<label for="q">find</label>');
    var q = el('input');
    q.id = 'q'; q.type = 'search'; q.placeholder = 'name, slug or sector'; q.value = state.q;
    q.addEventListener('input', function () { state.q = q.value; render(); });
    qField.appendChild(q);
    bar.appendChild(qField);

    bar.appendChild(selectField('Sector', 'cat', ['all'].concat(catList), state.category, function (v) { state.category = v; render(); }, function (v) { return v === 'all' ? 'every sector' : v + ' (' + cats[v] + ')'; }));
    bar.appendChild(selectField('Chain', 'chain', ['all'].concat(chainList.slice(0, 24)), state.chain, function (v) { state.chain = v; render(); }, function (v) { return v === 'all' ? 'every chain' : v + ' (' + chains[v] + ')'; }));
    bar.appendChild(selectField('Order', 'sort', Object.keys(SORTS), state.sort, function (v) { state.sort = v; render(); }, function (v) { return v === 'rank' ? 'implied rank' : v === 'growth' ? '7-day change' : v === 'farm' ? 'farm cost' : v; }));

    var dir = el('button', 'btn', state.dir === 1 && state.sort === 'rank' ? 'asc' : 'desc');
    dir.type = 'button';
    dir.addEventListener('click', function () { state.dir = -state.dir; render(); });
    bar.appendChild(dir);

    var reset = el('button', 'btn', 'reset');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.sort = 'rank'; state.dir = 1; state.selected = null;
      render();
    });
    bar.appendChild(reset);

    bar.appendChild(el('span', 'spacer'));
    var shown = visible();
    var check = PRE.filter(agrees).length;
    bar.appendChild(el('span', 'hint', 'showing <b>' + shown.length + '</b> of ' + scope().length + ' · model check <b>' + check + '/' + PRE.length + '</b> rows reproduce'));
    app.appendChild(bar);
  }

  function selectField(label, id, values, current, onChange, labelOf) {
    var field = el('div', 'field', '<label for="' + id + '">' + label + '</label>');
    var sel = el('select');
    sel.id = id;
    values.forEach(function (v) {
      var o = el('option', '', esc(labelOf(v)));
      o.value = v;
      if (v === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    field.appendChild(sel);
    return field;
  }

  // ---------- table ----------
  var COLUMNS = [
    { id: 'rank', label: '#', cls: 'rank', num: true },
    { id: 'name', label: 'protocol', cls: '', num: false },
    { id: 'category', label: 'sector', cls: '', num: false },
    { id: 'chains', label: 'chains', cls: '', num: false },
    { id: 'tvl', label: 'tvl', cls: 'mut num', num: true },
    { id: 'growth', label: '7d', cls: 'num', num: true },
    { id: 'age', label: 'no token for', cls: 'mut num', num: true },
    { id: 'implied', label: 'implied value', cls: 'value num', num: true },
    { id: 'farm', label: 'farm (cost · days)', cls: 'mut num', num: true },
  ];

  function table(rows) {
    var wrap = el('div', 'board');
    wrap.id = 'board';
    wrap.tabIndex = -1;
    if (rows.length === 0) {
      wrap.appendChild(el('p', 'empty', 'No protocol matches this filter. Clear the search or pick another sector.'));
      return wrap;
    }
    var t = el('table');
    var thead = el('thead');
    var hr = el('tr');
    COLUMNS.forEach(function (c) {
      var th = el('th', c.num ? 'num' : '', esc(c.label));
      th.setAttribute('scope', 'col');
      if (state.sort === c.id) th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
      th.addEventListener('click', function () {
        if (state.sort === c.id) state.dir = -state.dir;
        else { state.sort = c.id; state.dir = c.id === 'name' ? 1 : c.id === 'rank' ? 1 : -1; }
        render();
      });
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    t.appendChild(thead);

    var tbody = el('tbody');
    var maxValue = rows.reduce(function (a, r) { return Math.max(a, r.implied_value_usd || r.mcap_usd || 0); }, 1);
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.setAttribute('data-slug', r.slug);
      tr.setAttribute('aria-selected', String(state.selected === r.slug));
      var isLive = r.token_status === 'trading';
      var value = r.implied_value_usd || r.mcap_usd || 0;
      var growth = r.change_7d;
      tr.appendChild(el('td', 'rank' + (r.rank && r.rank <= 3 ? ' top' : ''), isLive ? '·' : String(r.rank)));
      tr.appendChild(el('td', '', '<span class="who"><span class="name">' + esc(r.name) + '</span><span class="slug">' + esc(r.slug) + '</span></span>'));
      tr.appendChild(el('td', '', '<span class="pill ' + (isLive ? 'live' : watchSet[r.slug] ? 'watch' : '') + '">' + esc(r.category || 'untagged') + '</span>'));
      var chains = r.chains || [];
      tr.appendChild(el('td', '', '<span class="chains">' + esc(chains.slice(0, 2).join(' · ')) + (chains.length > 2 ? ' <span class="more">+' + (chains.length - 2) + '</span>' : '') + '</span>'));
      tr.appendChild(el('td', 'mut num', usd(r.tvl_usd)));
      tr.appendChild(el('td', 'num ' + (growth === null || growth === undefined ? 'mut' : growth >= 0 ? 'pos' : 'neg'), pct(growth)));
      tr.appendChild(el('td', 'mut num', isLive ? 'trading' : age(r.age_days)));
      var bar = Math.max(2, Math.round((value / maxValue) * 100));
      tr.appendChild(el('td', 'value num', usd(value) + '<span class="bar" style="width:' + bar + '%"></span>'));
      tr.appendChild(el('td', 'mut num', isLive ? '—' : '$' + r.farm_cost_usd + ' · ' + r.farm_days + 'd'));
      tr.addEventListener('click', function () { open(r.slug); });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  // ---------- detail ----------
  function open(slug) { state.selected = slug; render(); }
  function close() { state.selected = null; render(); }

  function detail(row) {
    var box = el('div', 'detail');
    if (!row) return box;
    var inner = el('div', 'detail-inner');
    var isLive = row.token_status === 'trading';
    var head = el('div', 'detail-head');
    head.appendChild(el('div', '', '<h2>' + esc(row.name) + '</h2><p class="meta">' +
      '<span>' + esc(row.slug) + '</span><span>' + esc(row.category || 'untagged') + '</span><span>' +
      (isLive ? 'token trades' : 'records no token') + '</span></p>'));
    var x = el('button', 'closer', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'close the detail view');
    x.addEventListener('click', close);
    head.appendChild(x);
    inner.appendChild(head);

    if (isLive) {
      inner.appendChild(el('p', 'lead', 'This protocol\'s token trades: it is outside the pre-token board and shown at the market\'s own figures. ' +
        'Market cap ' + usd(row.mcap_usd) + ' against ' + usd(row.tvl_usd) + ' of TVL, a ratio of ' + (row.mcap_over_tvl === null ? 'n/a' : mult(row.mcap_over_tvl)) + '.'));
      inner.appendChild(el('p', 'meta', 'Seven-day change ' + pct(row.change_7d) + ' on ' + (row.chains || []).length + ' chains.'));
      box.appendChild(inner);
      return box;
    }

    inner.appendChild(el('p', 'lead', esc(row.thesis)));

    inner.appendChild(el('div', 'section-title', 'Value model <span>implied = TVL × base × growth × maturity × sector × chain</span>'));
    var factors = el('div', 'factors');
    var f = [
      { k: 'base', small: mult(D.model.base_multiple) + ' of TVL', v: usd(row.tvl_usd * D.model.base_multiple), w: 100, cls: '' },
      { k: 'growth', small: pct(row.change_7d) + ' in 7d', v: mult(row.growth_multiplier), w: Math.max(4, Math.min(100, row.growth_multiplier / 1.9 * 100)), cls: '' },
      { k: 'maturity', small: age(row.age_days) + ' with no token', v: mult(row.maturity_multiplier), w: row.maturity_multiplier * 100, cls: '' },
      { k: 'sector', small: esc(row.sector_label), v: mult(row.sector_multiplier), w: row.sector_multiplier / 1.35 * 100, cls: 'sector' },
      { k: 'chain', small: (row.chains || [])[0] + ' + breadth', v: mult(row.chain_multiplier), w: row.chain_multiplier / 1.24 * 100, cls: 'sector' },
    ];
    f.forEach(function (row2) {
      factors.appendChild(el('div', 'factor',
        '<span class="k">' + row2.k + '<small>' + row2.small + '</small></span>' +
        '<span class="track"><span class="fill ' + row2.cls + '" style="width:' + Math.round(Math.max(4, Math.min(100, row2.w))) + '%"></span></span>' +
        '<span class="v">' + row2.v + '</span>'));
    });
    inner.appendChild(factors);
    inner.appendChild(el('p', 'formula',
      'implied = ' + usd(row.tvl_usd) + ' × <b>' + D.model.base_multiple + '</b> × ' + row.growth_multiplier + ' × ' + row.maturity_multiplier +
      ' × ' + row.sector_multiplier + ' × ' + row.chain_multiplier + ' = <b>' + usd(row.implied_value_usd) + '</b>'));

    inner.appendChild(el('div', 'section-title', 'Farm plan <span>' + row.farm_steps.length + ' steps · $' + row.farm_cost_usd + ' · ' + row.farm_days + ' days</span>'));
    var plan = el('ol', 'plan');
    row.farm_steps.forEach(function (s) {
      var m = /^(.*?) Cost: (.*?)\. Time: (.*)\.$/s.exec(s);
      var text = m ? m[1] : s;
      var cost = m ? m[2] : '';
      var time = m ? m[3] : '';
      plan.appendChild(el('li', '', esc(text) + (m ? '<span class="cost">cost <em>' + esc(cost) + '</em> · time <em>' + esc(time) + '</em></span>' : '')));
    });
    inner.appendChild(plan);

    var ok = agrees(row);
    inner.appendChild(el('div', 'section-title', 'Checks <span>the gate\'s own rows, read on this protocol</span>'));
    var checks = el('ul', 'checks');
    [
      [true, 'watchlist coverage: ' + (watchSet[row.slug] ? 'on the watchlist' : 'early radar, below the floor') + ', so the board covers it'],
      [ok, 'value reproduces: ' + usd(recompute(row)) + ' recomputed from the row\'s factors'],
      [row.farm_steps.length >= 3 && row.farm_steps.length <= 12, 'farm steps: ' + row.farm_steps.length + ' of 3 to 12, each with a cost and a time'],
      [row.mcap_usd === null && row.gecko_id === null && row.symbol === null, 'no token recorded: mcap, CoinGecko id and ticker all empty'],
    ].forEach(function (c) {
      checks.appendChild(el('li', c[0] ? 'ok' : 'no', (c[0] ? '✓ ' : '✗ ') + c[1]));
    });
    inner.appendChild(checks);
    box.appendChild(inner);
    return box;
  }

  // ---------- render ----------
  function render() {
    try { paint(); } catch (e) { window.__renderError = (e && (e.stack || e.message)) || String(e); throw e; }
  }

  function paint() {
    app.innerHTML = '';
    masthead();
    controls();
    var boardWrap = el('div', 'board-wrap' + (state.selected ? ' open' : ''));
    var rows = visible();
    boardWrap.appendChild(table(rows));
    var chosen = null;
    PRE.concat(LIVE).forEach(function (r) { if (r.slug === state.selected) chosen = r; });
    boardWrap.appendChild(detail(chosen));
    app.appendChild(boardWrap);

    var check = PRE.filter(agrees).length;
    var foot = el('footer', 'foot');
    foot.innerHTML = '<span><b>' + esc(D.model_version) + '</b> · base ' + D.model.base_multiple + ' · growth weight ' + D.model.growth_weight +
      ' · maturity ' + D.model.maturity_floor + '–' + (D.model.maturity_floor + D.model.maturity_range) + ' over ' + D.model.maturity_days + ' days' +
      ' · sector table ' + 'keyed on DefiLlama category · chain breadth +' + D.model.breadth_step + '/chain</span>' +
      '<span class="sep">|</span><span>as of <b>' + esc(D.as_of) + '</b></span>' +
      '<span class="sep">|</span><span>model check <b>' + check + '/' + PRE.length + '</b> rows reproduce from their factors</span>' +
      '<span class="sep">|</span><span>source: ' + esc(D.source) + '</span>';
    app.appendChild(foot);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.selected) close();
    }, { once: true });
  }

  // The page's own hook, so a reviewer (or a screenshot run) can open a protocol or filter the board.
  window.radarUI = {
    select: function (slug) { open(slug); },
    close: close,
    filter: function (patch) {
      Object.keys(patch || {}).forEach(function (k) { if (k in state) state[k] = patch[k]; });
      render();
    },
    state: function () { return { tab: state.tab, q: state.q, category: state.category, chain: state.chain, sort: state.sort, dir: state.dir, selected: state.selected, shown: visible().length }; }
  };

  render();
})();
