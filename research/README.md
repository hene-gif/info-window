# 研究看板

给妮可看的全球股市研究页，静态挂在 GitHub Pages：

<https://hene-gif.github.io/info-window/research/>

浅色页，深色字，高对比。和讯息窗分开。不走讯息窗的 hash 路由，也不改 `data/` 或 `scripts/check_data.py`。

## 以后每一轮怎么更新

只改 JSON 和原文，不要为了加一条检验去改页面代码。

1. 把新的 markdown 放进 `research/docs/`，图放进 `research/docs/img/`。正文里的图用相对路径 `img/文件名.png`。
2. 在 `research/data/docs.json` 里登记这篇文档。
3. 把检验写进 `research/data/items.json`。**只写文档里有的话**：状态、证据标签、主人、p 值、样本，文档没写就留空或写在 `mapping` 里。
4. 总览结论改 `research/data/overview.json`。对照原版 / 修订版的评估改 `research/data/reviews.json`。理论地图的节点和边改 `research/data/theory.json`。当下市场信息改 `research/data/now.json`。已知规律改 `research/data/known.json`。
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

理论地图的层、节点和边。边只记结构和 `itemId`。**状态、证据、探索性都从 `items.json` 读**，不要在这里再写一份。改一条检验的状态，地图上的线形会跟着变。

图分成四层，宽屏从左到右，窄屏从上到下。页面只把主线画出来：检验状态不是「待测」，或者 `placeNote` 写了「进入总主线判定」（现在是 C9、C6、L1）。其余关系只出现在图下面的名单里。同一对市场只画一条线，箭头从原因指向被影响的一边。线上只放编号。

| 字段 | 用法 |
| --- | --- |
| `layers` | 四层的名称和一句说明。节点用 `layer` 归到某一层 |
| `nodes` | 市场或指标。`satellites` 是附在大节点上的小块，例如 A股下面的港股、中概股。`group: "chip"` 的节点收成「亚洲芯片链」 |
| `itemId` | 对应 `items.json` 里的 `id`，例如 `r2-C9`、`T3` |
| `short` | 这条线的短名称，用文档里的说法 |
| `hypothesis` | 这条线属于哪条假说，用文档里的说法 |
| `placeNote` | 它在总主线里的位置。文档没写就留空 |
| `also` | 线没有直接连上、但点开时要一起高亮的节点 |
| `paths` | 原因节点 `from` 指向被影响的节点 `to`。一条检验可以有多条，页面仍保证每一对只画一条线 |
| `loop` | 绕回同一个节点的线，例如降准降息回到 A股 |

### `now.json`

「当下市场信息」页（`#/now`）只读这个文件。猜想、价格和日期都写在这里，页面不另编。`narratives` 空着时，页面显示「本期内容整理中」。`verification_status` 用：待业绩验证、部分支持、业绩支持、业绩打脸、待数据验证。

`factors` 是「因子叠加」栏：`factors[]` 每个因子带 `indicators[]`（当前值、日期、来源、10 年百分位、强度、方向），`stack` 是叠加读数，`rules` 是写死的分级规则。这个字段由本地脚本 `factors.py` 生成，强度只用 低 / 中 / 高 / 极高 / 暂缺，方向只用 加压 / 缓解 / 持平 / 暂缺。没有 `factors` 时这一栏不显示。

### `known.json`

「已知规律」页（`#/known`）只读这个文件。`intro` 是页首说明。`position.foundation`、`position.our_addition`、`position.open_gaps` 分别是「我们站在哪里」的三列：底座（成熟规律）、我们新增的部分、尚未解决的缺口。`items` 按 `category` 分组。`reliability` 用 `反复验证` / `有争议` / `较新证据有限`。`relation` 用 `底座直接用` / `我们在检验的新增部分` / `注意事项`。论文字段是 `作者`、`年份`、`标题`、`url`。`related_tests` 写检验编号，能对上理论地图或进展里的条目时，芯片会链过去。`method_lessons` 是页尾的「第三轮方法教训」。

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
