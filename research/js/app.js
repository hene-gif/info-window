const REPO_NEW = 'https://github.com/hene-gif/info-window/issues/new';
const ISSUES_API = 'https://api.github.com/repos/hene-gif/info-window/issues';
const LABEL = 'research-feedback';
const SITE = 'https://hene-gif.github.io/info-window/research/';

const STATUS_CLASS = {
  通过: 'is-pass',
  被否: 'is-reject',
  未通过: 'is-fail',
  待测: 'is-wait',
  未能检验: 'is-na',
};

const state = {
  ready: false,
  fatal: '',
  overview: null,
  items: [],
  reviews: null,
  docs: [],
  theory: null,
  meta: null,
  issues: null,
  issuesError: '',
  route: parseRoute(),
  filter: {
    q: '',
    status: 'all',
    round: 'all',
    family: 'all',
    evidence: 'all',
  },
};

const $ = (id) => document.getElementById(id);
const main = $('main');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

window.addEventListener('hashchange', () => {
  const prev = state.route;
  state.route = parseRoute();
  if (state.route.name === 'progress') {
    syncFilterFromRoute();
  }
  render({ resetScroll: prev.name !== state.route.name || prev.id !== state.route.id });
});

boot();

async function boot() {
  tickClock();
  setInterval(tickClock, 30000);
  try {
    const [overview, pack, reviews, docs, theory] = await Promise.all([
      fetchJson('data/overview.json'),
      fetchJson('data/items.json'),
      fetchJson('data/reviews.json'),
      fetchJson('data/docs.json'),
      fetchJson('data/theory.json'),
    ]);
    state.overview = overview;
    state.items = Array.isArray(pack.items) ? pack.items : [];
    state.reviews = reviews;
    state.docs = docs.docs || [];
    state.theory = theory;
    state.meta = docs;
    state.ready = true;
    syncFilterFromRoute();
  } catch {
    state.fatal = '研究数据没有打开。可以稍后再试。';
  }
  render({ resetScroll: true });
  loadIssues();
}

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const url = new URL(raw.startsWith('/') ? raw : `/${raw}`, 'https://info-window.local');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  return {
    name: parts[0] || 'home',
    id: parts[1] || '',
    item: url.searchParams.get('item') || '',
    q: url.searchParams.get('q') || '',
    status: url.searchParams.get('status') || 'all',
    round: url.searchParams.get('round') || 'all',
    family: url.searchParams.get('family') || 'all',
    evidence: url.searchParams.get('evidence') || 'all',
    node: url.searchParams.get('node') || '',
    edge: url.searchParams.get('edge') || '',
  };
}

function syncFilterFromRoute() {
  const r = state.route;
  state.filter = {
    q: r.q || '',
    status: r.status || 'all',
    round: r.round || 'all',
    family: r.family || 'all',
    evidence: r.evidence || 'all',
  };
}

