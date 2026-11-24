<p align="center">
  <img src="./public/icon/rounded_image.png" alt="xb" width="96" />
</p>

<h1 align="center">xb <sub><sup>personal fork</sup></sub></h1>

<p align="center">
  <strong>Redesign Weibo</strong>
</p>

<p align="center">like X but even better.</p>

<p align="right">
  <a href="./README.md">中文</a>
</p>

> [!IMPORTANT]
> **This is a personal fork, not the official project, and it is not published to any store.**
>
> It is derived from [nnecec/xb](https://github.com/nnecec/xb) (GPL-3.0) and carries a handful of
> changes made for personal use. The upstream website, store listings and CI status do not apply here.
> For the original project — and to report upstream issues — go to
> **[nnecec/xb](https://github.com/nnecec/xb)**.
>
> For what this fork changes, see the
> [「本分支的改动」section in the Chinese README](./README.md#本分支的改动)
> (currently Chinese-only). In short:
>
> - **Super-topic (超话) support** — upstream bails out on those URLs; this fork renders
>   a super-topic page (header, channel tabs, feed) plus a `/chaohua` list page and a
>   one-click sign-in for every followed super topic.
> - **Downloads** — no more zip; each file is saved individually with a timestamp filename
>   (`20261007_143052.jpg`, suffixed `_1 _2` for multi-image posts), with the real failure
>   reason surfaced and a retry for failed items. Size warning raised from 100MB to 500MB.
> - **Navigation** — the left rail's 「主页 / 探索」became
>   「全部关注 / 最新微博 / 特别关注」.

[![License](https://img.shields.io/github/license/GEMAngelaSaGill/weibo-xb)](./LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/GEMAngelaSaGill/weibo-xb)](https://github.com/GEMAngelaSaGill/weibo-xb/commits/main)

[![Bun](https://img.shields.io/badge/bun-1.3.14-000000?logo=bun&logoColor=white)](https://bun.sh)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![WXT](https://img.shields.io/badge/WXT-0.21-000000)](https://wxt.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.3-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

![preview](./assets/xb_1.9.0.webp)

xb strips away the noise and gives you a focused, distraction-free reading
experience — similar to X.

xb is a browser extension. Once installed, simply browse Weibo as usual and enjoy
the beautifully redesigned interface.

👉 Screenshots and more: [xb website](https://xb-extension.vercel.app/) (upstream project)

## Install

This fork is **not published to any store** — build it and load it unpacked:

```bash
bun install
bun run build:edge    # output in .output/edge-mv3
# or bun run build     # Chrome, output in .output/chrome-mv3
```

Then open `edge://extensions` (or `chrome://extensions`), enable **Developer mode**, click
**Load unpacked** and select the output directory.

> [!WARNING]
> If you already have the store version of xb installed, **disable or remove it first** —
> running both at once will break things.

For the official build, see the upstream project: [nnecec/xb](https://github.com/nnecec/xb).

## Features

1. ✨ **X like Style** — Clean, reading-first.
2. 🔓 **Fully Open Source** — Auditable code; network requests and data use are
   documented in the [privacy policy](./PRIVACY_POLICY.md).
3. 🎯 **Focus on Reading** — Distraction-free, clearly feed.
4. 🚫 **Fewer Interruptions** — Hides stickers, ads, and other distractions by
   default; the supertopic card is optional.
5. 🆓 **Everything is Free** - No paid features.
6. 📷 **Take a shot** - Export Weibo as an image with multiple card templates.
7. 🔤 **Custom Font** - Choose from system fonts or downloadable open-source
   fonts.
8. 🎨 **Custom Theme** — Customize theme colors. See
   [Tutorial](https://github.com/nnecec/xb/discussions/54).
9. 📅 **Browsing History** — The history is recorded locally.
10. ⬇️ **Free to downloads** - Supports download and batch download of Weibo
    images and videos.

## Credits

All of the groundwork comes from the upstream project — thanks to
[nnecec](https://github.com/nnecec) and its contributors. Also inspired by
[BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) and
[BewlyCat](https://github.com/keleus/BewlyCat); [Linux Do](https://linux.do/) is a friendly community.

## Reference repositories

This project started from, and borrowed API details from, the following open-source projects:

- **[nnecec/xb](https://github.com/nnecec/xb)** — upstream skeleton (WXT + React + shadow-root
  takeover, data layer, routing, image generation, media player), GPL-3.0
- **[tiansh/yaofang](https://github.com/tiansh/yaofang)** — reference model for Weibo content
  filtering (keyword / author / source → hide / collapse / highlight); this fork only implements
  the "keyword → hide" part
- **[Mokelichen/weibo-auto-sign](https://github.com/Mokelichen/weibo-auto-sign)** — reference
  implementation of the super-topic check-in API

> [!NOTE]
> The rating feature talks to the upstream author's server
> `xb-server.nnecec-3d5.workers.dev` by default (rating is off unless enabled). To avoid relying
> on it, point `XB_SERVER_URL` at your own service at build time, or keep rating disabled.

## License

[GPL-3.0](./LICENSE), same as upstream. This fork is a derivative work; copyright for the
original code belongs to its authors, and the changes in this fork are released under the
same license.
