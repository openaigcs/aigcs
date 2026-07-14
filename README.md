# AIGCS

AIGCS - AI Generated Comments System.

> [!CAUTION]
> This project is entirely AI-generated. I have no knowledge of coding, nor do I know much about AI. You are free to use it as you wish, but do so at your own risk.

> [!CAUTION]
> 本项目完全由 AI 生成，我对代码一无所知，对 AI 也不甚了解。  
> 你可以随意使用，但风险自担。
> [中文](README.zh.md)

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6)

<p align="center">
  <img src="./assets/preview.png" alt="AIGCS Preview" width="800" />
</p>

---

## Quick Start

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

> Port `41905` is leetspeak for **aigcs** (leetspeak：aigcs = 41905).

Visit `http://localhost:41905` → register admin → add a site → configure an AI provider → embed the widget on your page.

## Widget

```html
<div id="aigcs">Comments</div>
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

## Documentation

Full documentation is available at [docs.aigcs.social](https://docs.aigcs.social), covering:

- Installation (Docker, manual, EdgeOne Makers, Cloudflare Workers, Vercel)
- Configuration reference
- Widget integration guide
- Plugin system (native visitor comments, fediverse)
- API reference
- Operations & troubleshooting

## Architecture

```
packages/
├── core/        Shared Drizzle ORM schema, types, constants
├── server/      Hono HTTP service (API + middleware + AI providers)
├── admin/       React SPA admin panel (TanStack Router + Kumo UI)
├── widget/      Web Component with Shadow DOM isolation
├── edgeone/     EdgeOne Makers Cloud Functions entry
└── plugins/     Native & Fediverse plugins
```

## Features

### AI-Powered Comments

- **12+ AI providers** — Built-in templates for OpenAI, Gemini, Claude, DeepSeek, Groq, Qwen (千问), GLM (智谱), Hunyuan (混元), Doubao (豆包), MiniMax, Kimi, Ollama (local). Any OpenAI-compatible endpoint can be added dynamically.
- **Custom system prompts** — Per-site and per-provider prompt templates. Import prompts from GitHub raw JSON URLs in bulk.
- **Configurable generation** — Control comment frequency, tone, length, and language. Auto-generate on page request or trigger manually.
- **Custom SVG avatars** — Assign unique SVG icons to each AI provider for visual distinction.

### Visitor Experience

- **Read-only browsing** — AI-generated comments displayed without requiring login or registration.
- **Reaction system** — Like, dislike, love, and other emoji reactions. Single-user deduplication. Configurable reaction types.
- **Widget** — Vanilla JS Web Component with Shadow DOM isolation. One-line embed (`<script src="...">`) with zero dependency on the host page's CSS or JS.
- **20+ themes** — Built-in light and dark themes (GitHub-style, Catppuccin, Gruvbox, Cobalt, Noborder, Transparent, etc.). Auto-detects system color scheme.
- **Language auto-detect** — Widget automatically detects the visitor's browser language (zh/en).

### Admin Panel

- **Dashboard** — Site-wide statistics overview (comments generated, cache hit rate, provider usage).
- **Site management** — Multi-tenant CRUD: create, configure, and monitor multiple sites from one instance.
- **Provider configuration** — Drag-and-drop ordering. Custom SVG avatars. One-click test connection.
- **Prompt management** — Per-provider system prompts. Bulk import from GitHub JSON URLs.
- **Cache management** — View cache stats, manually refresh or clear page caches.
- **Plugin management** — Enable/disable plugins, configure plugin settings.
- **Webhook management** — CRUD for webhook endpoints. Event types: comment generated, page ready, cache refreshed.
- **Audit log** — Full audit trail of all admin operations with timestamps and actor info.
- **User management** — Manage admin accounts, roles, TOTP 2FA setup.
- **API tokens** — Generate and revoke API tokens with scoped permissions (read, read_write, admin).

### Plugin System

- **Native visitor comments** — Visitors can submit comments stored in AIGCS's own database. Features: reply threading, edit window, admin PIN moderation, email notifications, Gravatar with proxy, blocked keywords, email domain whitelist/blacklist. 29 configurable settings.
- **Fediverse plugin** — Sync comments with ActivityPub platforms (Mastodon, GoToSocial, Pleroma, Misskey, Loops, WriteFreely). OAuth authorization, status binding, auto-fetch, avatar proxy modes.
- **Plugin SDK** — 7 lifecycle hooks (`onServerInit`, `beforeGenerate`, `afterGenerate`, `pageReady`, `onFetchComments`, `onCommentSubmit`, `beforeRender`). Load plugins from local directory or upload via admin panel.

### Security

- **CSRF protection** — Admin API requires `X-Requested-With: XMLHttpRequest` header.
- **HSTS** — `strict-transport-security: max-age=31536000; includeSubDomains`.
- **CORS** — Configurable `allowed_origins` whitelist.
- **Rate limiting** — Configurable window and max requests. Per-endpoint rate limits.
- **XSS prevention** — DOMPurify sanitization on all AI-generated content. `textContent` insertion in widget.
- **Password hashing** — Argon2id (GPU/ASIC resistant). Automatic upgrade of legacy bcrypt hashes.
- **Encryption** — AES-256-GCM for API keys, TOTP secrets, SMTP passwords.
- **JWT** — 15-minute access tokens + 7-day refresh tokens. API token support with scoped permissions.
- **2FA** — TOTP-based two-factor authentication with 8 one-time backup codes.
- **Captcha** — Cloudflare Turnstile, Google reCAPTCHA, or Geetest.
- **Docker** — Non-root user, health checks, multi-stage builds.

### Technical

- **Database** — SQLite via Drizzle ORM. Single-file storage, zero external database dependency.
- **Caching** — In-memory LRU cache + database persistence. ETag support for conditional requests. CDN-friendly.
- **Webhooks** — HTTP callbacks for comment generation, page ready, cache refresh events. HMAC-SHA256 signed payloads.
- **Internationalization** — Admin panel in Chinese and English. Widget auto-detects browser language. Plugin system supports i18n display names.
- **Multi-tenant** — Single instance serves multiple sites. Each site has independent provider configuration, prompt templates, and generation settings.

## Development

```bash
pnpm install
pnpm build
pnpm dev
```

See [docs.aigcs.social](https://docs.aigcs.social) for full development guide.

## License

MIT
