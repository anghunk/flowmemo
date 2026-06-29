# FlowMemo Cloudflare

一个前后端分离的轻量 memo 网页应用。

## 项目结构

```txt
apps/web       React 网页端
apps/worker    Cloudflare Worker API
apps/mobile-rn Expo / React Native 移动端
packages/shared 共享类型和常量
```

## 本地开发

```bash
pnpm install
pnpm dev
```

前端默认运行在 `http://localhost:5173`，Worker API 默认运行在 `http://localhost:8787`。

本地开发前可以从模板复制环境变量文件：

```bash
cp apps/web/.env.dev.example apps/web/.env.dev
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
cp apps/mobile-rn/.env.example apps/mobile-rn/.env
```

真实域名、Cloudflare 资源 ID、管理员账号密码和联系邮箱不要提交到仓库。
Cloudflare Pages 的生产 Vite 变量在网页控制台手动填写；Worker 部署变量写在本地 `apps/worker/wrangler.toml`，但只提交脱敏的 example。

`apps/worker/wrangler.toml.example` 是可提交的脱敏模板；真实 `apps/worker/wrangler.toml` 用于部署，里面会包含 Worker 变量和 Cloudflare 资源 ID，不要提交到公开仓库。

注册默认是开放注册，不需要邀请码。部署完成后，管理员可以在后台切换为“邀请码模式”，切换后新用户注册必须填写有效邀请码。

## Cloudflare 资源

- D1：业务数据
- KV：Session 和登录限流
- R2：图片上传存储
- Pages：部署 `apps/web`
- Workers：部署 `apps/worker`

## 部署准备

部署前需要准备：

- Cloudflare 账号，并在本机登录 Wrangler：`pnpm exec wrangler login`
- 一个 D1 数据库
- 两个 KV namespace：`SESSIONS` 和 `RATE_LIMIT`
- 一个 R2 bucket：`IMAGES`
- 一个 Worker 域名或自定义 API 域名
- 一个 Pages 域名或自定义前端域名

创建资源示例：

```bash
pnpm exec wrangler d1 create flowmemo
pnpm exec wrangler kv namespace create SESSIONS
pnpm exec wrangler kv namespace create RATE_LIMIT
pnpm exec wrangler r2 bucket create flowmemo-images
```

把命令输出中的 `database_name`、`database_id`、KV `id` 和 R2 bucket 名称填入本地 `apps/worker/wrangler.toml`。不要把真实 Cloudflare 账号信息、token、密钥或生产配置写进公开仓库。

## 后端 Worker 部署

1. 从模板创建本地 Worker 配置：

```bash
cp apps/worker/wrangler.toml.example apps/worker/wrangler.toml
```

2. 修改 `apps/worker/wrangler.toml` 中的 Worker 名称、变量和资源 binding：

```toml
name = "你的-worker-name"

[vars]
APP_ENV = "production"
WEB_ORIGIN = "https://你的前端域名"
COOKIE_DOMAIN = ""
PUBLIC_IMAGE_BASE_URL = ""
ADMIN_USER_IDS = ""

[[d1_databases]]
binding = "DB"
database_name = "你的-D1-名称"
database_id = "你的-D1-ID"

[[kv_namespaces]]
binding = "SESSIONS"
id = "你的-SESSIONS-KV-ID"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "你的-RATE_LIMIT-KV-ID"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "你的-R2-bucket"
```

`WEB_ORIGIN` 必填。前端有多个域名时用英文逗号分隔，例如 `https://app.example.com,https://www.example.com`。
`COOKIE_DOMAIN` 通常可留空；如果前后端共享顶级域名并需要跨子域 Cookie，再填写类似 `.example.com`。
`PUBLIC_IMAGE_BASE_URL` 可留空，留空时图片会走 Worker 的 `/api/uploads` 代理地址。
`ADMIN_USER_IDS` 可先留空，首个管理员创建方式见后文。

3. 执行类型检查：

```bash
pnpm --filter @flowmemo/worker typecheck
```

4. 执行数据库 migration：

```bash
pnpm --filter @flowmemo/worker db:migrate:remote
```

5. 部署 Worker：

```bash
pnpm --filter @flowmemo/worker deploy
```

6. 验证 Worker：

```bash
curl https://你的-api-域名/api/health
```

返回 `{"ok":true}` 表示 API 已可用。

## 前端 Pages 部署

### 方式一：Cloudflare Pages 连接 Git 仓库

在 Cloudflare Pages 创建项目时使用这些设置：

