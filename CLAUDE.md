# 梦想家（mengxiangjia）开发说明

SillyTavern 第三方扩展：按角色人设盖一个用户和角色共同的家，一起布置；角色会回家、和用户互动、回小纸条。每个角色一个家。

## 作者的规矩（每次都要遵守）

- **不加会让生成失败的限制或校验。** 模型返回缺字段、格式不对时用默认值兜底，能用的部分照常用；只有完全没有正文时才报错。
- **不限制温度。** 温度只做 0–2 的接口范围钳制，不另外压低或封顶。
- **界面和 README 里不写任何具体的接口名、模型名、服务商名**，输入框占位只写「API 地址」「模型 ID」这类通用词。
- **「有入口就能点进去」**：界面上画成按钮、标签、卡片等看起来能点的东西，必须真的能打开对应内容；还没做的功能不放入口。
- **入口是魔法棒菜单里的「梦想家」**，另有可选的可拖动小屋浮窗（设置里开关，默认关）。0.5.1 起扩展设置里不再放梦想家的面板，所有设置都在梦想家内部。
- 酒馆的 `menu_button` 在窄屏的竖排容器里会变成竖排文字，放到梦想家面板外的按钮要加 `writing-mode: horizontal-tb` 和 `white-space: nowrap`。
- **不用系统的 `window.confirm`**（TT 里不一定弹得出来），确认一律用 `ui.js` 里的 `askConfirm()`（页面文件里写 `app.askConfirm()`）。
- **三处都要能用**：PC 浏览器、手机浏览器访问的（云）酒馆、TT（TauriTavern，iOS WebView）。手机优先：触控目标 ≥44px，面板按 visualViewport 定尺寸。
- **每次发版都更新 README**：在最上面加 `## 版本号 标题`，下面只写这次的变动，用作者看得懂的话，不写代码细节。插件设置页的「更新日志」读的就是 README 里第一个 `##` 段落。
- **发版打包**（作者要 zip 时）：根目录只放运行文件——`manifest.json`、`index.js`、`style.css`、`README.md`、`src/`。不放 `.github`、测试脚本、CLAUDE.md，README 里也不要写「没有工作流」之类的话。
- **仓库与推送**：仓库是 `https://github.com/ruka0604-droid/mengxiangjia`，直接推到 `main`（2026-10）。旧仓库 `Zaiyebuzuoyouqingdetiangou/mengxiangjia` 不再使用。
- 不从外网加载字体（国内用户访问不了），字体都用系统字体栈。

## 版本号

改版本时三处一起改，否则酒馆会缓存旧模块：

1. `manifest.json` 的 `version`，以及 `js`、`css` 后面的 `?mxj=版本`
2. 所有相对路径 import 的 `?mxj=版本`（`index.js` 和 `src/*.js`，包括动态 `import()`）
3. README 新增的 `## 版本` 段落

批量改 import 可以用：

```bash
python3 - <<'EOF'
import re, pathlib
ver = '0.3.0'
pat = re.compile(r"""((?:from\s+|import\s*\(\s*)['"])(\.{1,2}/[^'"?]+\.js)(?:\?mxj=[^'"]*)?(['"])""")
for p in [pathlib.Path('index.js'), *pathlib.Path('src').glob('*.js')]:
    t = p.read_text()
    p.write_text(pat.sub(lambda m: m.group(0) if m.group(2).startswith('../../') else f"{m.group(1)}{m.group(2)}?mxj={ver}{m.group(3)}", t))
EOF
```

（指向酒馆本体的 `../../../../../script.js` 不加版本号。）

## 结构

