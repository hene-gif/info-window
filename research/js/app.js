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
    const [overview, pack, reviews, docs] = await Promise.all([
      fetchJson('data/overview.json'),
      fetchJson('data/items.json'),
      fetchJson('data/reviews.json'),
      fetchJson('data/docs.json'),
    ]);
    state.overview = overview;
    state.items = Array.isArray(pack.items) ? pack.items : [];
    state.reviews = reviews;
    state.docs = docs.docs || [];
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
    document.title = '研究 · 讯息窗';
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
  if (name === 'progress') return { html: progressPage(), title: '进展 · 研究' };
  if (name === 'review') return { html: reviewPage(), title: '评估 · 研究' };
  if (name === 'feedback') return { html: feedbackPage(), title: '修改意见 · 研究' };
  if (name === 'docs') return { html: docsPage(id), title: '文档 · 研究' };
  return { html: homePage(), title: '研究 · 讯息窗' };
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
      <p class="plain">${esc(o.currentRound.lockedBy)}</p>
      <p class="plain">${esc(o.currentRound.rule)}</p>
    </section>
    ${images}
    <p class="note-box">${esc(o.disclaimer)} 来源：${esc(o.headline.source)}</p>
  `;
}

function progressPage() {
  const rows = filteredItems();
  const options = (values, current) => values.map((value) =>
    `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(value === 'all' ? '全部' : value)}</option>`
  ).join('');
  const rounds = ['all', ...uniq(state.items.map((item) => item.round))];
  const families = ['all', ...uniq(state.items.map((item) => item.family))];
  const statuses = ['all', ...uniq(state.items.map((item) => item.status))];
  const evidences = ['all', ...uniq(state.items.map((item) => item.evidence).filter(Boolean))];
  return `
    <p class="kicker">第一轮已完成 · 第二轮已锁定未跑</p>
    <h1 class="page-title">进展</h1>
    <p class="lede">每一条都来自材料里的编号检验。状态以修订版为准。没有写明主人的，这里就空着。</p>
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
    <article class="item" data-item="${esc(item.id)}" id="item-${esc(item.id)}">
      <div class="item-top">
        <span class="code">${esc(item.code)}</span>
        <h3>${esc(item.title)}</h3>
      </div>
      <p class="question">${esc(item.question)}</p>
      <div class="tags">
        ${statusTag(item.status)}
        ${item.evidence ? `<span class="tag is-rel">〔${esc(item.evidence)}〕</span>` : ''}
        <span class="tag">${esc(item.round)}</span>
        <span class="tag">${esc(item.family)}</span>
        ${owner}
      </div>
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

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

window.addEventListener('resize', renderNav);