- Root directory：仓库根目录
- Build command：`pnpm install --frozen-lockfile && pnpm --filter @flowmemo/web build`
- Build output directory：`apps/web/dist`
- Node.js version：使用 `.nvmrc` 中的版本

前端生产环境变量不要提交 `.env.production`，需要在 Cloudflare Pages 后台手动填写：

进入 Pages 项目，打开 `Settings` -> `Environment variables`，在 `Production` 环境添加：

```txt
VITE_API_BASE_URL=https://你的-api-域名
VITE_SUBSCRIPTION_CONTACT_EMAIL=你的联系邮箱
```

如果需要预览分支也能访问真实 API，也在 `Preview` 环境填同样的变量。
`VITE_API_BASE_URL` 是前端请求 Worker API 的地址；前后端不同域时必须填写，并确保 Worker 的 `WEB_ORIGIN` 包含 Pages 域名。
`VITE_SUBSCRIPTION_CONTACT_EMAIL` 可留空；留空时订阅弹窗会提示未配置联系邮箱。
修改 Pages 后台环境变量后，需要重新触发一次 Pages 部署，新的变量才会进入 Vite 构建产物。

### 方式二：本地构建后上传

```bash
VITE_API_BASE_URL=https://你的-api-域名 pnpm --filter @flowmemo/web build
pnpm exec wrangler pages deploy apps/web/dist --project-name 你的-pages-project
```

这种方式的 Vite 变量在本机 build 时注入，不会读取 Cloudflare Pages 网页控制台变量。推荐优先使用 Git 仓库连接 Pages，并在 Cloudflare 控制台维护生产环境变量。

如果前端和 Worker 部署在同一个域名下，可以不配置 `VITE_API_BASE_URL`，网页端会默认请求当前站点同源 API。前后端不同域时必须在 Pages 后台填写 Worker API 地址，并在 Worker 的 `WEB_ORIGIN` 中允许前端域名。

## 首个管理员

默认开放注册，所以可以先在前端注册第一个账号。注册后有两种方式授予管理员权限：

### 方式一：使用环境变量 allowlist

从 D1 查询用户 ID：

```bash
pnpm --filter @flowmemo/worker exec wrangler d1 execute DB --remote --command "SELECT id, account FROM users;"
```

把目标用户 ID 填入本地 `apps/worker/wrangler.toml` 的 `ADMIN_USER_IDS`，然后重新部署 Worker。

多个管理员 ID 用英文逗号分隔。

### 方式二：直接更新 D1 角色

```bash
pnpm --filter @flowmemo/worker exec wrangler d1 execute DB --remote --command "UPDATE users SET role = 'admin' WHERE account = '你的邮箱';"
```

重新登录后，前端会显示管理员入口。管理员可以在后台管理用户会员状态、生成邀请码，并把注册入口切换为“邀请码模式”。

## 移动端配置

移动端使用 Expo 公开变量。复制模板：

```bash
cp apps/mobile-rn/.env.example apps/mobile-rn/.env
```

按实际部署填写：

```txt
EXPO_PUBLIC_API_BASE_URL=https://你的-api-域名
EXPO_PUBLIC_WEB_BASE_URL=https://你的前端域名
```

启动移动端：

```bash
pnpm --filter @flowmemo/mobile-rn start
```

## 部署前检查

```bash
pnpm typecheck
pnpm build
```

如果只改前端：

```bash
pnpm --filter @flowmemo/web typecheck
pnpm --filter @flowmemo/web build
```

如果只改 Worker：

```bash
pnpm --filter @flowmemo/worker typecheck
pnpm --filter @flowmemo/worker build
```

修改 D1 表结构或默认数据后，需要新增 migration，并至少运行：

```bash
pnpm --filter @flowmemo/worker db:migrate:local
```

## 开源注意事项

- 不要提交 `.env`、`.dev.vars`、Cloudflare API token、真实管理员账号密码或生产配置
- 提交 `apps/worker/wrangler.toml.example`，不要提交包含真实资源 ID、域名或管理员 ID 的 `apps/worker/wrangler.toml`
- Cloudflare Pages 的生产 Vite 变量在网页控制台手动填写；Worker 部署使用本地 `wrangler.toml`
- 如果真实密钥或密码曾经进入 Git 历史，开源前请先轮换相关凭据，并清理 Git 历史
- 生产环境建议使用强密码，并在部署后尽快确认 `WEB_ORIGIN`、`COOKIE_DOMAIN` 和自定义域名配置是否匹配