| 文件 | 作用 |
| - | - |
| `index.js` | 入口：魔法棒菜单项、扩展设置里的打开按钮、`CHAT_CHANGED` 监听；界面模块按需动态加载 |
| `src/settings.js` | 设置默认值与读写；每个角色的家存在 `extension_settings.mengxiangjia.homes[角色头像文件名]` |
| `src/api.js` | 生成通道：跟随当前 API（`ctx.generateRaw`），或副 API（酒馆连接配置 `ConnectionManagerRequestService.sendRequest` / 手动接口经 `/api/backends/chat-completions/generate` 转发）。副 API 出错直接报，不退回主 API |
| `src/character.js` | 读角色卡、用户人设、角色世界书（`/api/worldinfo/get`）、最近聊天 |
| `src/home-prompts.js` | 所有生成用的系统提示词（改提示词来这里） |
| `src/home-shared.js` | 生成共用：`liveHome`（等完确认家还在）、给模型看的家的近况、最近记录、最近纸条、现在时间 |
| `src/home-rooms.js` | 房子大小、房间种类（`roomTypeOf`）、默认家具、加减房间、搬家 |
| `src/home-house.js` | 盖房子（设计提案、入住）和他的样子（像素小人形象） |
| `src/home-visit.js` | 他回家（含纸条回信、他留的纸条、轮到他时的日记）、回应他、什么时候回家 |
| `src/home-notes.js` | 小纸条：贴纸条、请他回、请他留一张、已读 |
| `src/home-diary.js` | 交换日记 |
| `src/home-decor.js` | 布置改动记录、「他挑的」、按描述做家具 |
| `src/furniture.js` | 家具图库（`CATALOG` + 每种的 SVG 画法）、房间正面图绘制、平面图、小预览 |
| `src/floating.js` | 可选的小屋浮窗入口（拖动换位置、轻点打开） |
| `src/theme.js` | 三套主题（手帐 / 像素 / 绘本）和心情表情 |
| `src/art.js`、`src/imageApi.js`、`src/inflate.js` | 生图：准备提示词 → 请求一张图 → 预览 → 保存到酒馆 `/api/images/upload` |
| `src/sprite.js` | Q 版像素小人：16×24 像素格，按形象数据画；`poseFor` 按家具和他在做的事定站/坐/拿书/拿杯/闭眼 |
| `src/decorate.js` | 布置模式：拖动吸附、工具条、抽屉、仓库、墙面地板颜色、撤销重做 |
| `src/ui.js` | 界面核心：全屏 `<dialog>` 面板的打开关闭、`askConfirm`、`render`、忙碌条 `run`、`go` 换页、事件分发；本身不画页面 |
| `src/ui-common.js` | 界面共用的图标 `ICON` 和没有角色时的提示 |
| `src/view-home.js` | 小屋首页（房间、他在做什么、家具卡、扩建与搬家）和回家记录 |
| `src/view-build.js` | 盖房子 / 房子档案 |
| `src/view-notes.js`、`src/view-diary.js`、`src/view-look.js`、`src/view-art.js`、`src/view-settings.js` | 小纸条、交换日记、他的样子、画出我们的家、设置。设置按原来从上到下的顺序分组折叠（`state.settingsOpen`）：小屋浮窗（开关）/ 文字生成 / 生成时读取 / 他什么时候回家 / 生图连接 / 更新日志，最下面拆家；收起时显示一行摘要。别处要直达并展开某组，按钮写 `data-act="settings" data-group="image"`。设置里的文字框不要在 change 时整页重画（手机上会把刚点中的下一个输入框弄丢），Key、模型这类边打边存 |
| `src/util.js` | 小工具，含宽松 JSON 解析 `parseJsonLoose` |
| `style.css` | 全部样式限定在 `#mxj-root` 内；已经抵消了酒馆全局对 button/input/select/checkbox 的主题样式 |

只用 `SillyTavern.getContext()` 拿宿主能力，不静态 import 酒馆模块。

### 家的数据（`homes[key]`）

