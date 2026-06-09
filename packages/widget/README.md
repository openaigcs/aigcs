# @aigcs/widget

AIGCS 评论系统的前端 Web Component，Shadow DOM 隔离，零框架依赖。

## 安装

### CDN（推荐）

```html
<script src="https://cdn.jsdelivr.net/npm/@aigcs/widget/dist/aigcs.js" defer></script>
```

或 unpkg：

```html
<script src="https://unpkg.com/@aigcs/widget/dist/aigcs.js" defer></script>
```

### npm

```bash
npm install @aigcs/widget
```

## 使用

### 方式一：容器元素（自动初始化）

```html
<div id="aigcs" data-domain="your-blog.com"></div>
```

脚本会自动查找 `#aigcs` 元素并替换为 Web Component。

### 方式二：直接使用自定义元素

```html
<aigcs-widget
  domain="your-blog.com"
  path="/post/hello"
  theme="auto"
  lang="zh"
  server="https://admin.example.com"
></aigcs-widget>
```

### 方式三：JS API

```html
<div id="comment-root"></div>
<script src="https://cdn.jsdelivr.net/npm/@aigcs/widget/dist/aigcs.js" defer></script>
<script>
  AIGCS.init({
    el: '#comment-root',
    site: 'your-blog.com',
    path: '/post/hello',
    theme: 'auto',
    lang: 'zh',
  })
</script>
```

## 属性

| 属性 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `domain` | string | 必填 | 站点域名（与管理后台一致） |
| `path` | string | 当前路径 | 页面路径 |
| `server` | string | — | 服务端地址，跨域时使用 |
| `theme` | string | `auto` | `auto` / `light` / `dark` |
| `light-theme` | string | `light` | 浅色主题变体 |
| `dark-theme` | string | `dark_dimmed` | 深色主题变体 |
| `lang` | string | 自动检测 | `zh-hans` / `zh-hant` / `en` / `zh` |
| `auto-generate` | boolean | `false` | 设为 `true` 启用自动生成 |
| `comment-limit` | number | `0` | 最多显示评论数（0 = 不限） |
| `hide-title` | boolean | `false` | 设为 `true` 隐藏标题栏 |
| `disable-copyright` | boolean | `false` | 隐藏"由 AIGCS 提供支持" |
| `theme-color` | string | — | 主题色，`inverted` 反转 |

### 容器属性（方式一）

| 属性 | 说明 |
|------|------|
| `data-domain` | 站点域名 |
| `data-path` | 页面路径 |
| `data-server` | 管理面板 URL |
| `data-auto-generate` | 设为 `true` 启用自动生成 |

### JS API 参数

```typescript
AIGCS.init({
  el?: string | HTMLElement,   // 容器元素或选择器
  server?: string,              // 服务端地址
  site: string,                 // 站点域名
  path: string,                 // 页面路径
  theme?: 'auto' | 'light' | 'dark',
  lightTheme?: string,
  darkTheme?: string,
  lang?: 'zh' | 'en' | 'zh-hans' | 'zh-hant',
  autoGenerate?: boolean,
  disableCopyright?: boolean,
})
```

## 主题

兼容 giscus 主题命名。内置 20+ 主题变体：

**浅色：** `light`、`light_high_contrast`、`light_protanopia`、`light_tritanopia`、`noborder_light`、`catppuccin_latte`、`gruvbox_light`、`fro`

**深色：** `dark_dimmed`、`dark`、`dark_high_contrast`、`dark_protanopia`、`dark_tritanopia`、`transparent_dark`、`noborder_dark`、`noborder_gray`、`cobalt`、`purple_dark`、`gruvbox`、`gruvbox_dark`、`catppuccin_frappe`、`catppuccin_macchiato`、`catppuccin_mocha`

主题跟随系统（`auto`），也可通过 `theme` 属性固定。支持 `data-theme` 或 `class="dark"` 检测。

示例：

```html
<aigcs-widget
  domain="site.com"
  theme="dark"
  dark-theme="catppuccin_mocha"
></aigcs-widget>
```

## 本地开发

```bash
# 构建
pnpm --filter @aigcs/widget build

# 产物
dist/aigcs.js
dist/aigcs.js.map
```

## CDN URL

```
https://cdn.jsdelivr.net/npm/@aigcs/widget/dist/aigcs.js
https://unpkg.com/@aigcs/widget/dist/aigcs.js
```