# 当前部署 · 2026-11-12

按用户要求已改为独立后端，原手机网页部署已停止。以下旧部署记录仅供追溯，不是当前运行方式。

- 本机后端：`/Users/congwenjie/Desktop/perler-beads-backend/`，与小程序项目同级，包含独立依赖、API、管理台、图纸库与部署文件。
- 当前 release：`/opt/douwu/releases/backend-20261112`，`/opt/douwu/current` 指向该目录。
- 服务：`node platform/index.mjs`，只监听 127.0.0.1:8788，Nginx HTTPS 反代。
- `/` 返回 API JSON；`/admin/` 管理台正常；手机 `index.html`、`release-info.json`、模型/WASM 资源均返回 404。
- 新 release 不含小程序 `src/`、`dist/build/`，Docker 不再构建 H5。
- 原数据库和配置保留；切换前生成 `/opt/douwu/backups/douwu-20261112T080228Z.dump`。切换后 886 份图纸、5 个账号、5 份作品、1 笔订单、1 份工单。
- systemd、Nginx、原环境文件的回退副本在 `/opt/douwu/shared/backend-split-20261112/`，权限受限。上一 release 仅作回退备份，不对外提供手机网页。
- 线上 API、数据库就绪、管理台、演示账号登录和作品读取已验证。
- 小程序只在本机构建 `dist/build/mp-weixin/`，本轮没有提交微信审核或上传小程序到服务器。

---

# 历史：豆物 2.1.0 部署记录

验收：2026-11-12（北京时间）。

- 手机网页：https://1.92.110.111/
- 管理台：https://1.92.110.111/admin/
- 管理员 admin；演示客户 demo；客服 support；运营 operator。独立新密码见本机 `.runtime/登录信息.txt`（机器可读版本 `.runtime/server-access.json`），文件权限 600，未进入源码/前端产物。真实微信登录与支付未配置，购买入口提示筹备中，模拟付款禁用。
- 四底部标签：创作、发现、作品、我的。我的包含真实作品/收藏/库存统计、最近作品、权益、订单、客服、导入迁移与账号设置。
- 发现按 24 份分页，支持分类、主题、新手、关键词、颗数/颜色排序与账号收藏；游客可以预览免费图纸，使用与收藏需登录。
- 云端 886 份不重复网格图纸：原有 640 + 新增 246。新增原图位于 `scripts/template-sources/twemoji-cloud/`，固定 Twemoji v14.0.2，manifest 包含 SHA-256，CC BY 4.0 署名随图纸保存/导出；新增图纸只进入服务器，不扩大客户端素材包。

## 服务部署

保留宝塔与已有 Nginx。服务器 Docker 官方源超时，采用 Node.js 22 + PostgreSQL 16 + systemd。SQL 使用本机 PostgreSQL 17 的逻辑导出，移除 17 专属 transaction_timeout 后导入 16；只在原空库执行。

- 代码：`/opt/douwu/releases/2.1.0-20261112d`，当前软链接 `/opt/douwu/current`。
- 配置：`/opt/douwu/shared/platform.env`，root:douwu 640。
- 系统服务：`/etc/systemd/system/douwu.service`，douwu 非 root 身份，自动启动/失败重启，只读系统与内存上限。
- API 127.0.0.1:8788，数据库 loopback 5432，Nginx 443 对外；数据库不暴露公网。
- Nginx：`/www/server/panel/vhost/nginx/douwu.conf`，HTTP 跳转 HTTPS，保留 ACME 验证路径。
- 显式关闭宝塔继承的共享代理缓存；API/健康响应 `no-store`，HTML 与发布信息需重新验证，避免账户数据缓存与旧入口滞留。
- 首次图片检测显示资源加载进度；模型与 WASM 预压缩传输分别约 3.42 / 2.88 MB，mjs 使用正确 JavaScript MIME 类型。清空浏览器缓存后实测修改过的云端旧作品可以通过检测并恢复图纸/进度，未跳过检测。
- IP 证书：Let's Encrypt shortlived，自动续期每 6 小时检查，成功后验证并重载 Nginx。证书路径 `/opt/douwu/tls`，ACME 状态 `/opt/douwu/acme`。证书短有效期意味着续期任务必须持续运行。
- 数据备份：每天北京时间 03:17，目录 `/opt/douwu/backups`，14 天滚动；已恢复到独立临时数据库核对图纸/用户/作品/订单/工单，再删除临时库。
- 日志：`journalctl -u douwu`；Nginx `/www/wwwlogs/douwu.*.log`。

