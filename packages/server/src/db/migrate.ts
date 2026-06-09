export async function migrate(dialect: 'sqlite' | 'mysql' | 'pg' = 'sqlite') {
  switch (dialect) {
    case 'sqlite':
      await migrateSqlite()
      break
    case 'mysql':
      await migrateMysql()
      break
    case 'pg':
      await migratePg()
      break
    default:
      throw new Error(`Unsupported dialect: ${dialect}`)
  }
}

async function migrateSqlite() {
  const { getRawDb } = await import('./factory.js')
  const raw = getRawDb()

  raw.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  username TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  email_verified_at TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_backup_codes TEXT,
  avatar TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'read',
  last_used_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, domain)
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'zh',
  category TEXT NOT NULL DEFAULT 'general',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'openai-compatible',
  api_key TEXT NOT NULL DEFAULT '',
  api_endpoint TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
  model TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  show_on_frontend INTEGER NOT NULL DEFAULT 1,
  sort_weight INTEGER NOT NULL DEFAULT 0,
  prompt_template_id TEXT REFERENCES prompt_templates(id),
  extra_params TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, name)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,
  author_avatar TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_md5 TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, path, provider_name)
);

CREATE TABLE IF NOT EXISTS page_cache (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  etag TEXT,
  generated_at TEXT,
  expires_at TEXT,
  error TEXT,
  locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  title TEXT,
  content_source TEXT,
  UNIQUE(site_id, path)
);

