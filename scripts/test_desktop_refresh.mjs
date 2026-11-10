// Exercises the desktop window against the real page: subpath, installability,
// unchanged catalog, a newly published edition, network failure, and narrow layouts.
// Serves the repo in memory overrides only — it does not write data/.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/info-window';
const PORT = 8765;
const DEBUG_PORT = 9334;
const ARTIFACTS = '/opt/cursor/artifacts';
const SITE = `http://127.0.0.1:${PORT}${PREFIX}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const overrides = new Map();
let indexStatus = 200;
const misses = [];

function typeFor(file) {
  return TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === PREFIX) {
    res.writeHead(302, { Location: `${PREFIX}/` });
    res.end();
    return;
  }
  if (!pathname.startsWith(`${PREFIX}/`)) {
    res.writeHead(404);
    res.end('no');
    return;
  }
  let rel = pathname.slice(PREFIX.length + 1);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('no');
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  if (overrides.has(pathname)) {
    const item = overrides.get(pathname);
    res.writeHead(item.status, { 'Content-Type': item.type || 'application/json; charset=utf-8' });
    res.end(item.body);
    return;
  }
  if (rel === 'data/index.json' && indexStatus !== 200) {
    res.writeHead(indexStatus, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('fail');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      misses.push(pathname);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'Content-Type': typeFor(file) });
    res.end(data);
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.next;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return result;
  }
}

async function waitFor(fn, ms = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < ms) {
    last = await fn();
    if (last) return last;
    await sleep(80);
  }
  throw new Error(`timed out: ${JSON.stringify(last)}`);
}

function publish(id, title) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
  for (const [key, item] of overrides) {
    if (key.endsWith('/data/index.json')) {
      const previous = JSON.parse(item.body);
      index.issues = previous.issues;
    }
  }
  const issue = {
    version: 1,
    id,
    date: '2026-11-09',
    slot: '测',
    title,
    items: [
      {
        id: `${id}-1`,
        section: '我关注的',
        block: '你可能没想到',
        title: '窗口还开着时，新发布的一期会自己接上',
        time: '2026-11-09T21:00:00+08:00',
        summary: '这是用来核对桌面窗口的测试期，不是一条新闻。',
        relevance: '',
        sources: [],
      },
    ],
  };
  index.issues.unshift({ id, date: issue.date, slot: '测', title, itemCount: 1 });
  overrides.set(`${PREFIX}/data/index.json`, { status: 200, body: JSON.stringify(index) });
  overrides.set(`${PREFIX}/data/issues/${id}.json`, { status: 200, body: JSON.stringify(issue) });
  return id;
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync('/tmp/info-window-chrome-');
  const chrome = spawn('/usr/local/bin/google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--lang=zh-CN',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    let version;
    for (let i = 0; i < 50; i += 1) {
      try {
        version = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then((response) => response.json());
        break;
      } catch {
        await sleep(100);
      }
    }
    assert(version?.webSocketDebuggerUrl, 'Chrome 调试端口没有起来');
    const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page');
    assert(page?.webSocketDebuggerUrl, '没有页面目标');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    const cdp = new Cdp(ws);
    const evaluate = async (expression) => {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
      }
      return result.result?.value;
    };
    const snap = () => evaluate('window.__infoWindow && window.__infoWindow.snapshot()');
    const shot = async (name) => {
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ARTIFACTS, `${name}.png`), Buffer.from(image.data, 'base64'));
    };
    const size = async (width, height, mobile = false) => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
      await evaluate('window.dispatchEvent(new Event("resize"))').catch(() => {});
    };
    const scheme = (value) => cdp.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });

    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');
    await scheme('light');
    await size(1280, 800);
    await cdp.send('Page.navigate', { url: SITE });
    const ready = await waitFor(async () => {
      const view = await snap();
      const href = await evaluate('location.href');
      const status = await evaluate('document.querySelector("#main")?.textContent?.slice(0, 80) || ""');
      if (!view?.ready || view.fatal) return null;
      const controlled = await evaluate('Boolean(navigator.serviceWorker.controller)');
      return controlled ? view : null;
    }, 25000);
    assert(ready.picker && ready.picker !== '期次', `目录没有打开：${ready.picker}`);
    assert(!ready.label.includes('收集'), '状态不该声称正在采集新闻');
    console.log('ready', ready.picker, ready.label, ready.latest);
    assert(await evaluate("document.getElementById('install').hidden === false"), '宽窗口应该看得见安装');

    const manifest = await evaluate("fetch('manifest.webmanifest', { cache: 'no-store' }).then((response) => response.json())");
    assert(manifest.display === 'standalone', 'manifest display 不是 standalone');
    assert(manifest.start_url === './' && manifest.scope === './', 'start_url / scope 应该相对子路径');
    assert(manifest.launch_handler?.client_mode === 'navigate-existing', '再次打开应回到已经开着的窗口');
    const iconSizes = new Set((manifest.icons || []).map((icon) => icon.sizes));
    assert(iconSizes.has('192x192') && iconSizes.has('512x512'), '缺 192 或 512 图标');
    for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg']) {
      const response = await fetch(`${SITE}${icon}`);
      assert(response.ok, `${icon} 在 /info-window/ 下打不开`);
    }
    const scope = await evaluate('navigator.serviceWorker.getRegistration().then((registration) => registration && registration.scope)');
    assert(scope.endsWith('/info-window/'), `service worker 范围不是子路径：${scope}`);
    let installability = 'API unavailable';
    try {
      installability = await cdp.send('Page.getInstallabilityErrors');
      const errors = installability.installabilityErrors || [];
      const blocking = errors.filter((error) => !/engagement|already/i.test(`${error.errorId} ${error.errorMessage || ''}`));
      assert(blocking.length === 0, `装不上：${JSON.stringify(blocking)}`);
    } catch (error) {
      installability = error.message;
    }
    console.log('installability', JSON.stringify(installability));

    const fit = async () => {
      const box = await evaluate(`(() => {
        const fresh = document.getElementById('fresh');
        const rect = fresh.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          freshRight: rect.right,
          freshLeft: rect.left,
          width: window.innerWidth,
          hidden: fresh.hidden,
          text: fresh.textContent,
        };
      })()`);
      assert(box.overflow <= 1, `横向溢出 ${box.overflow}px`);
      assert(!box.hidden && box.freshLeft >= -1 && box.freshRight <= box.width + 1, `新鲜度被挤出画面 ${JSON.stringify(box)}`);
      return box;
    };

    await fit();
    await shot('desktop_latest');
    await scheme('dark');
    await shot('desktop_dark');
    await scheme('light');
    await evaluate("document.getElementById('install').click()");
    assert(await evaluate("document.getElementById('install-sheet').hidden === false"), '安装说明没有打开');
    await shot('install_steps');
    await evaluate("document.getElementById('install-close').click()");
    await evaluate("document.querySelector('[data-float]').click()");
    assert(await evaluate("document.getElementById('float-sheet').hidden === false"), '悬浮说明没有打开');
    assert(await evaluate("document.getElementById('float-get').getAttribute('href')") === 'float/info-window-float.exe', '下载地址不对');
    await shot('float_edge_help');
    await evaluate("document.getElementById('float-close').click()");
    const asked = await evaluate(`(() => {
      window.__askedNotification = false;
      if (typeof Notification !== 'undefined') {
        Notification.requestPermission = () => {
          window.__askedNotification = true;
          return Promise.resolve('denied');
        };
      }
      return true;
    })()`);
    assert(asked, '通知探针没有装上');

    await size(440, 860, false);
    const narrow = await fit();
    const installHiddenNarrow = await evaluate("document.getElementById('install').hidden");
    assert(installHiddenNarrow, '窄窗口不该再塞一个安装按钮');
    console.log('narrow', narrow.text);
    await shot('narrow_desktop');

    await size(390, 844, true);
    await fit();
    await shot('mobile_latest');
    await size(320, 700, true);
    await fit();

    await size(1280, 800, false);
    const beforeQuiet = await snap();
    await evaluate(`document.querySelector('.row-head').click(); window.scrollTo(0, 520);`);
    await sleep(40);
    const reading = await snap();
    assert(reading.open.length >= 1, '没有展开条目');
    assert(reading.scroll > 200, `页面不够长，滚不动：${reading.scroll}`);
    await evaluate('window.__infoWindow.checkNow()');
    const quiet = await snap();
    assert(quiet.latest === beforeQuiet.latest, '没有新目录时最新一期变了');
    assert(quiet.picker === reading.picker, '没有新目录时把期次换了');
    assert(Math.abs(quiet.scroll - reading.scroll) < 8, `没有新目录时滚动被挪了 ${reading.scroll} -> ${quiet.scroll}`);
    assert(quiet.open.join() === reading.open.join(), '没有新目录时收起了正在看的条目');
    assert(quiet.phase === 'current', `核对成功却是 ${quiet.phase}`);
    assert(quiet.label === '刚刚' || quiet.label.endsWith('分钟前'), `新鲜度文案不对：${quiet.label}`);
    console.log('no-update ok', quiet.label);

    const reopen = reading.open[0];
    await evaluate('location.reload()').catch(() => {});
    const restored = await waitFor(async () => {
      const view = await snap();
      return view?.ready ? view : null;
    });
    assert(restored.open.includes(reopen), `重载后没有接回展开的条目 ${reopen} / ${restored.open}`);
    assert(Math.abs(restored.scroll - reading.scroll) < 40, `重载后阅读位置差太多 ${reading.scroll} -> ${restored.scroll}`);
    console.log('reload restored', restored.scroll, restored.open);

    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await evaluate("window.dispatchEvent(new Event('offline'));");
    await evaluate('window.__infoWindow.checkNow()');
    const dropped = await snap();
    assert(dropped.picker === restored.picker, '断网时内容被换掉了');
    assert(dropped.label === '离线' || dropped.label === '没连上', `断网状态不对：${dropped.label} ${dropped.phase}`);
    await size(1100, 760, false);
    await shot('offline_status');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await evaluate("window.dispatchEvent(new Event('online'));");
    const back = await waitFor(async () => {
      let view = await snap();
      if (view.phase !== 'current') await evaluate('window.__infoWindow.checkNow()');
      view = await snap();
      return view.phase === 'current' && (view.label === '刚刚' || view.label.endsWith('分钟前')) ? view : null;
    });
    assert(back.picker === restored.picker, '恢复网络后内容变了');
    console.log('offline resume', dropped.label, '->', back.label);

    await evaluate('caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))');
    indexStatus = 503;
    await evaluate('window.__infoWindow.checkNow()');
    const failed = await snap();
    assert(failed.label === '没对上', `目录失败时状态是 ${failed.label} / ${failed.phase}`);
    assert(failed.picker === back.picker, '目录失败时把正在看的期次清掉了');
    indexStatus = 200;
    await evaluate('window.__infoWindow.wake()');
    const resumed = await waitFor(async () => {
      const view = await snap();
      return view.phase === 'current' ? view : null;
    });
    assert(resumed.picker === failed.picker, '失败后恢复时换了期次');
    console.log('failure resume', failed.label, '->', resumed.label);

    await size(1280, 800, false);
    await evaluate("location.hash = '#/';");
    await sleep(30);
    await evaluate(`
      document.querySelectorAll('.row.is-open .row-head').forEach((button) => button.click());
      window.scrollTo(0, 0);
    `);
    await sleep(30);
    const parked = await snap();
    assert(parked.open.length === 0, '换上新一期前还有展开的条目');
    const published = publish('1109测', '11月9日 · 测');
    await evaluate('window.__infoWindow.checkNow()');
    const swapped = await waitFor(async () => {
      const view = await snap();
      return view.latest === published ? view : null;
    });
    assert(swapped.scroll < 8, `换上新一期时没有留在页首：${swapped.scroll}`);
    assert(swapped.phase === 'current', `已经换上了却还挂着 ${swapped.phase}`);
    assert(swapped.label !== '新的一期', '已经看着最新一期，不该再催');
    const heading = await evaluate("document.querySelector('h1')?.textContent || ''");
    assert(heading.includes('测'), `最新视图没有换成新的一期：${heading}`);
    console.log('swap latest', swapped.picker, heading);

    const older = swapped.older;
    assert(older && older !== published, '没有往期可以停住');
    await evaluate(`location.hash = ${JSON.stringify(`#/issue/${encodeURIComponent(older)}`)}`);
    await waitFor(async () => {
      const view = await snap();
      const hash = decodeURIComponent(view.hash || '');
      return hash.includes(older) || (view.hash || '').includes(older) ? view : null;
    });
    await evaluate(`
      document.querySelector('.row-head').click();
      document.querySelector('[data-discuss]').click();
      document.querySelector('[data-giscus]').dataset.stay = 'yes';
      window.scrollTo(0, 480);
    `);
    await sleep(40);
    const heldBefore = await snap();
    assert(heldBefore.discuss.length >= 1, '讨论没有打开');
    const heldId = publish('1109测二', '11月9日 · 测二');
    await evaluate('window.__infoWindow.wake()');
    const held = await waitFor(async () => {
      const view = await snap();
      return view.latest === heldId ? view : null;
    });
    assert(decodeURIComponent(held.hash).includes(older), `往期被拽走了：${held.hash}`);
    assert(held.picker !== swapped.picker, '往期标题不该突然变成刚才那期');
    assert(!held.picker.includes('测'), `往期标题被测试期替换了：${held.picker}`);
    assert(held.open.join() === heldBefore.open.join(), '展开的条目被收起');
    assert(held.discuss.join() === heldBefore.discuss.join(), '讨论被关掉');
    assert(Math.abs(held.scroll - heldBefore.scroll) < 8, `阅读位置被挪了 ${heldBefore.scroll} -> ${held.scroll}`);
    assert(held.label === '新的一期', `没有提示新的一期：${held.label}`);
    const stayed = await evaluate("document.querySelector('[data-giscus]')?.dataset.stay || ''");
    assert(stayed === 'yes', '讨论节点被重画了');
    await shot('new_edition_keeps_place');
    console.log('hold place', held.picker, held.label, held.scroll);

    const permission = await evaluate('window.__askedNotification === true');
    assert(permission === false, '页面申请了通知权限');
    console.log('passes');
    if (misses.length) console.log('misses', [...new Set(misses)].slice(0, 12));
  } finally {
    server.close();
    chrome.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
