const SECTIONS = ['我关注的', '国际重大影响'];
const FOCUS = '我关注的';
const BLOCKS = ['AI 模型和产品动态', '人机恋和 AI 陪伴赛道', '语音交互和 AI 硬件玩具', '全球股市'];
const SLOT_LABEL = { 早: '早间', 午: '午间', 晚: '晚间', 试: '试刊' };
const LS_KEY = 'info-window:favorites';
const MENU_LIMIT = 21;

const ICON = {
  out: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 4h5.75v5.75M11.6 4.4 4.5 11.5"/></svg>',
  talk: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4.25h10A1.75 1.75 0 0 1 16.75 6v6.25A1.75 1.75 0 0 1 15 14H9.4l-3.4 2.55V14H5a1.75 1.75 0 0 1-1.75-1.75V6A1.75 1.75 0 0 1 5 4.25z"/></svg>',
  keep: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.25 3.5h7.5a1 1 0 0 1 1 1v11.9a.35.35 0 0 1-.55.29L10 13.9l-4.2 2.79a.35.35 0 0 1-.55-.29V4.5a1 1 0 0 1 1-1z"/></svg>',
  fav: '<svg class="m-fav" viewBox="0 0 12 12" role="img" aria-label="已收藏"><path d="M3 1h6a.75.75 0 0 1 .75.75v9.1a.25.25 0 0 1-.39.2L6 8.8l-3.36 2.25a.25.25 0 0 1-.39-.2v-9.1A.75.75 0 0 1 3 1z"/></svg>',
  tick: '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>',
  prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>',
};

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
  open: new Set(),
  back: '#/',
  backScroll: 0,
  restoreScroll: null,
};

if (state.route.name === 'search') state.query = state.route.query;
else state.back = location.hash || '#/';

const $ = (id) => document.getElementById(id);
const bar = $('bar');
const main = $('main');
const picker = $('picker');
const menu = $('menu');
const field = $('q');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

bar.addEventListener('click', onBarClick);
main.addEventListener('click', onMainClick);
field.addEventListener('input', onSearchInput);
$('bar-search').addEventListener('submit', (event) => {
  event.preventDefault();
  field.blur();
});
$('cancel').addEventListener('click', (event) => {
  event.preventDefault();
  field.blur();
  state.restoreScroll = state.backScroll;
  location.hash = state.back;
});
$('jump-date').addEventListener('change', (event) => {
  if (event.target.value) location.hash = `#/date/${event.target.value}`;
});
$('jump-date').addEventListener('click', (event) => {
  try {
    event.target.showPicker?.();
  } catch {
    /* 不支持 showPicker 的浏览器会照常聚焦原生控件。 */
  }
});
document.addEventListener('click', (event) => {
  if (!menu.hidden && !menu.contains(event.target) && !picker.contains(event.target)) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) {
    closeMenu();
    picker.focus();
  }
});
// iOS Safari 只有在页面监听了 touchstart 时才会显示 :active 按下态。
document.addEventListener('touchstart', () => {}, { passive: true });

window.addEventListener('hashchange', () => {
  state.route = parseRoute();
  if (state.route.name === 'search') state.query = state.route.query;
  else {
    state.back = location.hash || '#/';
    if (document.activeElement === field) field.blur();
  }
  render({ resetScroll: true });
  if (state.restoreScroll != null && state.route.name !== 'search') window.scrollTo(0, state.restoreScroll);
  state.restoreScroll = null;
});

window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
window.addEventListener('resize', closeMenu);

boot();