CREATE TABLE IF NOT EXISTS reaction_types (
  id TEXT PRIMARY KEY,
  emoji TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  site_id TEXT REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comment_reactions (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(comment_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS reaction_votes (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(comment_id, reaction_type, visitor_hash)
);

CREATE TABLE IF NOT EXISTS system_config (
  id TEXT PRIMARY KEY DEFAULT 'global',
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_from_email TEXT,
  smtp_from_name TEXT,
  captcha_provider TEXT NOT NULL DEFAULT 'none',
  turnstile_site_key TEXT,
  turnstile_secret_key TEXT,
  recaptcha_site_key TEXT,
  recaptcha_secret_key TEXT,
  geetest_captcha_id TEXT,
  geetest_captcha_key TEXT,
  cap_site_key TEXT,
  cap_secret_key TEXT,
  altcha_site_key TEXT,
  altcha_secret_key TEXT,
  hcaptcha_site_key TEXT,
  hcaptcha_secret_key TEXT,
  cap_verify_url TEXT,
  jwt_secret TEXT,
  global_system_prompt TEXT,
  email_notify_comments INTEGER NOT NULL DEFAULT 0,
  registration_open INTEGER NOT NULL DEFAULT 0,
  allowed_origins TEXT,
  rate_limit_max INTEGER NOT NULL DEFAULT 100,
  rate_limit_window INTEGER NOT NULL DEFAULT 60,
  provider_defaults TEXT,
  notify_new_registration INTEGER NOT NULL DEFAULT 0,
  site_title TEXT,
  site_favicon TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL,
  secret TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_lookup ON comments(site_id, path);
CREATE INDEX IF NOT EXISTS idx_page_cache_lookup ON page_cache(site_id, path);
CREATE INDEX IF NOT EXISTS idx_providers_site ON providers(site_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_site ON webhooks(site_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reaction_votes_lookup ON reaction_votes(comment_id, visitor_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
`)

  // Add provider_defaults column to existing databases
  try { raw.exec("ALTER TABLE system_config ADD COLUMN provider_defaults TEXT"); } catch {}
  // Add username column to existing databases
  try { raw.exec("ALTER TABLE users ADD COLUMN username TEXT"); } catch {}
  // Add avatar column to users
  try { raw.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"); } catch {}
  // Add enabled column to existing databases
  try { raw.exec("ALTER TABLE reaction_types ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1"); } catch {}
  // Add avatar_svg column to existing databases
  try { raw.exec("ALTER TABLE providers ADD COLUMN avatar_svg TEXT NOT NULL DEFAULT ''"); } catch {}
  // Add notify_new_registration column to existing databases
  try { raw.exec("ALTER TABLE system_config ADD COLUMN notify_new_registration INTEGER NOT NULL DEFAULT 0"); } catch {}
  // Add site_title and site_favicon to existing databases
  try { raw.exec("ALTER TABLE system_config ADD COLUMN site_title TEXT"); } catch {}
  try { raw.exec("ALTER TABLE system_config ADD COLUMN site_favicon TEXT"); } catch {}
  // Add title and content_source to page_cache
  try { raw.exec("ALTER TABLE page_cache ADD COLUMN title TEXT"); } catch {}
  try { raw.exec("ALTER TABLE page_cache ADD COLUMN content_source TEXT"); } catch {}
  // Add CAP/Altcha/hCaptcha columns to existing databases
  try { raw.exec("ALTER TABLE system_config ADD COLUMN cap_site_key TEXT"); } catch {}
  try { raw.exec("ALTER TABLE system_config ADD COLUMN cap_secret_key TEXT"); } catch {}
  try { raw.exec("ALTER TABLE system_config ADD COLUMN cap_verify_url TEXT"); } catch {}
  try { raw.exec("ALTER TABLE system_config ADD COLUMN altcha_site_key TEXT"); } catch {}
  try { raw.exec("ALTER TABLE system_config ADD COLUMN altcha_secret_key TEXT"); } catch {}
  try { raw.exec("ALTER TABLE system_config ADD COLUMN hcaptcha_site_key TEXT"); } catch {}
  try { raw.exec("ALTER TABLE system_config ADD COLUMN hcaptcha_secret_key TEXT"); } catch {}

  // Visitor comments table (comment plugins)
  raw.exec(`
CREATE TABLE IF NOT EXISTS visitor_comments (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  parent_id TEXT,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL DEFAULT '',
  author_url TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved',
  visitor_id TEXT NOT NULL DEFAULT '',
  notify_on_reply INTEGER NOT NULL DEFAULT 0,
  edited_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visitor_comments_lookup ON visitor_comments(site_id, path);
`)
 
  // Verification codes table
  raw.exec(`
CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'delete_comment',
  target_id TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);

CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  context TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(email, context)
);
`)

  // Add parent_id, edited_at, visitor_id to existing visitor_comments tables
  try { raw.exec("ALTER TABLE visitor_comments ADD COLUMN parent_id TEXT"); } catch {}
  try { raw.exec("ALTER TABLE visitor_comments ADD COLUMN visitor_id TEXT NOT NULL DEFAULT ''"); } catch {}
  try { raw.exec("ALTER TABLE visitor_comments ADD COLUMN edited_at TEXT"); } catch {}
  try { raw.exec("ALTER TABLE visitor_comments ADD COLUMN notify_on_reply INTEGER NOT NULL DEFAULT 0"); } catch {}

  // Add software column to existing mastodon_bindings tables
  try { raw.exec("ALTER TABLE mastodon_bindings ADD COLUMN software TEXT NOT NULL DEFAULT ''"); } catch {}
  // Add hidden column to existing mastodon_cached_comments tables
  try { raw.exec("ALTER TABLE mastodon_cached_comments ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0"); } catch {}

  // Migrate reaction tables to support visitor comment IDs (remove FK constraint on comments.id)
  raw.exec(`
    CREATE TABLE IF NOT EXISTS comment_reactions_v2 (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      reaction_type TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(comment_id, reaction_type)
    );
    INSERT OR IGNORE INTO comment_reactions_v2 SELECT * FROM comment_reactions;
    DROP TABLE IF EXISTS comment_reactions;
    ALTER TABLE comment_reactions_v2 RENAME TO comment_reactions;

    CREATE TABLE IF NOT EXISTS reaction_votes_v2 (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      reaction_type TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(comment_id, reaction_type, visitor_hash)
    );
    INSERT OR IGNORE INTO reaction_votes_v2 SELECT * FROM reaction_votes;
    DROP TABLE IF EXISTS reaction_votes;
    ALTER TABLE reaction_votes_v2 RENAME TO reaction_votes;
  `)

  // Mastodon plugin tables
  raw.exec(`
CREATE TABLE IF NOT EXISTS mastodon_bindings (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  instance_type TEXT NOT NULL DEFAULT 'mastodon',
  instance_url TEXT NOT NULL,
  status_id TEXT NOT NULL,
  software TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  fedi_author TEXT NOT NULL DEFAULT '',
  auto_fetch INTEGER NOT NULL DEFAULT 1,
  cache_ttl INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mastodon_bindings_site ON mastodon_bindings(site_id);
CREATE INDEX IF NOT EXISTS idx_mastodon_bindings_lookup ON mastodon_bindings(site_id, slug);

CREATE TABLE IF NOT EXISTS mastodon_cached_comments (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL,
  mastodon_comment_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  author_avatar TEXT NOT NULL DEFAULT '',
  author_fedi_id TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  favourites_count INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mastodon_cache_binding ON mastodon_cached_comments(binding_id);
`)

  console.log('[db] SQLite schema migrated successfully')
}

async function migrateMysql() {
  const { getRawDb } = await import('./factory.js')
  const pool = getRawDb()
  const connection = await pool.getConnection()

  try {
    await connection.execute(`
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  username VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  email_verified_at TIMESTAMP NULL,
  totp_secret VARCHAR(255),
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  totp_backup_codes TEXT,
  avatar VARCHAR(1024) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_tokens (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  token_prefix VARCHAR(20) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'read',
  last_used_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sites (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  settings JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_domain (user_id, domain),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prompt_templates (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  lang VARCHAR(10) NOT NULL DEFAULT 'zh',
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  provider_type VARCHAR(50) NOT NULL DEFAULT 'openai-compatible',
  api_key TEXT NOT NULL,
  api_endpoint TEXT NOT NULL,
  models JSON NOT NULL,
  model VARCHAR(255) NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_frontend BOOLEAN NOT NULL DEFAULT TRUE,
  sort_weight INT NOT NULL DEFAULT 0,
  prompt_template_id VARCHAR(36),
  extra_params JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_site_provider (site_id, name),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(36) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  provider_name VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL DEFAULT '',
  author_name VARCHAR(255) NOT NULL,
  author_avatar VARCHAR(1024) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_md5 VARCHAR(64) NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_site_path_provider (site_id, path, provider_name),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS page_cache (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(36) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  etag VARCHAR(64),
  generated_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL,
  error TEXT,
  locked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  title VARCHAR(255),
  content_source TEXT,
  UNIQUE KEY uk_cache (site_id, path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reaction_types (
  id VARCHAR(36) PRIMARY KEY,
  emoji VARCHAR(20) NOT NULL,
  label VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  site_id VARCHAR(36),
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comment_reactions (
  id VARCHAR(36) PRIMARY KEY,
  comment_id VARCHAR(36) NOT NULL,
  reaction_type VARCHAR(50) NOT NULL,
  count INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_comment_reaction (comment_id, reaction_type),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reaction_votes (
  id VARCHAR(36) PRIMARY KEY,
  comment_id VARCHAR(36) NOT NULL,
  reaction_type VARCHAR(50) NOT NULL,
  visitor_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vote (comment_id, reaction_type, visitor_hash),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR(36) PRIMARY KEY DEFAULT 'global',
  smtp_host VARCHAR(255),
  smtp_port INT,
  smtp_user VARCHAR(255),
  smtp_pass TEXT,
  smtp_from_email VARCHAR(255),
  smtp_from_name VARCHAR(255),
  captcha_provider VARCHAR(20) NOT NULL DEFAULT 'none',
  turnstile_site_key TEXT,
  turnstile_secret_key TEXT,
  recaptcha_site_key TEXT,
  recaptcha_secret_key TEXT,
  geetest_captcha_id TEXT,
  geetest_captcha_key TEXT,
  cap_site_key TEXT,
  cap_secret_key TEXT,
  altcha_site_key TEXT,
  altcha_secret_key TEXT,
  hcaptcha_site_key TEXT,
  hcaptcha_secret_key TEXT,
  cap_verify_url TEXT,
  jwt_secret TEXT,
  global_system_prompt TEXT,
  email_notify_comments BOOLEAN NOT NULL DEFAULT FALSE,
  registration_open BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_origins JSON,
  rate_limit_max INT NOT NULL DEFAULT 100,
  rate_limit_window INT NOT NULL DEFAULT 60,
  provider_defaults TEXT,
  notify_new_registration BOOLEAN NOT NULL DEFAULT FALSE,
  site_title VARCHAR(255),
  site_favicon TEXT,
  updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plugins (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhooks (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  events JSON NOT NULL,
  secret TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  action VARCHAR(100) NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  details JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_comments_lookup ON comments(site_id, path);
CREATE INDEX idx_page_cache_lookup ON page_cache(site_id, path);
CREATE INDEX idx_providers_site ON providers(site_id);
CREATE INDEX idx_webhooks_site ON webhooks(site_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_reaction_votes_lookup ON reaction_votes(comment_id, visitor_hash);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX idx_sites_user ON sites(user_id);
`)

    // Add provider_defaults column to existing databases
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN provider_defaults TEXT"); } catch {}
    // Add username column to existing databases
    try { await connection.execute("ALTER TABLE users ADD COLUMN username VARCHAR(255)"); } catch {}
    // Add avatar column to users
    try { await connection.execute("ALTER TABLE users ADD COLUMN avatar VARCHAR(1024) NOT NULL DEFAULT ''"); } catch {}
    // Add enabled column to existing databases
    try { await connection.execute("ALTER TABLE reaction_types ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE"); } catch {}
    // Add avatar_svg column to existing databases
    try { await connection.execute("ALTER TABLE providers ADD COLUMN avatar_svg VARCHAR(1024) NOT NULL DEFAULT ''"); } catch {}
    // Add notify_new_registration column to existing databases
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN notify_new_registration BOOLEAN NOT NULL DEFAULT FALSE"); } catch {}
    // Add site_title and site_favicon to existing databases
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN site_title VARCHAR(255)"); } catch {}
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN site_favicon TEXT"); } catch {}
    // Add title and content_source to page_cache
    try { await connection.execute("ALTER TABLE page_cache ADD COLUMN title VARCHAR(255)"); } catch {}
    try { await connection.execute("ALTER TABLE page_cache ADD COLUMN content_source TEXT"); } catch {}
    // Add CAP/Altcha/hCaptcha columns to existing databases
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN cap_site_key TEXT"); } catch {}
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN cap_secret_key TEXT"); } catch {}
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN altcha_site_key TEXT"); } catch {}
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN altcha_secret_key TEXT"); } catch {}
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN hcaptcha_site_key TEXT"); } catch {}
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN hcaptcha_secret_key TEXT"); } catch {}
    // Add CAP verify URL column to existing databases
    try { await connection.execute("ALTER TABLE system_config ADD COLUMN cap_verify_url TEXT"); } catch {}

    // Add visitor_comments columns to existing databases
    try { await connection.execute("ALTER TABLE visitor_comments ADD COLUMN parent_id VARCHAR(36)"); } catch {}
    try { await connection.execute("ALTER TABLE visitor_comments ADD COLUMN visitor_id VARCHAR(64) NOT NULL DEFAULT ''"); } catch {}
    try { await connection.execute("ALTER TABLE visitor_comments ADD COLUMN edited_at TIMESTAMP NULL"); } catch {}
    try { await connection.execute("ALTER TABLE visitor_comments ADD COLUMN notify_on_reply TINYINT NOT NULL DEFAULT 0"); } catch {}

    // Add software column to existing mastodon_bindings tables
    try { await connection.execute("ALTER TABLE mastodon_bindings ADD COLUMN software VARCHAR(20) NOT NULL DEFAULT ''"); } catch {}

    // Verification codes table
    await connection.execute(`
CREATE TABLE IF NOT EXISTS verification_codes (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'delete_comment',
  target_id VARCHAR(36) NOT NULL DEFAULT '',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vc_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`)

    // Email unsubscribes table
    await connection.execute(`
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  context VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_email_context (email, context)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`)

    // Mastodon plugin tables
    await connection.execute(`
CREATE TABLE IF NOT EXISTS mastodon_bindings (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(36) NOT NULL,
  slug VARCHAR(1024) NOT NULL,
  instance_type VARCHAR(20) NOT NULL DEFAULT 'mastodon',
  instance_url VARCHAR(1024) NOT NULL,
  status_id VARCHAR(255) NOT NULL,
  software VARCHAR(20) NOT NULL DEFAULT '',
  access_token TEXT NOT NULL,
  fedi_author VARCHAR(255) NOT NULL DEFAULT '',
  auto_fetch TINYINT NOT NULL DEFAULT 1,
  cache_ttl INT NOT NULL DEFAULT 30,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mb_site (site_id),
  INDEX idx_mb_lookup (site_id, slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mastodon_cached_comments (
  id VARCHAR(36) PRIMARY KEY,
  binding_id VARCHAR(36) NOT NULL,
  mastodon_comment_id VARCHAR(255) NOT NULL,
  author_name VARCHAR(255) NOT NULL DEFAULT '',
  author_avatar VARCHAR(1024) NOT NULL DEFAULT '',
  author_fedi_id VARCHAR(255) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  favourites_count INT NOT NULL DEFAULT 0,
  parent_id VARCHAR(255) NOT NULL DEFAULT '',
  hidden TINYINT NOT NULL DEFAULT 0,
  INDEX idx_mcc_binding (binding_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`)

    console.log('[db] MySQL schema migrated successfully')
  } finally {
    connection.release()
  }
}

async function migratePg() {
  const { getRawDb } = await import('./factory.js')
  const pool = getRawDb()
  const client = await pool.connect()

  try {
    await client.query(`
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL DEFAULT '',
  username VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  email_verified_at TIMESTAMPTZ,
  totp_secret VARCHAR(255),
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  totp_backup_codes TEXT,
  avatar VARCHAR(1024) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  token_prefix VARCHAR(20) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'read',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  lang VARCHAR(10) NOT NULL DEFAULT 'zh',
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  provider_type VARCHAR(50) NOT NULL DEFAULT 'openai-compatible',
  api_key TEXT NOT NULL DEFAULT '',
  api_endpoint TEXT NOT NULL DEFAULT '',
  models JSONB NOT NULL DEFAULT '[]',
  model VARCHAR(255) NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_frontend BOOLEAN NOT NULL DEFAULT TRUE,
  sort_weight INT NOT NULL DEFAULT 0,
  prompt_template_id UUID REFERENCES prompt_templates(id),
  extra_params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, name)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path VARCHAR(1024) NOT NULL,
  provider_name VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL DEFAULT '',
  author_name VARCHAR(255) NOT NULL,
  author_avatar VARCHAR(1024) NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  content_md5 VARCHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, path, provider_name)
);

CREATE TABLE IF NOT EXISTS page_cache (
  id VARCHAR(64) PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  path VARCHAR(1024) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  etag VARCHAR(64),
  generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  error TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title VARCHAR(255),
  content_source TEXT,
  UNIQUE(site_id, path)
);

CREATE TABLE IF NOT EXISTS reaction_types (
  id VARCHAR(36) PRIMARY KEY,
  emoji VARCHAR(20) NOT NULL,
  label VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reaction_type VARCHAR(50) NOT NULL,
  count INT NOT NULL DEFAULT 0,
  UNIQUE(comment_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS reaction_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reaction_type VARCHAR(50) NOT NULL,
  visitor_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comment_id, reaction_type, visitor_hash)
);

CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR(36) PRIMARY KEY DEFAULT 'global',
  smtp_host VARCHAR(255),
  smtp_port INT,
  smtp_user VARCHAR(255),
  smtp_pass TEXT,
  smtp_from_email VARCHAR(255),
  smtp_from_name VARCHAR(255),
  captcha_provider VARCHAR(20) NOT NULL DEFAULT 'none',
  turnstile_site_key TEXT,
  turnstile_secret_key TEXT,
  recaptcha_site_key TEXT,
  recaptcha_secret_key TEXT,
  geetest_captcha_id TEXT,
  geetest_captcha_key TEXT,
  cap_site_key TEXT,
  cap_secret_key TEXT,
  altcha_site_key TEXT,
  altcha_secret_key TEXT,
  hcaptcha_site_key TEXT,
  hcaptcha_secret_key TEXT,
  cap_verify_url TEXT,
  jwt_secret TEXT,
  global_system_prompt TEXT,
  email_notify_comments BOOLEAN NOT NULL DEFAULT FALSE,
  registration_open BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_origins JSONB,
  rate_limit_max INT NOT NULL DEFAULT 100,
  rate_limit_window INT NOT NULL DEFAULT 60,
  provider_defaults TEXT,
  notify_new_registration BOOLEAN NOT NULL DEFAULT FALSE,
  site_title VARCHAR(255),
  site_favicon TEXT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS plugins (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  events JSONB NOT NULL,
  secret TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_lookup ON comments(site_id, path);
CREATE INDEX IF NOT EXISTS idx_page_cache_lookup ON page_cache(site_id, path);
CREATE INDEX IF NOT EXISTS idx_providers_site ON providers(site_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_site ON webhooks(site_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reaction_votes_lookup ON reaction_votes(comment_id, visitor_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
`)

    // Add provider_defaults column to existing databases
    try { await client.query("ALTER TABLE system_config ADD COLUMN provider_defaults TEXT"); } catch {}
    // Add username column to existing databases
    try { await client.query("ALTER TABLE users ADD COLUMN username VARCHAR(255)"); } catch {}
    // Add avatar column to users
    try { await client.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(1024) NOT NULL DEFAULT ''"); } catch {}
    // Add enabled column to existing databases
    try { await client.query("ALTER TABLE reaction_types ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE"); } catch {}
    // Add avatar_svg column to existing databases
    try { await client.query("ALTER TABLE providers ADD COLUMN avatar_svg VARCHAR(1024) NOT NULL DEFAULT ''"); } catch {}
    // Add notify_new_registration column to existing databases
    try { await client.query("ALTER TABLE system_config ADD COLUMN notify_new_registration BOOLEAN NOT NULL DEFAULT FALSE"); } catch {}
    // Add site_title and site_favicon to existing databases
    try { await client.query("ALTER TABLE system_config ADD COLUMN site_title VARCHAR(255)"); } catch {}
    try { await client.query("ALTER TABLE system_config ADD COLUMN site_favicon TEXT"); } catch {}
    // Add title and content_source to page_cache
    try { await client.query("ALTER TABLE page_cache ADD COLUMN title VARCHAR(255)"); } catch {}
    try { await client.query("ALTER TABLE page_cache ADD COLUMN content_source TEXT"); } catch {}
    // Add CAP/Altcha/hCaptcha columns to existing databases
    try { await client.query("ALTER TABLE system_config ADD COLUMN cap_site_key TEXT"); } catch {}
    try { await client.query("ALTER TABLE system_config ADD COLUMN cap_secret_key TEXT"); } catch {}
    try { await client.query("ALTER TABLE system_config ADD COLUMN altcha_site_key TEXT"); } catch {}
    try { await client.query("ALTER TABLE system_config ADD COLUMN altcha_secret_key TEXT"); } catch {}
    try { await client.query("ALTER TABLE system_config ADD COLUMN hcaptcha_site_key TEXT"); } catch {}
    try { await client.query("ALTER TABLE system_config ADD COLUMN hcaptcha_secret_key TEXT"); } catch {}
    // Add CAP verify URL column to existing databases
    try { await client.query("ALTER TABLE system_config ADD COLUMN cap_verify_url TEXT"); } catch {}

    // Add visitor_comments columns to existing databases
    try { await client.query("ALTER TABLE visitor_comments ADD COLUMN parent_id TEXT"); } catch {}
    try { await client.query("ALTER TABLE visitor_comments ADD COLUMN visitor_id TEXT NOT NULL DEFAULT ''"); } catch {}
    try { await client.query("ALTER TABLE visitor_comments ADD COLUMN edited_at TIMESTAMPTZ"); } catch {}
    try { await client.query("ALTER TABLE visitor_comments ADD COLUMN notify_on_reply SMALLINT NOT NULL DEFAULT 0"); } catch {}

    // Add software column to existing mastodon_bindings tables
    try { await client.query("ALTER TABLE mastodon_bindings ADD COLUMN software TEXT NOT NULL DEFAULT ''"); } catch {}

    // Verification codes table
    await client.query(`
CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'delete_comment',
  target_id TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vc_email ON verification_codes(email);
`)

    // Email unsubscribes table
    await client.query(`
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id TEXT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  context VARCHAR(36) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(email, context)
);
`)

    // Mastodon plugin tables
    await client.query(`
CREATE TABLE IF NOT EXISTS mastodon_bindings (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  instance_type TEXT NOT NULL DEFAULT 'mastodon',
  instance_url TEXT NOT NULL,
  status_id TEXT NOT NULL,
  software TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  fedi_author TEXT NOT NULL DEFAULT '',
  auto_fetch SMALLINT NOT NULL DEFAULT 1,
  cache_ttl INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mb_site ON mastodon_bindings(site_id);
CREATE INDEX IF NOT EXISTS idx_mb_lookup ON mastodon_bindings(site_id, slug);

CREATE TABLE IF NOT EXISTS mastodon_cached_comments (
  id TEXT PRIMARY KEY,
  binding_id TEXT NOT NULL,
  mastodon_comment_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  author_avatar TEXT NOT NULL DEFAULT '',
  author_fedi_id TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  favourites_count INT NOT NULL DEFAULT 0,
  parent_id TEXT NOT NULL DEFAULT '',
  hidden SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mcc_binding ON mastodon_cached_comments(binding_id);
`)

    console.log('[db] PostgreSQL schema migrated successfully')
  } finally {
    client.release()
  }
}
