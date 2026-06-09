// ── Response codes ──

export const RES_CODE = {
  SUCCESS: 0,
  FAIL: 1,
  NEED_LOGIN: 1024,
  RATE_LIMITED: 1025,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
} as const

// ── Cache TTL defaults (seconds) ──

export const CACHE_DEFAULTS = {
  MEMORY_MAX: 1000,
  MEMORY_TTL: 300,
  CDN_S_MAXAGE: 300,
  CDN_STALE_WHILE_REVALIDATE: 86400,
  GENERATION_LOCK_TIMEOUT: 120_000,
} as const

// ── Default reaction types ──

export const DEFAULT_REACTIONS = [
  { id: 'thumbs_up', emoji: '👍', label: '点赞', sortOrder: 1 },
  { id: 'smile', emoji: '😄', label: '笑脸', sortOrder: 2 },
  { id: 'tada', emoji: '🎉', label: '庆祝', sortOrder: 3 },
  { id: 'heart', emoji: '❤️', label: '喜欢', sortOrder: 4 },
  { id: 'rocket', emoji: '🚀', label: '火箭', sortOrder: 5 },
  { id: 'eyes', emoji: '👀', label: '注视', sortOrder: 6 },
] as const

// ── Provider default weights ──

export const DEFAULT_PROVIDER_WEIGHTS: Record<string, number> = {
  gemini: 10,
  openai: 20,
  claude: 30,
  qrok: 40,
  deepseek: 50,
  doubao: 60,
  hunyuan: 70,
  qwen: 90,
  glm: 100,
  minimax: 110,
  kimi: 120,
  ollama: 999,
}

// ── Default prompt templates ──

export const DEFAULT_PROMPTS = [
  {
    name: '中文通用评论',
    lang: 'zh',
    category: 'general',
    content: `你是一个博客评论者。请针对以下文章内容写一段简短的评论（50-150字）。
评论要求：
1. 语气自然，像真实读者
2. 指出文章亮点或补充观点
3. 用中文回复
4. 不要用"作为一名AI"等开头`,
  },
  {
    name: 'English General',
    lang: 'en',
    category: 'general',
    content: `You are a blog commenter. Write a brief comment (50-150 words) on the following article.
Guidelines:
1. Natural tone, like a real reader
2. Highlight key points or add perspective
3. Reply in English`,
  },
  {
    name: '日本語コメント',
    lang: 'ja',
    category: 'general',
    content: `あなたはブログのコメント投稿者です。以下の記事に対して簡潔なコメント（50〜150字）を書いてください。
ガイドライン：
1. 自然な口調で、実際の読者のように
2. 記事の要点を指摘するか、あなたの視点を追加する
3. 日本語で返信する`,
  },
  {
    name: '한국어 댓글',
    lang: 'ko',
    category: 'general',
    content: `당신은 블로그 댓글 작성자입니다. 다음 기사 내용에 대해 간단한 댓글(50~150자)을 작성해주세요.
가이드라인:
1. 실제 독자처럼 자연스러운 어조로
2. 기사의 핵심을 짚거나 관점을 추가
3. 한국어로 답변`,
  },
  {
    name: 'Commentaire en Français',
    lang: 'fr',
    category: 'general',
    content: `Vous êtes un commentateur de blog. Écrivez un bref commentaire (50-150 mots) sur l'article suivant.
Directives :
1. Ton naturel, comme un vrai lecteur
2. Soulignez les points clés ou ajoutez une perspective
3. Répondez en français`,
  },
  {
    name: 'Comentario en Español',
    lang: 'es',
    category: 'general',
    content: `Eres un comentarista de blog. Escribe un breve comentario (50-150 palabras) sobre el siguiente artículo.
Pautas:
1. Tono natural, como un lector real
2. Destaca los puntos clave o añade perspectiva
3. Responde en español`,
  },
  {
    name: 'Deutscher Kommentar',
    lang: 'de',
    category: 'general',
    content: `Du bist ein Blog-Kommentator. Schreibe einen kurzen Kommentar (50-150 Wörter) zum folgenden Artikel.
Richtlinien:
1. Natürlicher Ton, wie ein echter Leser
2. Hebe wichtige Punkte hervor oder füge eine Perspektive hinzu
3. Antworte auf Deutsch`,
  },
  {
    name: 'Comentário em Português',
    lang: 'pt',
    category: 'general',
    content: `Você é um comentarista de blog. Escreva um breve comentário (50-150 palavras) sobre o seguinte artigo.
Diretrizes:
1. Tom natural, como um leitor real
2. Destaque pontos-chave ou adicione perspectiva
3. Responda em português`,
  },
] as const
