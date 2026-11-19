# 历史可选方案：Node.js 内容检测服务

> 当前 1.0.2 已改为纯本地处理，不接入该服务；无需配置下文地址。此文和 server/ 仅保留为日后明确需要接入检测时的实现参考。不能仅部署服务就认为已接通当前客户端。

## 覆盖的入口

| 入口 | 检测及失败行为 |
| --- | --- |
| 相册、拍照和换图 | 上传检测，通过后才显示原图、生成预览或进入主体提取；失败不替换原图 |
| 照片生成、打开用户历史作品 | 检测名称和当前图纸，通过后展示并本机保存 |
| 安装包内固定样板 | 与包内名称、尺寸、完整逐格颜色、用量和署名逐项匹配，并重新从包内构造后打开；支持本机保存、进度、清单和两种导出，不依赖运行时检测服务 |
| 重命名 | 检测新名称，通过后才更新；失败保留原名 |
| 复制用豆清单 | 检测名称后复制 |
| 色号图纸 / 成品效果导出 | 分别检测实际导出的 PNG，通过后才写入相册 |
| 旧版本本机作品 | 与包内固定样板完全一致的记录可以恢复；其余未检测的标题和缩略图先隐藏，打开时重检，无法凭旧记录直接导出 |

`risky`、`review` 均拦截，面向用户只显示「内容含违规信息」。接口故障显示可重试提示，不显示分类、标签、命中词、概率或原始微信错误。图片长时间未返回会停止等待，保留本次任务，可点击重试继续查询；可以取消选图。检测任务和回调存入 SQLite，服务重启后仍可查询。不同用户无法查询彼此任务。客户端本机检测标记只用于历史列表显示，用户内容的结果和导出仍会重新经过服务器检测。

固定样板是开发者随版本发布的静态内容，由维护者在发布前检查。`templateId`、本地标记或路径不能单独放行；改动名字、格子、颜色、用量或署名后均按用户内容检测。固定内容不会写成“微信检测通过”。未配置服务时，首页三份示例直接打开对应的固定样板，避免调整后进入无法生成的页面。此范围修正不代表已完成微信审核整改，不能代替照片功能的真实接口联调。

H5 仍是本地开发预览，未实现微信登录和微信检测，不能把 H5 预览结果作为审核通过证据，也不要直接作为公开的用户上传服务发布。

## 1. 部署普通服务器

准备一台可从公网访问的服务器、HTTPS 域名和 TLS 证书。国内域名按实际情况完成备案。安装 **Node.js 22.16+**；推荐受支持的 Node.js LTS。服务使用 Node 内置 HTTP、crypto、SQLite，无额外 npm 运行依赖。SQLite 在部分 Node 版本会打印实验性提示。

把仓库部署到服务器，例如 `/srv/perler-beads`，以独立、非 root 系统用户运行：

```sh
cd /srv/perler-beads/server
cp .env.example .env
chmod 600 .env
```

在服务器本地编辑 `server/.env`：

| 变量 | 配置 |
| --- | --- |
| `PUBLIC_ORIGIN` | 例如 `https://safety.your-domain.cn`，不带路径 |
| `WX_APP_ID` | 当前小程序 AppID，与前端一致 |
| `WX_APP_SECRET` | 小程序后台 AppSecret，仅保存在服务器 |
| `WX_PUSH_TOKEN` | 消息推送验证 Token，3–32 位字母、数字、下划线或连字符，与后台一致 |
| `WX_PUSH_AES_KEY` | 后台生成的 43 位 EncodingAESKey，与后台一致 |
| `HOST` / `PORT` | 默认 `127.0.0.1` / `8787`，由 HTTPS 反向代理访问 |
| `DATA_DIR` | 建议 `/var/lib/perler-safety`，服务用户可写，不能位于网站静态目录 |

不要把密钥填进 `.env.local` 中的 `VITE_` 变量、前端源码、提审说明、截图或 GitHub。服务器 `.env` 和 `data/` 已被 Git 忽略。

启动：

```sh
cd /srv/perler-beads/server
npm start
```

使用 systemd 等进程管理器保持运行，例如 `/etc/systemd/system/perler-safety.service`（替换实际 Node 路径和服务账号）：

```ini
[Unit]
Description=Perler WeChat content safety
After=network-online.target

[Service]
User=perler
WorkingDirectory=/srv/perler-beads/server
ExecStart=/usr/bin/node --env-file=.env index.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Nginx HTTPS 虚拟主机代理配置（证书和域名另按实际填写）：

```nginx
server {
    listen 443 ssl;
    server_name safety.your-domain.cn;
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_read_timeout 25s;
        proxy_set_header Host $host;
        # Avoid storing image bodies in proxy temporary files.
        proxy_request_buffering off;
        # Callback query contains signatures; don't persist it in access logs.
        access_log off;
    }
}
```

确认 `https://你的域名/healthz` 返回 `{"ok":true}`。`/media/随机串` 需要允许微信检测服务器通过 HTTPS 下载，不能加登录页、验证码或防盗链。链接为不可预测的短期地址，仅用于微信拉取，结果到达后立即失效。不要把整个 `DATA_DIR` 作为静态站点暴露。

