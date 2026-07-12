# AIGCS

AIGCS - AI Generated Comments System.

> [!CAUTION]
> 本项目完全由 AI 生成，我对代码一无所知，对 AI 也不甚了解。  
> 你可以随意使用，但风险自担。
> [English](README.md)

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6)

<p align="center">
  <img src="./docs/public/preview.png" alt="AIGCS 预览图" width="800" />
</p>

---

## 快速开始

```yaml
services:
  aigcs:
    image: openaigcs/aigcs:latest
    container_name: aigcs
    ports:
      - "41905:41905"
    environment:
      - JWT_SECRET=<change-this>
      - ENCRYPTION_KEY=<change-this>
      - NODE_ENV=production
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:41905/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

```bash
docker compose up -d
```

> 端口 `41905` 来源于 **aigcs** 的 leetspeak：aigcs = 41905。

访问 `http://Your_IP:41905` → 注册管理员 → 添加站点 → 配置 AI Provider → 在页面嵌入 Widget。

## 前端引用 Widget

```html
<div id="aigcs">评论</div>
<script src="https://cdn.jsdelivr.net/npm/@aigcs/widget@1/dist/aigcs.js"></script>
<script>
AIGCS.init({
  el: '#aigcs',
  site: 'your-blog.com',
  path: '/post/hello',
  server: 'https://comments.example.com',
})
</script>
```

## 文档

完整文档请访问 [docs.aigcs.chat](https://docs.aigcs.chat)，包括：

- 安装指南（Docker、手动、EdgeOne Makers、Cloudflare Workers、Vercel）
- 配置参考
- Widget 集成指南
- 插件系统（原生评论插件、联邦宇宙插件）
- API 参考
- 运维与故障排查

## 架构

```
packages/
├── core/        共享 Drizzle ORM schema、类型、常量
├── server/      Hono HTTP 服务（API + 中间件 + AI Provider）
├── admin/       React SPA 管理面板（TanStack Router + Kumo UI）
├── widget/      Web Component，Shadow DOM 隔离
├── edgeone/     EdgeOne Makers Cloud Functions 入口
└── plugins/     原生评论 & 联邦宇宙插件
```

## 特性

### AI 评论生成

- **12+ AI 提供商** — 内置 OpenAI、Gemini、Claude、DeepSeek、Groq、千问、GLM（智谱）、混元、豆包、MiniMax、Kimi、Ollama（本地部署）模板。任意 OpenAI 兼容端点可动态添加。
- **自定义系统提示词** — 按站点和按提供商分别配置提示词模板。支持从 GitHub 原始 JSON URL 批量导入。
- **可配置生成策略** — 控制评论频率、语气、长度和语言。支持页面请求时自动生成或手动触发。
- **自定义 SVG 头像** — 为每个 AI 提供商分配独特的 SVG 图标，视觉区分。

### 访客体验

- **只读浏览** — AI 生成的评论直接展示，访客无需登录或注册。
- **反应系统** — 点赞、点踩、爱心等表情反应，单用户去重。反应类型可配置。
- **Widget 嵌入** — 原生 JS Web Component，Shadow DOM 样式隔离。一行代码嵌入（`<script src="...">`），与宿主页面零依赖。
- **20+ 主题** — 内置亮色和暗色主题（GitHub 风格、Catppuccin、Gruvbox、Cobalt、Noborder、Transparent 等），自动检测系统颜色模式。
- **语言自动检测** — Widget 自动检测访客浏览器语言（中文/英文）。

### 管理面板

- **仪表盘** — 站点级统计概览（评论生成数、缓存命中率、提供商使用量）。
- **站点管理** — 多租户 CRUD：一个实例创建、配置和监控多个站点。
- **提供商配置** — 拖拽排序，自定义 SVG 头像，一键测试连接。
- **提示词管理** — 按提供商配置系统提示词，支持从 GitHub JSON URL 批量导入。
- **缓存管理** — 查看缓存统计，手动刷新或清除页面缓存。
- **插件管理** — 启用/禁用插件，配置插件设置。
- **Webhook 管理** — Webhook 端点 CRUD。支持事件：评论生成、页面就绪、缓存刷新。
- **审计日志** — 所有管理操作的完整审计追踪，包括时间戳和操作人。
- **用户管理** — 管理管理员账号、角色、TOTP 双因素认证。
- **API 令牌** — 生成和吊销 API 令牌，支持作用域权限（read、read_write、admin）。

### 插件系统

- **原生评论插件** — 访客可提交评论，存储在 AIGCS 自身数据库中。特性：回复线程、编辑窗口、管理员 PIN 审核、邮件通知、Gravatar 代理、屏蔽关键词、邮箱域名白名单/黑名单。29 个可配置设置。
- **联邦宇宙插件** — 与 ActivityPub 平台同步评论（Mastodon、GoToSocial、Pleroma、Misskey、Loops、WriteFreely）。OAuth 授权、状态绑定、自动获取、头像代理模式。
- **插件 SDK** — 7 个生命周期钩子（`onServerInit`、`beforeGenerate`、`afterGenerate`、`pageReady`、`onFetchComments`、`onCommentSubmit`、`beforeRender`），支持从本地目录加载或通过管理面板上传。

### 安全

- **CSRF 保护** — Admin API 要求 `X-Requested-With: XMLHttpRequest` 头。
- **HSTS** — `strict-transport-security: max-age=31536000; includeSubDomains`。
- **CORS** — 可配置的 `allowed_origins` 白名单。
- **速率限制** — 可配置窗口和最大请求数，按端点独立限制。
- **XSS 防护** — DOMPurify 清洗所有 AI 生成内容，Widget 使用 `textContent` 插入。
- **密码哈希** — Argon2id（抗 GPU/ASIC），自动升级遗留 bcrypt 哈希。
- **加密** — AES-256-GCM 加密 API Key、TOTP Secret、SMTP 密码。
- **JWT** — 15 分钟 Access Token + 7 天 Refresh Token，支持作用域 API 令牌。
- **双因素认证** — TOTP 双因素认证 + 8 个一次性备用码。
- **验证码** — Cloudflare Turnstile、Google reCAPTCHA 或极验 Geetest。
- **Docker** — 非 root 用户运行、健康检查、多阶段构建。

### 技术

- **数据库** — SQLite，Drizzle ORM。单文件存储，零外部数据库依赖。
- **缓存** — 内存 LRU 缓存 + 数据库持久化。ETag 条件请求，CDN 友好。
- **Webhook** — 评论生成、页面就绪、缓存刷新事件的 HTTP 回调。HMAC-SHA256 签名。
- **国际化** — 管理面板中文/英文，Widget 自动检测浏览器语言，插件系统支持 i18n 显示名称。
- **多租户** — 单个实例服务多个站点，每个站点独立配置 Provider、提示词和生成设置。

## 开发

```bash
pnpm install
pnpm build
pnpm dev
```

完整开发指南请访问 [docs.aigcs.chat](https://docs.aigcs.chat)。

## 许可证

MIT
