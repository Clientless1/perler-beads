# 开发说明

当前版本为 2.0.0 云端平台。后端与运维入口详见 [云平台指南](CLOUD_PLATFORM.md)，先完成数据库迁移和种子导入，再联调客户端。

## 环境与配置

- Node.js 22.16+、npm；附带 `package-lock.json`，使用 `npm ci` 安装固定依赖。
- Vue 3、uni-app 3.0.0-5000720260410001、Vite 5.2.8。
- H5 推理使用 ONNX Runtime Web 1.22.0，需浏览器支持 WebAssembly 和 Worker。
- 微信原生推理需基础库 2.30.0+、真机和可用 AppID。
- Python 仅用于素材或模型重建，日常运行和构建无需 Python。

```sh
npm ci
# 先在同级 perler-beads-backend 目录按其 README 启动 API
npm run dev:h5
npm test
npm run build:h5
npm run build:mp-weixin
# 独立 Android / iOS App 资源；之后使用 HBuilderX 运行或打包 APK
npm run build:app
```

微信正式构建后导入根目录；开发监听运行 `npm run dev:mp-weixin`，导入 `dist/dev/mp-weixin/`。`src/manifest.json` 和 `project.config.json` 的微信 AppID 需一致。`project.private.config.json` 为本地设置，不纳入版本管理。

## 页面与数据流

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 创作台 | `src/pages/index/index.vue` | 选图、参数、预览和生成 |
| 样板库 | `src/pages/templates/templates.vue` | 搜索、分页、详情和使用 |
| 图纸结果 | `src/pages/result/result.vue` | 画布、色号、进度和导出 |
| 作品库 | `src/pages/history/history.vue` | 云端记录、筛选和管理 |
| 主体编辑 | `src/subject/editor/editor.vue` | 自动识别、圈选和修整 |

```text
选图 → 解码并限制最长边 1280px → 可选主体遮罩
    → 网格取样 → CIEDE2000 配色/整体限色 → 逐格数据
    → 画布预览 → 保存作品 → 用豆统计与 PNG 导出
```

`imageSource.js` 复用编辑图，`imageProcessor.js` 取样，`colorMatcher.js` / `colorScience.js` 配色，`canvasRenderer.js` 显示和导出，`cloud.js` 统一请求与会话，`cloudWorks.js` 管理云端作品；`storage.js` 仅保留旧作品读取与迁移。云端写入包含版本号，冲突时要求重新打开；账号切换会清空作品缓存。取样、配色和绘制分段让出主线程；换图、改参数或离页会取消旧任务，避免覆盖新结果。

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
- `vite.config.js` 为 H5 复制 WASM 并解压模型，微信不包含浏览器 ONNX Runtime；另打包 `safetyWorkers/index.js` 和 537 bytes 本地卷积 WASM。修改内核后运行 `npm run build:safety-wasm`，日常构建直接使用已生成的内核。
- 主体分包接近 2 MiB，增添代码和资源后要复核实际包体。
- H5 构建为 uni-h5 ResizeSensor 加入空节点保护，处理返回缓存页时传感器节点已移除的情况。
- 当前作品、名称、库存、订单和工单由同级独立后端 `perler-beads-backend/platform/` 持久化，管理台在独立后端 `admin/`；照片转换、主体提取和本地模型仍在设备运行。登录后作品自动保存，游客草稿在内存中；旧版本本机记录由本人主动迁移。服务端不可用时保留当前内存图纸并提示重试，不显示为保存成功。历史官方内容安全适配器未接入。
- 导出动态调整格子和清单布局，将宽高控制在 4096 像素内。

运行测试和两个构建后，按 [验证记录](VALIDATION.md) 做真机检查。文档和截图存放于 `docs/`；依赖、构建产物、临时 QA、浏览器会话与本地设置不上传。

### Android 本地图像引擎（2026-11-13）

