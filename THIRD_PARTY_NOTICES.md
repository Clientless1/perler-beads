# Third-party sources

## Project license scope

Project-authored code and original patterns are licensed under the root [MIT License](LICENSE), Copyright (c) 2026 conglanglang (Clientless1). Third-party code, models, artwork and adaptations retain their respective licenses described below; the root license does not replace those terms.

Maintainer-supplied WeChat screenshots, photographs and exported showcase images in `docs/screenshots/wechat/` are included for project demonstration. They are not automatically licensed under the code's MIT License. Third-party graphics visible in screenshots retain their original terms. Source filenames and checksums are recorded in `docs/screenshots/wechat/sources.json`.

## Conversion

- [Jett-Wu / Perler_Beads_Generator](https://github.com/Jett-Wu/Perler_Beads_Generator), Copyright (c) 2026 Jett-Wu, MIT. Reviewed revision `aa360a1d50f9dd3d87a30354960f3f718bd412a4`. The 221-color MARD basic palette in `src/utils/beadPalette.js` is adapted from `src/palette.ts`. Its multi-point cell sampling and separate cartoon/photo processing informed the WeChat-compatible implementation in `src/utils/imageProcessor.js`. License: [licenses/Jett-Wu-MIT.txt](licenses/Jett-Wu-MIT.txt).
- [yourlin / Fusible-Beads-Studio](https://github.com/yourlin/Fusible-Beads-Studio), Copyright (c) 2026 yourlin, MIT. Reviewed revision `b12b157134af20a6480ece7984f07c3bdb202d2f`. `src/utils/colorScience.js` is adapted from `packages/shared/src/color/ciede2000.ts`, with TypeScript types removed. License: [licenses/Fusible-Beads-Studio-MIT.txt](licenses/Fusible-Beads-Studio-MIT.txt).
- CIEDE2000 validation uses published reference pairs from Sharma, Wu & Dalal (2005).

The palette reduction in `src/utils/colorMatcher.js` is implemented locally: weighted perceptual-error reduction favors distinct low-frequency details over redundant near-identical background colors. All conversion runs locally and requires no remote AI service.

## Ready-to-use patterns

- [16x16 Food](https://opengameart.org/content/16x16-food) by [ARoachIFoundOnMyPillow](https://opengameart.org/users/aroachifoundonmypillow), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Download archive: https://opengameart.org/sites/default/files/food_0.zip . The selected original PNGs are retained in `src/static/templates/sources/`. Eighty-seven food, fruit and dessert designs are adapted to MARD bead colors, centered on 29 × 29 or 58 × 58 grids, and stored as complete grids in `src/data/templates.json`. Six designs are scaled by an integer factor of two.
- [Tiny Creatures](https://opengameart.org/content/tiny-creatures) by Clint Bellanger, CC0 1.0. Selected 60 distinct static creatures and animals. The exact black background is removed, visible pixels are cropped and centered on a 29-cell board, and colors are matched to MARD. Original license: [licenses/Tiny-Creatures-CC0.txt](licenses/Tiny-Creatures-CC0.txt). Source-page record: [licenses/tiny_creatures-source.txt](licenses/tiny_creatures-source.txt).
- [496 pixel art icons for medieval/fantasy RPG](https://opengameart.org/content/496-pixel-art-icons-for-medievalfantasy-rpg) by Henrique Lazarini (7Soul1), CC0 1.0. Selected 190 icons including game equipment, small objects, food, potions and plants. The chosen public-domain archive explicitly removes icons derived from copyrighted games. Source-page record: [licenses/rpg_icons-source.txt](licenses/rpg_icons-source.txt).
- [Random animals](https://opengameart.org/content/random-animals) by HDST, CC0 1.0. Selected six distinct animals. Source-page record: [licenses/random_animals-source.txt](licenses/random_animals-source.txt).
- These three network collections contribute 256 new patterns. Their selected original PNGs are retained outside the mini-program static package in `scripts/template-sources/`; IDs, names, tags and SHA-256 checksums are in `scripts/network-templates.json`. Attribution, license links, archive URLs and retrieval dates are in `src/data/template-sources.json` and accessible from the gallery. Recorded collection download counts are 2,635 / 19,850 / 858 respectively as of 2026-11-03. These counts describe source collections, not individual bead-pattern popularity.
- [Twemoji v14.0.2](https://github.com/twitter/twemoji/tree/v14.0.2), Copyright 2019 Twitter, Inc and other contributors. Graphics licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); retained license: [licenses/Twemoji-CC-BY-4.0.txt](licenses/Twemoji-CC-BY-4.0.txt), attribution: [licenses/Twemoji-attribution.txt](licenses/Twemoji-attribution.txt). Selected 256 non-branded animal, plant, fruit, food, dessert, expression and object subjects from the pinned release's `assets/72x72/` PNGs. Changes: cropped transparent margins, resized to at most 25 visible cells, alpha thresholded and matched to at most 12 MARD colors on 29 × 29 grids. These are adapted emoji illustrations, not copied bead charts. The author, source, CC BY 4.0 URL and modification notice are shown in app source/detail views and retained in saved history and both exported PNG formats.
- Forty-one designs are original to this project: flower, fox and coffee from `scripts/create-assets.py`, and 38 animal, plant, expression and object designs in `scripts/template-designs.py`. The gallery contains 640 distinct complete patterns in total: 343 CC0 adaptations, 256 CC BY 4.0 adaptations and 41 originals.
- All gallery thumbnails are generated from the actual stored pattern cells by `scripts/create-templates.py`. They are not placeholders or remote gallery links.

`scripts/import-network-templates.py` validates all selected files before updating local sources. Automated downloads check robots.txt and stop when disallowed. OpenGameArt currently disallows Codex automated access; no further crawling is performed, and rebuilding uses the retained, already-downloaded CC0 files offline. Local ZIP imports remain available.

`scripts/import-twemoji.py` imports only the allowlisted, pinned public GitHub PNG URLs, enforces existing checksums and retains the graphics license. Originals live outside the mini-program runtime package. Douyin public search was reviewed for subject preferences; creator works with redistribution or commercial-use restrictions were not imported. Research notes: `docs/research/social-patterns-20261103.md`.

## Product references

Reviewed [Pixel-Beads](https://www.pixel-beads.net/), [Perler Beads Generator](https://jett-wu.github.io/Perler_Beads_Generator/), and [BraceletBook pattern browsing](https://www.braceletbook.com/patterns/?type=a) for conversion controls, thumbnail browsing, category filtering, and pattern metadata. The mobile page layout and styling are implemented for this uni-app project. No proprietary site source code or user-submitted pattern gallery was copied.

Research and adaptation date: 2026-11-03.

## 通用主体提取

- 模型：[U²-Net / U2Netp](https://github.com/xuebinqin/U-2-Net)，Apache 2.0；作者提供的轻量显著主体模型，用于人物、宠物和物品等。许可证原文：[U2Net Apache 2.0](licenses/U2Net-Apache-2.0.txt)。
- 固定下载源：[rembg 发布的 u2netp.onnx](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx)。原始 ONNX 保存在 `scripts/subject-source/u2netp-original.onnx`，4,574,861 bytes，SHA-256：`309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`。
- 本项目修改：折叠固定尺寸运算，移除未使用的侧输出，构建时对权重舍入、四个最大卷积核按输出通道压缩，再离线恢复为 float32 常量；实际运行模型不包含权重转换算子。使用 NCHW 接口 `rgb [1,3,320,320] → mask [1,1,320,320]`。RGB 最大强度归一化和 ImageNet 均值/标准差与 rembg 的模型预处理约定一致，应用层代码为本项目实现。
- `scripts/adapt-subject-model.py` 可离线重建 `src/subject/static/subject-u2net.br`，2,051,696 bytes，SHA-256：`d3dbd37a4d787ed16a36b4f4d31dcb2bbde7830fca56b6a3ff292db9ff33c6b5`。Brotli 解压后的普通 float32 ONNX 为 4,538,201 bytes，SHA-256：`efbaef3e8afe55ef6bb84f697c3f4a99f90a274af85ed6793e55bfdea5a1ee95`；原文件保存在 `scripts/subject-source/u2netp-runtime.onnx`。微信通过官方 `readCompressedFile` 解压并写入版本化本地 `.onnx`，H5 在构建时解压为 `.bin`；不下载第三方模型或上传用户照片。
- 透明图和纯色背景图的外围连通移除、轮廓缺口闭合、遮罩处理、圈选和画笔修整均为本项目实现。
- H5 推理：Microsoft ONNX Runtime Web 1.22.0，MIT，许可证：[ONNX Runtime MIT](licenses/ONNX-Runtime-MIT.txt)。WASM 从锁定的 npm 依赖复制到 H5 构建，在独立 Worker 中运行；微信版使用 `wx.createInferenceSession`，不打包浏览器运行时。微信开发者工具不支持原生模型推理，需要真机确认运行兼容性及性能。
- 之前使用的 Google MediaPipe Selfie Segmentation 已退出运行包。保留的历史原始模型 `scripts/subject-source/selfie-original.onnx` 来自 [PINTO_model_zoo 109_Selfie_Segmentation](https://github.com/PINTO0309/PINTO_model_zoo/tree/b8679db167939e1363095f2f33eaaab26b06be3d/109_Selfie_Segmentation)，SHA-256：`de212dabbc6266f0047711d1dfae80900f7b596b9ed5f7665f3d1cf68c5443ee`，许可：[Selfie Segmentation Apache 2.0](licenses/Selfie-Segmentation-Apache-2.0.txt)。

- H5 兼容修复：`vite.config.js` 在构建时为 uni-h5 5.07 的 `useResizeSensorReset` 增加空节点保护，避免返回缓存页时已卸载的 Canvas/Image 传感器报错；不修改依赖目录。uni-app 来源：https://github.com/dcloudio/uni-app ，许可 Apache 2.0。
