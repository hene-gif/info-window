# 研究看板

给妮可看的全球股市研究页，静态挂在 GitHub Pages：

<https://hene-gif.github.io/info-window/research/>

浅色页，深色字，高对比。和讯息窗分开。不走讯息窗的 hash 路由，也不改 `data/` 或 `scripts/check_data.py`。

## 以后每一轮怎么更新

只改 JSON 和原文，不要为了加一条检验去改页面代码。

1. 把新的 markdown 放进 `research/docs/`，图放进 `research/docs/img/`。正文里的图用相对路径 `img/文件名.png`。
2. 在 `research/data/docs.json` 里登记这篇文档。
3. 把检验写进 `research/data/items.json`。**只写文档里有的话**：状态、证据标签、主人、p 值、样本，文档没写就留空或写在 `mapping` 里。
4. 总览结论改 `research/data/overview.json`。对照原版 / 修订版的评估改 `research/data/reviews.json`。理论地图的节点和边改 `research/data/theory.json`。
5. 不要发明通过/被否。第二轮没跑完时，没过门槛写文档里的「本轮尚未检出」，不要写成已经推翻。
6. 推到 `main`。Pages 工作流会把整个 `research/` 拷进站点。讯息窗的 service worker 不算 `research/` 的版本，所以只改研究数据不会逼讯息窗重载。

### `items.json` 字段

| 字段 | 用法 |
| --- | --- |
| `id` | 页面锚点和意见链接用。框架登记表和第二轮若编号撞车，加前缀，例如 `v5-C1`、`r2-C1` |
| `code` | 给人看的编号，保持文档写法，如 `T1′`、`C9` |
| `status` | 只能是 `通过` / `被否` / `未通过` / `待测` / `未能检验` |
| `evidence` | 文档标签：`因果` / `相关` / `待验证` |
| `owner` | 只填文档写明的角色。没写就 `""` |
| `round` | `第一轮` / `第二轮` / `复验` |
| `mapping` | 文档对不干净的地方，留给下一轮的人看 |
| `exploratory` | `true` 时进展页打「探索性」徽章并加注：不占 N，不能当成正式结论。C1、C2 因偏离清单降级；X1 预先就是探索项 |

进展页以 `理论层第一轮报告_修订版.md` 为准。原版若用词更重（例如 T2「被推翻」），写在 `statusOriginal`，评估页会对照着展示。

### `theory.json`

理论地图的节点、分区和边。边只记结构和 `itemId`。**状态、证据、探索性都从 `items.json` 读**，不要在这里再写一份。改一条检验的状态，地图上的颜色和标签会跟着变。

| 字段 | 用法 |
| --- | --- |
| `itemId` | 对应 `items.json` 里的 `id`，例如 `r2-C9`、`T3` |
| `short` | 这条线的短名称，用文档里的说法 |
| `hypothesis` | 这条线属于哪条假说，用文档里的说法 |
| `placeNote` | 它在总主线里的位置。文档没写就留空 |
| `also` | 线没有直接连上、但点开时要一起高亮的节点 |
| `wide` / `narrow` | 宽屏和窄屏连哪些市场。`from` / `to` 是节点 id；`paths` 是一条检验连到多个市场；`loop` 是绕在一个节点上的线，`side` 是优先方向（左 `left`、右 `right`、上 `up`、下 `down`）。页面自己把线画在市场之间的空隙里，并只在线上放编号。编号放不下就留在图下面的名单里，不要在这里写标签坐标 |

## 修改意见（GitHub Issue）

「写意见」打开：

`https://github.com/hene-gif/info-window/issues/new?labels=research-feedback&title=...&body=...`

看板用未登录的 GitHub API 列出带 `research-feedback` 的 issue。读失败时页面会说明，不挡提交。

**每一轮结束后：**

1. 该采纳的改写进 `data/*.json` 和原文。
2. 用 GitHub 把对应 issue **关掉**，不要删。看板上会显示「已关」。
3. 不要用 issue 当数据源改结论。结论只来自 `data/*.json`。

仓库里需要有 `research-feedback` 这个标签。如果还没有，到 Issues → Labels 建一个；没有标签时，预填链接仍能打开，但标签可能加不上。

## 不要动

- `data/issues/`、`data/columns/`、`data/index.json`、`data/favorites.json`
- `scripts/check_data.py`（发布仍只检查讯息窗数据）
- 讯息窗的栏目、子块、收藏和检索逻辑

页首「研究」只是链到这个目录。