服务器本身需能请求 `api.weixin.qq.com`。若后台要求 IP 白名单，将服务器实际出口 IP 加入微信 API IP 白名单。不要关闭域名或证书校验来代替配置。

服务包含单机请求频率限制。当前适用一个 Node 进程、一份持久化磁盘；不要将 SQLite 放在临时容器文件系统，或直接扩为多个独立副本。正式扩容需迁移到共享数据库、对象存储和分布式限流。

## 2. 配置微信后台

1. 进入当前 AppID 的微信公众平台「开发管理 → 开发设置」。
2. 在 **request 合法域名**中加入 `https://你的域名`。图片使用 `uni.request` 二进制上传，因此也属于 request 域名。
3. 在「消息推送」设置服务器 URL 为 `https://你的域名/wechat/push`，填写同一组 Token 和 EncodingAESKey。
4. 选择 **安全模式（加密）**、**JSON** 数据格式，提交验证并启用推送。本实现有意拒绝明文、伪造和错误 AppID 的回调。若已有其他事件推送服务，先合并路由和配置，避免替换现有业务。
5. 检查该 AppID 可调用内容安全 API，配额充足。尚未发布的小程序文字接口可能受较低日配额限制；配额不足会阻止操作，需要等配额恢复或按后台指引处理。
6. 更新小程序「用户隐私保护指引」，如实说明照片/生成图纸、用户填写的作品名称、OpenID 的处理用途、接收方及保存期限，与实际部署一致。依微信后台对所用接口的要求填写，不要继续宣称照片从不上传。

API 固定 `scene: 4`、`version: 2`，场景由服务端控制；OpenID 从 `code2Session` 结果取得，不接受客户端传入的任意 OpenID、检测结果或图片外链。AppSecret 不进入小程序。

## 3. 配置小程序和构建

项目根目录创建 `.env.local`，这里只填写公开服务地址：

```dotenv
VITE_CONTENT_SAFETY_URL=https://你的域名
```

然后运行：

```sh
npm test
npm run build:mp-weixin
```

版本号已更新为 **1.0.1 / 101**。导入项目根目录，确认 `miniprogramRoot` 为 `dist/build/mp-weixin/`。在开发者工具中启用域名校验，扫码真机测试。不要继续上传旧的 `dist/dev/mp-weixin` 缓存包。

## 4. 真实联调后再上传

自动测试使用模拟微信返回和本地 HTTP 服务，能证明拦截/验签/归属/过期等逻辑，**不能证明你账号的内容安全接口和公网回调已接通**。必须用当前 AppID 的真机登录完成以下检查：

1. 正常图片选入后，确认服务器调用了 `mediaCheckAsync`，任务先为 pending，收到微信的 `wxa_media_check` 加密回调后才显示图片。
2. 用微信审核/调试支持的检测用例确认违规图片无法预览、生成、保存或导出；只提示「内容含违规信息」。不要在文档中复制违规内容。
3. 人工关闭推送或模拟网络故障，确认等待超时后没有生成或导出，重试可继续查询，取消后不会覆盖下一张图片。
4. 正常名称可以保存；违规名称被拦截，原名称不变。检查复制清单和两种导出。
5. 从旧版本作品进入，确认先检测再显示；重启服务后未完成任务仍可继续；检测完成后服务器图片文件已删除。
6. 后台检测调用统计有真实记录，消息推送启用且无失败记录；保留正常图片测试的时间、任务状态和回调结果用于核对，日志不记录图片、密钥、OpenID 或违规详情。

上述通过后，使用开发者工具上传版本 1.0.1，再在公众平台选择该开发版本提交审核。可填写整改说明（**仅在真实联调完成后使用**）：

> 已接入微信图片内容安全异步检测 v2 及文字内容安全检测 v2，覆盖相册/拍照选图、生成图纸、作品命名及图片导出。以服务器收到的微信加密回调最终结果为准；违规、待复核、网络故障及超时均不放行。违规提示统一为“内容含违规信息”。测试路径：创作台→选择图片→生成图纸→重命名→导出图纸；也可从拼豆样板、我的作品进入验证。

## 数据处理

上传原图与生成 PNG 仅用于安全检测，收到最终结果后删除；失败会删除，未收到回调由定时清理删除，正常持续运行时最多 35 分钟。服务启动会先清理过期文件。服务器停机期间无法运行清理，因此部署时需保证进程常驻，并为异常停机提供运维清理措施。不要备份图片临时目录。

SQLite 保存随机检测任务 ID、微信 trace ID、OpenID 归属和简化状态，最长 35 分钟；登录会话最长一小时。返回客户端的结果只有状态，不含原始风控细节。`session_key` 不保存、不返回。SQLite 删除行并非物理擦除保证，应按实际隐私要求配置磁盘加密、备份策略和日志保留。

## 官方接口参考

- [图片：多媒体内容安全识别 mediaCheckAsync](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_mediacheckasync.html)
- [文字：msgSecCheck](https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html)
- [消息推送与安全模式验签解密](https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html)

文档核对日期：2026-11-06。微信可能继续调整审核要求，接通检测并不构成审核通过保证。
