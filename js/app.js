const SECTIONS = ['我关注的', '国际重大影响'];
const FOCUS = '我关注的';
const BLOCKS = ['AI 模型和产品动态', '人机恋和 AI 陪伴赛道', '语音交互和 AI 硬件玩具'];
const SLOT_LABEL = { 早: '早间', 午: '午间', 晚: '晚间', 试: '试刊' };
const LS_KEY = 'info-window:favorites';

const state = {
  ready: false,
  fatal: '',
  index: { issues: [] },
  issues: new Map(),
  fileFavorites: [],
  route: parseRoute(),
  section: 'all',
  block: 'all',
  query: '',
};

if (state.route.name === 'search') state.query = state.route.query;

const main = document.getElementById('main');

main.addEventListener('click', onClick);
main.addEventListener('input', onInput);
main.addEventListener('change', onInput);
main.addEventListener('submit', (event) => event.preventDefault());
main.addEventListener('focusin', (event) => {
  if (event.target.id === 'q') document.body.classList.add('is-searching');
});
main.addEventListener('focusout', (event) => {
  if (event.target.id === 'q') document.body.classList.remove('is-searching');
});

window.addEventListener('hashchange', () => {
  state.route = parseRoute();
  if (state.route.name === 'search') state.query = state.route.query;
  render({ resetScroll: true });
});

window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
window.addEventListener('scroll', syncHeader, { passive: true });

boot();

async function boot() {
  tickClock();
  setInterval(tickClock, 30000);
  updateNet();
  renderTabs();
  try {
    const index = await fetchJson('data/index.json');
    if (!index || !Array.isArray(index.issues)) throw new Error('index');
    state.index = index;
    try {
      const favorites = await fetchJson('data/favorites.json');
      state.fileFavorites = Array.isArray(favorites.ids)
        ? favorites.ids.filter((id) => typeof id === 'string')
        : [];
    } catch {
      state.fileFavorites = [];
    }
    await loadIssues();
    state.ready = true;
  } catch {
    state.fatal = '这份目录没有打开。可以稍后再试。';
  }
  render({ resetScroll: true });
  registerServiceWorker();
}

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const url = new URL(raw.startsWith('/') ? raw : `/${raw}`, 'https://info-window.local');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  return {
    name: parts[0] || 'home',
    id: parts[1] || '',
    query: url.searchParams.get('q') || '',
  };
}

