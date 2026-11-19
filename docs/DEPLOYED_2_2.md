# 2.2.0 后端与移动端交付

移动端位置：`/Users/congwenjie/Desktop/perler-beads-main`；微信产物 `dist/build/mp-weixin`。H5 仅本机预览，不上传业务服务器。

独立后端位置：`/Users/congwenjie/Desktop/perler-beads-backend`。部署到 `1.92.110.111:/opt/douwu/releases/backend-studio-20261112`，`/opt/douwu/current` 指向该版本，systemd 服务 `douwu` 健康。

- 938 份上架图纸，新增 52 份精细萌物（58 格，最多 20 色，Noto SVG Apache 2.0），新来源与导出署名已打通。
- 更新目录是独立后端项目，无移动端 src 和 dist/build；后台管理台属于后端运营界面。
- 数据备份：`/opt/douwu/shared/backups/studio-20261112-before.dump`，权限 600。之前版本在 `/opt/douwu/releases/backend-20261112`；切回 current 链接并重启服务可回退代码。新增图纸为幂等插入，未删除业务记录。
- 修复重复导入图纸时仍要求首次管理员密码的问题；既有管理员及密码不变。
- 手机应在微信开发者工具预览新构建。生产环境合法域名和审核状态见 WECHAT_NETWORK.md / CONTENT_SAFETY.md。
