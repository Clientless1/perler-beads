# 开发说明

## 环境与配置

- Node.js 20+、npm；附带 `package-lock.json`，使用 `npm ci` 安装固定依赖。
- Vue 3、uni-app 3.0.0-5000720260410001、Vite 5.2.8。
- H5 推理使用 ONNX Runtime Web 1.22.0，需浏览器支持 WebAssembly 和 Worker。
- 微信原生推理需基础库 2.30.0+、真机和可用 AppID。
- Python 仅用于素材或模型重建，日常运行和构建无需 Python。

```sh
npm ci
npm run dev:h5
npm test
npm run build:h5
npm run build:mp-weixin
```

微信正式构建后导入根目录；开发监听运行 `npm run dev:mp-weixin`，导入 `dist/dev/mp-weixin/`。`src/manifest.json` 和 `project.config.json` 的微信 AppID 需一致。`project.private.config.json` 为本地设置，不纳入版本管理。

## 页面与数据流

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 创作台 | `src/pages/index/index.vue` | 选图、参数、预览和生成 |
| 样板库 | `src/pages/templates/templates.vue` | 搜索、分页、详情和使用 |
| 图纸结果 | `src/pages/result/result.vue` | 画布、色号、进度和导出 |
| 作品库 | `src/pages/history/history.vue` | 本地记录、筛选和管理 |
| 主体编辑 | `src/subject/editor/editor.vue` | 自动识别、圈选和修整 |

```text
选图 → 解码并限制最长边 1280px → 可选主体遮罩
    → 网格取样 → CIEDE2000 配色/整体限色 → 逐格数据
    → 画布预览 → 保存作品 → 用豆统计与 PNG 导出
```

`imageSource.js` 复用编辑图，`imageProcessor.js` 取样，`colorMatcher.js` / `colorScience.js` 配色，`canvasRenderer.js` 显示和导出，`storage.js` 压缩保存图纸及完成色号。取样、配色和绘制分段让出主线程；换图、改参数或离页会取消旧任务，避免覆盖新结果。

## 主体模型

透明图沿用 alpha；明确纯色背景优先外围连通移除并闭合小轮廓缺口，复杂背景使用 U2Netp。遮罩与原图 RGB 分开处理。

| 项目 | H5 | 微信小程序 |
| --- | --- | --- |
| 引擎 | ONNX Runtime Web WASM，独立 Worker | `wx.createInferenceSession` |
| 资源 | 构建时解压为同站点 `.bin` | 分包 `.br`，使用 `readCompressedFile` 解压 |
| 缓存 | 按需加载约 11 MiB WASM | 版本化本地 `.onnx` 缓存 |
| 取消释放 | 终止 Worker | 取消任务并销毁会话 |
| 调试 | 浏览器可运行 | 模拟器不支持原生推理，需真机 |

模型接口：`rgb float32[1,3,320,320] → mask float32[1,1,320,320]`。版本、体积与校验值见 `src/subject/modelInfo.json`。权重转换在离线构建时完成，运行模型使用 float32 常量。来源和许可见 [第三方说明](../THIRD_PARTY_NOTICES.md)。

可选重建：

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install onnx onnxsim numpy
python scripts/adapt-subject-model.py
```

源模型已附在 `scripts/subject-source/`。重建会更新模型资源和元数据；Python 库版本可能影响输出，修改后需重新测试、检查包体并做真机验证。通常直接使用仓库内已校验资源。

## 样板与素材

`src/data/templates.json` 使用共享 MARD 色卡和连续格子压缩，`src/utils/templates.js` 解码完整图纸。640 个封面来自实际格子数据。来源在 `src/data/template-sources.json`，原素材在 `src/static/templates/sources/` 和 `scripts/template-sources/`。

可选离线重建：

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install Pillow
python scripts/create-assets.py
python scripts/create-templates.py
npm test
```

可选导入：

```sh
python scripts/import-network-templates.py --archives /path/to/packs
python scripts/import-twemoji.py
```

导入器校验素材 SHA-256，Twemoji 固定为 v14.0.2。网络下载遵守站点访问限制；已附素材可离线重建。新增素材需保留作者、来源、许可与修改说明，CC BY 署名需随图纸保存及导出。见 [图案调研](research/social-patterns-20261103.md)。

## 打包与发布

- 主包含创作台、样板库、结果、作品库；`src/subject/` 为独立分包。
- `vite.config.js` 为 H5 复制 WASM 并解压模型，微信不包含浏览器 WASM / Worker。
- 主体分包接近 2 MiB，增添代码和资源后要复核实际包体。
- H5 构建为 uni-h5 ResizeSensor 加入空节点保护，处理返回缓存页时传感器节点已移除的情况。
- 本地作品上限 20 份，没有后端、账号或跨设备同步。
- 导出动态调整格子和清单布局，将宽高控制在 4096 像素内。

运行测试和两个构建后，按 [验证记录](VALIDATION.md) 做真机检查。文档和截图存放于 `docs/`；依赖、构建产物、临时 QA、浏览器会话与本地设置不上传。