- `house`：`name`、`story`、`size`、`palette{wall,floor,accent,trim}`、`rooms[{id,name,note,wall,floor,arranged}]`、`furniture[{id,type,name,room,x(0–100),color,by:'ai'|'user'|'char',z,row,flip,scale,dy}]`、`storage[]`
- `presence`：`atHome`、`activity`、`mood`、`spot`（家具 id）
- `visits[]`：每次回家 `{event, options, turns[{user,reply}]}`，最多留 40 次
- `notes[]`：`{from:'user'|'char', kind, place, text, at, deferred, readAt, replyTo, replyId}`，最多留 300 张
- `changes[]` + `changesSeenAt`：用户布置的改动，回家时写进提示词
- `suggestions`：「他挑的」当前结果
- `house.storage[]`：仓库。收进仓库和移除房间时整件家具放进来（保留 `art`、`dy` 等），记 `previousRoom`。0.5.6 曾误存到 `furnitureStorage`，`settings.getHome()` 会自动合并过来
- 房间 `type`：房间种类（客厅、卧室……），用 `home-rooms.js` 的 `roomTypeOf()` 从名字认；`art` + `useArt`：画好的房间背景，`useArt === false` 时显示纯色墙地
- `look`：像素小人形象 `{hairStyle, hair, skin, eyes, outfit, accent, pants, shoes, accessory}`；没有时按名字给默认样子
- `diary`：`{mode:'visit'|'daily'|'manual', entries[{author, date, weather, text, quote, stamp}], readAt}`。mode 为 visit 时，他的日记并在回家那次调用里一起生成

房间 `arranged` 为真后完全按用户摆的位置画；否则自动排开防重叠。

### 界面要点

- 面板是挂在 `body` 上的 `<dialog>` + `showModal()`，尺寸跟 `visualViewport`（CSS 变量 `--mxj-vw/vh/vl/vt`），TT 下加 `data-tt-mobile-surface`。
- 事件用 `data-act` 委托；输入用 `data-field`。改界面后调用 `render()`，需要保留滚动位置时先设 `state.keepScroll = true`。
- 生成一律走 `run(提示文字, signal => …)`，自带忙碌条和「取消」。
- 每页一个 `view-*.js`，导出 `setup(app)`，返回这一页的 `views`（画页面）、`titles`（标题）、`actions`（`data-act` 按钮）、`fields`（`data-field` 改完时）、`inputs`（边打边存）、`forms`（回车提交）、`enter`（进页面前）、`after`（画完之后）。`ui.js` 把它们合起来分发；同名重复登记会在控制台警告。`app` 里有 `state`、`render`、`run`、`flash`、`go`、`askConfirm`、`root()`、`renderView(页名, char, home)`、`doVisit()`。
- 页面文件之间不互相 import，要用别的页就走 `app`（比如没房子时首页画盖房子页：`app.renderView('build', …)`）。没有登记的 `data-field` 当设置项存（`view-settings.js` 的 `saveField`）。
- 新加按钮：在对应页面的 `actions` 里加一项；新加页面：新建 `view-xxx.js`，在 `ui.js` 的 `pages` 里加上。

## 待定

- 交换日记里「贴一张图」：图片怎么存还没定（只存本机浏览器 / 用柏宝绘生成 / 不做），做之前先问作者。入口没放。

## 生成的约定

- 所有生成都走 `api.js` 的 `generate()`：取消后直接结束，结果不会写进存档；等完再写之前用 `home-shared.js` 的 `liveHome(char)` 确认家还在。
- 副 API 的模型列表：手动接口和酒馆连接配置都能拉（`fetchManualModels` / `fetchProfileModels`），结果缓存在 `independentModelCache`。

## 调用次数

每个动作一次调用：盖房子（含像素小人外形）、回家（含纸条回信、他留的纸条、轮到他时的日记）、每次回应、纸条马上回、他挑的、描述做家具、重新生成形象、叫他写日记。打开小屋本身不调用；只有到了回家时间才会触发回家那一次。

## 测试

这个仓库里没有测试脚本。之前的做法是：用一个模拟页面，加载酒馆 `public/style.css` 和 `public/css/popup.css`，提供假的 `SillyTavern.getContext()`、假的 `/api/backends/chat-completions/generate` 和 `/status`；然后用 Playwright 以 390×844 手机尺寸、触摸模式跑完整流程并截图。能连上真实酒馆时，优先在真实酒馆里测。作者不接受只靠模拟测试全绿就宣布手机兼容；涉及手机或 TT 的问题，要找到真实原因。
