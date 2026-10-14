# 讯息窗

个人新闻摘要。手机优先的静态页面，没有构建步骤。推送到 `main` 后，GitHub Actions 把它发布到 GitHub Pages。

线上地址：<https://hene-gif.github.io/info-window/>

页面里的样式、脚本、数据和 manifest 都用相对路径，所以站点挂在 `/info-window/` 下也能打开。浅色和深色跟随系统。离线由 service worker、manifest 和图标负责。

## 页面

- 打开就是最新一期。`data/index.json` 的 `issues` 从新到旧，第一条就是本期。
- 页首可以切换期次，也可以按日期回看。同一天可以有早、午、晚多期。
- 每一期固定两个栏目：「我关注的」和「国际重大影响」。某一栏没有条目时，页面显示「这段时间没有」。
- 选中「我关注的」后，可以再筛三个子块。
- 全文检索查全部期次的标题、摘要、相关说明、栏目、子块、期次和来源。
- 每条有两个按钮，复制的文字分别是 `聊聊 <条目 id>` 和 `收藏 <条目 id>`，中间一个空格。
- 收藏页合并 `data/favorites.json` 和这台设备的 localStorage。

## 加一期

一次提交，只改两个地方，可以直接推到 `main`：

1. 新建 `data/issues/<id>.json`
2. 把这一期插到 `data/index.json` 里 `issues` 数组的**最前面**（从新到旧）

不要改页面代码，也不要改 `sw.js`。发布前工作流会跑 `python3 scripts/check_data.py`。

期次 id 形如 `1014早`：两位月、两位日，再加时段。月日按台北日历，不足两位补零。常见时段是 `早`、`午`、`晚`。`1013试` 这种试刊把时段写成 `试`。哪一年写在 `date` 里，不写进 id。

条目 id 形如 `1014早-3`：期次 id、连字符、从 1 开始的序号。序号就是该条目在 `items` 里的位置。

栏目不是单独的数组。每条用 `section` 标明自己属于哪一栏。某一栏这次没有内容时，不要造占位条目；页面会自己显示「这段时间没有」。

## `data/index.json`

同一天有多期时，也按这个数组的顺序，把较新的放前面。

```json
{
  "version": 1,
  "issues": [
    {
      "id": "1014早",
      "date": "2026-10-14",
      "slot": "早",
      "title": "10月14日 · 早",
      "itemCount": 2
    }
  ]
}
```

| 字段 | 类型 | 约定 |
| --- | --- | --- |
| `version` | 数字 | 固定为 `1` |
| `issues` | 数组 | 从新到旧。同一天里也按这个数组的顺序，不另排 |
| `id` | 字符串 | `MMDD` + `slot`，例如 `1014早` |
| `date` | 字符串 | `YYYY-MM-DD`，台北的日历日，必须和 id 前四位一致 |
| `slot` | 字符串 | 和 id 里月日之后的部分一致 |
| `title` | 字符串 | 列表和窗口标题用的展示名 |
| `itemCount` | 整数 | 等于该期 `items` 的条数 |

## `data/issues/<id>.json`

文件名就是期次 id。`version`、`id`、`date`、`slot`、`title` 与目录里的那一条一致。`items` 按阅读顺序排列。下面是字段形状，不是要原样提交的新闻。仓库里现成的一期是 [`data/issues/1013试.json`](data/issues/1013试.json)。

```json
{
  "version": 1,
  "id": "1014早",
  "date": "2026-10-14",
  "slot": "早",
  "title": "10月14日 · 早",
  "items": [
    {
      "id": "1014早-1",
      "section": "我关注的",
      "block": "AI 模型和产品动态",
      "title": "标题",
      "time": "2026-10-14",
      "summary": "摘要。",
      "relevance": "",
      "sources": [
        {
          "label": "example.com",
          "url": "https://example.com/story"
        }
      ]
    },
    {
      "id": "1014早-2",
      "section": "国际重大影响",
      "title": "标题",
      "time": "2026-10-14T08:30:00+08:00",
      "summary": "摘要。",
      "relevance": "",
      "sources": []
    }
  ]
}
```

### 条目

| 字段 | 类型 | 约定 |
| --- | --- | --- |
| `id` | 字符串 | `<期次 id>-<序号>`，序号从 1 起，与数组位置一致 |
| `section` | 字符串 | 只能是 `我关注的` 或 `国际重大影响`，文字必须完全一致 |
| `block` | 字符串 | 仅 `我关注的` 要写，而且只能是下面三个子块之一。`国际重大影响` 不要写这个字段，或者写 `null` |
| `title` | 字符串 | 标题 |
| `time` | 字符串 | 台北时间。只有日期时写 `YYYY-MM-DD`，不要配一个虚构的钟点。有钟点时写 `YYYY-MM-DDTHH:mm:ss+08:00` |
| `summary` | 字符串 | 摘要 |
| `relevance` | 字符串 | 相关说明。没有就写空字符串 `""` |
| `sources` | 数组 | 来源。每一项是 `{ "label": "短名称", "url": "https://..." }`。`url` 只接受 `http` 或 `https`。没有链接时用空数组 |

`我关注的` 的三个子块，文字必须完全一致：

- `AI 模型和产品动态`
- `人机恋和 AI 陪伴赛道`
- `语音交互和 AI 硬件玩具`

只写日期的 `time` 按日历日显示，不会被当成 UTC 午夜再换算到另一天。没写时区的钟点会被当成台北时间。

## `data/favorites.json`

跨设备共用的收藏清单。最初是空的：

```json
{
  "ids": []
}
```

`ids` 是条目 id，例如 `1013试-1`。不要写期次 id。页面上的顺序不跟这个数组走，而是按期次从新到旧、期内按原序号。同一个 id 只出现一次。

本机另外有一份收藏，存在 localStorage，键名是 `info-window:favorites`，值是 JSON 字符串数组。点「收藏 &lt;id&gt;」会把这句复制到剪贴板，并把该 id 写入这个键。收藏页取文件和本机的并集。文件里有的条目会标成「清单」，只在本机的标成「本机」。收藏页上的「移出本机」只改 localStorage，不改仓库。

## 离线

`sw.js` 会预缓存应用壳、图标、目录、收藏文件和已经放进仓库的期次。在线打开过的新文件会进入运行时缓存。新加一期不必改 `sw.js`：在线时优先走网络，离线时用已经缓存的内容。

## 部署

工作流在 `.github/workflows/pages.yml`。它在推送到 `main` 时运行，也可以手动触发。没有站点构建，只检查数据，再把页面文件交给 GitHub Pages。

第一次发布前，到仓库的 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。

Settings → Pages → Source: GitHub Actions.

选好之后，合并到 `main` 的推送会发布到 <https://hene-gif.github.io/info-window/>。
