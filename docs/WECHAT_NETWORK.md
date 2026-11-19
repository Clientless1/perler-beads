# 微信真机联调与正式域名

## 独立 Android / iOS App 与微信预览的区别

APK 不受微信 `request` 合法域名列表限制，可以直接连接有可信证书的 `https://1.92.110.111`。2026-11-13 修复 App 构建未设置默认服务器地址的问题：原代码只给 `MP-WEIXIN` 设置地址，`APP-PLUS` 中请求与封面只剩相对路径。现在 App 也使用绝对 HTTPS 地址，PDF 下载走原生 `uni.downloadFile` / `uni.openDocument`；保持证书校验，不回退明文 HTTP。

- H5 默认走本地代理/同源 API；微信与 App 默认使用公网 HTTPS，均可用 `VITE_API_BASE_URL` 覆盖。
- `npm run build:app` 生成 `dist/build/app/` App 资源，**不是可安装 APK**；需要在 HBuilderX 中重新运行到手机或重新打包 APK。旧安装包不会随源码修改自动更新。
- 本地 Android 联调：HBuilderX 打开项目根目录，运行到 Android App；项目已提供 `dev:app` 和 `build:app` 命令。仅连接接口与读取图库无需新增手机权限。
- 如果新包仍失败，检查手机日期、网络以及原始 `errMsg`。网络错误对象保留 `code`、`detail`、`server`，并区分证书、超时和微信域名拦截。不要用“关闭微信域名校验”解决 APK 请求失败。

以下配置仅适用于微信小程序。

服务器已提供可信 HTTPS：`https://1.92.110.111`，就绪地址 `https://1.92.110.111/health/ready`。当前小程序没有设置 `VITE_API_BASE_URL` 时默认连接此地址，手机不会再误连自身的 `127.0.0.1`。

## 目前在手机上测试

1. 微信开发者工具打开本项目，使用最新的 `dist/build/mp-weixin` 构建（根目录 `project.config.json` 已指向此目录）。
2. 在「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。本机私有配置的 `setting.urlCheck` 已设为 `false`，不进入 Git；如直接导入产物目录，请在该项目也检查此选项。
3. 重新编译并扫码预览；手机小程序右上角「…」中打开开发调试/调试模式，再重新进入。不同微信版本的菜单名称可能略有不同。仅关闭电脑端校验不能保证普通手机预览跳过校验。
4. 若仍失败，先在手机浏览器访问上述就绪地址；正常应返回 `status: ready`。然后在真机调试面板查看请求地址与原始 `errMsg`，区分域名校验、证书、连接超时等原因。

重新构建：`npm run build:mp-weixin`。也可显式传入：`VITE_API_BASE_URL=https://1.92.110.111 npm run build:mp-weixin`。H5 默认与 API 同源，保持变量为空。

## 正式版及关闭调试后的访问

微信合法服务器域名不允许使用公网 IP 或 localhost。证书可信、网址以 HTTPS 开头，仍不能代替合法域名配置。调试开关只供开发使用，正式发布时恢复校验。

1. 准备已完成 ICP 备案的域名或其业务子域名，如 `api.example.com`，A 记录指向 `1.92.110.111`；大陆服务器按接入商要求办理接入备案。
2. 为该域名配置 Nginx 443、完整可信证书链与续期；后台允许来源同步增加实际 H5/管理台来源。
3. 小程序后台「开发管理 → 开发设置 → 服务器域名」把 `https://api.example.com` 配入 `request` 与 `downloadFile` 合法域名。当前原始照片在设备处理，没有照片上传接口，无需为此添加上传域名。
4. `.env.local` 设置 `VITE_API_BASE_URL=https://api.example.com`，重新构建小程序。该变量只有公开接口地址，不得包含密钥。
5. 恢复本地 `urlCheck: true`，在手机关闭调试的状态下验证图纸、登录和 PDF 下载，再进行平台提审。

域名注册、实名与备案需要域名持有人在服务商平台完成；现有 IP HTTPS 可继续供 H5/管理台与开发联调使用。

依据：[微信官方网络文档](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)，2026-11-12 核对“服务器域名配置”与“跳过域名校验”。实际手机连通性仍需用户设备验证。
