<p align="center">
  <img src="./public/icon/rounded_image.png" alt="xb" width="96" />
</p>

<h1 align="center">xb <sub><sup>个人定制分支</sup></sub></h1>

<p align="center">
  <strong>Redesign Weibo</strong>
</p>

<p align="center">like X but even better.</p>

<p align="right">
  <a href="./README.en.md">English</a>
</p>

> [!IMPORTANT]
> **这是个人定制分支，不是官方版本，也未上架任何商店。**
>
> 代码源自 [nnecec/xb](https://github.com/nnecec/xb)（GPL-3.0），仅供个人自用做了若干改动。
> 原项目的官网、应用商店链接、CI 状态等均不适用于本仓库。
> 想看原版、想反馈上游问题，请去 **[nnecec/xb](https://github.com/nnecec/xb)**。
>
> 与上游的具体差异见下方[「本分支的改动」](#本分支的改动)。

[![License](https://img.shields.io/github/license/GEMAngelaSaGill/weibo-xb)](./LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/GEMAngelaSaGill/weibo-xb)](https://github.com/GEMAngelaSaGill/weibo-xb/commits/main)

[![Bun](https://img.shields.io/badge/bun-1.3.14-000000?logo=bun&logoColor=white)](https://bun.sh)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![WXT](https://img.shields.io/badge/WXT-0.21-000000)](https://wxt.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.3-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

![preview](./assets/xb_1.9.0.webp)

xb 旨在浏览微博时去除噪音，打造一个专注、无干扰的阅读体验——就像 X 那样清爽。

xb 是一个浏览器插件。安装后，正常浏览微博，就能享受到重新设计的优美界面。

## 本分支的改动

相对上游 `nnecec/xb`，这个分支为了个人自用改了以下几块。

### 超话支持（上游没有）

上游遇到超话链接会直接放弃接管、退回微博原版页面。本分支补上了：

- **超话页**：`/p/{超话id}` 和 `/p/{超话id}/super_index` 现在由 xb 渲染，包含超话头部
  （头像、名称、帖子数、粉丝数）、分区栏（热门 / 最新 / 精华 / …）和无限滚动的信息流。
  数据走微博未公开接口 `ajax_proxy/chaohua/page`：`flowId` 切分区、`page` 翻页。
- **「我的超话」列表页**：新增 `/chaohua` 路由，左侧导航栏加了「超话」入口。
  微博桌面端本身没有统一的超话首页，所以这个页面是自建的。
- **一键签到**：串行签到所有关注的超话，右侧栏超话卡片和「我的超话」列表页各有一个入口。
  接口是 `GET /p/aj/general/button`，`api` 参数指向 `i.huati.weibo.com/aj/super/checkin`
  （直接打 huati 域会被拒）。思路参考了
  [Mokelichen/weibo-auto-sign](https://github.com/Mokelichen/weibo-auto-sign)。
- 超话页不显示右侧的搜索/热搜栏。

### 下载行为（改了落盘方式）

- **不再打包 zip**，每条媒体单独存盘。上游是把一次下载的全部媒体压成一个 zip。
- **文件名用下载时间戳**：`20261007_143052.jpg`，一条微博多张图时追加 `_1` `_2` 序号。
  上游用的是「作者名_正文前10字_序号」。
- **失败会说明原因**，并且支持只重试失败的那几项。上游这部分错误信息在几层 catch 里被吞掉了。
- **体积提醒阈值从 100MB 改为 500MB**。

> [!NOTE]
> 落盘走的是 `<a download>` + blob URL。这不是随便选的，另外两条路都不通：
> 把 CDN URL 直接交给 downloads API 会被微博 CDN 按 403 挡掉（请求没有 Referer、
> 还带 `Sec-Fetch-Site: none`，DNR 也改不了 Sec-* 头）；而把本地 `blob:` / `data:` URL
> 交给 downloads API 时，Chrome 会丢弃 `filename` 参数。
>
> 代价有两个：文件名里的路径分隔符会被替换成 `_`，**所以文件只能平铺在下载目录下，
> 建不了子文件夹**；另外浏览器会拦截「一个手势触发多个下载」，需要在
> `edge://settings/content/automaticDownloads`（Chrome 同理）里把 `weibo.com`
> 加进允许列表，批量下载才能一次全下来。

### 导航调整

- 左侧导航栏的「主页 / 探索」换成了「**全部关注 / 最新微博 / 特别关注**」。
- 「发微博」按钮去掉了填充样式，跟其它导航项保持一致。
- 移除了已经失效的「探索」开关（设置 → 左侧导航）。

## 安装（自行构建）

本分支不上架任何商店，需要自己构建后以「加载解压缩的扩展」方式装载：

```bash
bun install
bun run build:edge    # 产物在 .output/edge-mv3
# 或 bun run build     # Chrome，产物在 .output/chrome-mv3
```

然后打开 `edge://extensions`（Chrome 是 `chrome://extensions`），开启**开发人员模式**，
点**加载解压缩的扩展**，选中产物目录。

> [!WARNING]
> 如果之前装过应用商店版的 xb，**先禁用或卸载**，两个版本同时运行会互相打架。

想装官方版本请去上游仓库：[nnecec/xb](https://github.com/nnecec/xb)。

## 功能特点

以下为原项目的功能，本分支均有保留。

1. ✨ **X 风格** — 简洁纯粹，阅读优先
2. 🔓 **完全开源** — 代码可审计；网络请求与数据用途见[隐私政策](./PRIVACY_POLICY.md)
3. 🎯 **聚焦阅读** — 无干扰、清楚的信息流
4. 🚫 **减少干扰** — 默认隐藏贴图、广告等干扰，超话卡片可按需开启
5. 🆓 **完全免费** - 没有付费功能
6. 📷 **生图** - 把微博导出成图片，支持多种卡片模板
7. 🔤 **自定义字体** - 支持系统字体和可下载的开源字体
8. 🎨
   **自定义主题** - 支持自定义主题配色，[教程](https://github.com/nnecec/xb/discussions/54)
9. 📅 **浏览历史** - 本地记录浏览历史
10. ⬇️ **自由下载** - 支持下载和批量下载微博图片和视频（本分支改为逐条存盘 + 时间戳命名）

## 致谢

本分支的全部基础工作来自原项目，感谢原作者 [nnecec](https://github.com/nnecec) 与贡献者：

- **[nnecec/xb](https://github.com/nnecec/xb)** — 上游项目，GPL-3.0
- 受 [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) 和
  [BewlyCat](https://github.com/keleus/BewlyCat) 启发
- [Linux Do](https://linux.do/) 友好的中文社区

一键签到的接口用法参考了 [Mokelichen/weibo-auto-sign](https://github.com/Mokelichen/weibo-auto-sign)。

## 许可证

[GPL-3.0](./LICENSE)，与上游一致。本分支是上游的衍生作品，原始版权归原作者所有；
本分支的改动同样以 GPL-3.0 发布，任何人可以自由使用、修改、再分发。
