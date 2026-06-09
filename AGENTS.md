# AIGCS — 开发规范

## 项目结构

pnpm monorepo + Turborepo。5 个包：

| 包 | 路径 | 职责 |
|---|------|------|
| `@aigcs/core` | `packages/core` | Drizzle schema、类型、常量（所有包共享） |
| `@aigcs/server` | `packages/server` | Hono HTTP 服务（API + 中间件 + AI Provider） |
| `@aigcs/admin` | `packages/admin` | React SPA 管理面板（TanStack Router + Kumo UI） |
| `@aigcs/widget` | `packages/widget` | Web Component 评论展示（Shadow DOM，零框架依赖） |
| `@aigcs/edgeone` | `packages/edgeone` | EdgeOne Pages Cloud Functions 打包入口 |

插件在 `packages/plugins/`，schema 变更需更新 `packages/core/src/schema/`。

## 常用命令

```bash
pnpm install                  # 安装依赖
pnpm build                    # Turborepo 构建所有包（core → server/admin/widget 有依赖序）
pnpm lint                     # Turborepo lint
pnpm typecheck                # Turborepo typecheck（依赖 ^build 产物）
pnpm --filter @aigcs/server dev   # API 服务 (端口 3000, tsx watch)
pnpm --filter @aigcs/admin dev    # 管理面板 (Vite, 端口 5173)
pnpm --filter @aigcs/widget dev   # Widget (Vite, 端口 5175)
pnpm db:generate              # drizzle-kit generate（从 packages/core/src/schema/ 读取）
pnpm db:migrate               # drizzle-kit migrate
pnpm --filter @aigcs/core test    # vitest
pnpm --filter @aigcs/server test  # vitest
pnpm format                   # prettier --write
pnpm edgeone:build            # esbuild 打包 EdgeOne 产物到 cloud-functions/
```

## 最高优先级规则

### 0. 每次修改后自动提交

每次对文件进行修改后，必须立即执行：

```bash
git add {files}
git commit -m "{message}"
```

禁止执行其他 `git` 命令（如 `git push`、`git pull`、`git restore` 等），除非用户明确要求。

### 1. UI 样式 — Cloudflare Kumo

所有新增和修改的 UI 必须使用 `packages/admin/src/components/ui.tsx` 中定义的 Kumo 风格组件：

- `PrimaryButton` / `SecondaryButton` / `DangerButton` — 代替所有原生 `<button>`
- `Input` / `Select` — 代替所有原生 `<input>` / `<select>`
- `Card` — 代替手写的卡片样式 div
- `Toggle` — 代替自定义开关
- `Badge` — 代替状态标签

禁止使用行内硬编码的按钮/输入框样式（如 `bg-blue-600 text-white px-4 py-2 rounded-lg`）。

### 2. 国际化 — i18n

所有用户可见的文本必须使用 `react-i18next` 的 `useTranslation()` 钩子和 `t('namespace.key')` 调用。

- 中文翻译在 `packages/admin/src/locales/zh.json`
- 英文翻译在 `packages/admin/src/locales/en.json`
- 新增功能必须同时添加中英文翻译键值

禁止硬编码中文字符串或英文字符串在 UI 组件中。

## 关键架构细节

- **服务端入口**: `packages/server/src/index.ts` — 加载 `.env` 再加载 `.env.local`，初始化 DB，运行迁移，seed 默认数据
- **Hono 路由**: `packages/server/src/app.ts` — 中间件链：logger → secureHeaders → cors → CORS origin check → auth → rateLimiter → csrfProtection
- **Admin API CSRF**: 所有 `/api/admin/*` 请求必须带 `X-Requested-With: XMLHttpRequest` 头（admin main.tsx 已全局 monkey-patch fetch 注入）
- **数据库**: SQLite 默认（`file:./data/aigcs.db`）。Schema 定义在 `packages/core/src/schema/`，drizzle.config.ts 方言硬编码为 sqlite
- **服务端口**: 生产默认 `41905`（leetspeak aigcs → 41905），dev 模式 server 端口 `3000`
- **环境变量**: `.env` 用于生产配置，`.env.local` 用于本地覆盖（不提交 Git）
- **Admin 路由**: TanStack Router，路由定义在 `packages/admin/src/routes/router.ts`，根布局在 `__root.tsx`
- **Widget**: 独立 Web Component，Shadow DOM 隔离，通过 `<script src="...aigcs-widget.js">` 嵌入

## 代码风格

- TypeScript strict mode
- Prettier: 无分号、单引号、尾逗号、行宽 100
- ESM modules（所有包 `"type": "module"`）
- Server 端 import 使用 `.js` 后缀（`import './foo.js'`）