async function fetchJson(path) {
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function loadIssues() {
  try {
    const url = `${ISSUES_API}?labels=${encodeURIComponent(LABEL)}&state=all&per_page=50&sort=updated`;
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    state.issues = Array.isArray(data) ? data.filter((row) => !row.pull_request) : [];
    state.issuesError = '';
  } catch {
    state.issues = [];
    state.issuesError = '暂时读不到 GitHub 上的意见。可以稍后重试，或直接点「写意见」。';
  }
  if (state.route.name === 'feedback') render();
}

function render(options = {}) {
  renderNav();
  if (state.fatal) {
    document.title = '研究台';
    main.innerHTML = `<p class="status">${esc(state.fatal)}</p>`;
    return;
  }
  if (!state.ready) {
    main.innerHTML = '<p class="status">正在打开…</p>';
    return;
  }
  const view = pageView();
  document.title = view.title;
  main.innerHTML = view.html;
  bindPage();
  if (options.resetScroll) {
    if (state.route.item) {
      const node = main.querySelector(`[data-item="${CSS.escape(state.route.item)}"]`);
      if (node) node.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      else window.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }
  }
}

function renderNav() {
  const name = state.route.name === 'docs' ? 'docs' : (state.route.name || 'home');
  document.querySelectorAll('[data-nav]').forEach((tab) => {
    const on = tab.getAttribute('data-nav') === name;
    tab.classList.toggle('is-on', on);
    if (on) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  const tabs = $('tabs');
  const ink = tabs.querySelector('.tab-ink');
  const on = tabs.querySelector('.tab.is-on');
  if (!ink || !on || !on.offsetWidth) return;
  const first = !ink.style.width;
  if (first) ink.style.transition = 'none';
  ink.style.width = `${on.offsetWidth}px`;
  ink.style.transform = `translateX(${on.offsetLeft}px)`;
  if (first) {
    void ink.offsetWidth;
    ink.style.transition = '';
  }
}

function pageView() {
  const { name, id } = state.route;
  if (name === 'map') return { html: mapPage(), title: '理论地图 · 研究台' };
  if (name === 'progress') return { html: progressPage(), title: '进展 · 研究台' };
  if (name === 'review') return { html: reviewPage(), title: '评估 · 研究台' };
  if (name === 'feedback') return { html: feedbackPage(), title: '修改意见 · 研究台' };
  if (name === 'docs') return { html: docsPage(id), title: '文档 · 研究台' };
  return { html: homePage(), title: '研究台' };
}

function homePage() {
  const o = state.overview;
  const counts = countItems(state.items);
  const layers = o.layers.map((layer) => `
    <article class="card">
      <p class="layer-id">${esc(layer.name)}</p>
      <p class="vars">${esc(layer.vars)}</p>
      <p class="plain">${esc(layer.plain)}</p>
      <p class="plain">主要影响：${esc(layer.affects)}</p>
    </article>`).join('');
  const team = o.team.map((person) => `
    <div class="person"><i class="dot" aria-hidden="true"></i>
      <div><strong>${esc(person.name)}</strong><span>${esc(person.source)}</span></div>
    </div>`).join('');
  const roles = (o.rolesInDocs || []).map((role) => `
    <div class="person"><i class="dot" aria-hidden="true"></i>
      <div><strong>${esc(role.name)}</strong><span>${esc(role.note)}</span></div>
    </div>`).join('');
  const uses = o.howToUse.map((row) => `<li>${esc(row.text)}</li>`).join('');
  const tags = o.tagLegend.map((tag) => `
    <article class="card">
      <h2>〔${esc(tag.tag)}〕</h2>
      <p class="plain">${esc(tag.plain)}</p>
      <p class="plain">${esc(tag.use)}</p>
    </article>`).join('');
  const images = (o.images || []).map((img) => `
    <figure class="hero-img">
      <img src="${esc(img.file)}" alt="${esc(img.alt)}">
      <figcaption>${esc(img.alt)} · ${esc(img.from)}</figcaption>
    </figure>`).join('');

  return `
    <p class="kicker">全球股市研究</p>
    <h1 class="page-title">${esc(o.title)}</h1>
    <p class="lede">${esc(o.headline.text)}</p>
    <p class="lede">${esc(o.headline.moneyFlow)}</p>
    <div class="meta-row">
      <span class="chip">截至 ${esc(o.asOf)} ${esc(o.timezone)}</span>
      <span class="chip">当前：${esc(o.currentRound.name)} · ${esc(o.currentRound.status)}</span>
      <span class="chip">上一轮：${esc(o.currentRound.previous.name)} ${esc(o.currentRound.previous.status)}</span>
      <span class="chip">结论以修订版为准</span>
    </div>
    ${theoryTeaser()}
    <div class="stat-grid">
      <div class="stat"><b>${counts.total}</b><span>已收录检验</span></div>
      <div class="stat"><b>${counts['通过']}</b><span>通过</span></div>
      <div class="stat"><b>${counts['被否']}</b><span>被否</span></div>
      <div class="stat"><b>${counts['未通过'] + counts['未能检验']}</b><span>未通过 / 未能检验</span></div>
    </div>
    <section class="focus">
      <p class="kicker">研究重点</p>
      <p>主：${esc(o.focus.primary)}。次：${esc(o.focus.secondary)}。${esc(o.focus.note)}</p>
    </section>
    <section class="sec" style="margin-top:22px">
      <h2>分层驱动</h2>
      <p class="muted" style="margin:6px 0 0">从上往下看。越上层影响越广，越下层越有个性。</p>
      <div class="grid layers">${layers}</div>
      <ul class="use-list">${o.layerRules.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul>
    </section>
    <section class="grid two" style="margin-top:18px">
      <article class="card">
        <h2>两个维度</h2>
        ${(o.dimensions || []).map((dim) => `<p class="vars" style="margin-top:10px">${esc(dim.title)}</p><p class="plain">${esc(dim.items.join('、'))} · ${esc(dim.state)}</p>`).join('')}
      </article>
      <article class="card">
        <h2>覆盖范围</h2>
        <p class="plain">市场：${esc(o.coverage.markets.join('、'))}</p>
        <p class="plain">宏观：${esc(o.coverage.macro.join('、'))}</p>
        <p class="plain">${esc(o.coverage.exclude)}</p>
      </article>
    </section>
    <section class="sec" style="margin-top:22px">
      <h2>标签怎么读</h2>
      <div class="grid layers">${tags}</div>
    </section>
    <section class="grid two" style="margin-top:18px">
      <article class="card">
        <h2>团队</h2>
        <div class="team">${team}</div>
      </article>
      <article class="card">
        <h2>文档里出现的其他角色</h2>
        <div class="team">${roles}</div>
      </article>
    </section>
    <section class="sec" style="margin-top:22px">
      <h2>这套体系现在怎么用</h2>
      <ul class="use-list">${uses}</ul>
    </section>
    <section class="sec" style="margin-top:22px">
      <h2>第二轮</h2>
      <p class="plain">${esc(o.currentRound.mainline || o.currentRound.lockedBy)}</p>
      ${o.currentRound.families ? `<p class="plain">C 家族 N=${esc(o.currentRound.families.C.n)}（${esc((o.currentRound.families.C.items || []).join('、'))}），Holm 最严门槛 ${esc(o.currentRound.families.C.holmStrictest)}。L 家族 N=${esc(o.currentRound.families.L.n)}，门槛 ${esc(o.currentRound.families.L.threshold)}。</p>` : ''}
      ${o.currentRound.progress ? `<p class="plain">进度：${esc(o.currentRound.progress)}</p>` : ''}
      <p class="plain">${esc(o.currentRound.lockedBy)}</p>
      <p class="plain">${esc(o.currentRound.rule)}</p>
    </section>
    ${images}
    <p class="note-box">${esc(o.disclaimer)} 来源：${esc(o.headline.source)}</p>
  `;
}

function progressPage() {
  const rows = filteredItems();
  const cr = (state.overview && state.overview.currentRound) || {};
  const options = (values, current) => values.map((value) =>
    `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(value === 'all' ? '全部' : value)}</option>`
  ).join('');
  const rounds = ['all', ...uniq(state.items.map((item) => item.round))];
  const families = ['all', ...uniq(state.items.map((item) => item.family))];
  const statuses = ['all', ...uniq(state.items.map((item) => item.status))];
  const evidences = ['all', ...uniq(state.items.map((item) => item.evidence).filter(Boolean))];
  return `
    <p class="kicker">${esc(cr.previous ? `${cr.previous.name}${cr.previous.status}` : '第一轮已完成')} · ${esc(cr.name || '第二轮')} · ${esc(cr.status || '')}</p>
    <h1 class="page-title">进展</h1>
    <p class="lede">每一条都来自材料里的编号检验。状态以修订版为准。没有写明主人的，这里就空着。标了「探索性」的不占 N，不能当成正式结论。</p>
    ${cr.progress ? `<p class="note-box">${esc(cr.progress)}</p>` : ''}
    <form class="filters" id="filters">
      <input type="search" id="q" placeholder="编号、标题、问题" value="${esc(state.filter.q)}" autocomplete="off">
      <select id="status" aria-label="状态">${options(statuses, state.filter.status)}</select>
      <select id="round" aria-label="轮次">${options(rounds, state.filter.round)}</select>
      <select id="family" aria-label="组别">${options(families, state.filter.family)}</select>
      <select id="evidence" aria-label="证据">${options(evidences, state.filter.evidence)}</select>
    </form>
    <p class="count">${rows.length} / ${state.items.length} 条</p>
    <div class="list">${rows.map((item) => itemCard(item)).join('') || '<p class="empty">没有符合筛选的条目。</p>'}</div>
  `;
}

function itemCard(item, extra = '') {
  const owner = item.owner ? `<span class="tag">${esc(item.owner)}</span>` : '';
  const stats = Array.isArray(item.stats) && item.stats.length
    ? `<div class="stats">${item.stats.map((row) => `<div><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join('')}</div>`
    : '';
  const mapping = item.mapping ? `<p class="note">未能干净对应：${esc(item.mapping)}</p>` : '';
  return `
    <article class="item${item.exploratory ? ' is-explore' : ''}" data-item="${esc(item.id)}" id="item-${esc(item.id)}">
      <div class="item-top">
        <span class="code">${esc(item.code)}</span>
        <h3>${esc(item.title)}</h3>
      </div>
      <p class="question">${esc(item.question)}</p>
      <div class="tags">
        ${statusTag(item.status)}
        ${item.exploratory ? '<span class="tag is-explore">探索性</span>' : ''}
        ${item.evidence ? `<span class="tag is-rel">〔${esc(item.evidence)}〕</span>` : ''}
        <span class="tag">${esc(item.round)}</span>
        <span class="tag">${esc(item.family)}</span>
        ${owner}
      </div>
      ${item.exploratory ? '<p class="note explore-note">探索性：偏离清单或预先登记为探索项，不占 N，不能当成正式结论。</p>' : ''}
      ${item.statusNote ? `<p class="note">${esc(item.statusNote)}</p>` : ''}
      ${item.detail ? `<p class="detail">${esc(item.detail)}</p>` : ''}
      ${stats}
      ${mapping}
      ${extra}
    </article>`;
}

function reviewPage() {
  const o = state.reviews;
  const notes = (o.reviewerNotes || []).map((note) => `
    <article class="card">
      <h2>${esc(note.from)} · ${esc(note.itemId)}</h2>
      <p class="plain">${esc(note.text)}</p>
      <p class="plain">${esc(note.source)}</p>
    </article>`).join('');
  const rows = (o.items || []).map((row) => `
    <article class="review" data-item="${esc(row.itemId)}">
      <h3>${esc(row.code)} · ${esc(row.title)}</h3>
      <div class="diff">
        <div class="pane"><p class="lbl">原版</p><p>${esc(row.original)}</p></div>
        <div class="pane"><p class="lbl">修订版</p><p>${esc(row.revised)}</p></div>
      </div>
      <p class="changed">${esc(row.whatChanged)}</p>
    </article>`).join('');
  return `
    <p class="kicker">对照原版与修订版</p>
    <h1 class="page-title">评估</h1>
    <p class="lede">${esc(o.note)}</p>
    <p class="muted" style="margin-top:8px">${esc(o.meta.revisedHeader)}。${esc(o.meta.numbers)}</p>
    <div class="grid" style="margin-top:16px">${notes}</div>
    ${rows}
  `;
}

function feedbackPage() {
  const rows = filteredItems();
  const issues = renderIssues();
  return `
    <p class="kicker">意见会变成 GitHub Issue</p>
    <h1 class="page-title">修改意见</h1>
    <p class="lede">点「写意见」，会打开一条预先填好的 GitHub 新议题，标签是 research-feedback。妮可不用写代码，提交后会出现在下面的列表里。</p>
    <form class="filters" id="filters">
      <input type="search" id="q" placeholder="编号、标题" value="${esc(state.filter.q)}" autocomplete="off">
    </form>
    <section class="sec" style="margin-top:8px">
      <h2>已有意见</h2>
      ${issues}
    </section>
    <p class="count" style="margin-top:18px">给下面任一检验写意见</p>
    <div class="list">${rows.map((item) => itemCard(item, writeButton(item))).join('')}</div>
  `;
}

function writeButton(item) {
  return `<div class="row-actions"><a class="btn btn-main" href="${esc(issueHref(item))}" target="_blank" rel="noopener noreferrer">写意见</a></div>`;
}

function issueHref(item) {
  const title = `研究意见：${item.code} ${item.title}`;
  const body = [
    `## 条目`,
    `${item.code} · ${item.title}`,
    ``,
    `问题：${item.question}`,
    `当前状态：${item.status}${item.evidence ? ` · 〔${item.evidence}〕` : ''}`,
    `轮次：${item.round} · ${item.family}`,
    ``,
    `## 意见`,
    ``,
    ``,
    `## 来源`,
    `${SITE}#/feedback?item=${encodeURIComponent(item.id)}`,
  ].join('\n');
  const url = new URL(REPO_NEW);
  url.searchParams.set('labels', LABEL);
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  return url.toString();
}

function renderIssues() {
  if (state.issues == null) return '<p class="empty">正在读取 GitHub…</p>';
  if (state.issuesError) return `<p class="empty">${esc(state.issuesError)}</p>`;
  if (!state.issues.length) return '<p class="empty">还没有 research-feedback 意见。如果标签还不存在，第一次提交时 GitHub 可能不会自动加上，需要仓库管理员建好这个标签。</p>';
  return state.issues.map((issue) => {
    const when = issue.updated_at ? issue.updated_at.slice(0, 10) : '';
    const stateLabel = issue.state === 'open' ? '未关' : '已关';
    return `<a class="issue" href="${esc(issue.html_url)}" target="_blank" rel="noopener noreferrer">
      <span class="ttl">#${esc(issue.number)} ${esc(issue.title)}</span>
      <span class="who">${esc(stateLabel)} · ${esc(issue.user?.login || '')} · ${esc(when)}</span>
    </a>`;
  }).join('');
}

function docsPage(id) {
  const current = state.docs.find((doc) => doc.id === id) || state.docs[0];
  const nav = state.docs.map((doc) =>
    `<a href="#/docs/${encodeURIComponent(doc.id)}" class="${doc.id === current.id ? 'is-on' : ''}">${esc(doc.kind)}</a>`
  ).join('');
  if (!current) return '<p class="empty">还没有文档。</p>';
  return `
    <p class="kicker">原文</p>
    <h1 class="page-title">${esc(current.title)}</h1>
    <p class="lede">${esc(current.blurb)}</p>
    <nav class="doc-nav">${nav}</nav>
    <article class="md" id="md"><p class="status">正在打开原文…</p></article>
  `;
}

function bindPage() {
  const form = $('filters');
  if (form) {
    form.addEventListener('input', onFilter);
    form.addEventListener('change', onFilter);
  }
  if (state.route.name === 'docs') loadDoc();
  if (state.route.name === 'map') bindMap();
}

function onFilter() {
  state.filter = {
    q: ($('q')?.value || '').trim(),
    status: $('status')?.value || state.filter.status || 'all',
    round: $('round')?.value || state.filter.round || 'all',
    family: $('family')?.value || state.filter.family || 'all',
    evidence: $('evidence')?.value || state.filter.evidence || 'all',
  };
  const next = filterHash(state.route.name);
  if (location.hash !== next) history.replaceState(null, '', next);
  state.route = parseRoute();
  const list = main.querySelector('.list');
  const count = main.querySelector('.count');
  const rows = filteredItems();
  if (list) {
    const extra = state.route.name === 'feedback' ? (item) => writeButton(item) : () => '';
    list.innerHTML = rows.map((item) => itemCard(item, extra(item))).join('') || '<p class="empty">没有符合筛选的条目。</p>';
  }
  if (count && state.route.name === 'progress') count.textContent = `${rows.length} / ${state.items.length} 条`;
}

function filterHash(name) {
  const params = new URLSearchParams();
  const f = state.filter;
  if (f.q) params.set('q', f.q);
  if (f.status && f.status !== 'all') params.set('status', f.status);
  if (f.round && f.round !== 'all') params.set('round', f.round);
  if (f.family && f.family !== 'all') params.set('family', f.family);
  if (f.evidence && f.evidence !== 'all') params.set('evidence', f.evidence);
  const query = params.toString();
  return `#/${name}${query ? `?${query}` : ''}`;
}

function filteredItems() {
  const f = state.filter;
  const q = f.q.toLowerCase();
  return state.items.filter((item) => {
    if (f.status !== 'all' && item.status !== f.status) return false;
    if (f.round !== 'all' && item.round !== f.round) return false;
    if (f.family !== 'all' && item.family !== f.family) return false;
    if (f.evidence !== 'all' && item.evidence !== f.evidence) return false;
    if (!q) return true;
    const hay = [item.code, item.title, item.question, item.detail, item.statusNote, item.owner, item.family]
      .filter(Boolean).join('\n').toLowerCase();
    return hay.includes(q);
  });
}

async function loadDoc() {
  const box = $('md');
  if (!box) return;
  const current = state.docs.find((doc) => doc.id === state.route.id) || state.docs[0];
  if (!current) return;
  try {
    const response = await fetch(new URL(`docs/${encodeURI(current.file)}`, document.baseURI), { cache: 'no-cache' });
    if (!response.ok) throw new Error('doc');
    const text = await response.text();
    box.innerHTML = window.renderMarkdown(text, { imgBase: 'docs/' });
  } catch {
    box.innerHTML = '<p class="empty">这篇原文没有打开。</p>';
  }
}

function statusTag(status) {
  return `<span class="tag ${STATUS_CLASS[status] || ''}">${esc(status)}</span>`;
}

function countItems(items) {
  const counts = { total: items.length, 通过: 0, 被否: 0, 未通过: 0, 待测: 0, 未能检验: 0 };
  for (const item of items) {
    if (counts[item.status] != null) counts[item.status] += 1;
  }
  return counts;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function tickClock() {
  const node = $('clock');
  if (!node) return;
  const parts = new Intl.DateTimeFormat('zh-Hans-CN', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  node.textContent = `${pick('hour')}:${pick('minute')}`;
}

function theoryTeaser() {
  const t = state.theory;
  if (!t || !t.thesis) return '';
  return `
    <section class="tease">
      <p class="kicker">市场怎么连在一起</p>
      <h2>${esc(t.thesis.title)}</h2>
      <p>${esc(t.thesis.lead)}</p>
      ${thesisTable(t.thesis)}
      <div class="row-actions"><a class="btn btn-main" href="#/map">打开理论地图</a></div>
    </section>`;
}

function thesisTable(thesis) {
  const rows = (thesis.rows || []).map((row) => `
    <tr><td>${esc(row.market)}</td><td>${esc(row.how)}</td><td>${esc(row.cost)}</td></tr>`).join('');
  return `
    <div class="sheet-wrap">
      <table class="sheet-table">
        <thead><tr><th>市场</th><th>怎样吸收冲击</th><th>代价出现在哪里</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${thesis.note ? `<p class="note-box">${esc(thesis.note)}</p>` : ''}`;
}

function mapPage() {
  const t = state.theory;
  if (!t) return '<p class="status">理论地图没有打开。</p>';
  const mode = mapMode();
  const lay = t.layouts[mode];
  const nodes = t.nodes || [];
  const edges = t.edges || [];
  const counts = edgeStatusCounts(edges);
  const chips = Object.entries(counts).map(([status, n]) =>
    `<span class="chip">${esc(status)} ${n}</span>`).join('');
  const focus = mapFocus();
  return `
    <p class="kicker">第二轮总主线</p>
    <h1 class="page-title">理论地图</h1>
    <p class="lede">${esc(t.thesis.title)}。${esc(t.thesis.lead)}点一个市场，或点一条线，看它对应的检验、状态和假说。</p>
    <div class="meta-row">${chips}<span class="chip">状态跟着检验数据变</span></div>
    ${thesisTable(t.thesis)}
    ${judgeTable(t.thesis)}
    ${legendHtml()}
    <div class="map-layout">
      <div class="map-canvas">
        <div class="map-frame">
          <div class="map-scroll">
            <div class="map-board" style="--map-w:${lay.w};--map-h:${lay.h}">
              ${mapSvg(t, mode)}
              ${(t.zones || []).map((zone) => zoneTag(zone, mode, lay)).join('')}
              ${nodes.map((node) => nodeButton(node, mode, lay, focus)).join('')}
              ${edgeChips(edges, mode, lay)}
            </div>
          </div>
        </div>
      </div>
      <aside class="map-side" id="map-side">${mapDetail(focus)}</aside>
      <section class="rel-list">
        <h2>登记的关系</h2>
        <div class="rel-grid">${edges.map((edge) => relButton(edge, focus)).join('')}</div>
      </section>
    </div>`;
}

function judgeTable(thesis) {
  const rows = (thesis.judgeRule || []).map((row) =>
    `<tr><td>${esc(row.when)}</td><td>${esc(row.then)}</td></tr>`).join('');
  if (!rows) return '';
  return `
    <div class="sheet-wrap">
      <table class="sheet-table">
        <thead><tr><th>C9、C6、L1 合起来</th><th>主线判定</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function legendHtml() {
  const items = [
    ['is-pass', '通过'],
    ['is-reject', '被否'],
    ['is-fail', '未通过'],
    ['is-wait', '待测'],
    ['is-na', '未能检验'],
  ];
  return `
    <div class="legend" aria-label="线的颜色">
      <b>线的颜色是这条检验现在的状态</b>
      ${items.map(([cls, name]) => `<span class="legend-item"><i class="swatch ${cls}" aria-hidden="true"></i>${esc(name)}</span>`).join('')}
      <span class="legend-item"><i class="swatch is-explore" aria-hidden="true"></i>探索性</span>
      <span class="legend-note">探索性用紫色线，并标「探索性」。不占 N，不能当成正式结论。证据另标〔因果〕〔相关〕〔待验证〕。「判定」是总主线用来下结论的 C9、C6、L1。</span>
    </div>`;
}

function mapMode() {
  return mapMq.matches ? 'narrow' : 'wide';
}

function mapFocus() {
  if (state.route.name !== 'map') return { kind: '', id: '' };
  if (state.route.edge) return { kind: 'edge', id: state.route.edge };
  if (state.route.node) return { kind: 'node', id: state.route.node };
  return { kind: '', id: '' };
}

function itemById(id) {
  return state.items.find((item) => item.id === id) || null;
}

function edgeItem(edge) {
  return itemById(edge.itemId);
}

function edgeLook(edge) {
  const item = edgeItem(edge);
  const status = item ? item.status : '';
  const exploratory = Boolean(item && item.exploratory);
  const cls = exploratory ? 'is-explore' : (STATUS_CLASS[status] || '');
  return { item, status, exploratory, cls };
}

function edgeStatusCounts(edges) {
  const counts = {};
  for (const edge of edges) {
    const status = edgeLook(edge).status || '缺失';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function edgeNodeIds(edge, mode) {
  const spec = edge[mode] || {};
  const ids = new Set(edge.also || []);
  if (spec.loop) ids.add(spec.loop);
  if (spec.from) ids.add(spec.from);
  if (spec.to) ids.add(spec.to);
  for (const path of spec.paths || []) {
    if (path.from) ids.add(path.from);
    if (path.to) ids.add(path.to);
  }
  return ids;
}

function hotEdgeIds(focus, edges, mode) {
  if (!focus.id) return null;
  if (focus.kind === 'edge') return new Set([focus.id]);
  if (focus.kind === 'node') {
    return new Set(edges.filter((edge) => edgeNodeIds(edge, mode).has(focus.id)).map((edge) => edge.id));
  }
  return null;
}

function hotNodeIds(focus, edges, mode) {
  if (!focus.id) return null;
  if (focus.kind === 'node') {
    const ids = new Set([focus.id]);
    for (const edge of edges) {
      if (edgeNodeIds(edge, mode).has(focus.id)) {
        for (const id of edgeNodeIds(edge, mode)) ids.add(id);
      }
    }
    return ids;
  }
  if (focus.kind === 'edge') {
    const edge = edges.find((row) => row.id === focus.id);
    return edge ? edgeNodeIds(edge, mode) : new Set();
  }
  return null;
}

function nodeById(id) {
  return (state.theory.nodes || []).find((node) => node.id === id) || null;
}

function mapSvg(theory, mode) {
  const lay = theory.layouts[mode];
  const focus = mapFocus();
  const edges = theory.edges || [];
  const hot = hotEdgeIds(focus, edges, mode);
  const zones = (theory.zones || []).map((zone) => {
    const box = zone[mode];
    if (!box || box.w <= 0 || box.h <= 0) return '';
    return `<rect class="zone" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="16"></rect>`;
  }).join('');
  const wires = edges.map((edge) => edgeWires(edge, mode, hot)).join('');
  return `
    <svg class="map-svg" viewBox="0 0 ${lay.w} ${lay.h}" aria-hidden="true">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 1.4 L 8.2 5 L 0 8.6 Z" fill="context-stroke"></path>
        </marker>
      </defs>
      ${zones}
      ${wires}
    </svg>`;
}

function edgeWires(edge, mode, hot) {
  const look = edgeLook(edge);
  const dim = hot && !hot.has(edge.id) ? ' is-dim' : '';
  const on = hot && hot.has(edge.id) ? ' is-hot' : '';
  const cls = `wire ${look.cls}${dim}${on}`;
  return edgePolys(edge, mode).map((pts) => {
    const d = toPath(pts);
    return `<path class="wire-halo${dim}" d="${d}"></path><path class="${cls}" d="${d}" marker-end="url(#arrow)"></path><path class="wire-hit" data-edge="${esc(edge.id)}" d="${d}"></path>`;
  }).join('');
}

function edgePolys(edge, mode) {
  const spec = edge[mode] || {};
  if (spec.loop) {
    const node = nodeById(spec.loop);
    if (!node || !node[mode]) return [];
    const g = loopGeometry(node[mode], spec.side || 'left', spec.reach || 72);
    return [sampleCubic(g.start, g.c1, g.c2, g.end, 0, 1)];
  }
  const paths = spec.paths || (spec.from && spec.to ? [spec] : []);
  return paths.map((path) => {
    const a = nodeById(path.from);
    const b = nodeById(path.to);
    if (!a || !b || !a[mode] || !b[mode]) return [];
    const c = controlPoint(a[mode], b[mode], path.bend, path.c);
    return sampleQuad(a[mode], c, b[mode], 0.2, 0.8);
  }).filter((pts) => pts.length);
}

function controlPoint(a, b, bend, c) {
  if (Array.isArray(c)) return { x: c[0], y: c[1] };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const n = bend || 0;
  return { x: (a.x + b.x) / 2 + (-dy / len) * n, y: (a.y + b.y) / 2 + (dx / len) * n };
}

function sampleQuad(a, c, b, t0, t1) {
  const pts = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = t0 + ((t1 - t0) * i) / 24;
    const u = 1 - t;
    pts.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    });
  }
  return pts;
}

function sampleCubic(p0, p1, p2, p3, t0, t1) {
  const pts = [];
  for (let i = 0; i <= 28; i += 1) {
    const t = t0 + ((t1 - t0) * i) / 28;
    const u = 1 - t;
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return pts;
}

function loopGeometry(pos, side, reach) {
  const { x, y } = pos;
  if (side === 'down') {
    return {
      start: { x: x - 28, y: y + 16 },
      c1: { x: x - 78, y: y + reach },
      c2: { x: x + 78, y: y + reach },
      end: { x: x + 28, y: y + 16 },
      label: { x, y: y + reach },
    };
  }
  const dir = side === 'right' ? 1 : -1;
  return {
    start: { x: x + dir * 22, y: y - 16 },
    c1: { x: x + dir * reach, y: y - 52 },
    c2: { x: x + dir * reach, y: y + 56 },
    end: { x: x + dir * 22, y: y + 20 },
    label: { x: x + dir * reach, y },
  };
}

function toPath(pts) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function zoneTag(zone, mode, lay) {
  const box = zone[mode];
  if (!box || !zone.label || box.w <= 0) return '';
  const left = ((box.x + 12) / lay.w) * 100;
  const top = ((box.y + 10) / lay.h) * 100;
  return `<div class="zone-tag" style="left:${left}%;top:${top}%">${esc(zone.label)}</div>`;
}

function nodeButton(node, mode, lay, focus) {
  const pos = node[mode];
  if (!pos) return '';
  const left = (pos.x / lay.w) * 100;
  const top = (pos.y / lay.h) * 100;
  const edges = state.theory.edges || [];
  const near = hotNodeIds(focus, edges, mode);
  const on = focus.kind === 'node' && focus.id === node.id;
  const cls = `${on ? ' is-on' : ''}${near && near.has(node.id) && !on ? ' is-near' : ''}`;
  const role = node.role ? `<span class="m-role">${esc(node.role)}</span>` : '';
  const sub = node.sub ? `<span class="m-sub">${esc(node.sub)}</span>` : '';
  return `<button type="button" class="m-node${cls}" data-node="${esc(node.id)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" aria-pressed="${on ? 'true' : 'false'}">${role}<strong>${esc(node.name)}</strong>${sub}</button>`;
}

function edgeChips(edges, mode, lay) {
  const focus = mapFocus();
  return edges.map((edge) => {
    const { x, y } = labelPoint(edge, mode);
    const look = edgeLook(edge);
    const left = (x / lay.w) * 100;
    const top = (y / lay.h) * 100;
    const on = focus.kind === 'edge' && focus.id === edge.id;
    const code = look.item ? look.item.code : edge.id;
    const badge = edge.placeNote === '进入总主线判定'
      ? '<span class="tag is-judge">判定</span>'
      : (edge.placeNote === '只作旁证，不进入判定' ? '<span class="tag is-judge">旁证</span>' : '');
    return `<button type="button" class="edge-chip${on ? ' is-on' : ''}${look.exploratory ? ' is-explore' : ''}" data-edge="${esc(edge.id)}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" aria-pressed="${on ? 'true' : 'false'}">
      <span class="edge-kicker"><b>${esc(code)}</b>${statusTag(look.status || '缺失')}${look.item && look.item.evidence ? `<span class="tag is-rel">〔${esc(look.item.evidence)}〕</span>` : ''}${look.exploratory ? '<span class="tag is-explore">探索性</span>' : ''}${badge}</span>
      <span class="edge-short">${esc(edge.short)}</span>
    </button>`;
  }).join('');
}

function labelPoint(edge, mode) {
  const spec = edge[mode] || {};
  if (spec.label) return { x: spec.label.x, y: spec.label.y };
  if (spec.loop) {
    const node = nodeById(spec.loop);
    if (!node || !node[mode]) return { x: 0, y: 0 };
    return loopGeometry(node[mode], spec.side || 'left', spec.reach || 72).label;
  }
  const paths = spec.paths || (spec.from ? [spec] : []);
  const mids = paths.map((path) => {
    const a = nodeById(path.from);
    const b = nodeById(path.to);
    if (!a || !b || !a[mode] || !b[mode]) return null;
    const c = controlPoint(a[mode], b[mode], path.bend, path.c);
    const t = 0.5;
    const u = 1 - t;
    return {
      x: u * u * a[mode].x + 2 * u * t * c.x + t * t * b[mode].x,
      y: u * u * a[mode].y + 2 * u * t * c.y + t * t * b[mode].y,
    };
  }).filter(Boolean);
  if (!mids.length) return { x: 0, y: 0 };
  return {
    x: mids.reduce((sum, p) => sum + p.x, 0) / mids.length,
    y: mids.reduce((sum, p) => sum + p.y, 0) / mids.length,
  };
}

function mapDetail(focus) {
  const t = state.theory;
  if (focus.kind === 'edge') {
    const edge = (t.edges || []).find((row) => row.id === focus.id);
    if (!edge) return '<p class="empty">没有这条线。</p>';
    return edgeDetail(edge);
  }
  if (focus.kind === 'node') {
    const node = nodeById(focus.id);
    if (!node) return '<p class="empty">没有这个市场。</p>';
    return nodeDetail(node);
  }
  return `
    <p class="kicker">怎么读这张图</p>
    <h2>${esc(t.thesis.title)}</h2>
    <p class="question">${esc(t.thesis.lead)}</p>
    <p class="detail">${esc(t.thesis.note)}点一个市场，或点一条线。</p>`;
}

function edgeDetail(edge) {
  const look = edgeLook(edge);
  const item = look.item;
  const code = item ? item.code : edge.id;
  const title = item ? item.title : edge.short;
  const ends = [...edgeNodeIds(edge, mapMode())].map((id) => nodeById(id)?.name).filter(Boolean);
  return `
    <p class="kicker">${esc(code)}${item ? ` · ${esc(item.family)} · ${esc(item.round)}` : ''}</p>
    <h2>${esc(title)}</h2>
    <div class="tags" style="margin-top:8px">
      ${statusTag(look.status || '缺失')}
      ${look.exploratory ? '<span class="tag is-explore">探索性</span>' : ''}
      ${item && item.evidence ? `<span class="tag is-rel">〔${esc(item.evidence)}〕</span>` : ''}
      ${edge.placeNote ? `<span class="tag is-judge">${esc(edge.placeNote)}</span>` : ''}
    </div>
    <div class="field"><p class="lbl">关系</p><p>${esc(edge.short)}</p></div>
    <div class="field"><p class="lbl">假说</p><p>${esc(edge.hypothesis)}</p></div>
    ${item ? `<div class="field"><p class="lbl">检验的问题</p><p>${esc(item.question)}</p></div>` : '<p class="note">进展数据里没有这条检验。</p>'}
    ${item && item.theory ? `<div class="field"><p class="lbl">理论</p><p>${esc(item.theory)}</p></div>` : ''}
    ${item && item.statusNote ? `<p class="note">${esc(item.statusNote)}</p>` : ''}
    ${item && item.detail ? `<p class="detail">${esc(item.detail)}</p>` : ''}
    ${look.exploratory ? '<p class="note explore-note">探索性：偏离清单或预先登记为探索项，不占 N，不能当成正式结论。</p>' : ''}
    <p class="detail">连着：${esc(ends.join('、'))}</p>
    ${item ? `<div class="row-actions"><a class="btn" href="#/progress?item=${encodeURIComponent(item.id)}">在进展里打开</a></div>` : ''}`;
}

function nodeDetail(node) {
  const mode = mapMode();
  const related = (state.theory.edges || []).filter((edge) => edgeNodeIds(edge, mode).has(node.id));
  const rows = related.map((edge) => {
    const look = edgeLook(edge);
    const code = look.item ? look.item.code : edge.id;
    return `<button type="button" class="rel ${look.cls}" data-edge="${esc(edge.id)}">
      <span class="rel-id">${esc(code)}</span>
      <span class="rel-name">${esc(edge.short)}</span>
      <span class="tags">${statusTag(look.status || '缺失')}${look.item && look.item.evidence ? `<span class="tag is-rel">〔${esc(look.item.evidence)}〕</span>` : ''}${edge.hypothesis ? `<span class="tag">${esc(edge.hypothesis)}</span>` : ''}</span>
    </button>`;
  }).join('');
  return `
    <p class="kicker">${esc(node.role || '市场')}</p>
    <h2>${esc(node.name)}</h2>
    ${node.sub ? `<p class="question">${esc(node.sub)}</p>` : ''}
    <p class="detail">${esc(node.plain || '')}</p>
    <div class="field"><p class="lbl">连着的检验</p></div>
    ${rows || '<p class="note">登记的这些检验里，没有一条线接到这里。</p>'}
  `;
}

function relButton(edge, focus) {
  const look = edgeLook(edge);
  const on = focus.kind === 'edge' && focus.id === edge.id;
  const code = look.item ? look.item.code : edge.id;
  return `<button type="button" class="rel ${look.cls}${on ? ' is-on' : ''}" data-edge="${esc(edge.id)}">
    <span class="rel-id">${esc(code)}</span>
    <span class="rel-name">${esc(edge.short)}</span>
    <span class="tags">
      ${statusTag(look.status || '缺失')}
      ${look.exploratory ? '<span class="tag is-explore">探索性</span>' : ''}
      ${look.item && look.item.evidence ? `<span class="tag is-rel">〔${esc(look.item.evidence)}〕</span>` : ''}
      ${edge.placeNote ? `<span class="tag is-judge">${esc(edge.placeNote)}</span>` : ''}
    </span>
  </button>`;
}

function bindMap() {
  const pick = (kind, id) => {
    const current = mapFocus();
    const nextId = current.kind === kind && current.id === id ? '' : id;
    const params = new URLSearchParams();
    if (nextId) params.set(kind, nextId);
    const query = params.toString();
    const next = `#/map${query ? `?${query}` : ''}`;
    if (location.hash !== next) history.replaceState(null, '', next);
    state.route = parseRoute();
    render();
  };
  main.querySelectorAll('[data-node]').forEach((btn) => {
    btn.addEventListener('click', () => pick('node', btn.getAttribute('data-node')));
  });
  main.querySelectorAll('[data-edge]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      pick('edge', btn.getAttribute('data-edge'));
    });
  });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

window.addEventListener('resize', renderNav);
const mapMq = window.matchMedia('(max-width: 759px)');
mapMq.addEventListener('change', () => {
  if (state.route.name === 'map') render();
});
