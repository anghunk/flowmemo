# AGENTS.md

## 项目结构

- 根目录是 pnpm workspace，只放工作区配置、脚本和通用配置；不要把业务代码放到根目录。
- `apps/web` 是 React 19 + Vite 前端，页面、组件、hooks、API client 和样式放在 `apps/web/src`。
- `apps/worker` 是 Cloudflare Worker + Hono API，入口为 `apps/worker/src/index.ts`，业务服务在 `apps/worker/src/services`，中间件在 `apps/worker/src/middleware`，D1 migration 在 `apps/worker/migrations`。
- `apps/mobile-rn` 是 Expo / React Native 客户端，移动端代码在 `apps/mobile-rn/src`，入口包括 `App.tsx` 和 `index.ts`。
- `packages/shared` 存放前端、Worker、移动端共享的常量和 TypeScript 类型；跨端接口字段、枚举、响应类型优先放这里。

## 运行命令

- 安装依赖：`pnpm install`
- 同时启动前端和 Worker：`pnpm dev`
- 仅启动前端：`pnpm dev:web`
- 仅启动 Worker：`pnpm dev:worker`
- 前端默认地址：`http://localhost:5173`
- Worker 默认地址：`http://localhost:8787`
- 启动移动端 Expo：`pnpm --filter @flowmemo/mobile-rn start`
- 启动移动端 Android：`pnpm --filter @flowmemo/mobile-rn android`
- 启动移动端 iOS：`pnpm --filter @flowmemo/mobile-rn ios`
- 本地 D1 migration：`pnpm --filter @flowmemo/worker db:migrate:local`
- 远程 D1 migration：`pnpm --filter @flowmemo/worker db:migrate:remote`

## 测试与验证命令

- 当前项目没有单元测试脚本；不要声称运行了不存在的 `test`。
- 全量类型检查：`pnpm typecheck`
- 全量构建：`pnpm build`
- 只验证前端：`pnpm --filter @flowmemo/web typecheck`；涉及打包路径或资源时再运行 `pnpm --filter @flowmemo/web build`。
- 只验证 Worker：`pnpm --filter @flowmemo/worker typecheck`；涉及 Worker 发布包时再运行 `pnpm --filter @flowmemo/worker build`。
- 只验证 shared：`pnpm --filter @flowmemo/shared typecheck`
- 只验证移动端：`pnpm --filter @flowmemo/mobile-rn typecheck`
- 修改数据库结构后必须新增 migration，并至少运行本地 migration 命令验证。

## 代码风格

- 使用 TypeScript ESM，保留现有双引号、分号、2 空格缩进风格。
- 方法、事件、函数、接口、导出类型尽量补充简洁 JSDoc，优先中文注释；不要写重复代码含义的空注释。
- 共享数据结构先放进 `packages/shared/src/index.ts`，再由 web、worker、mobile-rn 引用，避免复制类型。
- API 对外响应使用前端已有的 camelCase 字段；数据库字段可以是 snake_case，但必须在 Worker 层显式映射。
- Worker 访问 D1/KV 继续使用 Cloudflare binding，不引入 Node-only API。
- 新增需要登录的 Worker 业务接口必须经过 `requireAuth`。
- 动态 SQL 必须使用 D1 prepared statement 和 `bind`，不要拼接未校验条件。
- React 组件优先复用 `apps/web/src/components/ui` 和已有 hooks；图标优先使用 `lucide-react`。
- 前端异步请求统一走 `apps/web/src/lib/api.ts` 和 React Query hooks，不在组件里散落裸 `fetch`。
- React Native 代码优先复用 `apps/mobile-rn/src` 里的现有组件、hooks 和 shared 类型；图标优先使用 `lucide-react-native`。
- 用户可见文案优先中文，错误信息保持可直接展示。

## 禁止事项

- 不要提交、修改或依赖 `node_modules`、`apps/web/dist`、`.wrangler/state`、`apps/mobile-rn/.expo` 这类生成物。
- 不要硬编码生产域名、密钥、token、Cloudflare 账号信息；本地配置使用现有 env/dev vars 文件。
- 不要绕过认证、中间件、shared 类型或 API client 去新增业务通路。
- 不要用 `dangerouslySetInnerHTML` 渲染未经过现有 Markdown/DOMPurify 流程处理的内容。
- 不要破坏 workspace 依赖关系；内部包使用 `workspace:*`。
- 不要大范围重构与当前任务无关的文件。
- 不要改动用户未要求的移动端原生工程文件，除非 Expo/React Native 变更确实需要。

## 完成标准

- 改动范围和用户需求一致，没有顺手改无关逻辑。
- TypeScript 类型检查通过；涉及构建产物、打包路径或部署入口时构建通过。
- 新增或修改 API 时，同步更新 `packages/shared` 类型、API client、相关 hooks 和调用点。
- 修改数据库字段、索引或约束时，提供 migration，并确认旧数据兼容或迁移路径。
- 涉及 React Query 新增、修改、删除行为时，正确处理缓存失效或缓存更新。
- 受影响用户路径可手动验证：登录态、memo 创建/编辑/归档/标签、公开 memo、会员/管理员流程不能只看静态类型。
- 最终回复说明实际改了什么、跑了哪些命令；未运行的验证必须说明原因。

## Review 标准

- 优先检查会导致数据丢失、越权访问、登录失效、XSS、SQL 查询错误、D1 migration 不兼容的问题。
- 检查 web、worker、mobile-rn、shared 的契约是否一致，尤其是响应字段、可选字段、错误状态码和分页参数。
- 检查 Worker 是否正确处理空请求体、非法类型、边界长度和未登录请求。
- 检查 React Query 缓存失效是否覆盖新增、修改、删除行为。
- 检查 UI 在移动端和桌面端是否存在文本溢出、按钮不可达、加载状态缺失、错误状态缺失。
- Review 结论先列问题和文件行号，再给简短总结；没有发现问题也要说明剩余风险或未验证项。
