# AIGCS Docker

## 快速开始

```bash
# 复制配置
cp .env.example .env
# 编辑 .env，修改 JWT_SECRET 等必要配置

# 启动
docker compose up -d

# 查看日志
docker compose logs -f
```

默认访问 `http://localhost:41905`，管理面板在 `http://localhost:41905/admin`。

## 构建镜像

```bash
# 从项目根目录构建
docker build -t eallion/aigcs:latest .
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `41905` | 服务端口 |
| `DATABASE_URL` | `file:./data/aigcs.db` | 数据库连接 URL（SQLite 默认，支持 MySQL/PostgreSQL） |
| `JWT_SECRET` | `change-me-in-production` | JWT 签名密钥（**必须修改**） |
| `ENCRYPTION_KEY` | — | AES-256-GCM 加密密钥，未设置时使用 JWT_SECRET |
| `RATE_LIMIT_MAX` | `100` | 窗口内最大请求数 |
| `RATE_LIMIT_WINDOW` | `60` | 速率限制窗口（秒） |
| `ADMIN_URL` | `http://localhost:5173` | 管理面板 URL（用于邮件模板等）。不设置则自动从请求 URL 推断 |

### SMTP

| 变量 | 说明 |
|------|------|
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | SMTP 端口 |
| `SMTP_USER` | SMTP 用户名 |
| `SMTP_PASS` | SMTP 密码 |
| `SMTP_FROM_EMAIL` | 发件人邮箱 |
| `SMTP_FROM_NAME` | 发件人名称 |

### 验证码

| 变量 | 说明 |
|------|------|
| `CAPTCHA_PROVIDER` | 验证码提供商（`turnstile` / `recaptcha` / `geetest` / `hcaptcha` / `altcha` / `cap`） |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile Site Key |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile Secret Key |
| `RECAPTCHA_SITE_KEY` | reCAPTCHA Site Key |
| `RECAPTCHA_SECRET_KEY` | reCAPTCHA Secret Key |
| `GEETEST_CAPTCHA_ID` | GeeTest Captcha ID |
| `GEETEST_CAPTCHA_KEY` | GeeTest Captcha Key |
| `HCAPTCHA_SITE_KEY` | hCaptcha Site Key |
| `HCAPTCHA_SECRET_KEY` | hCaptcha Secret Key |
| `ALTCHA_SITE_KEY` | Altcha Site Key |
| `ALTCHA_SECRET_KEY` | Altcha Secret Key |
| `CAP_SITE_KEY` | CAP Site Key |
| `CAP_SECRET_KEY` | CAP Secret Key |
| `CAP_VERIFY_URL` | CAP 验证接口 URL |

### CORS 与其他

| 变量 | 说明 |
|------|------|
| `ALLOWED_ORIGINS` | 允许跨域来源（JSON 数组格式） |
| `REGISTRATION_OPEN` | 是否开放注册（`true` / `false`） |
| `GLOBAL_SYSTEM_PROMPT` | AI 评论的全局系统提示词 |

## volumes

| 挂载点 | 说明 |
|--------|------|
| `./data:/app/data` | SQLite 数据库文件、头像缓存等持久化数据 |

默认使用 SQLite，数据库文件保存在 `./data/aigcs.db`。如需 MySQL/PostgreSQL，修改 `DATABASE_URL` 并自行提供对应数据库服务（推荐额外定义一个 db service）。
