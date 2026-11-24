# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 这个仓库是什么

起于 [nnecec/xb](https://github.com/nnecec/xb)，但**阅读、下载、超话、签到、帖子菜单、图片查看**
这些主干功能都已经按本机需求重做过，行为与上游差异很大。**以上游文档或上游博客为准会踩坑**——
以本文件、`README.md` 的「本分支的改动」和代码为准。

## 开发命令

```bash
bun install                 # preinstall 有 only-allow bun，npm/yarn 会被拒
bun run dev:edge            # 产物 .output/edge-mv3-dev
bun run build:edge          # 产物 .output/edge-mv3
bun run lint                # oxfmt + oxlint（会直接改写文件）
bun run compile             # tsc --noEmit
bun run test:unit           # 全量
bunx vitest run src/lib/weibo/checkin/checkin-runner.test.ts   # 单文件
bunx vitest run -t "用例名"                                     # 按用例名
```

验证顺序：`lint → compile → test:unit → build`。

**改了代码要重载扩展**：`edge://extensions` 点刷新；已经打开的 weibo 页面还要刷新一次
（旧页面的 content script 会变成孤儿，扩展 API 全部失效）。

## 架构要点

### 微博接口只能从页面上下文发出

`services/client.ts` 的 `wbGet` / `wbPostForm` **不发请求**：它们 `window.postMessage`
把请求交给页面主世界的 `inject/install-api-bridge.ts`，由后者带着页面 Cookie 发出去。

推论：

- **后台 Service Worker 不能直接调 weibo.com 的接口**（没有页面上下文）
- 依赖微博接口的功能只能在 weibo.com 标签页里跑；后台要触发只能开或复用一个标签页
- 例外：下载取媒体字节走 background 的 `fetch`（CDN 资源，靠 DNR 补 Referer），不走桥接
- POST 必须带 `X-XSRF-TOKEN`，桥接层已自动处理；缺了会被 403

### 数据层只有两个门

- 公共：`data/weibo-data.ts`（`load*` + TanStack Query options），UI 只许从这里进
- 私有：`data/weibo-io.ts` → `services/client` + `adapters/` + `utils/transform/`
- UI 和 pages **不许**直接 import `weibo-io` 或 `services/adapters`

### 接管与路由

原生 `#app` 被设成 `display:none`，React 跑在 shadow root（宿主元素 `XB-SHELL`）。
`route/parse-weibo-url.ts` 把 URL 解析成 `WeiboPageDescriptor`；解析成 `unsupported` 时
`content/shell-state.ts` 会把页面还给微博原版。

新增一种页面要走四处：`page-descriptor.ts` 加类型 → `parse-weibo-url.ts` 加分支 →
`app/app-root.tsx` 加路由 → `pages/` 加组件。

### 信息流只有一个渲染收口

`components/infinite-feed-list.tsx` 是所有信息流（首页 / 超话 / 探索 / 个人页…）的共同渲染层。
本地过滤（关键词屏蔽）在这一层做，改一处全局生效。

### 缓存

`queries/status-cache.ts` 管跨页面的点赞 / 收藏 / 评论计数同步。
要把某条微博从信息流里摘掉用 `removeStatusFromFeedCaches`（「不感兴趣」「屏蔽此条微博」都靠它）。

## 本机特有的功能

### 超话与签到

| 部分     | 位置                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| 页面     | `pages/super-topic-page.tsx`（`/p/{id}` 和 `/p/{id}/super_index`）、`pages/super-topics-page.tsx`（`/chaohua`） |
| 数据     | `ajax_proxy/chaohua/page`，`flowId` 切分区、`page` 翻页                                                         |
| 签到接口 | `GET /p/aj/general/button`，`api` 参数指向 `i.huati.weibo.com/aj/super/checkin`；成功 `100000`、已签 `382004`   |
| 签到逻辑 | `checkin/checkin-runner.ts`（串行签到）、`checkin/checkin-log.ts`（日志 + 当天状态，存 `chrome.storage.local`） |
| 自动触发 | `checkin/use-auto-super-topic-checkin.ts`；后台负责投递、裁决与 20:00 的 alarms 保底                            |

自动签到的机制（**和早期版本完全不同，别按旧逻辑改**）：

- 后台只负责**投递**，不预先占用当天资格；由真正要执行签到的页面调 `checkin-claim` **领取**
- 领取时写 `running` 且 `attempts + 1`；**只有全部成功才写 `done`**
- 失败或中断后 1 小时内不许再领；每天最多自动尝试 2 次（`MAX_AUTO_CHECKIN_ATTEMPTS`）
- 保底 20:00；SW 启动时若已过 20 点，`startFallbackCheckinScheduler` 会检查当天是否需要补签
- 注册闹钟时保留已有的、时间正确的未来闹钟，避免重启时把它重置掉
- 保底派发时挨个试标签页（跳过被浏览器休眠的）；收不到消息就换下一个，全不通再开新标签页
- 签到日志在「我的超话」页底部可查看

### 帖子菜单

服务端随每条微博下发操作菜单，字段是 **`mblog_feed_back_menus_format`**；
`mblog_menus_new` 在时间线上经常是空的（实测 0/14），只作兜底。
`utils/transform/status.ts` 把它透传到 `FeedItem.menus`，菜单项动态渲染，不写死。

「不感兴趣 / 减少推送」走 `POST /ajax/feed/throwbatch`，`actionlog` 是服务端算好的对象，
**必须摊平成 `actionlog[字段]=值`**——整段 JSON 塞进一个字段会被服务端 500。

### 下载

`utils/download-media.ts` 走 `<a download>` + blob URL，文件名是下载时间戳。
不要改成 `chrome.downloads.download`：

- 直传 CDN URL 会被微博 CDN 403（无 Referer + `Sec-Fetch-Site: none`，DNR 改不了 Sec-* 头）
- `blob:` / `data:` URL 交给 downloads API 时 Chrome 会丢弃 `filename`
- anchor 的 `download` 属性不认路径，所以文件只能平铺，建不了子文件夹

### 图片查看方式

`app-settings` 的 `photoViewMode: 'weibo-preview' | 'original'`，默认 `weibo-preview`。

- 预览模式用 `thumbnailUrl`（信息流里已缓存、几乎秒开），底部给「查看原图」按钮，点了才换成 `largeUrl`
- 只作用于图片灯箱（`components/media-collection/` → `PhotoProvider`）；Live Photo 和视频不走这条路
- 设置入口：设置 → 媒体 → 「图片查看方式」

### 关键词屏蔽

`utils/keyword-filter.ts` + `blockedKeywords` 设置。在 `InfiniteFeedList` 渲染时过滤正文
（转发连带原微博正文），大小写不敏感，**不匹配作者名**。纯本地，不发请求。

## 陷阱

- **Windows + `core.autocrlf=true`**：`git status` 常显示上百个文件「已修改」，但内容零差异
  （只有换行符）。提交前用 `git diff --numstat` 确认真实改动，别一把 `git add -A` 夹带。
- `jszip` 仍留在 `package.json` 里，但源码已经不再引用（下载不再打包）。
- 超话卡片默认关闭（`showFollowedSuperTopicsCard`）；签到入口在「我的超话」页始终可用。
- 微博的部分接口是未公开的（超话信息流、签到、菜单反馈），字段和路径随时可能变；
  改这块时先在真实页面上验证，别只看类型定义。

## 参考代码仓库

本项目起于下列开源项目，部分功能的接口用法也参考了它们：

- **[nnecec/xb](https://github.com/nnecec/xb)** — 上游骨架（WXT + React + shadow root 接管、
  数据层、路由、生图、播放器等），GPL-3.0
- **[tiansh/yaofang（药方 YAWF）](https://github.com/tiansh/yaofang)** — 微博内容过滤的参考模型
  （关键字 / 作者 / 来源 → 隐藏 / 折叠 / 高亮）；本项目只取了「关键词 → 隐藏」一档
- **[Mokelichen/weibo-auto-sign](https://github.com/Mokelichen/weibo-auto-sign)** — 超话签到接口的参考实现