async function fetchJson(path) {
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

async function loadIssues() {
  await Promise.all(
    state.index.issues.map(async (meta) => {
      try {
        const issue = await fetchJson(`data/issues/${encodeURIComponent(meta.id)}.json`);
        state.issues.set(meta.id, issue);
      } catch {
        state.issues.set(meta.id, { ...meta, items: [], error: true });
      }
    })
  );
}

function render(options = {}) {
  const focusSearch = document.activeElement && document.activeElement.id === 'q';
  const selection = focusSearch
    ? [document.activeElement.selectionStart, document.activeElement.selectionEnd]
    : null;

  renderTabs();
  if (state.fatal) {
    document.title = '讯息窗';
    main.innerHTML = `<p class="status">${esc(state.fatal)}</p>`;
    return;
  }
  if (!state.ready) {
    main.innerHTML = '<p class="status">正在打开…</p>';
    return;
  }

  const name = state.route.name;
  let html = '';
  let title = '讯息窗';
  if (name === 'search') {
    html = searchPage();
    title = '检索 · 讯息窗';
  } else if (name === 'favorites') {
    html = favoritesPage();
    title = '收藏 · 讯息窗';
  } else if (name === 'dates') {
    html = datesPage();
    title = '日期 · 讯息窗';
  } else if (name === 'date') {
    html = dayPage(state.route.id);
    title = `${formatLongDate(state.route.id)} · 讯息窗`;
  } else if (name === 'issue') {
    html = issuePage(state.route.id);
    const issue = state.issues.get(state.route.id);
    if (issue) title = `${issue.title || issue.id} · 讯息窗`;
  } else {
    const latest = state.index.issues[0];
    html = latest ? issuePage(latest.id) : '<p class="empty">还没有期次。</p>';
    if (latest) title = `${latest.title || latest.id} · 讯息窗`;
  }

  document.title = title;
  main.innerHTML = html;
  if (focusSearch) {
    const field = document.getElementById('q');
    if (field) {
      field.focus();
      if (selection) field.setSelectionRange(selection[0], selection[1]);
    }
  }
  if (options.resetScroll) window.scrollTo(0, 0);
  revealCurrentIssue();
  syncHeader();
}

function revealCurrentIssue() {
  const current = document.querySelector('.issue-pill.is-on');
  if (!current || !current.parentElement) return;
  const scroller = current.parentElement;
  const left = current.offsetLeft - (scroller.clientWidth - current.offsetWidth) / 2;
  scroller.scrollLeft = Math.max(0, left);
}

function syncHeader() {
  const top = document.querySelector('.top');
  if (top) top.classList.toggle('is-stuck', window.scrollY > 2);
}

function renderTabs() {
  const tab = activeTab();
  document.querySelectorAll('.tabbar a').forEach((link) => {
    const on = link.dataset.tab === tab;
    link.classList.toggle('is-on', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const count = document.getElementById('fav-count');
  const total = mergedFavoriteIds().length;
  count.hidden = total === 0;
  count.textContent = String(total);
}

function activeTab() {
  const name = state.route.name;
  if (name === 'search') return 'search';
  if (name === 'favorites') return 'favorites';
  if (name === 'dates' || name === 'date') return 'dates';
  if (name === 'issue') {
    const latest = state.index.issues[0];
    if (!latest || state.route.id !== latest.id) return 'dates';
  }
  return 'home';
}

function issuePage(id) {
  const issue = state.issues.get(id);
  if (!issue) return '<p class="empty">没有这一期。</p>';
  const index = state.index.issues.findIndex((item) => item.id === id);
  return `${mastHtml(issue, issue.items || [])}${switcherHtml(id)}${filtersHtml()}${issueBody(issue)}${neighborHtml(index)}`;
}

function dayPage(date) {
  const issues = state.index.issues.filter((item) => item.date === date);
  if (!issues.length) {
    return `<header class="page-head"><p class="kicker">按日期</p><h1>这一天没有期次</h1></header><p class="empty"><a href="#/dates">回到日期</a></p>`;
  }
  const bodies = issues
    .map((meta) => {
      const issue = state.issues.get(meta.id);
      if (!issue) return '';
      return `<div class="issue-head"><a class="issue-link" href="${issueHref(issue.id)}">${esc(slotLabel(issue.slot))} · ${esc(issue.title || issue.id)}</a></div>${issueBody(issue)}`;
    })
    .join('');
  return `<header class="page-head"><p class="kicker">${issues.length} 期 · ${esc(weekText(date))}</p><h1>${esc(formatLongDate(date))}</h1></header>${filtersHtml()}${bodies}`;
}

function datesPage() {
  const groups = new Map();
  for (const meta of state.index.issues) {
    const parts = parseDate(meta.date);
    const key = parts ? `${parts.year}年${parts.month}月` : meta.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(meta);
  }
  const months = [...groups.entries()]
    .map(([label, metas]) => {
      const byDate = new Map();
      for (const meta of metas) {
        if (!byDate.has(meta.date)) byDate.set(meta.date, []);
        byDate.get(meta.date).push(meta);
      }
      const rows = [...byDate.entries()]
        .map(([date, slots]) => {
          const parts = parseDate(date);
          const slotText = slots
            .map((meta) => `${slotLabel(meta.slot)} · ${meta.itemCount} 则`)
            .join('、');
          return `<a class="date-row" href="#/date/${encodeURIComponent(date)}"><span><span class="date-num">${parts ? parts.day : ''}</span><span class="date-side">${esc(weekText(date))}</span></span><span class="date-slots"><strong>${esc(slotText)}</strong></span></a>`;
        })
        .join('');
      return `<section class="month"><h2 class="month-label">${esc(label)}</h2><div class="date-list">${rows}</div></section>`;
    })
    .join('');
  return `<header class="page-head"><p class="kicker">按日期</p><h1>往期</h1></header><form class="date-jump"><label for="jump-date">跳到日期</label><input type="date" id="jump-date"></form>${months || '<p class="empty">还没有期次。</p>'}`;
}

function searchPage() {
  return `<header class="page-head"><p class="kicker">全部期次</p><h1>检索</h1></header><form class="search" role="search"><label class="sr-only" for="q">检索全部期次</label><div class="search-field"><svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 20 20"/></svg><input id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="搜索标题、摘要、备注、来源" value="${esc(state.query)}"></div></form>${filtersHtml()}<div id="results">${searchResultsHtml()}</div>`;
}

function searchResultsHtml() {
  const query = state.query.trim();
  if (!query) return '<p class="empty">输入几个字，在全部期次里找。</p>';
  const hits = [];
  for (const meta of state.index.issues) {
    const issue = state.issues.get(meta.id);
    if (!issue || issue.error) continue;
    const matched = applyFilter(issue.items || []).filter((item) => matches(item, issue, query));
    if (matched.length) hits.push({ issue, items: matched });
  }
  if (!hits.length) return '<p class="empty">没有匹配的条目。</p>';
  const total = hits.reduce((sum, hit) => sum + hit.items.length, 0);
  const body = hits
    .map(
      (hit) =>
        `<div class="issue-head"><a class="issue-link" href="${issueHref(hit.issue.id)}">${esc(hit.issue.title || hit.issue.id)}</a></div>${sectionsHtml(hit.items, hit.issue, { query: state.query })}`
    )
    .join('');
  return `<p class="result-count">${total} 则</p>${body}`;
}

function favoritesPage() {
  if (!mergedFavoriteIds().length) {
    return '<header class="page-head"><p class="kicker">收藏</p><h1>还没有收藏</h1></header><p class="empty">点条目上的「收藏」，这句话会复制出来，并记在这台设备上。仓库里的收藏清单会和这台设备上的记录合在一起。</p>';
  }
  const { found, missing } = favoriteEntries();
  const groups = new Map();
  for (const entry of found) {
    if (!groups.has(entry.issue.id)) groups.set(entry.issue.id, { issue: entry.issue, items: [] });
    groups.get(entry.issue.id).items.push(entry.item);
  }
  const body = found.length
    ? [...groups.values()]
      .map(
        (group) =>
          `<div class="issue-head"><a class="issue-link" href="${issueHref(group.issue.id)}">${esc(group.issue.title || group.issue.id)}</a></div>${group.items.map((item) => cardHtml(item, group.issue, { favorite: true })).join('')}`
      )
      .join('')
    : '<p class="empty">没有符合筛选的收藏。</p>';
  const lost = missing
    .map((id) => `<p class="missing">找不到条目 ${esc(id)}</p>`)
    .join('');
  return `<header class="page-head"><p class="kicker">收藏</p><h1>${found.length} 则</h1></header>${filtersHtml()}${body}${lost}`;
}

function switcherHtml(currentId) {
  const pills = state.index.issues
    .map((meta) => {
      const on = meta.id === currentId;
      const parts = parseDate(meta.date);
      const dateText = parts ? `${parts.month}月${parts.day}日` : meta.date;
      return `<a class="issue-pill${on ? ' is-on' : ''}" href="${issueHref(meta.id)}"${on ? ' aria-current="true"' : ''}><span class="issue-pill-date">${esc(dateText)}</span><span class="issue-pill-slot">${esc(slotLabel(meta.slot))}</span></a>`;
    })
    .join('');
  return `<nav class="switcher" aria-label="切换期次">${pills}<a class="issue-pill issue-pill-all" href="#/dates">全部日期</a></nav>`;
}

function mastHtml(issue, items) {
  const visible = applyFilter(items).length;
  const total = items.length;
  const count = state.section === 'all' ? `${total} 则` : `显示 ${visible} / ${total} 则`;
  return `<header class="mast"><p class="kicker">${esc(dateKicker(issue.date))}</p><div class="mast-row"><h1>${esc(slotLabel(issue.slot))}</h1><p class="mast-count">${esc(count)}</p></div></header>`;
}

function issueBody(issue) {
  if (issue.error) return '<p class="empty">这一期没有打开。</p>';
  return sectionsHtml(applyFilter(issue.items || []), issue, { showEmpty: true });
}

function neighborHtml(index) {
  if (index < 0) return '';
  const issues = state.index.issues;
  const newer = issues[index - 1];
  const older = issues[index + 1];
  if (!newer && !older) return '';
  const link = (meta, label, extraClass) => {
    if (!meta) return '<span></span>';
    return `<a class="nav-card ${extraClass}" href="${issueHref(meta.id)}"><span class="nav-kicker">${label}</span><span class="nav-title">${esc(meta.title || meta.id)}</span></a>`;
  };
  return `<nav class="issue-nav" aria-label="相邻期次">${link(newer, '较新', '')}${link(older, '较旧', 'is-end')}</nav>`;
}

function filtersHtml() {
  const sections = [['all', '全部'], ...SECTIONS.map((section) => [section, section])];
  const sectionChips = sections
    .map(
      ([id, label]) =>
        `<button type="button" class="chip${state.section === id ? ' is-on' : ''}" data-section="${esc(id)}" aria-pressed="${state.section === id}">${esc(label)}</button>`
    )
    .join('');
  let blocks = '';
  if (state.section === FOCUS) {
    const blockChips = [['all', '全部子块'], ...BLOCKS.map((block) => [block, block])]
      .map(
        ([id, label]) =>
          `<button type="button" class="chip${state.block === id ? ' is-on' : ''}" data-block="${esc(id)}" aria-pressed="${state.block === id}">${esc(label)}</button>`
      )
      .join('');
    blocks = `<div class="chips chips-sub" role="group" aria-label="我关注的子块">${blockChips}</div>`;
  }
  return `<div class="filters"><div class="chips" role="group" aria-label="栏目">${sectionChips}</div>${blocks}</div>`;
}

function sectionsHtml(items, issue, options = {}) {
  const query = options.query || '';
  const visibleSections = options.showEmpty
    ? (state.section === 'all' ? SECTIONS : SECTIONS.filter((section) => section === state.section))
    : SECTIONS.filter((section) => items.some((item) => item.section === section));
  return visibleSections
    .map((section) => renderSection(section, items.filter((item) => item.section === section), issue, query))
    .join('');
}

function renderSection(section, items, issue, query) {
  const count = items.length ? `<span class="section-count">${items.length}</span>` : '';
  const body = items.length
    ? (section === FOCUS ? focusBlocksHtml(items, issue, query) : `<div class="block">${items.map((item) => cardHtml(item, issue, { query })).join('')}</div>`)
    : '<p class="section-empty">这段时间没有</p>';
  return `<section class="section" data-section="${esc(section)}"><header class="section-head"><h2 class="section-title">${esc(section)}</h2>${count}</header>${body}</section>`;
}

function focusBlocksHtml(items, issue, query) {
  const known = new Set(BLOCKS);
  const parts = [];
  for (const block of BLOCKS) {
    const list = items.filter((item) => item.block === block);
    if (!list.length) continue;
    parts.push(blockHtml(block, list, issue, query));
  }
  const rest = items.filter((item) => !known.has(item.block));
  if (rest.length) parts.push(blockHtml(rest[0].block || '其他', rest, issue, query));
  return parts.join('');
}

function blockHtml(title, items, issue, query) {
  const cards = items.map((item) => cardHtml(item, issue, { query })).join('');
  return `<div class="block"><p class="block-title">${esc(title)}</p>${cards}</div>`;
}

function cardHtml(item, issue, options = {}) {
  const query = options.query || '';
  const title = text(item.title);
  const summary = text(item.summary);
  const relevance = text(item.relevance).trim();
  const saved = readLocalFavorites().includes(item.id);
  const talk = `聊聊 ${item.id}`;
  const keep = `收藏 ${item.id}`;
  const summaryBody = summaryRemainder(title, summary);
  const summaryHtml = summaryBody
    ? `<p class="summary">${query ? highlight(summaryBody, query) : esc(summaryBody)}</p>`
    : '';
  const relevanceHtml = relevance
    ? `<p class="relevance"><span>相关</span>${query ? highlight(relevance, query) : esc(relevance)}</p>`
    : '';
  const sectionChip = options.favorite && item.section
    ? `<span class="section-chip">${esc(item.section)}</span>`
    : '';
  const origin = options.favorite ? `<span class="origin-chip">${esc(favOrigin(item.id))}</span>` : '';
  const forget = options.favorite && readLocalFavorites().includes(item.id)
    ? `<button type="button" class="text-btn" data-forget="${esc(item.id)}">移出本机</button>`
    : '';
  return `<article class="card" data-section="${esc(item.section || '')}" id="${esc(item.id)}">
    <p class="card-meta"><span class="id-chip">${esc(item.id)}</span>${sectionChip}${origin}<time class="time-chip" datetime="${esc(item.time || '')}">${esc(formatTime(item.time))}</time></p>
    <h3 class="item-title">${query ? highlight(title, query) : esc(title)}</h3>
    ${summaryHtml}
    ${relevanceHtml}
    ${sourcesHtml(item.sources)}
    <div class="actions">
      <button type="button" data-copy="${esc(talk)}">${esc(talk)}</button>
      <button type="button" data-copy="${esc(keep)}" data-save="${esc(item.id)}" aria-pressed="${saved}" class="${saved ? 'is-saved' : ''}">${esc(keep)}</button>
      ${forget}
    </div>
  </article>`;
}

function sourcesHtml(sources) {
  const links = (Array.isArray(sources) ? sources : []).filter(
    (source) => source && /^https?:\/\//i.test(source.url || '')
  );
  if (!links.length) return '';
  const anchors = links
    .map((source) => {
      const label = source.label || hostname(source.url);
      return `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    })
    .join('');
  return `<p class="sources"><span>来源</span>${anchors}</p>`;
}

function applyFilter(items) {
  return items.filter((item) => {
    if (state.section !== 'all' && item.section !== state.section) return false;
    if (state.section === FOCUS && state.block !== 'all' && item.block !== state.block) return false;
    return true;
  });
}

function matches(item, issue, query) {
  const haystack = [
    item.id,
    item.title,
    item.summary,
    item.relevance,
    item.section,
    item.block,
    item.time,
    issue.id,
    issue.title,
    issue.date,
    issue.slot,
    ...(Array.isArray(item.sources) ? item.sources.flatMap((source) => [source.label, source.url]) : []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return query
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .every((token) => haystack.includes(token.toLowerCase()));
}

function favoriteEntries() {
  const wanted = new Set(mergedFavoriteIds());
  const known = new Set();
  for (const meta of state.index.issues) {
    const issue = state.issues.get(meta.id);
    if (!issue || issue.error) continue;
    for (const item of issue.items || []) known.add(item.id);
  }
  const found = [];
  for (const meta of state.index.issues) {
    const issue = state.issues.get(meta.id);
    if (!issue || issue.error) continue;
    for (const item of applyFilter(issue.items || [])) {
      if (wanted.has(item.id)) found.push({ item, issue });
    }
  }
  const missing = state.section === 'all' ? mergedFavoriteIds().filter((id) => !known.has(id)) : [];
  return { found, missing };
}

function mergedFavoriteIds() {
  const seen = new Set();
  const ids = [];
  for (const id of [...state.fileFavorites, ...readLocalFavorites()]) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function favOrigin(id) {
  const inFile = state.fileFavorites.includes(id);
  const inLocal = readLocalFavorites().includes(id);
  if (inFile && inLocal) return '清单 · 本机';
  if (inFile) return '清单';
  return '本机';
}

function readLocalFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function addLocalFavorite(id) {
  const ids = readLocalFavorites();
  if (ids.includes(id)) return;
  ids.push(id);
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

function removeLocalFavorite(id) {
  const ids = readLocalFavorites().filter((item) => item !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

async function onClick(event) {
  const sectionButton = event.target.closest('button[data-section]');
  if (sectionButton) {
    state.section = sectionButton.getAttribute('data-section');
    if (state.section !== FOCUS) state.block = 'all';
    render();
    return;
  }
  const blockButton = event.target.closest('button[data-block]');
  if (blockButton) {
    state.block = blockButton.getAttribute('data-block');
    render();
    return;
  }
  const forget = event.target.closest('[data-forget]');
  if (forget) {
    removeLocalFavorite(forget.getAttribute('data-forget'));
    render();
    toast('已移出本机收藏');
    return;
  }
  const copyButton = event.target.closest('[data-copy]');
  if (!copyButton) return;
  const value = copyButton.getAttribute('data-copy');
  const saveId = copyButton.getAttribute('data-save');
  if (saveId) {
    addLocalFavorite(saveId);
    copyButton.classList.add('is-saved');
    copyButton.setAttribute('aria-pressed', 'true');
    renderTabs();
  }
  const ok = await copyText(value);
  toast(ok ? `已复制 ${value}` : `没有写入剪贴板。请手动复制：${value}`);
}

function onInput(event) {
  if (event.target.id === 'jump-date' && event.target.value) {
    location.hash = `#/date/${event.target.value}`;
    return;
  }
  if (event.target.id !== 'q') return;
  state.query = event.target.value;
  const results = document.getElementById('results');
  if (results) results.innerHTML = searchResultsHtml();
  const next = state.query ? `#/search?q=${encodeURIComponent(state.query)}` : '#/search';
  if (location.hash !== next) history.replaceState(null, '', next);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

let toastTimer = 0;
function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.add('is-on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('is-on'), 2200);
}

function tickClock() {
  const node = document.getElementById('clock');
  const parts = new Intl.DateTimeFormat('zh-Hans-CN', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  node.textContent = `${pick('hour')}:${pick('minute')}`;
}

function updateNet() {
  document.getElementById('offline').hidden = navigator.onLine;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const script = new URL('sw.js', document.baseURI);
  const scope = new URL('./', document.baseURI);
  navigator.serviceWorker.register(script, { scope: scope.href, updateViaCache: 'none' }).catch(() => {});
}

function issueHref(id) {
  return `#/issue/${encodeURIComponent(id)}`;
}

function slotLabel(slot) {
  return SLOT_LABEL[slot] || slot || '';
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function formatLongDate(value) {
  const parts = parseDate(value);
  if (!parts) return value || '';
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

function weekday(value) {
  const parts = parseDate(value);
  if (!parts) return '';
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return '日一二三四五六'[day];
}

function weekText(value) {
  const day = weekday(value);
  return day ? `周${day}` : '';
}

function dateKicker(value) {
  const week = weekText(value);
  const date = formatLongDate(value);
  return week ? `${date} · ${week}` : date;
}

function formatTime(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = parseDate(value);
    return parts ? `${parts.month}月${parts.day}日` : value;
  }
  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) normalized = `${value}:00+08:00`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) normalized = `${value}+08:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('zh-Hans-CN', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('month')}月${pick('day')}日 ${pick('hour')}:${pick('minute')}`;
}

function sameText(left, right) {
  const norm = (value) => String(value || '').trim().replace(/[。．.]+$/u, '');
  return norm(left) === norm(right);
}

function summaryRemainder(title, summary) {
  const body = String(summary || '').trim();
  const head = String(title || '').trim();
  if (!body || sameText(head, body)) return '';
  if (head && body.startsWith(head)) {
    const rest = body.slice(head.length).replace(/^[，,：:\s]+/u, '');
    return sameText(head, rest) ? '' : rest;
  }
  return body;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function text(value) {
  return value == null ? '' : String(value);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

function highlight(value, query) {
  const source = text(value);
  const tokens = String(query || '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map(escapeRegExp);
  if (!tokens.length) return esc(source);
  const pattern = new RegExp(tokens.join('|'), 'gi');
  let html = '';
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    html += esc(source.slice(last, match.index));
    html += `<mark>${esc(match[0])}</mark>`;
    last = match.index + match[0].length;
  }
  html += esc(source.slice(last));
  return html;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