## 数据迁移

886 份图纸、4 个账户、3 份本地云端作品、现有库存、1 笔测试订单、1 份工单及对话、内部备注与导出记录已迁移。保留测试订单标识，真实营收为 0。导入后重置四个账号为部署独立密码，清空本机会话。

浏览器 localStorage 中的旧作品无法从服务器直接读取，需客户登录后从“我的 → 导入与迁移”主动迁移，原记录保留。

线上验收另外用演示账号保存了新增“小机器人”，演示作品现为 4 份；实际下载一次彩色 A4 PDF，打印次数由 12 降到 11。此操作不产生真实订单或营收。

## 运维

```sh
systemctl status douwu
journalctl -u douwu -n 100
/opt/douwu/backup-native.sh
/opt/douwu/renew-ip.sh
curl https://1.92.110.111/health/ready
```

后续发布应生成新 release 目录，保留上一版本与静态资源后再切换软链接和重启服务，数据库先备份再迁移。代码回退不等同于数据库回退；新 schema 需评估兼容。

恢复备份先建独立数据库，由 root 打开备份并通过标准输入交给 postgres：`runuser -u postgres -- pg_restore --no-owner --exit-on-error -d 新库 < 备份文件`。验证后再安排维护切换，避免覆盖正在写入的数据。

## 验证及边界

84 项客户端/本地流程测试，13 项数据库/API/支付验证，H5/admin/微信构建与 8 项发布检查通过。微信主包 2,020,852 字节，会员工具分包 34,704 字节，每包均小于 2 MiB。公网 HTTPS、登录/权限/迁移数据/收藏/筛选、冷缓存图纸加载及数据库恢复已实测。彩色 PDF 下载后渲染核对两页 A4，含完整色号/坐标、50 mm 校准线与材料清单。

本机 `dist/build/mp-weixin` 已重新构建为 HTTPS IP 联调包，小程序缺省接口固定为 `https://1.92.110.111`；本机私有配置关闭开发域名校验，手机预览仍需开启调试模式。正式上线必须覆盖为已备案 HTTPS 域名，并恢复校验。H5 同源访问不受此默认值影响。完整步骤见 [真机联调](WECHAT_NETWORK.md)。

公网 IP 可用作本次 H5/后台入口；微信小程序正式版仍需合法 HTTPS 域名、真实微信凭据、商户资质、内容安全及真机/平台审核。本轮没有把上述外部接入宣称完成，亦未做生产负载容量测试。单机备份尚无异地副本。

## 2026-11-12 · 移除欢迎弹窗

按用户要求移除首次进入的“欢迎来拼豆”弹窗及帮助中的“功能介绍”入口，首次访问直接进入创作台；使用帮助、隐私入口保留。10 项页面流程测试、H5/微信构建、8 项发布检查通过，发布信息指纹与本机一致。

## 2026-11-12 · 微信 HTTPS 联调

核对微信官方网络文档：公网 IP 不能作为合法服务器域名；开发工具跳过校验且手机开启调试模式可供联调。当前 IP 可信证书与就绪接口可用。小程序默认 API 已改为公网 HTTPS，避免重编译误连手机回环地址；正式版校验仍开启，本机私有调试配置另行关闭。用户手机连通性尚需实际扫码验证。