async function boot() {
  watchForUpdates();
  tickClock();
  setInterval(tickClock, 30000);
  updateNet();
  renderBar();
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
  closeMenu();
  renderBar();
  if (state.fatal) {
    document.title = '讯息窗';
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
  if (options.resetScroll) window.scrollTo(0, 0);
}

function pageView() {
  const { name, id } = state.route;
  if (name === 'search') return { html: searchPage(), title: '检索 · 讯息窗' };
  if (name === 'favorites') return { html: favoritesPage(), title: '收藏 · 讯息窗' };
  if (name === 'dates') return { html: datesPage(), title: '往期 · 讯息窗' };
  if (name === 'date') return { html: dayPage(id), title: `${formatLongDate(id)} · 讯息窗` };
  const issueId = currentIssueId();
  if (!issueId) return { html: '<p class="empty">还没有期次。</p>', title: '讯息窗' };
  const issue = state.issues.get(issueId);
  return { html: issuePage(issueId), title: issue ? `${issue.title || issue.id} · 讯息窗` : '讯息窗' };
}

function currentIssueId() {
  const { name, id } = state.route;
  if (name === 'issue') return id;
  if (name === 'home') return state.index.issues[0]?.id || '';
  return '';
}

function renderBar() {
  const name = state.route.name;
  const searching = name === 'search';
  $('bar-top').hidden = searching;
  $('bar-search').hidden = !searching;
  if (searching && field.value !== state.query) field.value = state.query;
  picker.hidden = !state.ready;
  $('picker-label').textContent = pickerLabel();
  document.querySelectorAll('[data-tool]').forEach((tool) => {
    const on = tool.dataset.tool === name;
    tool.classList.toggle('is-on', on);
    if (on) tool.setAttribute('aria-current', 'page');
    else tool.removeAttribute('aria-current');
  });
  const total = mergedFavoriteIds().length;
  const badge = $('fav-count');
  badge.hidden = total === 0;
  badge.textContent = String(total);
  $('jump').hidden = name !== 'dates';
  $('tabs').hidden = name === 'dates';
  renderTabs();
}

function renderTabs() {
  const tabs = $('tabs');
  const blocks = $('blocks');
  const name = state.route.name;
  if (!state.ready || name === 'dates') {
    tabs.innerHTML = '';
    blocks.hidden = true;
    return;
  }
  const items = contextItems();
  const counted = name !== 'search' || Boolean(state.query.trim());
  const count = (list) => (counted ? `<span class="tab-n">${list.length}</span>` : '');
  // 三个栏目标签只建一次，之后原地更新，下划线才能滑到新位置。
  if (!tabs.querySelector('.tab')) {
    tabs.innerHTML = `${[['all', '全部'], ...SECTIONS.map((section) => [section, section])]
      .map(([id, label]) => `<button type="button" class="tab" data-section="${esc(id)}" aria-pressed="false">${esc(label)}<span class="tab-n"></span></button>`)
      .join('')}<i class="tab-ink" aria-hidden="true"></i>`;
  }
  tabs.querySelectorAll('.tab').forEach((button) => {
    const id = button.getAttribute('data-section');
    const on = state.section === id;
    const list = id === 'all' ? items : items.filter((item) => item.section === id);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    button.querySelector('.tab-n').textContent = counted ? String(list.length) : '';
  });
  moveInk(tabs);
  blocks.hidden = state.section !== FOCUS;
  if (blocks.hidden) return;
  const focus = items.filter((item) => item.section === FOCUS);
  blocks.innerHTML = [['all', '全部子块'], ...presentBlocks(focus).map((block) => [block, block])]
    .map(([id, label]) => {
      const on = state.block === id;
      const list = id === 'all' ? focus : focus.filter((item) => item.block === id);
      return `<button type="button" class="block-tab${on ? ' is-on' : ''}" data-block="${esc(id)}" aria-pressed="${on}">${esc(label)}${count(list)}</button>`;
    })
    .join('');
}

function moveInk(container) {
  const ink = container.querySelector('.tab-ink');
  const on = container.querySelector('.tab.is-on');
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

function contextItems() {
  const { name, id } = state.route;
  if (name === 'search') return searchHits(false).flatMap((hit) => hit.items);
  if (name === 'favorites') return favoriteEntries(false).found.map((entry) => entry.item);
  if (name === 'date') {
    return state.index.issues
      .filter((meta) => meta.date === id)
      .flatMap((meta) => state.issues.get(meta.id)?.items || []);
  }
  return state.issues.get(currentIssueId())?.items || [];
}

function pickerLabel() {
  const { name, id } = state.route;
  if (name === 'favorites') return '收藏';
  if (name === 'dates') return '往期';
  if (name === 'search') return '检索';
  if (name === 'date') return `${shortDate(id)} ${weekText(id)}`.trim();
  const meta = state.index.issues.find((item) => item.id === currentIssueId());
  if (meta) return issueLabel(meta);
  return name === 'issue' ? '没有这一期' : '期次';
}

function onBarClick(event) {
  if (event.target.closest('#picker')) {
    toggleMenu();
    return;
  }
  const tab = event.target.closest('[data-section]');
  if (tab) {
    const section = tab.getAttribute('data-section');
    if (section === state.section) return;
    state.section = section;
    if (section !== FOCUS) state.block = 'all';
    filterChanged();
    return;
  }
  const blockTab = event.target.closest('[data-block]');
  if (blockTab) {
    const block = blockTab.getAttribute('data-block');
    if (block === state.block) return;
    state.block = block;
    filterChanged();
    return;
  }
  const searchTool = event.target.closest('[data-tool="search"]');
  if (searchTool && state.route.name !== 'search') {
    // 在点击事件里同步聚焦，iOS 才会弹出键盘。
    event.preventDefault();
    state.backScroll = window.scrollY;
    $('bar-top').hidden = true;
    $('bar-search').hidden = false;
    field.value = state.query;
    field.focus();
    location.hash = state.query ? `#/search?q=${encodeURIComponent(state.query)}` : '#/search';
  }
}

function filterChanged() {
  render();
  if (window.scrollY > 0) window.scrollTo(0, 0);
  if (!reduceMotion.matches) {
    main.animate([{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
      duration: 220,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  }
}

function toggleMenu() {
  if (menu.hidden) openMenu();
  else closeMenu();
}

function openMenu() {
  menu.innerHTML = menuHtml();
  menu.hidden = false;
  $('scrim').hidden = false;
  picker.setAttribute('aria-expanded', 'true');
  const box = picker.getBoundingClientRect();
  const width = menu.offsetWidth;
  menu.style.left = `${Math.max(8, Math.min(box.left - 10, window.innerWidth - width - 8))}px`;
  const current = menu.querySelector('.menu-item.is-on');
  if (current) current.scrollIntoView({ block: 'nearest' });
}

function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  $('scrim').hidden = true;
  picker.setAttribute('aria-expanded', 'false');
}

function menuHtml() {
  const currentId = currentIssueId();
  const latestId = state.index.issues[0]?.id;
  const perDay = new Map();
  for (const meta of state.index.issues) perDay.set(meta.date, (perDay.get(meta.date) || 0) + 1);
  const days = new Map();
  for (const meta of state.index.issues.slice(0, MENU_LIMIT)) {
    if (!days.has(meta.date)) days.set(meta.date, []);
    days.get(meta.date).push(meta);
  }
  const body = [...days.entries()]
    .map(([date, metas]) => {
      const total = perDay.get(date) || metas.length;
      const whole = total > 1 ? `<a href="#/date/${encodeURIComponent(date)}">全天 ${total} 期</a>` : '';
      const head = `<p class="menu-day"><span>${esc(shortDate(date))} ${esc(weekText(date))}</span>${whole}</p>`;
      const rows = metas
        .map((meta) => {
          const on = meta.id === currentId;
          const latest = meta.id === latestId ? '<span class="menu-latest">最新</span>' : '';
          return `<a class="menu-item${on ? ' is-on' : ''}" href="${issueHref(meta.id)}"${on ? ' aria-current="page"' : ''}>${ICON.tick}<span>${esc(slotLabel(meta.slot))}</span>${latest}<span class="n">${esc(meta.itemCount)} 条</span></a>`;
        })
        .join('');
      return head + rows;
    })
    .join('');
  return `<div class="menu-scroll">${body || '<p class="menu-day">还没有期次</p>'}</div><a class="menu-foot" href="#/dates">全部往期${ICON.next}</a>`;
}

function issuePage(id) {
  const issue = state.issues.get(id);
  if (!issue) return '<p class="empty">没有这一期。<a href="#/dates">看看往期</a></p>';
  const position = state.index.issues.findIndex((meta) => meta.id === id);
  return `<h1 class="sr-only">${esc(issue.title || issue.id)}</h1>${issueBody(issue)}${pagerHtml(position)}`;
}

function issueBody(issue, options = {}) {
  if (issue.error) return '<p class="empty">这一期没有打开。</p>';
  return sectionsHtml(applyFilter(issue.items || []), issue, { showEmpty: true, ...options });
}

function dayPage(date) {
  const metas = state.index.issues.filter((meta) => meta.date === date);
  if (!metas.length) {
    return `<h1 class="sr-only">${esc(formatLongDate(date))}</h1><p class="empty">这一天没有期次。<a href="#/dates">看看往期</a></p>`;
  }
  const body = metas
    .map((meta) => {
      const issue = state.issues.get(meta.id);
      if (!issue) return '';
      const shown = issue.error ? 0 : applyFilter(issue.items || []).length;
      return `<section class="day-issue"><h2 class="issue-title"><a href="${issueHref(issue.id)}">${esc(slotLabel(issue.slot))}</a><span class="n">${shown} 条</span><a class="issue-open" href="${issueHref(issue.id)}">单独看这一期${ICON.next}</a></h2>${issueBody(issue, { blocks: false })}</section>`;
    })
    .join('');
  return `<h1 class="sr-only">${esc(formatLongDate(date))}</h1>${body}`;
}

function datesPage() {
  const months = new Map();
  for (const meta of state.index.issues) {
    const parts = parseDate(meta.date);
    const key = parts ? `${parts.year}年${parts.month}月` : meta.date;
    if (!months.has(key)) months.set(key, new Map());
    const days = months.get(key);
    if (!days.has(meta.date)) days.set(meta.date, []);
    days.get(meta.date).push(meta);
  }
  const body = [...months.entries()]
    .map(([label, days]) => {
      const rows = [...days.entries()]
        .map(([date, metas]) => {
          const parts = parseDate(date);
          const slots = metas
            .map((meta) => `${esc(slotLabel(meta.slot))} <span class="n">${esc(meta.itemCount)}</span>`)
            .join('<span class="n"> · </span>');
          return `<a class="day" href="#/date/${encodeURIComponent(date)}"><span class="day-num">${parts ? parts.day : ''}</span><span class="day-week">${esc(weekText(date))}</span><span class="day-slots">${slots}</span>${ICON.next}</a>`;
        })
        .join('');
      return `<section><h2 class="month-head">${esc(label)}</h2>${rows}</section>`;
    })
    .join('');
  return `<h1 class="sr-only">往期</h1>${body || '<p class="empty">还没有期次。</p>'}`;
}

function searchPage() {
  return `<h1 class="sr-only">检索</h1><div id="results">${searchResultsHtml()}</div>`;
}

function searchHits(filtered) {
  const query = state.query.trim();
  if (!query) return [];
  const hits = [];
  for (const meta of state.index.issues) {
    const issue = state.issues.get(meta.id);
    if (!issue || issue.error) continue;
    const pool = filtered ? applyFilter(issue.items || []) : issue.items || [];
    const matched = pool.filter((item) => matches(item, issue, query));
    if (matched.length) hits.push({ issue, items: matched });
  }
  return hits;
}

function searchResultsHtml() {
  if (!state.query.trim()) return '<p class="empty">在全部期次里找标题、摘要、相关说明、来源和编号。</p>';
  const hits = searchHits(true);
  if (!hits.length) return '<p class="empty">没有匹配的条目。</p>';
  const total = hits.reduce((sum, hit) => sum + hit.items.length, 0);
  const body = hits
    .map((hit) => groupHtml(hit.issue, hit.items, { query: state.query, crumb: true }))
    .join('');
  return `<p class="result-count">${total} 条结果</p>${body}`;
}

function favoritesPage() {
  if (!mergedFavoriteIds().length) {
    return '<h1 class="sr-only">收藏</h1><p class="empty">还没有收藏。展开一条，点「收藏」，这句话会复制出来，并记在这台设备上。仓库里的收藏清单也会合在这里。</p>';
  }
  const { found, missing } = favoriteEntries(true);
  const groups = new Map();
  for (const entry of found) {
    if (!groups.has(entry.issue.id)) groups.set(entry.issue.id, { issue: entry.issue, items: [] });
    groups.get(entry.issue.id).items.push(entry.item);
  }
  const body = found.length
    ? [...groups.values()]
      .map((group) => groupHtml(group.issue, group.items, { favorite: true, crumb: true }))
      .join('')
    : '<p class="empty">没有符合筛选的收藏。</p>';
  const lost = missing.map((id) => `<p class="missing">找不到条目 ${esc(id)}</p>`).join('');
  return `<h1 class="sr-only">收藏</h1>${body}${lost}`;
}

function groupHtml(issue, items, options) {
  return `<h2 class="grp-head"><a href="${issueHref(issue.id)}">${esc(issueLabel(issue))}</a><span class="n">${items.length}</span></h2>${rowsHtml(items, issue, options)}`;
}

function pagerHtml(position) {
  if (position < 0) return '';
  const newer = state.index.issues[position - 1];
  const older = state.index.issues[position + 1];
  if (!newer && !older) return '';
  const newerLink = newer
    ? `<a class="newer" href="${issueHref(newer.id)}">${ICON.prev}<span>较新</span>${esc(issueLabel(newer))}</a>`
    : '';
  const olderLink = older
    ? `<a class="older" href="${issueHref(older.id)}"><span>较旧</span>${esc(issueLabel(older))}${ICON.next}</a>`
    : '';
  return `<nav class="pager" aria-label="相邻期次">${newerLink}${olderLink}</nav>`;
}

function sectionsHtml(items, issue, options = {}) {
  const visible = options.showEmpty
    ? (state.section === 'all' ? SECTIONS : SECTIONS.filter((section) => section === state.section))
    : SECTIONS.filter((section) => items.some((item) => item.section === section));
  return visible
    .map((section) => sectionHtml(section, items.filter((item) => item.section === section), issue, options))
    .join('');
}

function sectionHtml(section, items, issue, options) {
  const count = items.length ? `<span class="n">${items.length}</span>` : '';
  let body = '<p class="sec-empty">这段时间没有</p>';
  if (items.length) {
    const grouped = section === FOCUS && options.blocks !== false && state.block === 'all';
    body = grouped ? blocksHtml(items, issue, options) : rowsHtml(items, issue, options);
  }
  // 只看一个栏目时，页首的栏目标签已经写明是哪一栏。
  const head = state.section === 'all'
    ? `<h2 class="sec-head">${esc(section)}${count}</h2>`
    : `<h2 class="sr-only">${esc(section)}</h2>`;
  return `<section class="sec${state.section === 'all' ? '' : ' is-solo'}">${head}${body}</section>`;
}

function presentBlocks(items) {
  const names = [];
  const seen = new Set();
  for (const name of BLOCKS) {
    names.push(name);
    seen.add(name);
  }
  for (const item of items) {
    const name = typeof item.block === 'string' ? item.block.trim() : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function blocksHtml(items, issue, options) {
  return presentBlocks(items)
    .map((block) => [block, items.filter((item) => item.block === block)])
    .filter(([, list]) => list.length)
    .map(([block, list]) => `<h3 class="blk-head">${esc(block)}<span class="n">${list.length}</span></h3>${rowsHtml(list, issue, options)}`)
    .join('');
}

function rowsHtml(items, issue, options) {
  return `<div class="rows">${items.map((item) => rowHtml(item, issue, options)).join('')}</div>`;
}

function rowHtml(item, issue, options = {}) {
  const query = options.query || '';
  const show = (value) => (query ? highlight(value, query) : esc(value));
  const id = text(item.id);
  const title = text(item.title);
  const summary = summaryRemainder(title, text(item.summary));
  const relevance = text(item.relevance).trim();
  const links = sourceLinks(item.sources);
  const time = formatTime(item.time, issue.date);
  const open = state.open.has(id);
  const saved = mergedFavoriteIds().includes(id);
  const bodyId = `body-${id}`;
  const source = links.length
    ? `<span class="m-src">${esc(links[0].label)}${links.length > 1 ? ` +${links.length - 1}` : ''}</span>`
    : '';
  const meta = [
    `<span class="m-id">${show(id)}</span>`,
    time ? `<time datetime="${esc(item.time)}">${esc(time)}</time>` : '',
    source,
    options.favorite ? `<span class="m-tag">${esc(favOrigin(id))}</span>` : '',
    saved && !options.favorite ? ICON.fav : '',
  ].join('');
  const crumb = options.crumb
    ? `<p class="crumb">${esc([item.section, item.block].filter(Boolean).join(' · '))}</p>`
    : '';
  const sources = links.length
    ? `<p class="srcs">${links.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}${ICON.out}</a>`).join('')}</p>`
    : '';
  const body = [
    crumb,
    summary ? `<p class="summary">${show(summary)}</p>` : '',
    relevance ? `<p class="note"><b>相关</b>${show(relevance)}</p>` : '',
    sources,
    actionsHtml(id, saved, options),
  ].join('');
  return `<article class="row${open ? ' is-open' : ''}" data-row="${esc(id)}"><button type="button" class="row-head" aria-expanded="${open}" aria-controls="${esc(bodyId)}"><span class="row-title">${show(title)}</span><span class="row-meta">${meta}</span></button><div class="row-body" id="${esc(bodyId)}"><div class="row-clip"><div class="row-inner">${body}</div></div></div></article>`;
}

function actionsHtml(id, saved, options) {
  const talk = `聊聊 ${id}`;
  const keep = `收藏 ${id}`;
  const forget = options.favorite && readLocalFavorites().includes(id)
    ? `<button type="button" class="act act-quiet" data-forget="${esc(id)}">移出本机</button>`
    : '';
  return `<div class="acts"><button type="button" class="act" data-copy="${esc(talk)}">${ICON.talk}${esc(talk)}</button><button type="button" class="act${saved ? ' is-saved' : ''}" data-copy="${esc(keep)}" data-save="${esc(id)}" aria-pressed="${saved}">${ICON.keep}${esc(keep)}</button>${forget}</div>`;
}

function sourceLinks(sources) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => source && /^https?:\/\//i.test(source.url || ''))
    .map((source) => ({ url: source.url, label: source.label || hostname(source.url) }));
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

function favoriteEntries(filtered) {
  const wanted = new Set(mergedFavoriteIds());
  const known = new Set();
  const found = [];
  for (const meta of state.index.issues) {
    const issue = state.issues.get(meta.id);
    if (!issue || issue.error) continue;
    for (const item of issue.items || []) known.add(item.id);
    const pool = filtered ? applyFilter(issue.items || []) : issue.items || [];
    for (const item of pool) {
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

async function onMainClick(event) {
  const head = event.target.closest('.row-head');
  if (head) {
    toggleRow(head.closest('.row'));
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
    markSaved(saveId);
  }
  const ok = await copyText(value);
  toast(ok ? `已复制「${value}」` : `没有写入剪贴板。请手动复制：${value}`);
}

function toggleRow(row) {
  if (!row) return;
  const id = row.getAttribute('data-row');
  const open = !row.classList.contains('is-open');
  row.classList.toggle('is-open', open);
  row.querySelector('.row-head').setAttribute('aria-expanded', String(open));
  if (open) {
    state.open.add(id);
    revealRow(row);
  } else {
    state.open.delete(id);
  }
}

function revealRow(row) {
  const top = row.getBoundingClientRect().top;
  const bottom = top + row.querySelector('.row-head').offsetHeight + row.querySelector('.row-inner').offsetHeight;
  const limit = window.innerHeight - 16;
  if (bottom <= limit) return;
  const room = top - bar.getBoundingClientRect().bottom - 8;
  const delta = Math.min(bottom - limit, room);
  if (delta > 0) window.scrollBy({ top: delta, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
}

function markSaved(id) {
  const row = main.querySelector(`.row[data-row="${CSS.escape(id)}"]`);
  if (row) {
    const button = row.querySelector('[data-save]');
    button.classList.add('is-saved');
    button.setAttribute('aria-pressed', 'true');
    const meta = row.querySelector('.row-meta');
    if (!meta.querySelector('.m-fav') && !meta.querySelector('.m-tag')) meta.insertAdjacentHTML('beforeend', ICON.fav);
  }
  renderBar();
}

function onSearchInput() {
  state.query = field.value;
  const results = $('results');
  if (results) results.innerHTML = searchResultsHtml();
  renderTabs();
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
  const node = $('toast');
  node.textContent = message;
  node.classList.add('is-on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.classList.remove('is-on'), 2200);
}

function tickClock() {
  const parts = new Intl.DateTimeFormat('zh-Hans-CN', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  $('clock').textContent = `${pick('hour')}:${pick('minute')}`;
}

function updateNet() {
  $('offline').hidden = navigator.onLine;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const script = new URL('sw.js', document.baseURI);
  const scope = new URL('./', document.baseURI);
  navigator.serviceWorker.register(script, { scope: scope.href, updateViaCache: 'none' }).catch(() => {});
}

function watchForUpdates() {
  // 第一次安装时页面还没有被接管，不必重载。
  const reloadsOnTakeover = Boolean(navigator.serviceWorker?.controller);
  if (reloadsOnTakeover) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  }
  // 主屏幕上的应用多半是从后台切回来，并不重新打开。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates(reloadsOnTakeover).catch(() => {});
  });
}

async function checkForUpdates(reloadsOnTakeover) {
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const previous = registration?.active || null;
  await registration?.update().catch(() => {});
  // 页面代码已经会换新 worker 并重载一次，目录检查让给那一次。
  if (
    reloadsOnTakeover &&
    (registration?.installing || registration?.waiting || (registration?.active && registration.active !== previous))
  ) {
    return;
  }
  if (!state.ready && !state.fatal) return;
  const index = await fetchJson('data/index.json');
  if (JSON.stringify(index) !== JSON.stringify(state.index)) window.location.reload();
}

function issueHref(id) {
  return `#/issue/${encodeURIComponent(id)}`;
}

function issueLabel(meta) {
  return `${shortDate(meta.date)} ${slotLabel(meta.slot)}`.trim();
}

function slotLabel(slot) {
  return SLOT_LABEL[slot] || slot || '';
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function shortDate(value) {
  const parts = parseDate(value);
  return parts ? `${parts.month}月${parts.day}日` : value || '';
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

function formatTime(value, issueDate) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return shortDate(value);
  let normalized = value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) normalized = `${value}:00+08:00`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) normalized = `${value}+08:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  const day = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const clock = `${pick('hour')}:${pick('minute')}`;
  return day === issueDate ? clock : `${shortDate(day)} ${clock}`;
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
