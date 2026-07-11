export const STYLES = `:host {
  display: block;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--text);
}

/* ── giscus-compatible themes ──
     theme="auto"|"light"|"dark" — mode
     light-theme="<name>"        — light variant (default: light)
     dark-theme="<name>"         — dark variant  (default: dark_dimmed)
  ── */

:host { --outer-border: 1px solid var(--border); }

/* Fallback for unknown / missing light themes */
:host([data-theme="light"]) {
  --outer-bg: #f5f5f5; --card-bg: #fafafa; --text: #1f2937;
  --text-secondary: #6b7280; --text-muted: #9ca3af;
  --border: #e5e7eb; --card-border: #e5e7eb; --error-color: #ef4444;
  --avatar-bg: #6366f1; --reaction-bg: #f3f4f6; --reaction-hover: #e5e7eb;
  --link: #3b82f6; --outer-border: 1px solid var(--border);
}

/* Fallback for unknown / missing dark themes */
:host([data-theme="dark"]) {
  --outer-bg: #22272e; --card-bg: #2d333b; --text: #adbac7;
  --text-secondary: #768390; --text-muted: #545d68;
  --border: #444c56; --card-border: #444c56; --error-color: #f47067;
  --avatar-bg: #6366f1; --reaction-bg: #2d333b; --reaction-hover: #373e47;
  --link: #539bf5; --outer-border: 1px solid var(--border);
}

/* ════════════════════════════════════════════
   Light themes
   ════════════════════════════════════════════ */

/* light (default) */
:host([data-theme="light"][data-active-theme="light"]) {
  --outer-bg: #f5f5f5; --card-bg: #fafafa; --text: #1f2937;
  --text-secondary: #6b7280; --text-muted: #9ca3af;
  --border: #e5e7eb; --card-border: #e5e7eb; --error-color: #ef4444;
  --avatar-bg: #6366f1; --reaction-bg: #f3f4f6; --reaction-hover: #e5e7eb;
  --link: #3b82f6; --outer-border: 1px solid var(--border);
}

/* light_high_contrast */
:host([data-theme="light"][data-active-theme="light_high_contrast"]) {
  --outer-bg: #ffffff; --card-bg: #ffffff; --text: #0f172a;
  --text-secondary: #334155; --text-muted: #64748b;
  --border: #cbd5e1; --card-border: #94a3b8; --error-color: #dc2626;
  --avatar-bg: #4f46e5; --reaction-bg: #f8fafc; --reaction-hover: #e2e8f0;
  --link: #2563eb; --outer-border: 1px solid var(--border);
}

/* light_protanopia */
:host([data-theme="light"][data-active-theme="light_protanopia"]) {
  --outer-bg: #f5f5f5; --card-bg: #fafafa; --text: #1f2937;
  --text-secondary: #6b7280; --text-muted: #9ca3af;
  --border: #e5e7eb; --card-border: #e5e7eb; --error-color: #dc2626;
  --avatar-bg: #6366f1; --reaction-bg: #f3f4f6; --reaction-hover: #e5e7eb;
  --link: #0066cc; --outer-border: 1px solid var(--border);
}

/* light_tritanopia */
:host([data-theme="light"][data-active-theme="light_tritanopia"]) {
  --outer-bg: #f5f5f5; --card-bg: #fafafa; --text: #1f2937;
  --text-secondary: #6b7280; --text-muted: #9ca3af;
  --border: #e5e7eb; --card-border: #e5e7eb; --error-color: #dc2626;
  --avatar-bg: #6366f1; --reaction-bg: #f3f4f6; --reaction-hover: #e5e7eb;
  --link: #007f5f; --outer-border: 1px solid var(--border);
}

/* noborder_light */
:host([data-theme="light"][data-active-theme="noborder_light"]) {
  --outer-bg: #f5f5f5; --card-bg: #fafafa; --text: #1f2937;
  --text-secondary: #6b7280; --text-muted: #9ca3af;
  --border: #e5e7eb; --card-border: #e5e7eb; --error-color: #ef4444;
  --avatar-bg: #6366f1; --reaction-bg: #f3f4f6; --reaction-hover: #e5e7eb;
  --link: #3b82f6; --outer-border: none;
}

/* catppuccin_latte */
:host([data-theme="light"][data-active-theme="catppuccin_latte"]) {
  --outer-bg: #eff1f5; --card-bg: #e6e9ef; --text: #4c4f69;
  --text-secondary: #6c6f85; --text-muted: #9ca0b0;
  --border: #ccd0da; --card-border: #bcc0cc; --error-color: #d20f39;
  --avatar-bg: #8839ef; --reaction-bg: #e6e9ef; --reaction-hover: #dce0e8;
  --link: #1e66f5; --outer-border: 1px solid var(--border);
}

/* gruvbox_light */
:host([data-theme="light"][data-active-theme="gruvbox_light"]) {
  --outer-bg: #fbf1c7; --card-bg: #ebdbb2; --text: #3c3836;
  --text-secondary: #665c54; --text-muted: #928374;
  --border: #d5c4a1; --card-border: #bdae93; --error-color: #cc241d;
  --avatar-bg: #98971a; --reaction-bg: #ebdbb2; --reaction-hover: #d5c4a1;
  --link: #076678; --outer-border: 1px solid var(--border);
}

/* fro */
:host([data-theme="light"][data-active-theme="fro"]) {
  --outer-bg: #e8f5e9; --card-bg: #f1f8f4; --text: #1b5e20;
  --text-secondary: #388e3c; --text-muted: #81c784;
  --border: #c8e6c9; --card-border: #a5d6a7; --error-color: #c62828;
  --avatar-bg: #00897b; --reaction-bg: #f1f8f4; --reaction-hover: #dcedc8;
  --link: #00695c; --outer-border: 1px solid var(--border);
}

/* ════════════════════════════════════════════
   Dark themes
   ════════════════════════════════════════════ */

/* dark_dimmed / dimmed (default) */
:host([data-theme="dark"][data-active-theme="dark_dimmed"]),
:host([data-theme="dark"][data-active-theme="dimmed"]) {
  --outer-bg: #22272e; --card-bg: #2d333b; --text: #adbac7;
  --text-secondary: #768390; --text-muted: #545d68;
  --border: #444c56; --card-border: #444c56; --error-color: #f47067;
  --avatar-bg: #6366f1; --reaction-bg: #2d333b; --reaction-hover: #373e47;
  --link: #539bf5; --outer-border: 1px solid var(--border);
}

/* dark */
:host([data-theme="dark"][data-active-theme="dark"]) {
  --outer-bg: #0d1117; --card-bg: #161b22; --text: #e6edf3;
  --text-secondary: #8b949e; --text-muted: #545d68;
  --border: #30363d; --card-border: #30363d; --error-color: #f85149;
  --avatar-bg: #6366f1; --reaction-bg: #161b22; --reaction-hover: #1c2128;
  --link: #58a6ff; --outer-border: 1px solid var(--border);
}

/* dark_high_contrast */
:host([data-theme="dark"][data-active-theme="dark_high_contrast"]) {
  --outer-bg: #000000; --card-bg: #0a0e14; --text: #ffffff;
  --text-secondary: #d0d7de; --text-muted: #8b949e;
  --border: #6e7681; --card-border: #6e7681; --error-color: #ff6b6b;
  --avatar-bg: #8250df; --reaction-bg: #0a0e14; --reaction-hover: #1c2128;
  --link: #71b7ff; --outer-border: 1px solid var(--border);
}

/* dark_protanopia */
:host([data-theme="dark"][data-active-theme="dark_protanopia"]) {
  --outer-bg: #1c2128; --card-bg: #22272e; --text: #adbac7;
  --text-secondary: #768390; --text-muted: #545d68;
  --border: #444c56; --card-border: #444c56; --error-color: #f47067;
  --avatar-bg: #6366f1; --reaction-bg: #22272e; --reaction-hover: #373e47;
  --link: #71b7ff; --outer-border: 1px solid var(--border);
}

/* dark_tritanopia */
:host([data-theme="dark"][data-active-theme="dark_tritanopia"]) {
  --outer-bg: #1c2128; --card-bg: #22272e; --text: #adbac7;
  --text-secondary: #768390; --text-muted: #545d68;
  --border: #444c56; --card-border: #444c56; --error-color: #f47067;
  --avatar-bg: #6366f1; --reaction-bg: #22272e; --reaction-hover: #373e47;
  --link: #57d9a3; --outer-border: 1px solid var(--border);
}

/* transparent_dark */
:host([data-theme="dark"][data-active-theme="transparent_dark"]) {
  --outer-bg: transparent; --card-bg: transparent; --text: #adbac7;
  --text-secondary: #768390; --text-muted: #545d68;
  --border: #444c56; --card-border: #444c56; --error-color: #f47067;
  --avatar-bg: #6366f1; --reaction-bg: transparent;
  --reaction-hover: rgba(255,255,255,0.08);
  --link: #539bf5; --outer-border: 1px solid var(--border);
}

/* noborder_dark */
:host([data-theme="dark"][data-active-theme="noborder_dark"]) {
  --outer-bg: #22272e; --card-bg: #2d333b; --text: #adbac7;
  --text-secondary: #768390; --text-muted: #545d68;
  --border: #444c56; --card-border: #444c56; --error-color: #f47067;
  --avatar-bg: #6366f1; --reaction-bg: #2d333b; --reaction-hover: #373e47;
  --link: #539bf5; --outer-border: none;
}

/* noborder_gray */
:host([data-theme="dark"][data-active-theme="noborder_gray"]) {
  --outer-bg: #1c2128; --card-bg: #22272e; --text: #adbac7;
  --text-secondary: #768390; --text-muted: #545d68;
  --border: #444c56; --card-border: #444c56; --error-color: #f47067;
  --avatar-bg: #6366f1; --reaction-bg: #22272e; --reaction-hover: #373e47;
  --link: #539bf5; --outer-border: none;
}

/* cobalt */
:host([data-theme="dark"][data-active-theme="cobalt"]) {
  --outer-bg: #193549; --card-bg: #1d3a4f; --text: #ffffff;
  --text-secondary: #9effff; --text-muted: #6a9fb5;
  --border: #2d5b7a; --card-border: #2d5b7a; --error-color: #ff628c;
  --avatar-bg: #ff9d00; --reaction-bg: #1d3a4f; --reaction-hover: #264b66;
  --link: #9effff; --outer-border: 1px solid var(--border);
}

/* purple_dark */
:host([data-theme="dark"][data-active-theme="purple_dark"]) {
  --outer-bg: #1e1e2e; --card-bg: #2a2a3e; --text: #e0d0f0;
  --text-secondary: #a090c0; --text-muted: #706090;
  --border: #3a3a5e; --card-border: #4a4a6e; --error-color: #f08080;
  --avatar-bg: #b084f0; --reaction-bg: #2a2a3e; --reaction-hover: #3a3a5e;
  --link: #b084f0; --outer-border: 1px solid var(--border);
}

/* gruvbox */
:host([data-theme="dark"][data-active-theme="gruvbox"]) {
  --outer-bg: #282828; --card-bg: #32302f; --text: #ebdbb2;
  --text-secondary: #a89984; --text-muted: #7c6f64;
  --border: #504945; --card-border: #504945; --error-color: #fb4934;
  --avatar-bg: #98971a; --reaction-bg: #32302f; --reaction-hover: #3c3836;
  --link: #458588; --outer-border: 1px solid var(--border);
}

/* gruvbox_dark */
:host([data-theme="dark"][data-active-theme="gruvbox_dark"]) {
  --outer-bg: #1d2021; --card-bg: #282828; --text: #ebdbb2;
  --text-secondary: #928374; --text-muted: #7c6f64;
  --border: #3c3836; --card-border: #3c3836; --error-color: #fb4934;
  --avatar-bg: #98971a; --reaction-bg: #282828; --reaction-hover: #32302f;
  --link: #458588; --outer-border: 1px solid var(--border);
}

/* catppuccin_frappe */
:host([data-theme="dark"][data-active-theme="catppuccin_frappe"]) {
  --outer-bg: #303446; --card-bg: #353850; --text: #c6d0f5;
  --text-secondary: #a5adce; --text-muted: #737994;
  --border: #414559; --card-border: #51576d; --error-color: #e78284;
  --avatar-bg: #ca9ee6; --reaction-bg: #353850; --reaction-hover: #424659;
  --link: #8caaee; --outer-border: 1px solid var(--border);
}

/* catppuccin_macchiato */
:host([data-theme="dark"][data-active-theme="catppuccin_macchiato"]) {
  --outer-bg: #24273a; --card-bg: #292c3c; --text: #cad3f5;
  --text-secondary: #a5adcb; --text-muted: #6e738d;
  --border: #363a4f; --card-border: #494d64; --error-color: #ed8796;
  --avatar-bg: #c6a0f6; --reaction-bg: #292c3c; --reaction-hover: #363a4f;
  --link: #8aadf4; --outer-border: 1px solid var(--border);
}

/* catppuccin_mocha */
:host([data-theme="dark"][data-active-theme="catppuccin_mocha"]) {
  --outer-bg: #11111b; --card-bg: #181825; --text: #cdd6f4;
  --text-secondary: #a6adc8; --text-muted: #6c7086;
  --border: #313244; --card-border: #45475a; --error-color: #f38ba8;
  --avatar-bg: #cba6f7; --reaction-bg: #181825; --reaction-hover: #1e1e2e;
  --link: #89b4fa; --outer-border: 1px solid var(--border);
}

/* ── Outer container ── */
.aigcs-wrapper {
  border: var(--outer-border, 1px solid var(--border));
  border-radius: 16px;
  padding: 24px;
  background: var(--outer-bg);
  position: relative;
}

/* ── Title ── */
.aigcs-title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-bottom: 16px;
}

.aigcs-title-row h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.aigcs-powered {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0;
}

.aigcs-powered a {
  color: var(--link);
  text-decoration: none;
}

.aigcs-powered a:hover {
  text-decoration: underline;
}

/* ── Utilities ── */
.aigcs-hidden { display: none !important; }

/* ── Comment floor (card) ── */
.aigcs-comment-floor {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.aigcs-comment-floor:last-child {
  border-bottom: none;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: no-preference) {
  .aigcs-comment-floor {
    animation: fadeIn 0.3s ease-out;
  }
}

/* ── Comment body: avatar | main ── */
.aigcs-comment-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.aigcs-comment-main {
  flex: 1;
  min-width: 0;
}

/* ── Comment header ── */
.aigcs-comment-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.aigcs-comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 600;
  flex-shrink: 0;
}

.aigcs-comment-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.aigcs-comment-reply .aigcs-comment-avatar {
  width: 32px;
  height: 32px;
  font-size: 0.8125rem;
  border-width: 1.5px;
}

.aigcs-avatar-wrap {
  position: relative;
  display: inline-flex;
}

.aigcs-ai-badge {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid;
  background: var(--card-bg, #fff);
  box-shadow: 0 0 0 2px var(--card-bg, #fff);
  color: var(--text-secondary);
  opacity: 0.8;
  font-size: 8px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 1;
}

.aigcs-ai-badge-tr {
  top: -2px;
  right: -2px;
  bottom: auto;
  left: auto;
}

.aigcs-ai-badge-tl {
  top: -2px;
  left: -2px;
  bottom: auto;
  right: auto;
}

.aigcs-ai-badge-br {
  bottom: -2px;
  right: -2px;
  top: auto;
  left: auto;
}

.aigcs-ai-badge-bl {
  bottom: -2px;
  left: -2px;
  top: auto;
  right: auto;
}

.aigcs-fedi-badge {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin-right: 3px;
}

.aigcs-ai-nick-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid;
  font-size: 7px;
  font-weight: 700;
  line-height: 1;
  margin-right: 3px;
  color: var(--text-secondary);
  opacity: 0.8;
  vertical-align: middle;
}

.aigcs-fedi-badge, .aigcs-ai-nick-badge {
  position: relative;
  z-index: 10000;
  cursor: pointer;
}

.aigcs-fedi-badge::after, .aigcs-ai-nick-badge::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #1f2937;
  color: #f3f4f6;
  font-size: 11px;
  font-weight: 400;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 10000;
}

.aigcs-fedi-badge:hover::after, .aigcs-ai-nick-badge:hover::after {
  opacity: 1;
}

.aigcs-fedi-icon {
  display: block;
}

.aigcs-fedi-content {
  line-height: 1.6;
}
.aigcs-fedi-content p {
  margin: 0;
}
.aigcs-fedi-content a {
  color: var(--link, #3b82f6);
  text-decoration: none;
}
.aigcs-fedi-content a:hover {
  text-decoration: underline;
}
.aigcs-fedi-content .mention {
  font-weight: 500;
}

.aigcs-comment-author {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text);
}

.aigcs-comment-author:hover {
  color: var(--link);
}

.aigcs-comment-model {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* ── Comment content ── */
.aigcs-comment-content {
  font-size: 1rem;
  color: var(--text);
  line-height: 1.7;
  margin-top: 4px;
}

.aigcs-comment-content a {
  color: var(--link);
  text-decoration: none;
}

.aigcs-comment-content a:hover {
  text-decoration: underline;
}

/* ── Markdown content ── */
.aigcs-md-content {
  font-size: 1rem;
  color: var(--text);
  line-height: 1.7;
  margin-top: 4px;
  word-break: break-word;
}

.aigcs-md-content > *:first-child {
  margin-top: 0;
}

.aigcs-md-content > *:last-child {
  margin-bottom: 0;
}

.aigcs-md-content p {
  margin: 0.5em 0;
}

.aigcs-md-content a {
  color: var(--link);
  text-decoration: none;
}

.aigcs-md-content a:hover {
  text-decoration: underline;
}

.aigcs-md-content strong {
  font-weight: 600;
}

.aigcs-md-content em {
  font-style: italic;
}

.aigcs-md-content code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.875em;
  background: var(--border);
  padding: 0.15em 0.35em;
  border-radius: 4px;
}

.aigcs-md-content pre {
  background: var(--border);
  border-radius: 6px;
  padding: 0.75em 1em;
  overflow-x: auto;
  margin: 0.75em 0;
}

.aigcs-md-content pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: 0.85em;
}

.aigcs-md-content blockquote {
  border-left: 3px solid var(--border);
  padding-left: 0.75em;
  margin: 0.75em 0;
  color: var(--text-secondary);
}

.aigcs-md-content ul,
.aigcs-md-content ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.aigcs-md-content li {
  margin: 0.25em 0;
}

/* ── Comment footer (reactions) ── */
.aigcs-comment-footer {
  margin-top: 8px;
}

.aigcs-empty-content-note {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-style: italic;
  margin-bottom: 8px;
  padding: 6px 10px;
  background: var(--reaction-bg);
  border-radius: 6px;
  white-space: normal;
}

/* ── Loading / Error ── */
.aigcs-loading {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
}

.aigcs-error {
  text-align: center;
  padding: 24px;
  color: var(--error-color);
}

/* ── Reactions - GitHub style ── */
.aigcs-reactions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  position: relative;
}

.aigcs-reaction-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--reaction-bg);
  cursor: pointer;
  padding: 0;
  transition: background 0.15s;
  color: var(--text-secondary);
}

.aigcs-reaction-trigger:hover {
  background: var(--reaction-hover);
}

.aigcs-reaction-trigger svg {
  fill: currentColor;
}

.aigcs-reaction-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--reaction-bg);
  cursor: pointer;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-secondary);
  box-sizing: border-box;
  transition: border-color 0.15s, background 0.15s;
}

.aigcs-reaction-more:hover {
  border-color: var(--text-secondary);
  background: var(--reaction-hover);
}

.aigcs-reaction-overflow {
  display: none;
  position: absolute;
  right: 0;
  bottom: 100%;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
  gap: 2px;
  margin-bottom: 4px;
  white-space: nowrap;
}

.aigcs-reaction-overflow.show {
  display: inline-flex;
  align-items: center;
}

.aigcs-reaction-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
  height: 24px;
  box-sizing: border-box;
  color: var(--text-secondary);
  transition: border-color 0.15s, background 0.15s;
  white-space: nowrap;
}

.aigcs-reaction-item:hover {
  border-color: var(--text-secondary);
  background: var(--reaction-bg);
}

.aigcs-reaction-item .aigcs-emoji {
  font-size: 0.75rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.aigcs-reaction-item .aigcs-count {
  font-size: 0.75rem;
  font-weight: 500;
}

.aigcs-reaction-picker {
  display: none;
  position: absolute;
  left: 0;
  bottom: 100%;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
  gap: 2px;
  margin-bottom: 4px;
}

.aigcs-reaction-picker.show { display: flex; }

.aigcs-reaction-picker-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 1.125rem;
  transition: background 0.15s, transform 0.1s;
}

.aigcs-reaction-picker-btn:hover {
  background: var(--reaction-hover);
  transform: scale(1.2);
}

/* ── Visitor comment form ── */
.aigcs-section + .aigcs-section {
  margin-top: 1.5rem;
}

.aigcs-section-header {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text);
}

.aigcs-comment-form {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.aigcs-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.aigcs-form-label {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  display: flex;
  flex-direction: column;
}

.aigcs-form-label .aigcs-form-input {
  display: block;
  margin-top: 0.25rem;
  width: 100%;
}

.aigcs-form-required {
  color: #ef4444;
  margin-left: 2px;
}

.aigcs-form-input {
  min-width: 120px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--outer-bg);
  color: var(--text);
  font-size: 0.875rem;
  font-family: inherit;
  line-height: 1.4;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.aigcs-form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.aigcs-form-textarea {
  width: 100%;
  min-height: 80px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--outer-bg);
  color: var(--text);
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.aigcs-form-textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.aigcs-form-submit {
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s;
}

.aigcs-form-submit:hover:not(:disabled) {
  background: #1d4ed8;
}

.aigcs-form-submit:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.4);
}

.aigcs-form-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.aigcs-form-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.aigcs-reply-notify {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  cursor: pointer;
  margin: 0.5rem 0;
}

.aigcs-reply-notify input[type="checkbox"] {
  cursor: pointer;
}

#aigcs-cancel-reply {
  padding: 0.5rem 1.25rem;
  font-size: 0.875rem;
}

.aigcs-form-pin-row {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.aigcs-form-pin-label {
  font-size: 0.8125rem;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}

.aigcs-form-pin-input {
  max-width: 200px;
}

.aigcs-captcha-container {
  margin-top: 0.75rem;
}

.aigcs-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: 0.25rem;
  transition: opacity 0.15s;
}

/* Mobile: show ⋮, hide other buttons until .show toggled */
.aigcs-more-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 1.125rem;
  line-height: 1;
  padding: 0;
  transition: border-color 0.15s, background 0.15s;
}
.aigcs-more-toggle:hover {
  border-color: var(--text-secondary);
  background: var(--reaction-hover);
}
.aigcs-header-actions > button:not(.aigcs-more-toggle) { display: none; }
.aigcs-header-actions.show > button:not(.aigcs-more-toggle) { display: inline-flex; }

/* Desktop: buttons hidden by default, shown on hover via JS .hover class */
@media (hover: hover) {
  .aigcs-header-actions { opacity: 0; }
  .aigcs-header-actions.hover { opacity: 1; }
  .aigcs-more-toggle { display: none; }
  .aigcs-header-actions > button:not(.aigcs-more-toggle) { display: inline-flex; }
  .aigcs-header-actions.show > button:not(.aigcs-more-toggle) { display: inline-flex; }
}

.aigcs-header-action-btn {
  border: none;
  background: var(--reaction-bg);
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 12px;
  border-radius: 8px;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
  line-height: 1.5;
}

.aigcs-header-action-btn:hover {
  background: var(--reaction-hover);
  color: var(--text);
}

/* ── Email delete form ── */
.aigcs-delete-email-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  padding: 0.5rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin: 0.5rem 0;
}
.aigcs-delete-email-form .aigcs-delete-status {
  width: 100%;
  flex: 0 0 100%;
}

.aigcs-delete-email-input {
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--outer-bg);
  color: var(--text);
  font-size: 0.8125rem;
  font-family: inherit;
  min-width: 0;
  flex: 1;
}

.aigcs-delete-email-input-code {
  max-width: 85px;
}

.aigcs-delete-email-btn {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text);
  font-size: 0.8125rem;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.15s;
}

.aigcs-delete-email-btn:hover {
  background: var(--reaction-hover);
}

.aigcs-delete-email-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.aigcs-delete-status {
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding: 0.25rem 0;
}

/* ── Edited label ── */
.aigcs-edited-label {
  font-size: 0.6875rem;
  color: var(--text-muted, #9ca3af);
  margin-left: 0.25rem;
}

/* ── Nested replies - shared outer border ── */
.aigcs-comment-group {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.aigcs-comment-root {
  padding: 0.75rem 1rem;
}

.aigcs-comment-root + .aigcs-comment-replies {
  margin-top: 0;
}

.aigcs-comment-replies {
  position: relative;
  background: transparent;
}

.aigcs-thread-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}

.aigcs-comment-reply {
  position: relative;
}

.aigcs-comment-reply > .aigcs-comment-floor {
  margin-left: 0.5rem;
}

.aigcs-comment-reply + .aigcs-comment-reply {
  border-top: 1px solid var(--border);
}

/* ── Inline reply form ── */
.aigcs-inline-reply {
  border-top: 1px solid var(--border);
  padding: 12px 16px;
}

.aigcs-inline-reply .aigcs-comment-form {
  margin: 0;
}

/* ── Reply-to indicator ── */
.aigcs-reply-to {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-left: 0.125rem;
}

.aigcs-reply-to::before {
  content: '\u25B8';
  margin-right: 0.125rem;
  font-size: 0.6875rem;
}

/* ── Edit actions ── */
.aigcs-edit-textarea {
  width: 100%;
  min-height: 80px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--outer-bg);
  color: var(--text);
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.aigcs-edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.aigcs-edit-save,
.aigcs-edit-cancel {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.8125rem;
  cursor: pointer;
  font-family: inherit;
  background: var(--card-bg);
  color: var(--text);
}

.aigcs-edit-save {
  background: var(--link);
  color: #fff;
  border-color: var(--link);
}


.aigcs-comment-action-btn {
  background: none;
  border: none;
  color: var(--text-muted, #9ca3af);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.125rem 0.375rem;
  font-family: inherit;
  transition: color 0.15s;
}

.aigcs-comment-action-btn:hover {
  color: var(--link);
}

.aigcs-comment-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Standalone card for AI comments ── */
.aigcs-comment-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  margin-bottom: 12px;
}

.aigcs-form-status {
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

/* ── Visitor comments (reuses aigcs-comment-floor from AI) ── */
.aigcs-visitor-link {
  color: var(--link);
  font-weight: 600;
  text-decoration: none;
}

/* ── Deleted comments styling ── */
.aigcs-comment-collapsed .aigcs-comment-deleted {
  opacity: 0.6;
  background-color: var(--border, rgba(0, 0, 0, 0.03)) !important;
  border-radius: 8px;
  padding: 4px 8px;
}
.aigcs-comment-deleted .aigcs-deleted-content-text {
  font-style: italic;
  color: var(--text-secondary, #888);
  font-size: 0.85rem;
}
.aigcs-comment-author-deleted {
  color: var(--text-secondary, #888) !important;
  font-style: italic;
}
.aigcs-comment-avatar svg {
  color: var(--text-secondary, #bbb);
  width: 24px;
  height: 24px;
}
`