App Vue 的逻辑层没有 DOM Canvas，也没有浏览器 Worker。`AppImageRuntime.vue` 在页面的 renderjs 视图层加载随 App 打包的 `static/app-image/engine.js`，`utils/app/bridge.js` 按页面传递有截止时间、可取消的任务。图片解码、裁剪和主体像素留在视图层，安全检测与 U2Net 在独立 Worker 运行。禁止将 `document`、`new Image` 或浏览器 Worker 放到 App 逻辑层。

`npm run build:app` 会通过 `scripts/app-image-assets.mjs` 打包 ONNX Runtime、同一份安全模型及主体模型，无需后端托管这些文件。引擎用 XHR 读取随包资源，Worker 接收二进制；WASM 显式指定模块和资源地址，避免 Blob URL 无法解析相对路径。主运行时不可用时安全检测使用同一训练权重的 Worker CPU 实现，错误继续阻止生成。模型在空闲两分钟后释放。

Android WebView 的页面运行在 `file://`，直接将相册 URI 或随包图片交给 `Image` 会污染 Canvas，即使图片能显示也无法读回像素。`utils/app/resources.js` 通过 HTML5+ `plus.io.FileReader` 读取本地图片字节为 data URL 后解码，HTTP 图片通过可读 Blob 解码；读取失败不会回退到不可读画布，也不会放行检测。原生读取有超时和迟到回调保护。不要通过关闭 WebView 安全策略修复这个问题。

App 逻辑层的 JS 引擎与 WebView 版本不同，页面路由和撤销栈使用数组下标，不能假设支持 `Array.prototype.at`。跨层触摸事件也不保证有 DOM 的 `preventDefault` 方法；画布使用 `.stop` 及 `touch-action: none` 处理手势，避免 Vue `.prevent` 在原生事件上报错。

预览、色号图、逐格编辑、成品模拟通过异步画布代理提交；导出使用原生 Bitmap 写入 App 文档目录后保存相册。主体修整仅传选区和画笔路径，原图像素保留在视图层。开发时须通过 HBuilderX 完整重新编译/同步 App 资源；`dist/build/app` 是 App 资源目录，不是已签名 APK。


### 手机手势与预览渲染（2026-11-13）

`TouchViewport.vue` 统一图纸和逐格编辑的平移、双指缩放，手势仅更新内容 transform；缩放状态显示与按钮命令分离，避免原 movable-view 事件回写产生抖动。uni-h5 的触摸纵坐标已扣除页面导航，DOM 矩形需做相同换算。微信 / App 的异步矩形查询期间按序保留快速触摸；关闭、取消时丢弃迟到事件。第二指进入会撤销正在绘制的一笔，余下单指须重新落下才开始画。

编辑器使用固定 24px/格的纹理，笔画用 `lineCells` 插值、`paintCells` 按行复制，保持撤销快照不变。一笔只提交一个撤销项。画布占据工具栏剩余空间，适配小屏与展开更多工具；全图大小取可用宽高的较小值。H5/微信局部更新实际 Canvas，App 使用 `editorInit` / `editorPatch` 在 WebView 局部绘制。

`preview3d.mjs` 将每种烫法按颜色建立 sprite 并合成为纹理，最多缓存两种材质。每帧只绘制缓存纹理的视角、阴影和厚度层；绘制串行、合并中间状态，不累积手势帧。App 通过 `previewInit` / `previewDraw` 传递小型视角状态，避免跨层逐豆命令。用直接渲染指令初始化前先 `canvas.flush()`，清除代理初始 1×1 尺寸指令，防止导出时重置画布。重复进入编辑 / 成品页时释放旧画布的像素缓冲与缓存索引，避免大图反复打开累积内存。五种外观均为视觉模拟。

`PhotoCropper.vue` 记录原图归一化选区，`composition.mjs` 校验后交 `imageProcessor.js` 先裁剪再旋转 / 镜像；取消不修改制作参数，确认后触发一次处理。旧比例 / 焦点记录兼容，主体模式继续保留完整主体。
