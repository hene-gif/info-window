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
  now: null,
  known: null,
  knownFilter: 'all',
  knownPinned: '',
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
    const [overview, pack, reviews, docs, theory, now, known] = await Promise.all([
      fetchJson('data/overview.json'),
      fetchJson('data/items.json'),
      fetchJson('data/reviews.json'),
      fetchJson('data/docs.json'),
      fetchJson('data/theory.json'),
      fetchJson('data/now.json'),
      fetchJson('data/known.json'),
    ]);
    state.overview = overview;
    state.items = Array.isArray(pack.items) ? pack.items : [];
    state.reviews = reviews;
    state.docs = docs.docs || [];
    state.theory = theory;
    state.now = now;
    state.known = known;
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
    const knownNode = state.route.name === 'known' && state.route.id
      ? document.getElementById(`known-${state.route.id}`)
      : null;
    if (knownNode) {
      scrollBelowBar(knownNode);
    } else if (state.route.item) {
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
  if (tabs.scrollWidth > tabs.clientWidth) {
    const left = on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
    tabs.scrollTo({ left: Math.max(0, left) });
  }
}

function pageView() {
  const { name, id } = state.route;
  if (name === 'map') return { html: mapPage(), title: '理论地图 · 研究台' };
  if (name === 'known') return { html: knownPage(), title: knownTitle() };
  if (name === 'now') return { html: nowPage(), title: '当下市场信息 · 研究台' };
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
      ${mainlineVerdict()}
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
    ${mainlineVerdict()}
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

function isUndecided(item) {
  return Boolean(item && typeof item.statusNote === 'string' && item.statusNote.startsWith('未判定'));
}

function statusMarkup(item) {
  if (isUndecided(item)) return '<span class="tag is-undecided">未判定</span>';
  return statusTag(item && item.status);
}

function statsBlock(item) {
  if (!item || !Array.isArray(item.stats) || !item.stats.length) return '';
  return `<div class="stats">${item.stats.map((row) => `<div><span>${esc(row.label)}</span><b>${esc(row.value)}</b></div>`).join('')}</div>`;
}

function mainlineVerdict() {
  const item = state.items.find((row) => row.id === 'r2-main');
  if (!isUndecided(item)) return '';
  return '<p class="verdict"><span class="tag is-undecided">未判定</span><span>总主线没有推翻，也没有支持。</span></p>';
}

function itemCard(item, extra = '') {
  const owner = item.owner ? `<span class="tag">${esc(item.owner)}</span>` : '';
  const stats = statsBlock(item);
  const mapping = item.mapping ? `<p class="note">未能干净对应：${esc(item.mapping)}</p>` : '';
  return `
    <article class="item${item.exploratory ? ' is-explore' : ''}${isUndecided(item) ? ' is-undecided' : ''}" data-item="${esc(item.id)}" id="item-${esc(item.id)}">
      <div class="item-top">
        <span class="code">${esc(item.code)}</span>
        <h3>${esc(item.title)}</h3>
      </div>
      <p class="question">${esc(item.question)}</p>
      <div class="tags">
        ${statusMarkup(item)}
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
  if (state.route.name === 'now') bindNow();
  if (state.route.name === 'known') bindKnown();
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
      <div class="row-actions"><a class="btn btn-main" href="#/map">打开理论地图</a><a class="btn" href="#/now">当下市场信息</a></div>
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

function mapPage() {
  const t = state.theory;
  if (!t) return '<p class="status">理论地图没有打开。</p>';
  const edges = t.edges || [];
  const focus = mapFocus();
  const main = edges.filter(isMainEdge);
  const rest = edges.filter((edge) => !isMainEdge(edge));
  return `
    <p class="kicker">谁影响谁</p>
    <h1 class="page-title">理论地图</h1>
    <p class="lede">${esc(t.thesis.title)}。${esc(t.thesis.lead)}图分成四层，箭头只从原因指向被影响的一边。线上看编号，全称在下面的名单里。</p>
    ${legendHtml()}
    <div class="map-layout">
      <div class="map-canvas">
        <div class="flow-frame">
          <div class="flow-board" id="flow-board">
            <svg class="flow-svg" id="flow-svg" aria-hidden="true"></svg>
            ${flowLayersHtml(t, focus)}
          </div>
        </div>
        <section class="rel-list">
          <h2>图上的主线</h2>
          <p class="map-key">已经有结果的关系，加上总主线用来下结论的 C9、C6、L1。每一对只画一条线。</p>
          <div class="rel-grid">${main.map((edge) => relButton(edge, focus)).join('') || '<p class="empty">图上还没有主线。</p>'}</div>
          <h2 class="rel-sub">其余关系</h2>
          <p class="map-key">还在待测，又不是总主线的三项，所以不画线，避免线叠在一起。</p>
          <div class="rel-grid">${rest.map((edge) => relButton(edge, focus)).join('') || '<p class="empty">没有其余关系。</p>'}</div>
        </section>
        ${thesisTable(t.thesis)}
        ${judgeTable(t.thesis)}
      </div>
      <aside class="map-side" id="map-side">${mapDetail(focus)}</aside>
    </div>`;
}

function flowLayersHtml(theory, focus) {
  const byLayer = new Map();
  for (const node of theory.nodes || []) {
    if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
    byLayer.get(node.layer).push(node);
  }
  return (theory.layers || []).map((layer) => {
    const nodes = byLayer.get(layer.id) || [];
    const chip = nodes.filter((node) => node.group === 'chip');
    const plain = nodes.filter((node) => node.group !== 'chip');
    const chipHtml = chip.length ? `<div class="chip-group g-chip" data-group="chip">${chip.map((node) => flowNode(node, focus, true)).join('')}</div>` : '';
    return `
      <p class="flow-label g-l-${esc(layer.id)}"><span>${esc(layer.label)}</span>${layer.hint ? `<small>${esc(layer.hint)}</small>` : ''}</p>
      ${plain.map((node) => flowNode(node, focus)).join('')}
      ${chipHtml}`;
  }).join('');
}

function flowNode(node, focus, inChip) {
  const on = focus.kind === 'node' && focus.id === node.id;
  const nearIds = hotNodeIds(focus);
  const near = nearIds && nearIds.has(node.id) && !on;
  const dim = nearIds && !nearIds.has(node.id) && !on;
  const role = inChip
    ? '<span class="flow-role">亚洲芯片链</span>'
    : (node.role ? `<span class="flow-role">${esc(node.role)}</span>` : '');
  const sub = node.sub ? `<span class="flow-sub">${esc(node.sub)}</span>` : '';
  const sats = (node.satellites || []).map((sat) => {
    const satOn = focus.kind === 'node' && focus.id === sat.id;
    const satNear = nearIds && nearIds.has(sat.id);
    return `<span class="sat${satOn ? ' is-on' : ''}${satNear && !satOn ? ' is-near' : ''}" data-node="${esc(sat.id)}">${esc(sat.name)}</span>`;
  }).join('');
  const loop = node.id === 'a' ? ' has-loop' : '';
  return `<button type="button" class="flow-node g-${esc(node.id)}${loop}${on ? ' is-on' : ''}${near ? ' is-near' : ''}${dim ? ' is-dim' : ''}" data-node="${esc(node.id)}" aria-pressed="${on ? 'true' : 'false'}">${role}<strong>${esc(node.name)}</strong>${sub}${sats ? `<span class="sats">${sats}</span>` : ''}</button>`;
}

function legendHtml() {
  const items = [
    ['pass', '通过', '实线'],
    ['wait', '待测', '虚线'],
    ['quiet', '被否 / 未通过 / 未能检验', '灰线'],
  ];
  const sample = (kind) => `<svg class="legend-line" viewBox="0 0 36 8" aria-hidden="true"><line class="legend-${kind}" x1="1" y1="4" x2="35" y2="4"></line></svg>`;
  return `
    <div class="legend" aria-label="线的样子">
      <b>线的样子是这条检验现在的状态</b>
      ${items.map(([kind, name]) => `<span class="legend-item">${sample(kind)}${esc(name)}</span>`).join('')}
      <span class="legend-note">箭头从原因指向被影响的一边。探索性如果出现，用紫色虚线，不占 N，不能当成正式结论。点一条线，或点一个市场，看完整说法。</span>
    </div>`;
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

function isMainEdge(edge) {
  if (edge.placeNote && edge.placeNote.includes('进入总主线判定')) return true;
  const status = edgeLook(edge).status;
  return Boolean(status) && status !== '待测';
}

function edgeNodeIds(edge) {
  const ids = new Set(edge.also || []);
  if (edge.loop) ids.add(edge.loop);
  for (const path of edge.paths || []) {
    if (path.from) ids.add(path.from);
    if (path.to) ids.add(path.to);
  }
  return ids;
}

function hotEdgeIds(focus) {
  const edges = state.theory?.edges || [];
  if (!focus.id) return null;
  if (focus.kind === 'edge') return new Set([focus.id]);
  if (focus.kind === 'node') {
    return new Set(edges.filter((edge) => edgeNodeIds(edge).has(focus.id)).map((edge) => edge.id));
  }
  return null;
}

function hotNodeIds(focus) {
  const edges = state.theory?.edges || [];
  if (!focus.id) return null;
  if (focus.kind === 'node') {
    const ids = new Set([focus.id]);
    for (const edge of edges) {
      if (edgeNodeIds(edge).has(focus.id)) {
        for (const id of edgeNodeIds(edge)) ids.add(id);
      }
    }
    return ids;
  }
  if (focus.kind === 'edge') {
    const edge = edges.find((row) => row.id === focus.id);
    return edge ? edgeNodeIds(edge) : new Set();
  }
  return null;
}

function allTheoryNodes() {
  const nodes = [];
  for (const node of state.theory?.nodes || []) {
    nodes.push(node);
    for (const sat of node.satellites || []) nodes.push({ ...sat, parent: node.id });
  }
  return nodes;
}

function nodeById(id) {
  return allTheoryNodes().find((node) => node.id === id) || null;
}

function flowWide() {
  return !window.matchMedia('(max-width: 959px)').matches;
}

function flowBox(el, root) {
  const a = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return {
    left: a.left - b.left,
    top: a.top - b.top,
    right: a.right - b.left,
    bottom: a.bottom - b.top,
    width: a.width,
    height: a.height,
    cx: a.left - b.left + a.width / 2,
    cy: a.top - b.top + a.height / 2,
  };
}

function flowEls(root) {
  const out = {};
  root.querySelectorAll('[data-node]').forEach((el) => {
    out[el.getAttribute('data-node')] = flowBox(el, root);
  });
  return out;
}

function elbowAcross(from, to) {
  if (Math.abs(from.cy - to.cy) < 18) {
    const y = (from.cy + to.cy) / 2;
    return [{ x: from.right, y }, { x: to.left, y }];
  }
  const x = from.right + Math.max(18, (to.left - from.right) * 0.55);
  return [
    { x: from.right, y: from.cy },
    { x, y: from.cy },
    { x, y: to.cy },
    { x: to.left, y: to.cy },
  ];
}

function wideRoutes(box) {
  const routes = [];
  const yen = box.yen;
  const useq = box.useq;
  const real = box.real;
  const cardA = box.a;
  const usd = box.usd;
  const tw = box.tw;
  const kr = box.kr;
  if (yen && useq) {
    const y = (yen.cy + useq.cy) / 2;
    routes.push({ id: 'L1', label: true, pts: [{ x: yen.right, y }, { x: useq.left, y }] });
    if (cardA) {
      const x = cardA.left - 14;
      const yTop = cardA.top - 18;
      routes.push({
        id: 'L1',
        label: true,
        labelKey: 'L1-branch',
        labelAt: 1,
        pts: [
          { x, y },
          { x, y: yTop },
          { x: cardA.cx, y: yTop },
          { x: cardA.cx, y: cardA.top },
        ],
      });
    }
  }
  if (real && cardA) routes.push({ id: 'C9', label: true, pts: elbowAcross(real, cardA) });
  if (usd && kr) routes.push({ id: 'D5', label: true, pts: elbowAcross(usd, kr) });
  if (useq && tw && kr) {
    const x = Math.max(useq.right, tw.right, kr.right) + 16;
    routes.push({
      id: 'T3',
      label: true,
      labelPos: { x: x + 28, y: (tw.cy + kr.cy) / 2 },
      pts: [
        { x: useq.right, y: useq.cy },
        { x, y: useq.cy },
        { x, y: tw.cy },
        { x: tw.right, y: tw.cy },
      ],
    });
    routes.push({
      id: 'T3',
      label: false,
      pts: [
        { x, y: tw.cy },
        { x, y: kr.cy },
        { x: kr.right, y: kr.cy },
      ],
    });
  }
  if (cardA) {
    const y = cardA.bottom + 16;
    const x1 = cardA.left + cardA.width * 0.32;
    const x2 = cardA.left + cardA.width * 0.68;
    routes.push({
      id: 'C6',
      label: true,
      pts: [
        { x: x1, y: cardA.bottom },
        { x: x1, y },
        { x: x2, y },
        { x: x2, y: cardA.bottom },
      ],
    });
  }
  return routes.filter((route) => isMainEdge(state.theory.edges.find((edge) => edge.id === route.id) || {}));
}

function narrowRoutes(root, box) {
  const yen = box.yen;
  const useq = box.useq;
  const real = box.real;
  const cardA = box.a;
  const usd = box.usd;
  const tw = box.tw;
  const kr = box.kr;
  const edges = state.theory.edges || [];
  const on = (id) => isMainEdge(edges.find((edge) => edge.id === id) || {});
  const routes = [];
  const gap12 = yen && real ? (yen.right + real.left) / 2 : null;
  const gap23 = real && usd ? (real.right + usd.left) / 2 : null;
  const gapL = yen ? Math.max(8, yen.left - 12) : null;
  const gapR = usd ? usd.right + 14 : null;
  if (on('L1') && yen && useq && gap12 != null) {
    routes.push({
      id: 'L1',
      label: true,
      labelAt: 1,
      pts: [
        { x: yen.right, y: yen.cy },
        { x: gap12, y: yen.cy },
        { x: gap12, y: useq.cy },
        { x: useq.right, y: useq.cy },
      ],
    });
    if (cardA) {
      const yTop = cardA.top - 18;
      routes.push({
        id: 'L1',
        label: true,
        labelKey: 'L1-branch',
        labelAt: 1,
        pts: [
          { x: gap12, y: useq.cy },
          { x: gap12, y: yTop },
          { x: cardA.cx, y: yTop },
          { x: cardA.cx, y: cardA.top },
        ],
      });
    }
  }
  if (on('C9') && real && cardA && gap23 != null) {
    routes.push({
      id: 'C9',
      label: true,
      labelAt: 1,
      pts: [
        { x: real.right, y: real.cy },
        { x: gap23, y: real.cy },
        { x: gap23, y: cardA.cy },
        { x: cardA.right, y: cardA.cy },
      ],
    });
  }
  if (on('D5') && usd && kr && gapR != null) {
    routes.push({
      id: 'D5',
      label: true,
      labelAt: 1,
      pts: [
        { x: usd.right, y: usd.cy },
        { x: gapR, y: usd.cy },
        { x: gapR, y: kr.cy },
        { x: kr.right, y: kr.cy },
      ],
    });
  }
  if (on('T3') && useq && tw && kr && gapL != null) {
    const y = Math.max(tw.bottom, kr.bottom) + 18;
    routes.push({
      id: 'T3',
      label: true,
      labelPos: { x: (tw.right + kr.left) / 2, y: (tw.cy + kr.cy) / 2 },
      pts: [
        { x: useq.left, y: useq.cy },
        { x: gapL, y: useq.cy },
        { x: gapL, y: tw.cy },
        { x: tw.left, y: tw.cy },
      ],
    });
    routes.push({
      id: 'T3',
      label: false,
      pts: [
        { x: gapL, y: tw.cy },
        { x: gapL, y },
        { x: kr.cx, y },
        { x: kr.cx, y: kr.bottom },
      ],
    });
  }
  if (cardA && on('C6')) {
    const y = cardA.bottom + 14;
    const x1 = cardA.left + 22;
    const x2 = cardA.left + Math.min(cardA.width - 22, 92);
    routes.push({
      id: 'C6',
      label: true,
      labelAt: 1,
      pts: [
        { x: x1, y: cardA.bottom },
        { x: x1, y },
        { x: x2, y },
        { x: x2, y: cardA.bottom },
      ],
    });
  }
  return routes;
}

function pointAlong(pts, index) {
  let best = pts[0];
  let bestLen = -1;
  const start = index == null ? 0 : index;
  const end = index == null ? pts.length - 1 : Math.min(pts.length - 1, index + 1);
  for (let i = start; i < end; i += 1) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2, i };
    }
  }
  return best;
}

function tagHits(x, y, obstacles, placed) {
  const rect = { left: x - 20, top: y - 12, right: x + 20, bottom: y + 12 };
  const hit = (item) => rect.left < item.right - 1 && rect.right > item.left + 1 && rect.top < item.bottom - 1 && rect.bottom > item.top + 1;
  return obstacles.some(hit) || placed.some(hit);
}

function placeTag(route, obstacles, placed, board) {
  const candidates = [];
  if (route.labelPos) candidates.push(route.labelPos);
  const along = pointAlong(route.pts, route.labelAt);
  const seg = route.labelAt == null ? along.i || 0 : route.labelAt;
  const a = route.pts[Math.min(seg, route.pts.length - 1)];
  const b = route.pts[Math.min(seg + 1, route.pts.length - 1)];
  for (let step = 0; step <= 12; step += 1) {
    const t = 0.12 + (0.76 * step) / 12;
    candidates.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const base = candidates[1] || candidates[0];
  for (const dist of [22, -22, 34, -34]) {
    candidates.push({ x: base.x + px * dist, y: base.y + py * dist });
  }
  const inside = (point) => point.x > 22 && point.y > 16 && point.x < board.width - 22 && point.y < board.height - 16;
  const clear = candidates.find((point) => inside(point) && !tagHits(point.x, point.y, obstacles, placed));
  return clear || candidates.find((point) => !tagHits(point.x, point.y, obstacles, placed)) || candidates[0];
}

function toPath(pts) {
  return pts.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

let flowObserver = null;

function drawFlow() {
  const root = document.getElementById('flow-board');
  const svg = document.getElementById('flow-svg');
  if (!root || !svg) return;
  const width = root.getBoundingClientRect().width;
  const height = root.getBoundingClientRect().height;
  if (width < 20 || height < 20) return;
  svg.setAttribute('viewBox', `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const box = flowEls(root);
  const routes = (flowWide() ? wideRoutes(box) : narrowRoutes(root, box))
    .filter((route) => route.pts && route.pts.length > 1 && route.pts.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  const focus = mapFocus();
  const hot = hotEdgeIds(focus);
  const lines = routes.map((route) => {
    const edge = (state.theory.edges || []).find((row) => row.id === route.id);
    const look = edge ? edgeLook(edge) : { cls: '', status: '' };
    const dim = hot && !hot.has(route.id) ? ' is-dim' : '';
    const on = hot && hot.has(route.id) ? ' is-hot' : '';
    const quiet = !look.exploratory && look.status && look.status !== '通过' && look.status !== '待测';
    const cls = `flow-line ${look.cls}${quiet ? ' is-quiet' : ''}${dim}${on}`;
    const d = toPath(route.pts);
    return `<path class="flow-halo${dim}" d="${d}"></path><path class="${cls}" d="${d}" marker-end="url(#flow-arrow)"></path><path class="flow-hit" data-edge="${esc(route.id)}" d="${d}"></path>`;
  }).join('');
  svg.innerHTML = `
    <defs>
      <marker id="flow-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M 0 1.2 L 8.6 5 L 0 8.8 Z" fill="context-stroke"></path>
      </marker>
    </defs>
    ${lines}`;
  root.querySelectorAll('.flow-tag').forEach((el) => el.remove());
  const obstacles = [...root.querySelectorAll('.flow-node, .sat, .flow-label, .chip-group')]
    .map((el) => flowBox(el, root))
    .filter((rect) => rect.width > 4 && rect.height > 4);
  const placed = [];
  const seen = new Set();
  routes.filter((route) => route.label).forEach((route) => {
    const edge = (state.theory.edges || []).find((row) => row.id === route.id);
    if (!edge) return;
    const key = route.labelKey || `${route.id}:${route.labelAt || 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    const look = edgeLook(edge);
    const code = look.item ? look.item.code : edge.id;
    const at = placeTag(route, obstacles, placed, { width, height });
    placed.push({ left: at.x - 20, top: at.y - 12, right: at.x + 20, bottom: at.y + 12 });
    const dim = hot && !hot.has(route.id) ? ' is-dim' : '';
    const on = focus.kind === 'edge' && focus.id === edge.id ? ' is-on' : '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `flow-tag ${look.cls}${dim}${on}`;
    btn.dataset.edge = edge.id;
    btn.style.left = `${at.x}px`;
    btn.style.top = `${at.y}px`;
    btn.setAttribute('aria-label', `${code} ${edge.short}`);
    btn.textContent = code;
    root.appendChild(btn);
  });
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
  const board = document.getElementById('flow-board');
  if (board) {
    board.addEventListener('click', (event) => {
      const edge = event.target.closest('[data-edge]');
      if (edge) {
        event.stopPropagation();
        pick('edge', edge.getAttribute('data-edge'));
        return;
      }
      const node = event.target.closest('[data-node]');
      if (node) pick('node', node.getAttribute('data-node'));
    });
  }
  main.querySelectorAll('.rel-list [data-edge]').forEach((btn) => {
    btn.addEventListener('click', () => pick('edge', btn.getAttribute('data-edge')));
  });
  main.querySelectorAll('.map-side [data-edge]').forEach((btn) => {
    btn.addEventListener('click', () => pick('edge', btn.getAttribute('data-edge')));
  });
  if (flowObserver) flowObserver.disconnect();
  if (board && window.ResizeObserver) {
    flowObserver = new ResizeObserver(() => drawFlow());
    flowObserver.observe(board);
  }
  drawFlow();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawFlow());
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
    ${mainlineVerdict()}
    <p class="question">${esc(t.thesis.lead)}</p>
    <p class="detail">${esc(t.thesis.note)}点一个市场，或点一条线。图上只保留主线，其余关系在下面的名单里。</p>`;
}

function edgeDetail(edge) {
  const look = edgeLook(edge);
  const item = look.item;
  const code = item ? item.code : edge.id;
  const title = item ? item.title : edge.short;
  const ends = [...edgeNodeIds(edge)].map((id) => nodeById(id)?.name).filter(Boolean);
  const drawn = isMainEdge(edge);
  return `
    <p class="kicker">${esc(code)}${item ? ` · ${esc(item.family)} · ${esc(item.round)}` : ''}</p>
    <h2>${esc(title)}</h2>
    <div class="tags" style="margin-top:8px">
      ${statusTag(look.status || '缺失')}
      ${look.exploratory ? '<span class="tag is-explore">探索性</span>' : ''}
      ${item && item.evidence ? `<span class="tag is-rel">〔${esc(item.evidence)}〕</span>` : ''}
      ${edge.placeNote ? `<span class="tag is-judge">${esc(edge.placeNote)}</span>` : ''}
      ${drawn ? '' : '<span class="tag">不画线</span>'}
    </div>
    <div class="field"><p class="lbl">关系</p><p>${esc(edge.short)}</p></div>
    <div class="field"><p class="lbl">假说</p><p>${esc(edge.hypothesis)}</p></div>
    ${item ? `<div class="field"><p class="lbl">检验的问题</p><p>${esc(item.question)}</p></div>` : '<p class="note">进展数据里没有这条检验。</p>'}
    ${item && item.theory ? `<div class="field"><p class="lbl">理论</p><p>${esc(item.theory)}</p></div>` : ''}
    ${item && item.statusNote ? `<p class="note">${esc(item.statusNote)}</p>` : ''}
    ${item && item.detail ? `<p class="detail">${esc(item.detail)}</p>` : ''}
    ${statsBlock(item)}
    ${look.exploratory ? '<p class="note explore-note">探索性：偏离清单或预先登记为探索项，不占 N，不能当成正式结论。</p>' : ''}
    <p class="detail">连着：${esc(ends.join('、') || '—')}</p>
    ${item ? `<div class="row-actions"><a class="btn" href="#/progress?item=${encodeURIComponent(item.id)}">在进展里打开</a></div>` : ''}`;
}

function nodeDetail(node) {
  const related = (state.theory.edges || []).filter((edge) => edgeNodeIds(edge).has(node.id));
  const rows = related.map((edge) => {
    const look = edgeLook(edge);
    const code = look.item ? look.item.code : edge.id;
    const drawn = isMainEdge(edge);
    return `<button type="button" class="rel ${look.cls}" data-edge="${esc(edge.id)}">
      <span class="rel-id">${esc(code)}</span>
      <span class="rel-name">${esc(edge.short)}</span>
      <span class="tags">${statusTag(look.status || '缺失')}${look.item && look.item.evidence ? `<span class="tag is-rel">〔${esc(look.item.evidence)}〕</span>` : ''}${drawn ? '' : '<span class="tag">不画线</span>'}</span>
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
  const drawn = isMainEdge(edge);
  return `<button type="button" class="rel ${look.cls}${on ? ' is-on' : ''}" data-edge="${esc(edge.id)}">
    <span class="rel-id">${esc(code)}</span>
    <span class="rel-name">${esc(edge.short)}</span>
    <span class="tags">
      ${statusTag(look.status || '缺失')}
      ${look.exploratory ? '<span class="tag is-explore">探索性</span>' : ''}
      ${look.item && look.item.evidence ? `<span class="tag is-rel">〔${esc(look.item.evidence)}〕</span>` : ''}
      ${edge.placeNote ? `<span class="tag is-judge">${esc(edge.placeNote)}</span>` : ''}
      ${drawn ? '' : '<span class="tag">不画线</span>'}
    </span>
  </button>`;
}

const NOW_STATUS = {
  待业绩验证: 'is-earn-wait',
  部分支持: 'is-part',
  业绩支持: 'is-yes',
  业绩打脸: 'is-no',
  待数据验证: 'is-data',
};

function nowPage() {
  const data = state.now;
  if (!data || typeof data !== 'object') return '<p class="empty">本期内容整理中</p>';
  const narratives = Array.isArray(data.narratives) ? data.narratives : [];
  const calendar = Array.isArray(data.calendar) ? data.calendar : [];
  const summary = data.summary || '本期内容整理中';
  return `
    <p class="kicker">猜想走在业绩前面</p>
    <h1 class="page-title">当下市场信息</h1>
    <p class="lede">这里记的是市场眼下正在定价的故事，不是预注册检验。价格往往先动，业绩和数据随后才来对质。</p>
    <article class="now-summary">
      <div class="meta-row">
        ${data.updated ? `<span class="chip">更新 ${esc(data.updated)}</span>` : ''}
        <span class="chip">${narratives.length ? `${narratives.length} 条猜想` : '内容整理中'}</span>
      </div>
      <p>${esc(summary)}</p>
    </article>
    ${factorsSection(data.factors)}
    <section class="sec">
      <h2>正在定价的猜想</h2>
      ${narratives.length ? `<div class="now-list">${narratives.map(narrativeCard).join('')}</div>` : '<p class="empty">本期内容整理中</p>'}
    </section>
    <section class="sec">
      <h2>接下来要核对</h2>
      ${calendar.length ? calendarHtml(calendar, narratives) : '<p class="empty">这段时间没有待核对的事。</p>'}
    </section>`;
}

const FACTOR_STRENGTH = { 低: 'is-low', 中: 'is-mid', 高: 'is-high', 极高: 'is-top', 暂缺: 'is-na' };
const FACTOR_DIR = {
  加压: { cls: 'is-up', icon: '↑' },
  缓解: { cls: 'is-down', icon: '↓' },
  持平: { cls: 'is-flat', icon: '→' },
  暂缺: { cls: 'is-na', icon: '·' },
};

function factorStrength(level) {
  const name = level || '暂缺';
  return `<span class="fx-strength ${FACTOR_STRENGTH[name] || 'is-na'}">${esc(name)}</span>`;
}

function factorDir(dir) {
  const name = dir || '暂缺';
  const meta = FACTOR_DIR[name] || FACTOR_DIR.暂缺;
  return `<span class="fx-dir ${meta.cls}"><span aria-hidden="true">${meta.icon}</span>${esc(name)}</span>`;
}

function factorBar(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
    return '<div class="fx-bar is-empty" aria-label="百分位暂缺"><span class="fx-bar-text">百分位暂缺</span></div>';
  }
  const v = Math.max(0, Math.min(100, Number(pct)));
  return `
    <div class="fx-bar" role="img" aria-label="压力百分位 ${esc(v)}">
      <span class="fx-bar-zone z1"></span><span class="fx-bar-zone z2"></span><span class="fx-bar-zone z3"></span><span class="fx-bar-zone z4"></span>
      <span class="fx-bar-mark" style="left:${v}%"></span>
    </div>`;
}

function factorIndicator(row) {
  const missing = row.value === null || row.value === undefined;
  const src = row.source || {};
  const pct = row.percentile === null || row.percentile === undefined ? '暂缺' : `${row.percentile}`;
  return `
    <li class="fx-ind">
      <div class="fx-ind-top">
        <div class="fx-ind-name">
          <h4>${esc(row.name || '')}</h4>
          ${row.plain ? `<p>${esc(row.plain)}</p>` : ''}
        </div>
        <div class="fx-ind-value">
          <strong>${missing ? '暂缺' : esc(row.display)}</strong>${!missing && row.unit ? `<span>${esc(row.unit)}</span>` : ''}
          <time>${esc(row.date_label || row.date || '暂缺')}${row.freq ? ` · ${esc(row.freq)}` : ''}</time>
        </div>
      </div>
      ${factorBar(row.pressure_pct)}
      <div class="fx-ind-meta">
        <span>10 年百分位 <b>${esc(pct)}</b></span>
        ${factorStrength(row.strength)}
        ${factorDir(row.direction)}
        ${!missing && row.prev_value !== undefined ? `<span class="fx-prev">上一期 ${esc(row.prev_date || '')}：${esc(Number(row.prev_value).toFixed(2))}</span>` : ''}
      </div>
      ${row.note ? `<p class="fx-note">${esc(row.note)}</p>` : ''}
      ${src.url ? `<p class="fx-src">来源：<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title || src.url)}</a></p>` : ''}
    </li>`;
}

function factorCard(row) {
  return `
    <article class="fx-card" id="factor-${esc(row.id)}">
      <header class="fx-head">
        <span class="now-id">${esc(row.id)}</span>
        <div class="fx-title">
          <h3>${esc(row.name || '')}</h3>
          ${row.question ? `<p>${esc(row.question)}</p>` : ''}
        </div>
        <div class="fx-head-tags">${factorStrength(row.strength)}${factorDir(row.direction)}</div>
      </header>
      <ul class="fx-inds">${(row.indicators || []).map(factorIndicator).join('')}</ul>
    </article>`;
}

function factorsSection(fx) {
  if (!fx || typeof fx !== 'object' || !Array.isArray(fx.factors) || !fx.factors.length) return '';
  const stack = fx.stack || {};
  const stacked = new Set(stack.factors || []);
  const tiles = fx.factors.map((row) => `
    <a class="fx-tile${stacked.has(row.id) ? ' is-stacked' : ''}" href="#/now" data-factor-jump="${esc(row.id)}">
      <span class="fx-tile-name">${esc(row.name || '')}</span>
      <span class="fx-tile-tags">${factorStrength(row.strength)}${factorDir(row.direction)}</span>
    </a>`).join('');
  const rules = (fx.rules || []).map((line) => `<li>${esc(line)}</li>`).join('');
  return `
    <section class="sec fx-sec" aria-labelledby="fx-title">
      <h2 id="fx-title">${esc(fx.title || '因子叠加')}</h2>
      <p class="fx-lede">不光看有哪些压力，还看每个压力有多大、在往哪边走。每个数都附日期和来源，拿不到的写“暂缺”。</p>
      <article class="fx-stack">
        <div class="meta-row">
          ${fx.updated ? `<span class="chip">更新 ${esc(fx.updated)}</span>` : ''}
          ${fx.evidence_tag ? `<span class="tag is-rel">〔${esc(fx.evidence_tag)}〕</span>` : ''}
        </div>
        <div class="fx-stack-main">
          <span class="fx-stack-label">叠加读数</span>
          <strong class="fx-stack-level">${esc(stack.level || '暂缺')}</strong>
          <span class="fx-stack-count">高位 ${esc((stack.high_factors || []).length)} / ${esc(fx.factors.length)} · 高位且加压 ${esc(stack.count ?? 0)} / ${esc(fx.factors.length)}</span>
        </div>
        ${stack.text ? `<p class="fx-stack-text">${esc(stack.text)}</p>` : ''}
        <div class="fx-tiles">${tiles}</div>
        ${fx.disclaimer ? `<p class="fx-disclaimer">${esc(fx.disclaimer)}</p>` : ''}
      </article>
      <div class="fx-grid">${fx.factors.map(factorCard).join('')}</div>
      ${rules ? `<details class="fx-rules"><summary>怎么读这张表（规则事先写死）</summary><ol>${rules}</ol></details>` : ''}
    </section>`;
}

function nowBadge(status) {
  const cls = NOW_STATUS[status] || 'is-plain';
  return `<span class="now-badge ${cls}">${esc(status || '未标注')}</span>`;
}

function narrativeCard(row) {
  const markets = (row.markets || []).map((name) => `<span class="chip">${esc(name)}</span>`).join('');
  const tests = (row.related_tests || []).map((code) => `<a href="${esc(testHref(code))}">${esc(code)}</a>`).join('、');
  const sources = (row.sources || []).map((source) => `
    <li>
      <a href="${esc(source.url || '#')}" target="_blank" rel="noopener noreferrer">${esc(source.title || source.url || '来源')}</a>
      ${source.date ? `<time>${esc(source.date)}</time>` : ''}
    </li>`).join('');
  const next = row.next_check || {};
  return `
    <article class="now-card" id="narrative-${esc(row.id)}">
      <header class="now-head">
        <span class="now-id">${esc(row.id)}</span>
        <h3>${esc(row.title || '')}</h3>
        ${nowBadge(row.verification_status)}
      </header>
      ${markets ? `<div class="meta-row">${markets}</div>` : ''}
      <ol class="timeline">
        <li>
          <span class="step">1 · 猜想先行</span>
          <p>${esc(row.claim || '')}</p>
          ${row.first_seen ? `<p class="when">首次出现 ${esc(row.first_seen)}</p>` : ''}
        </li>
        <li>
          <span class="step">2 · 价格反应</span>
          <p>${esc(row.price_reaction || '')}</p>
        </li>
        <li>
          <span class="step">3 · 业绩验证</span>
          <p>${nowBadge(row.verification_status)}</p>
          ${next.date || next.event ? `<p class="when">下一步 ${esc([next.date, next.event].filter(Boolean).join(' · '))}</p>` : ''}
        </li>
      </ol>
      <div class="now-meta">
        ${row.evidence_tag ? `<span class="tag is-rel">〔${esc(row.evidence_tag)}〕</span>` : ''}
        ${tests ? `<span class="now-tests">相关检验 ${tests}</span>` : ''}
      </div>
      ${sources ? `<ul class="sources">${sources}</ul>` : ''}
    </article>`;
}

function testHref(code) {
  const edge = (state.theory?.edges || []).find((row) => row.id === code);
  if (edge) return `#/map?edge=${encodeURIComponent(edge.id)}`;
  const item = state.items.find((row) => row.code === code || row.id === code);
  if (item) return `#/progress?item=${encodeURIComponent(item.id)}`;
  return `#/progress?q=${encodeURIComponent(code)}`;
}

function calendarHtml(calendar, narratives) {
  const known = new Set(narratives.map((row) => row.id));
  const rows = calendar.map((row, index) => ({ ...row, index }))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.index - b.index);
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.items.push(row);
    else groups.push({ date: row.date || '', items: [row] });
  }
  const body = groups.map((group) => {
    const items = group.items.map((item) => {
      const links = (item.narratives || []).map((id) => (
        known.has(id)
          ? `<button type="button" class="jump" data-jump="${esc(id)}">${esc(id)}</button>`
          : `<span class="chip">${esc(id)}</span>`
      )).join('');
      return `<div class="cal-item"><p>${esc(item.event || '')}</p>${links ? `<div class="cal-links">${links}</div>` : ''}</div>`;
    }).join('');
    return `<li><time>${esc(group.date)}</time><div>${items}</div></li>`;
  }).join('');
  return `<ol class="cal">${body}</ol>`;
}

function bindNow() {
  main.querySelectorAll('[data-factor-jump]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const node = document.getElementById(`factor-${link.getAttribute('data-factor-jump')}`);
      if (node) node.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  });
  main.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const node = document.getElementById(`narrative-${btn.getAttribute('data-jump')}`);
      if (node) node.scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  });
}

const KNOWN_RELIABILITY = {
  反复验证: 'is-solid',
  有争议: 'is-contested',
  较新证据有限: 'is-thin',
};

const KNOWN_RELATION = {
  底座直接用: 'is-base',
  我们在检验的新增部分: 'is-add',
  注意事项: 'is-watch',
};

function knownTitle() {
  const item = (state.known?.items || []).find((row) => row.id === state.route.id);
  if (item) return `${item.id} ${item.name} · 已知规律 · 研究台`;
  return '已知规律 · 研究台';
}

function knownPage() {
  const data = state.known;
  if (!data || typeof data !== 'object') {
    return `
      <p class="kicker">文献里的成熟规律</p>
      <h1 class="page-title">已知规律</h1>
      <p class="empty">已知规律还没有整理进来。</p>`;
  }
  if (state.route.id && state.knownPinned !== state.route.id) {
    state.knownFilter = 'all';
    state.knownPinned = state.route.id;
  }
  const items = Array.isArray(data.items) ? data.items : [];
  const shown = knownVisible(items);
  const groups = knownGrouped(shown);
  const lessons = Array.isArray(data.method_lessons) ? data.method_lessons : [];
  return `
    <p class="kicker">文献里的成熟规律</p>
    <h1 class="page-title">已知规律</h1>
    <p class="lede">${esc(data.intro || '')}</p>
    <div class="meta-row">
      ${data.updated ? `<span class="chip">更新 ${esc(data.updated)}</span>` : ''}
      <span class="chip">${items.length} 条规律</span>
    </div>
    ${knownStand(data.position || {})}
    <section class="sec" aria-labelledby="known-items-title">
      <h2 id="known-items-title">规律条目</h2>
      ${knownFilters(items)}
      ${knownJumps(groups)}
      ${groups.length ? groups.map(knownGroup).join('') : '<p class="empty">这一组里还没有规律。</p>'}
    </section>
    ${knownLessons(lessons)}
  `;
}

function knownStand(position) {
  const cols = [
    { key: 'foundation', title: '底座（成熟规律）', cls: 'is-base', index: '01' },
    { key: 'our_addition', title: '我们新增的部分', cls: 'is-add', index: '02' },
    { key: 'open_gaps', title: '尚未解决的缺口', cls: 'is-gap', index: '03' },
  ];
  const body = cols.map((col) => {
    const rows = Array.isArray(position[col.key]) ? position[col.key] : [];
    const list = rows.map((text) => `<li>${esc(text)}</li>`).join('')
      || '<li>这里还没有写。</li>';
    return `
      <article class="stand-col ${col.cls}">
        <header>
          <span class="stand-index">${col.index}</span>
          <h3>${esc(col.title)}</h3>
        </header>
        <ul>${list}</ul>
      </article>`;
  }).join('');
  return `
    <section class="sec" aria-labelledby="stand-title">
      <h2 id="stand-title">我们站在哪里</h2>
      <p class="muted">按这个顺序读：底座、我们新增的部分、尚未解决的缺口。</p>
      <div class="stand-wrap">
        <div class="stand">${body}</div>
        <div class="stand-rail" aria-hidden="true"><span class="is-base"></span><span class="is-add"></span><span class="is-gap"></span></div>
      </div>
    </section>`;
}

function knownFilters(items) {
  const buttons = [
    { id: 'all', label: '全部', n: items.length },
    ...['底座直接用', '我们在检验的新增部分', '注意事项'].map((label) => ({
      id: `rel:${label}`,
      label,
      n: items.filter((item) => item.relation === label).length,
    })),
  ];
  return `<div class="known-filters" role="toolbar" aria-label="按和我们的关系筛选">${buttons.map((btn) => `
    <button type="button" class="known-filter${state.knownFilter === btn.id ? ' is-on' : ''}" data-known-filter="${esc(btn.id)}" aria-pressed="${state.knownFilter === btn.id ? 'true' : 'false'}">${esc(btn.label)}<span>${btn.n}</span></button>`).join('')}</div>`;
}

function knownJumps(groups) {
  if (groups.length < 2) return '';
  return `<div class="known-jumps" role="navigation" aria-label="分类">${groups.map((group) => `
    <button type="button" class="known-jump" data-known-jump="${esc(knownCatId(group.category))}">${esc(group.category)}</button>`).join('')}</div>`;
}

function knownVisible(items) {
  const filter = state.knownFilter || 'all';
  if (filter === 'all') return items;
  if (filter.startsWith('rel:')) return items.filter((item) => item.relation === filter.slice(4));
  return items;
}

function knownGrouped(items) {
  const groups = [];
  const seen = new Map();
  items.forEach((item) => {
    const category = item.category || '未分类';
    if (!seen.has(category)) {
      const group = { category, items: [] };
      seen.set(category, group);
      groups.push(group);
    }
    seen.get(category).items.push(item);
  });
  return groups;
}

function knownCatId(category) {
  let hash = 0;
  for (const char of String(category)) hash = (hash * 33 + char.codePointAt(0)) >>> 0;
  return `known-cat-${hash.toString(36)}`;
}

function knownGroup(group) {
  return `
    <section class="known-cat" id="${esc(knownCatId(group.category))}">
      <h2>${esc(group.category)}<span>${group.items.length}</span></h2>
      <div class="known-list">${group.items.map(knownCard).join('')}</div>
    </section>`;
}

function knownCard(item) {
  const tests = Array.isArray(item.related_tests) ? item.related_tests.filter(Boolean) : [];
  const studies = Array.isArray(item.studies) ? item.studies : [];
  const on = state.route.id && state.route.id === item.id ? ' is-target' : '';
  return `
    <article class="known-card${on}" id="known-${esc(item.id)}">
      <header class="known-head">
        <span class="code">${esc(item.id || '')}</span>
        <h3>${esc(item.name || '')}</h3>
      </header>
      <p class="known-claim">${esc(item.claim || '')}</p>
      <div class="known-pair">
        <div>
          <p class="known-k">可靠程度</p>
          ${knownBadge(KNOWN_RELIABILITY, item.reliability)}
          ${item.reliability_note ? `<p class="known-note">${esc(item.reliability_note)}</p>` : ''}
        </div>
        <div>
          <p class="known-k">和我们的关系</p>
          ${knownBadge(KNOWN_RELATION, item.relation)}
          ${item.relation_note ? `<p class="known-note">${esc(item.relation_note)}</p>` : ''}
        </div>
      </div>
      ${studies.length ? `<div class="studies"><p class="known-k">论文</p><div class="study-list">${studies.map(studyLink).join('')}</div></div>` : ''}
      ${tests.length ? `<div class="known-tests"><span class="known-k">相关检验</span>${tests.map(knownTestChip).join('')}</div>` : ''}
    </article>`;
}

function knownBadge(map, value) {
  const cls = map[value] || 'is-plain';
  return `<span class="known-badge ${cls}">${esc(value || '未标注')}</span>`;
}

function studyLink(study) {
  const author = study?.['作者'] || '';
  const year = study?.['年份'] ?? '';
  const title = study?.['标题'] || '';
  const url = study?.url || '';
  const who = [author, year].filter((part) => part !== '' && part != null).join(' · ');
  const inner = `<span class="study-who">${esc(who)}</span><span class="study-title">${esc(title)}</span>`;
  if (!url) return `<div class="study">${inner}</div>`;
  return `<a class="study" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
}

function knownTestChip(code) {
  const item = state.items.find((row) => row.code === code || row.id === code);
  const label = item ? `${item.code} ${item.title}` : String(code);
  return `<a class="chip known-chip" href="${esc(testHref(code))}" title="${esc(label)}">${esc(code)}</a>`;
}

function knownLessons(lessons) {
  if (!lessons.length) return '';
  return `
    <section class="sec" aria-labelledby="lessons-title">
      <h2 id="lessons-title">第三轮方法教训</h2>
      <ol class="lessons">${lessons.map((text) => `<li>${esc(text)}</li>`).join('')}</ol>
    </section>`;
}

function bindKnown() {
  main.querySelectorAll('[data-known-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-known-filter') || 'all';
      if (next === state.knownFilter) return;
      state.knownFilter = next;
      const y = window.scrollY;
      render({ resetScroll: false });
      window.scrollTo(0, y);
    });
  });
  main.querySelectorAll('[data-known-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const node = document.getElementById(btn.getAttribute('data-known-jump'));
      if (node) scrollBelowBar(node);
    });
  });
}

function scrollBelowBar(node) {
  const go = (behavior) => {
    if (!node.isConnected) return;
    const bar = $('bar');
    const offset = (bar ? bar.getBoundingClientRect().height : 96) + 14;
    const top = node.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior });
  };
  go(reduceMotion.matches ? 'auto' : 'smooth');
  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(() => go('auto'));
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

window.addEventListener('resize', () => {
  renderNav();
  if (state.route.name === 'map') drawFlow();
});
const flowMq = window.matchMedia('(max-width: 959px)');
flowMq.addEventListener('change', () => {
  if (state.route.name === 'map') drawFlow();
});
