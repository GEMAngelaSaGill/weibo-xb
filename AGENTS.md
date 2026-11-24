# AGENTS.md

文档地图：`AGENTS.md`（本文：命令、结构、约定）· `CLAUDE.md`（架构要点与本机特有功能）·
`PRODUCT.md`（产品边界）· `DESIGN.md` / `DESIGN.json`（UI 规则与 token）·
`README.md` / `README.en.md`（面向用户，含「本分支的改动」）·
`src/lib/app-settings.ts`（设置项默认值）

## Project Overview

xb 是一个把 weibo.com 重写成 X 风格阅读体验的浏览器扩展。

项目起于 [nnecec/xb](https://github.com/nnecec/xb)，但阅读、下载、超话、签到、帖子菜单、
图片查看等主干功能已经按本机需求重做过，**与上游差异较大**。上游文档只作背景参考；
实现细节以 `CLAUDE.md` 和代码为准。

技术栈：WXT、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、videojs、motion、
Zustand、TanStack Query、`@reactuses/core`。

## Developer Commands

```bash
bun run dev           # 开发服务器（Chrome）
bun run dev:edge      # 开发服务器（Edge）
bun run dev:firefox   # 开发服务器（Firefox）
bun run build         # 构建 Chrome / Chromium
bun run build:edge    # 构建 Edge
bun run build:firefox # 构建 Firefox
bun run test:unit     # 单测（Vitest + jsdom）
bun run test:watch    # 单测 watch
bun run compile       # 只做类型检查
bun run lint          # oxfmt + oxlint
bun run knip          # 未使用的文件 / 导出 / 依赖
bun run zip           # 打包 Chrome .zip
bun run zip:edge      # 打包 Edge .zip
bun run zip:firefox   # 打包 Firefox .zip
```

- 包管理器使用 **bun**（`preinstall` 有 `only-allow bun`）
- 单个测试文件：`bunx vitest run path/to/x.test.ts`；按用例名：`bunx vitest run -t "用例名"`

## Verification Order

lint → typecheck → test → build

## Project Structure

```
src/
├── entrypoints/       # background, weibo.content, weibo-main-world, weibo-hide, options
├── lib/
│   ├── app-settings.ts / app-settings-store.ts
│   ├── custom-theme.ts / font-loader.ts / utils.ts
│   └── weibo/
│       ├── app/          # shell、root、layout
│       ├── checkin/      # 超话签到：runner（串行）、log（当天状态/历史）、auto 触发
│       ├── components/   # feed、profile、gen-image、media-player、media-collection、super-topic…
│       ├── content/      # host selectors、shell state、page takeover、lifecycle
│       ├── data/         # weibo-data（公共 IO + Query options）、weibo-io（私有）
│       ├── hooks/ pages/ route/ inject/ platform/ stores/
│       ├── queries/      # status-cache 等缓存操作
│       ├── services/     # client、adapters、m-weibo-client、endpoints
│       ├── models/
│       └── utils/        # transform、download-media、keyword-filter、filename…
├── components/ui/     # shadcn
├── hooks/
└── test/
```

## Architecture Notes

详细的「为什么」见 `CLAUDE.md`，这里只列必须知道的约束：

- **Content Script UI**：WXT `createShadowRootUi` + `cssInjectionMode: 'ui'`，React 在 shadow root 里，
  与微博 CSS 隔离；宿主元素是 `XB-SHELL`，原生 `#app` 被隐藏。
- **API 桥接**：`services/client.ts` 用 `postMessage` 把请求交给页面主世界的
  `inject/install-api-bridge.ts`。**后台 Service Worker 无法直接调 weibo.com 接口**。
- **数据层**：`data/weibo-data.ts` 是唯一的公共 IO 门；私有实现在 `data/weibo-io.ts`。
  UI 与 pages 不得直接 import 后者或 `services/adapters`。
- **设置**：`app-settings.ts` 定义类型与默认值，`app-settings-store.ts` 持久化到 `chrome.storage`。
- **路由**：`parse-weibo-url.ts` → `page-descriptor.ts`；`unsupported` 会把页面还给微博原版。
- **缓存**：`queries/status-cache.ts` 负责跨页面的计数同步与条目移除。
- **下载**：`utils/download-media.ts` 用 `<a download>` + blob URL，**不要**改回 downloads API
  （原因见 `CLAUDE.md`）。
- **签到**：后台只投递，页面领取资格；成功后写完成标记，失败有冷却与次数上限。

## Code Patterns

### Settings

`useAppSettings` 选择性订阅；开关与默认值以 `app-settings.ts` 为准。

```typescript
const fontSizeClass = useAppSettings((s) => s.fontSizeClass)
const setFontSizeClass = useAppSettings((s) => s.setFontSizeClass)
```

### Mutations

- 跨页面乐观更新 → `status-cache.ts`
- 仅刷新查询 → mutation `meta.invalidates`

```typescript
const followMutation = useMutation({
  mutationFn: () => followUser(uid),
  meta: {
    invalidates: [
      ['weibo', 'profile'],
      ['weibo', 'profile-hover'],
    ],
  },
})
```

### Shared UI

- Profile 共享：`profile-shared.tsx`（`ProfileBanner`、`ProfileMutualFollowers`、`formatProfileCount`）
- 产品范围与 UI 原则：见 `PRODUCT.md`、`DESIGN.md`

## Testing

- Vitest + `jsdom`；setup：`src/test/setup.ts`
- 测试与源码同目录，`*.test.ts` / `*.spec.ts`；组件用 `@testing-library/react`

## Code Quality

- **Linter**：oxlint（strict，TS/React/unicorn）
- **Formatter**：oxfmt（无分号、单引号、import 排序）
- **TypeScript**：extends `.wxt/tsconfig.json`

## Browser Extension Notes

- Manifest v3（WXT）
- 权限：`storage`、`cookies`、`declarativeNetRequest`（媒体下载请求头）、`alarms`（签到保底）
- Host 权限：`https://weibo.com/*`、`https://www.weibo.com/*`、`https://*.sinaimg.cn/*`、
  `https://*.sinajs.cn/*`、`https://*.weibocdn.com/*`、`https://m.weibo.cn/*`、
  `https://xb-server.nnecec-3d5.workers.dev/*`
- Web accessible resource：`weibo-main-world.js`
- Rating 构建环境变量：`XB_SIGN_SECRET` / `VITE_XB_SIGN_SECRET`；可选 `XB_SERVER_URL`。
  这些签名密钥会打进扩展产物，只应视为兼容性手段，不是安全边界。
