import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';

// ============================================================================
// Constants
// ============================================================================

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENAI_DEFAULT_API_BASE = 'https://api.openai.com/v1';
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const FEED_FETCH_TIMEOUT_MS = 15_000;
const ARXIV_FEED_FETCH_TIMEOUT_MS = 120_000; // ArXiv feeds are much larger
const GEMINI_BATCH_SIZE = 10;
const MAX_CONCURRENT_GEMINI = 4;

// AI retry configuration
const AI_MAX_RETRIES = 5;
const AI_INITIAL_RETRY_DELAY_MS = 2000;
const AI_MAX_RETRY_DELAY_MS = 60000;

// ArXiv category mapping
const ARXIV_CATEGORIES = {
  'cs.AI': { name: 'Artificial Intelligence', emoji: '🤖', rssUrl: 'https://rss.arxiv.org/rss/cs.AI' },
  'cs.RO': { name: 'Robotics', emoji: '🦾', rssUrl: 'https://rss.arxiv.org/rss/cs.RO' },
  'cs.LG': { name: 'Machine Learning', emoji: '🧠', rssUrl: 'https://rss.arxiv.org/rss/cs.LG' },
  'cs.CL': { name: 'Computation and Language', emoji: '🗣️', rssUrl: 'https://rss.arxiv.org/rss/cs.CL' },
  'cs.CV': { name: 'Computer Vision', emoji: '👁️', rssUrl: 'https://rss.arxiv.org/rss/cs.CV' },
  'cs.NE': { name: 'Neural and Evolutionary', emoji: '🔮', rssUrl: 'https://rss.arxiv.org/rss/cs.NE' },
  'cs.HC': { name: 'Human-Computer Interaction', emoji: '👤', rssUrl: 'https://rss.arxiv.org/rss/cs.HC' },
  'cs.SY': { name: 'Systems and Control', emoji: '🎛️', rssUrl: 'https://rss.arxiv.org/rss/cs.SY' },
} as const;

type ArxivCategoryCode = keyof typeof ARXIV_CATEGORIES;

// ============================================================================
// Types
// ============================================================================

interface ArxivPaper {
  title: string;
  titleZh: string;
  link: string;
  arxivId: string;
  authors: string[];
  abstract: string;
  contributions: string[];
  summary: string;
  reason: string;
  keywords: string[];
  pubDate: Date;
  scores: {
    novelty: number;
    significance: number;
    clarity: number;
  };
  totalScore: number;
}

interface ParsedRSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  authors: string[];
}

interface ArxivScoringResult {
  results: Array<{
    index: number;
    novelty: number;
    significance: number;
    clarity: number;
    authors: string[];
    contributions: string[];
    keywords: string[];
  }>;
}

interface ArxivSummaryResult {
  results: Array<{
    index: number;
    titleZh: string;
    summary: string;
    reason: string;
  }>;
}

interface AIClient {
  call(prompt: string): Promise<string>;
}

interface FeedError {
  feedName: string;
  feedUrl: string;
  errorType: '404' | 'network' | 'timeout' | 'parse' | 'other';
  message: string;
}

interface TopicPaper {
  arxivId: string;
  title: string;
  titleZh: string;
  link: string;
  topic: 'VLA' | 'VLN' | 'WorldModel';
  scores: {
    novelty: number;
    significance: number;
    clarity: number;
    totalScore: number;
  };
}

// ============================================================================
// Utility Functions (reused from digest.ts)
// ============================================================================

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .trim();
}

function extractCDATA(text: string): string {
  const cdataMatch = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdataMatch ? cdataMatch[1] : text;
}

function getTagContent(xml: string, tagName: string): string {
  const patterns = [
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*/>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match?.[1]) {
      return extractCDATA(match[1]).trim();
    }
  }
  return '';
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  const rfc822 = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (rfc822) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function parseRSSItems(xml: string): Array<ParsedRSSItem> {
  const items: Array<ParsedRSSItem> = [];

  const isAtom = xml.includes('<feed') && (xml.includes('xmlns="http://www.w3.org/2005/Atom"') || xml.includes('<feed '));

  // Helper to extract authors from Atom format
  function extractAtomAuthors(entryXml: string): string[] {
    const authors: string[] = [];
    const authorPattern = /<author[\s>]([\s\S]*?)<\/author>/gi;
    let authorMatch;
    while ((authorMatch = authorPattern.exec(entryXml)) !== null) {
      const authorXml = authorMatch[1];
      const name = getTagContent(authorXml, 'name');
      if (name) {
        authors.push(name);
      }
    }
    return authors;
  }

  if (isAtom) {
    const entryPattern = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let entryMatch;
    while ((entryMatch = entryPattern.exec(xml)) !== null) {
      const entryXml = entryMatch[1];
      const title = stripHtml(getTagContent(entryXml, 'title'));
      let link = getTagContent(entryXml, 'link');
      if (!link) {
        const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']*)["'][^>]*>/i);
        link = linkMatch?.[1] || '';
      }
      const pubDate = getTagContent(entryXml, 'published') || getTagContent(entryXml, 'updated') || getTagContent(entryXml, 'date');
      const description = getTagContent(entryXml, 'summary') || getTagContent(entryXml, 'content') || '';
      const authors = extractAtomAuthors(entryXml);

      if (title && link) {
        items.push({ title, link, pubDate, description: stripHtml(description), authors });
      }
    }
  } else {
    const itemPattern = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(xml)) !== null) {
      const itemXml = itemMatch[1];
      const title = stripHtml(getTagContent(itemXml, 'title'));
      const link = getTagContent(itemXml, 'link');
      const pubDate = getTagContent(itemXml, 'pubDate') || getTagContent(itemXml, 'date') || getTagContent(itemXml, 'updated');
      const description = getTagContent(itemXml, 'description') || getTagContent(itemXml, 'summary') || getTagContent(itemXml, 'content') || '';

      if (title && link) {
        items.push({ title, link, pubDate, description: stripHtml(description), authors: [] });
      }
    }
  }

  return items;
}

// ============================================================================
// AI Provider Layer (reused from digest.ts)
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Timer {
  private startTime: number;
  private lastLap: number;

  constructor() {
    this.startTime = Date.now();
    this.lastLap = this.startTime;
  }

  elapsed(): number {
    return (Date.now() - this.startTime) / 1000 / 60;
  }

  lap(): number {
    const now = Date.now();
    const elapsed = (now - this.lastLap) / 1000 / 60;
    this.lastLap = now;
    return elapsed;
  }

  static format(minutes: number): string {
    if (minutes < 1) {
      return `${Math.round(minutes * 60)}s`;
    }
    return `${minutes.toFixed(2)}min`;
  }
}

function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    AI_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
    AI_MAX_RETRY_DELAY_MS
  );
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, exponentialDelay + jitter);
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') ||
           msg.includes('rate limit') ||
           msg.includes('too many requests') ||
           msg.includes('访问量过大') ||
           msg.includes('请稍后再试');
  }
  return false;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= AI_MAX_RETRIES) {
        break;
      }

      if (isRateLimitError(error)) {
        const delay = calculateRetryDelay(attempt);
        console.warn(`[arxiv-digest] ${context} hit rate limit (attempt ${attempt + 1}/${AI_MAX_RETRIES + 1}), retrying after ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  return retryWithBackoff(async () => {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.8,
          topK: 40,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }, 'Gemini API');
}

async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  apiBase: string,
  model: string
): Promise<string> {
  return retryWithBackoff(async () => {
    const normalizedBase = apiBase.replace(/\/+$/, '');
    const response = await fetch(`${normalizedBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        top_p: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(item => item.type === 'text' && typeof item.text === 'string')
        .map(item => item.text)
        .join('\n');
    }
    return '';
  }, `OpenAI-compatible API (${model})`);
}

function inferOpenAIModel(apiBase: string): string {
  const base = apiBase.toLowerCase();
  if (base.includes('deepseek')) return 'deepseek-chat';
  return OPENAI_DEFAULT_MODEL;
}

function createAIClient(config: {
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiApiBase?: string;
  openaiModel?: string;
}): AIClient {
  const state = {
    geminiApiKey: config.geminiApiKey?.trim() || '',
    openaiApiKey: config.openaiApiKey?.trim() || '',
    openaiApiBase: (config.openaiApiBase?.trim() || OPENAI_DEFAULT_API_BASE).replace(/\/+$/, ''),
    openaiModel: config.openaiModel?.trim() || '',
    geminiEnabled: Boolean(config.geminiApiKey?.trim()),
    fallbackLogged: false,
  };

  if (!state.openaiModel) {
    state.openaiModel = inferOpenAIModel(state.openaiApiBase);
  }

  return {
    async call(prompt: string): Promise<string> {
      if (state.geminiEnabled && state.geminiApiKey) {
        try {
          return await callGemini(prompt, state.geminiApiKey);
        } catch (error) {
          if (state.openaiApiKey) {
            if (!state.fallbackLogged) {
              const reason = error instanceof Error ? error.message : String(error);
              console.warn(`[arxiv-digest] Gemini failed, switching to OpenAI-compatible fallback (${state.openaiApiBase}, model=${state.openaiModel}). Reason: ${reason}`);
              state.fallbackLogged = true;
            }
            state.geminiEnabled = false;
            return callOpenAICompatible(prompt, state.openaiApiKey, state.openaiApiBase, state.openaiModel);
          }
          throw error;
        }
      }

      if (state.openaiApiKey) {
        return callOpenAICompatible(prompt, state.openaiApiKey, state.openaiApiBase, state.openaiModel);
      }

      throw new Error('No AI API key configured. Set GEMINI_API_KEY and/or OPENAI_API_KEY.');
    },
  };
}

function parseJsonResponse<T>(text: string): T {
  let jsonText = text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(jsonText) as T;
}

// ============================================================================
// ArXiv-specific Functions
// ============================================================================

function validateArxivCategory(code: string): ArxivCategoryCode {
  if (code in ARXIV_CATEGORIES) {
    return code as ArxivCategoryCode;
  }
  const validCategories = Object.keys(ARXIV_CATEGORIES).join(', ');
  throw new Error(`Invalid ArXiv category: "${code}". Valid categories: ${validCategories}`);
}

function extractArxivId(link: string): string {
  // Extract ArXiv ID from URL, e.g., https://arxiv.org/abs/2403.12345 -> 2403.12345
  const match = link.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/i);
  return match?.[1] || 'unknown';
}

async function fetchSingleArxivFeed(categoryCode: ArxivCategoryCode): Promise<{
  papers: Array<{ title: string; link: string; pubDate: Date; description: string; authors: string[] }>;
  error?: FeedError;
}> {
  const category = ARXIV_CATEGORIES[categoryCode];
  const arxivApiUrl = 'http://export.arxiv.org/api/query';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ARXIV_FEED_FETCH_TIMEOUT_MS);

    // ArXiv API query parameters
    // Get up to 2000 most recent papers for the category
    const params = new URLSearchParams({
      search_query: `cat:${categoryCode}`,
      start: '0',
      max_results: '2000',
      sortBy: 'submittedDate',
      sortOrder: 'descending'
    });

    const response = await fetch(`https://${arxivApiUrl.replace(/^https?:\/\//, '')}?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Daily-Digest/1.0 (ArXiv API Reader)',
        'Accept': 'application/xml, application/atom+xml',
      },
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      return {
        papers: [],
        error: {
          feedName: `ArXiv ${categoryCode}`,
          feedUrl: `${arxivApiUrl}?${params.toString()}`,
          errorType: '404',
          message: 'HTTP 404 - API endpoint not found'
        }
      };
    }

    if (!response.ok) {
      return {
        papers: [],
        error: {
          feedName: `ArXiv ${categoryCode}`,
          feedUrl: `${arxivApiUrl}?${params.toString()}`,
          errorType: 'other',
          message: `HTTP ${response.status} - ${response.statusText}`
        }
      };
    }

    const xml = await response.text();
    const items = parseRSSItems(xml);

    return {
      papers: items.map(item => ({
        title: item.title,
        link: item.link,
        pubDate: parseDate(item.pubDate) || new Date(0),
        description: item.description,
        authors: item.authors,
      }))
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    let errorType: FeedError['errorType'] = 'other';

    if (msg.includes('abort')) {
      errorType = 'timeout';
    } else if (msg.includes('fetch') || msg.includes('network')) {
      errorType = 'network';
    }

    return {
      papers: [],
      error: {
        feedName: `ArXiv ${categoryCode}`,
        feedUrl: arxivApiUrl,
        errorType,
        message: msg
      }
    };
  }
}

// ============================================================================
// Academic Scoring and Paper Detail Extraction
// ============================================================================

function buildAcademicScoringPrompt(
  papers: Array<{ index: number; title: string; description: string }>,
  categoryName: string
): string {
  const papersList = papers.map(p =>
    `Paper ${p.index}: ${p.title}\nAbstract: ${p.description.slice(0, 1000)}`
  ).join('\n\n---\n\n');

  return `你是一位专注于${categoryName}领域的学术研究员。请对以下ArXiv论文进行学术价值评估。

## 主题优先级

以下主题具有更高优先级，在评分时应给予更高分数：
- **VLA (Vision-Language-Action models)**: 视觉-语言-行动模型，多模态策略学习
- **VLN (Vision-Language Navigation)**: 视觉-语言导航，具身导航
- **World Model**: 世界模型、环境模型、动力学预测、视频预测

如果论文涉及以上主题，significance（重要性）评分应提高 1-2 分。

## 评分维度（1-10分，10分最高）

### 1. 新颖性
- 10: 提出全新方法、架构或理论突破，有重要创新点
- 8-9: 显著改进现有方法，或有明显创新
- 5-7: 常规改进或应用型工作
- 1-4: 缺乏创新或重复已有工作

### 2. 重要性
- 10: 可能产生重大影响，解决关键问题
- 8-9: 对领域有重要贡献
- 5-7: 有一定学术价值
- 1-4: 影响较小或应用场景有限

### 3. 可读性
- 10: 论文结构清晰，实验充分，结果可靠
- 8-9: 写作规范，方法描述清楚
- 5-7: 基本清楚但可能有瑕疵
- 1-4: 论文质量较差，难以理解

## 需要提取的信息

### 1. 作者列表 (authors)
从摘要或描述中提取作者姓名，返回字符串数组。

### 2. 核心贡献 (contributions)
提炼论文的3-5个核心贡献要点，每个要点用简短的中文描述。
- 关注：提出的新方法、新模型、新技术
- 关注：实验结果和性能提升
- 关注：解决的问题和实际应用价值

### 3. 关键词 (keywords)
提取3-5个最能代表论文主题的技术关键词（英文）。

## 待评分论文

${papersList}

请严格按JSON格式返回：
{
  "results": [
    {
      "index": 0,
      "novelty": 8,
      "significance": 7,
      "clarity": 9,
      "authors": ["Author Name 1", "Author Name 2"],
      "contributions": ["提出新的XXX方法", "在XXX数据集上达到SOTA", "开源了代码和模型"],
      "keywords": ["transformer", "attention", "NLP"]
    }
  ]
}`;
}

/**
 * 检测论文主题并应用加分
 * VLA, VLN, World Model 相关论文获得加分
 * @returns 加分后的分数和检测到的主题（如果有）
 */
function applyTopicBonus(
  scores: { novelty: number; significance: number; clarity: number },
  keywords: string[],
  title: string,
  abstract: string
): { scores: { novelty: number; significance: number; clarity: number }; topic: 'VLA' | 'VLN' | 'WorldModel' | null } {
  const topicKeywords: Record<string, string[]> = {
    vla: ['vision-language-action', 'vla', 'vision language action', 'multimodal policy', 'robotic foundation model', 'embodied ai'],
    vln: ['vision-language navigation', 'vln', 'embodied navigation', 'visual navigation', 'spatial reasoning', 'room-to-room'],
    worldModel: ['world model', 'world-model', 'environment model', 'dynamics prediction', 'video prediction', 'model-based rl', 'predictive model']
  };

  const text = (title + ' ' + abstract + ' ' + keywords.join(' ')).toLowerCase();

  // 检测主题匹配
  let detectedTopic: 'VLA' | 'VLN' | 'WorldModel' | null = null;
  for (const [topic, kwList] of Object.entries(topicKeywords)) {
    if (kwList.some(kw => text.includes(kw.toLowerCase()))) {
      detectedTopic = topic === 'vla' ? 'VLA' : topic === 'vln' ? 'VLN' : 'WorldModel';
      console.log(`[arxiv-digest] Topic bonus applied: ${detectedTopic} detected (+1 to significance)`);
      break; // 每个主题只加一次
    }
  }

  // 应用加分到 significance（最高不超过10）
  return {
    scores: {
      ...scores,
      significance: Math.min(10, scores.significance + (detectedTopic ? 1 : 0))
    },
    topic: detectedTopic
  };
}

async function scorePapersWithAI(
  papers: Array<{ title: string; link: string; pubDate: Date; description: string; authors: string[] }>,
  categoryName: string,
  aiClient: AIClient
): Promise<{
  scoredPapers: Array<{
    paper: typeof papers[0];
    arxivId: string;
    scores: { novelty: number; significance: number; clarity: number };
    authors: string[];
    contributions: string[];
    keywords: string[];
  }>;
  topicPapers: TopicPaper[];
}> {
  const allScores = new Map<number, {
    novelty: number;
    significance: number;
    clarity: number;
    authors: string[];
    contributions: string[];
    keywords: string[];
  }>();

  const indexed = papers.map((paper, index) => ({
    index,
    title: paper.title,
    description: paper.description,
  }));

  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }

  console.log(`[arxiv-digest] Scoring ${papers.length} papers in ${batches.length} batches`);

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildAcademicScoringPrompt(batch, categoryName);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<ArxivScoringResult>(responseText);

        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            const clamp = (v: number) => Math.min(10, Math.max(1, Math.round(v)));
            allScores.set(result.index, {
              novelty: clamp(result.novelty),
              significance: clamp(result.significance),
              clarity: clamp(result.clarity),
              authors: Array.isArray(result.authors) ? result.authors : [],
              contributions: Array.isArray(result.contributions) ? result.contributions.slice(0, 5) : [],
              keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 5) : [],
            });
          }
        }
      } catch (error) {
        console.warn(`[arxiv-digest] Scoring batch failed: ${error instanceof Error ? error.message : String(error)}`);
        for (const item of batch) {
          allScores.set(item.index, {
            novelty: 5,
            significance: 5,
            clarity: 5,
            authors: [],
            contributions: [],
            keywords: []
          });
        }
      }
    });

    await Promise.all(promises);
    console.log(`[arxiv-digest] Scoring progress: ${Math.min(i + MAX_CONCURRENT_GEMINI, batches.length)}/${batches.length} batches`);
  }

  const topicPapers: TopicPaper[] = [];

  const scoredPapers = papers.map((paper, index) => {
    const score = allScores.get(index) || {
      novelty: 5,
      significance: 5,
      clarity: 5,
      authors: [],
      contributions: [],
      keywords: []
    };

    // Apply topic bonus for VLA/VLN/World Model papers
    const { scores: scoresWithBonus, topic } = applyTopicBonus(
      {
        novelty: score.novelty,
        significance: score.significance,
        clarity: score.clarity,
      },
      score.keywords,
      paper.title,
      paper.description
    );

    // Collect topic papers
    if (topic) {
      topicPapers.push({
        arxivId: extractArxivId(paper.link),
        title: paper.title,
        titleZh: paper.title, // Will be updated later with AI translation
        link: paper.link,
        topic,
        scores: {
          novelty: scoresWithBonus.novelty,
          significance: scoresWithBonus.significance,
          clarity: scoresWithBonus.clarity,
          totalScore: scoresWithBonus.novelty + scoresWithBonus.significance + scoresWithBonus.clarity,
        }
      });
    }

    // Use AI-extracted authors, fallback to ArXiv API authors if AI didn't extract any
    const finalAuthors = (score.authors && score.authors.length > 0) ? score.authors : paper.authors;

    return {
      paper,
      arxivId: extractArxivId(paper.link),
      scores: scoresWithBonus,
      authors: finalAuthors,
      contributions: score.contributions,
      keywords: score.keywords,
    };
  });

  return { scoredPapers, topicPapers };
}

// ============================================================================
// Academic Summarization
// ============================================================================

function buildPaperSummaryPrompt(
  papers: Array<{ index: number; title: string; description: string; link: string; contributions: string[] }>,
  lang: 'zh' | 'en'
): string {
  const papersList = papers.map(p =>
    `Paper ${p.index}: ${p.title}\nURL: ${p.link}\nAbstract: ${p.description.slice(0, 1000)}\nContributions: ${p.contributions.join('; ')}`
  ).join('\n\n---\n\n');

  const langInstruction = lang === 'zh'
    ? '请用中文撰写摘要和推荐理由。'
    : 'Write summaries and reasons in English.';

  return `你是一位学术写作专家。请为以下ArXiv论文生成学术摘要。

请为每篇论文生成：

1. **中文标题** (titleZh): 将英文标题翻译成准确的学术中文。
2. **学术摘要** (summary): 5-7句话的详细学术摘要，包含：
   - 研究背景和问题（1句）
   - 核心方法和技术方案（2-3句）
   - 实验设置和结果（1-2句）
   - 结论和意义（1句）
3. **学术价值** (reason): 1句话说明该论文的学术贡献和阅读价值。

${langInstruction}

摘要要求：
- 使用学术化语言，包含技术细节和关键指标
- 保留重要的性能数据、模型名称、数据集名称
- 突出创新点和与现有工作的区别
- 目标：让读者花1分钟了解论文核心内容

## 待摘要论文

${papersList}

请严格按JSON格式返回：
{
  "results": [
    {
      "index": 0,
      "titleZh": "基于XXX的YYY方法研究",
      "summary": "本文针对XXX问题，提出了YYY方法。该方法通过...",
      "reason": "该论文首次提出了XXX概念，为解决YYY问题提供了新思路。"
    }
  ]
}`;
}

async function summarizePapers(
  scoredPapers: Array<{
    paper: { title: string; link: string; pubDate: Date; description: string; authors: string[] };
    arxivId: string;
    scores: { novelty: number; significance: number; clarity: number };
    authors: string[];
    contributions: string[];
    keywords: string[];
  }>,
  aiClient: AIClient,
  lang: 'zh' | 'en'
): Promise<Map<number, { titleZh: string; summary: string; reason: string }>> {
  const summaries = new Map<number, { titleZh: string; summary: string; reason: string }>();

  const indexed = scoredPapers.map((sp, i) => ({
    index: i,
    title: sp.paper.title,
    description: sp.paper.description,
    link: sp.paper.link,
    contributions: sp.contributions,
  }));

  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }

  console.log(`[arxiv-digest] Generating summaries for ${scoredPapers.length} papers in ${batches.length} batches`);

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildPaperSummaryPrompt(batch, lang);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<ArxivSummaryResult>(responseText);

        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            summaries.set(result.index, {
              titleZh: result.titleZh || '',
              summary: result.summary || '',
              reason: result.reason || '',
            });
          }
        }
      } catch (error) {
        console.warn(`[arxiv-digest] Summary batch failed: ${error instanceof Error ? error.message : String(error)}`);
        for (const item of batch) {
          summaries.set(item.index, {
            titleZh: item.title,
            summary: item.description.slice(0, 300),
            reason: ''
          });
        }
      }
    });

    await Promise.all(promises);
    console.log(`[arxiv-digest] Summary progress: ${Math.min(i + MAX_CONCURRENT_GEMINI, batches.length)}/${batches.length} batches`);
  }

  return summaries;
}

// ============================================================================
// Highlights Generation
// ============================================================================

async function generateHighlights(
  papers: ArxivPaper[],
  categoryName: string,
  aiClient: AIClient,
  lang: 'zh' | 'en'
): Promise<string> {
  const paperList = papers.slice(0, Math.min(10, papers.length)).map((p, i) =>
    `${i + 1}. ${p.titleZh || p.title} — ${p.summary.slice(0, 100)}`
  ).join('\n');

  const langNote = lang === 'zh' ? '用中文回答。' : 'Write in English.';

  const prompt = `根据以下${categoryName}领域的最新论文列表，写一段3-5句话的"今日研究热点"总结。
要求：
- 提炼出今天该领域的2-3个主要研究方向或热点话题
- 不要逐篇列举，要做宏观归纳
- 风格简洁有力，适合学术研究者阅读
${langNote}

论文列表：
${paperList}

直接返回纯文本总结，不要JSON，不要markdown格式。`;

  try {
    const text = await aiClient.call(prompt);
    return text.trim();
  } catch (error) {
    console.warn(`[arxiv-digest] Highlights generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

// ============================================================================
// Report Generation
// ============================================================================

function humanizeTime(pubDate: Date): string {
  const diffMs = Date.now() - pubDate.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return pubDate.toISOString().slice(0, 10);
}

function generateKeywordFrequencyChart(papers: ArxivPaper[]): string {
  const kwCount = new Map<string, number>();
  for (const p of papers) {
    for (const kw of p.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (sorted.length === 0) return '';

  const labels = sorted.map(([k]) => `"${k}"`).join(', ');
  const values = sorted.map(([, v]) => v).join(', ');
  const maxVal = sorted[0][1];

  let chart = '```mermaid\n';
  chart += `xychart-beta horizontal\n`;
  chart += `    title "关键词频率"\n`;
  chart += `    x-axis [${labels}]\n`;
  chart += `    y-axis "出现次数" 0 --> ${maxVal + 2}\n`;
  chart += `    bar [${values}]\n`;
  chart += '```\n';

  return chart;
}

function generateAsciiChart(papers: ArxivPaper[]): string {
  const kwCount = new Map<string, number>();
  for (const p of papers) {
    for (const kw of p.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  if (sorted.length === 0) return '';

  const maxVal = sorted[0][1];
  const maxBarWidth = 20;
  const maxLabelLen = Math.max(...sorted.map(([k]) => k.length));

  let chart = '```\n';
  for (const [label, value] of sorted) {
    const barLen = Math.max(1, Math.round((value / maxVal) * maxBarWidth));
    const bar = '█'.repeat(barLen) + '░'.repeat(maxBarWidth - barLen);
    chart += `${label.padEnd(maxLabelLen)} │ ${bar} ${value}\n`;
  }
  chart += '```\n';

  return chart;
}

function generateTagCloud(papers: ArxivPaper[]): string {
  const kwCount = new Map<string, number>();
  for (const p of papers) {
    for (const kw of p.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  if (sorted.length === 0) return '';

  return sorted
    .map(([word, count], i) => i < 4 ? `**${word}**(${count})` : `${word}(${count})`)
    .join(' · ');
}

function generateArxivDigestReport(
  papers: ArxivPaper[],
  categoryCode: ArxivCategoryCode,
  hours: number,
  lang: 'zh' | 'en',
  highlights: string,
  stats: {
    totalPapers: number;
    filteredPapers: number;
  },
  topicPapers: TopicPaper[] = []
): string {
  const category = ARXIV_CATEGORIES[categoryCode];
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1]?.slice(0, 5) || '';

  // Academic-style header
  let report = `# ArXiv ${category.name}论文日报 - ${dateStr}\n\n`;
  report += `> 扫描时间范围: ${hours}小时 | 精选 Top ${papers.length} 篇论文\n\n`;

  // Highlights section
  if (highlights) {
    report += `## 今日研究热点\n\n`;
    report += `${highlights}\n\n`;
    report += `---\n\n`;
  }

  // All Papers with unified numbering
  report += `## 精选论文\n\n`;

  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    const authorsDisplay = p.authors.length > 0
      ? p.authors.slice(0, 5).join(', ') + (p.authors.length > 5 ? ' 等' : '')
      : '作者信息未提供';

    report += `### ${i + 1}. ${p.titleZh || p.title}\n\n`;
    report += `**${p.title}**\n\n`;
    report += `📄 [arXiv:${p.arxivId}](${p.link}) · 👤 ${authorsDisplay} · 🕐 ${humanizeTime(p.pubDate)}\n\n`;

    if (p.contributions.length > 0) {
      report += `> 核心贡献\n`;
      for (const c of p.contributions) {
        report += `> - ${c}\n`;
      }
      report += `\n`;
    }

    report += `${p.summary}\n\n`;

    if (p.reason) {
      report += `💡 **学术价值**: ${p.reason}\n\n`;
    }

    if (p.keywords.length > 0) {
      report += `🏷️ ${p.keywords.join(', ')}\n\n`;
    }

    report += `---\n\n`;
  }

  // Data Overview at the end
  report += `## 数据概览\n\n`;

  report += `| 抓取论文 | 时间范围内 | 精选 |\n`;
  report += `|:---:|:---:|:---:|\n`;
  report += `| ${stats.totalPapers} 篇 → ${stats.filteredPapers} 篇 | ${hours}h | **${papers.length} 篇** |\n\n`;

  const keywordChart = generateKeywordFrequencyChart(papers);
  if (keywordChart) {
    report += `### 关键词频率\n\n${keywordChart}\n`;
  }

  const asciiChart = generateAsciiChart(papers);
  if (asciiChart) {
    report += `<details>\n<summary>📈 纯文本关键词图（终端友好）</summary>\n\n${asciiChart}\n</details>\n\n`;
  }

  const tagCloud = generateTagCloud(papers);
  if (tagCloud) {
    report += `### 🏷️ 话题标签\n\n${tagCloud}\n\n`;
  }

  // Topic Papers Appendix
  if (topicPapers.length > 0) {
    report += `---\n\n`;
    report += `## 附录：重点主题论文 (VLA/VLN/World Model)\n\n`;

    // Group by topic
    const byTopic = new Map<'VLA' | 'VLN' | 'WorldModel', TopicPaper[]>();
    byTopic.set('VLA', []);
    byTopic.set('VLN', []);
    byTopic.set('WorldModel', []);

    for (const tp of topicPapers) {
      byTopic.get(tp.topic)?.push(tp);
    }

    // Display each topic group
    for (const [topic, papers] of byTopic.entries()) {
      if (papers.length === 0) continue;

      const topicNames: Record<typeof topic, string> = {
        'VLA': 'Vision-Language-Action (VLA) 模型',
        'VLN': 'Vision-Language Navigation (VLN)',
        'WorldModel': 'World Model (世界模型)'
      };

      report += `### ${topicNames[topic]} (${papers.length}篇)\n\n`;

      // Sort by total score
      const sorted = [...papers].sort((a, b) => b.scores.totalScore - a.scores.totalScore);

      for (const tp of sorted) {
        report += `#### ${tp.titleZh}\n\n`;
        report += `**${tp.title}**\n\n`;
        report += `📄 [arXiv:${tp.arxivId}](${tp.link})\n\n`;
        report += `| 评分 | 分值 |\n`;
        report += `|:---|---:|\n`;
        report += `| 新颖性 | ${tp.scores.novelty}/10 |\n`;
        report += `| 重要性 | ${tp.scores.significance}/10 |\n`;
        report += `| 可读性 | ${tp.scores.clarity}/10 |\n`;
        report += `| **总分** | **${tp.scores.totalScore}/30** |\n\n`;
      }
    }
  }

  // Footer
  report += `---\n\n`;
  report += `*生成于 ${dateStr} ${timeStr} | 基于 [ArXiv API](http://export.arxiv.org/api/query)*\n`;
  report += `*由「懂点儿AI」制作，欢迎关注同名微信公众号获取更多 AI 实用技巧*\n`;

  return report;
}

// ============================================================================
// CLI
// ============================================================================

function printUsage(): never {
  console.log(`ArXiv Academic Digest - AI-powered ArXiv paper digest

Usage:
  bun scripts/arxiv-digest.ts [options]

Options:
  --category <code>  (Required) ArXiv category code
  --hours <n>        Time range in hours (default: 24)
  --top-n <n>        Number of top papers to include (default: 10)
  --lang <zh|en>     Summary language (default: zh)
  --output <path>    Output file path (default: ./arxiv-digest-<CATEGORY>-<DATE>.md)
  --help             Show this help

Environment:
  GEMINI_API_KEY     Recommended primary key. Get one at https://aistudio.google.com/apikey
  OPENAI_API_KEY     Optional fallback key for OpenAI-compatible APIs
  OPENAI_API_BASE    Optional fallback base URL (default: https://api.openai.com/v1)
  OPENAI_MODEL       Optional fallback model (default: deepseek-chat for DeepSeek base)

ArXiv Categories:
  cs.AI   - Artificial Intelligence (🤖)
  cs.RO   - Robotics (🦾)
  cs.LG   - Machine Learning (🧠)
  cs.CL   - Computation and Language (🗣️)
  cs.CV   - Computer Vision (👁️)
  cs.NE   - Neural and Evolutionary (🔮)
  cs.HC   - Human-Computer Interaction (👤)
  cs.SY   - Systems and Control (🎛️)

Examples:
  bun scripts/arxiv-digest.ts --category cs.AI --hours 24 --top-n 10 --lang zh
  bun scripts/arxiv-digest.ts --category cs.RO --hours 48 --top-n 15 --output ./my-arxiv-digest.md
`);
  process.exit(0);
  throw new Error('process.exit failed');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  let categoryCode: ArxivCategoryCode | null = null;
  let hours = 24;
  let topN = 10;
  let lang: 'zh' | 'en' = 'zh';
  let outputPath = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--category' && args[i + 1]) {
      try {
        categoryCode = validateArxivCategory(args[++i]!);
      } catch (error) {
        console.error(`[arxiv-digest] Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    } else if (arg === '--hours' && args[i + 1]) {
      hours = parseInt(args[++i]!, 10);
    } else if (arg === '--top-n' && args[i + 1]) {
      topN = parseInt(args[++i]!, 10);
    } else if (arg === '--lang' && args[i + 1]) {
      lang = args[++i] as 'zh' | 'en';
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i]!;
    }
  }

  if (!categoryCode) {
    console.error('[arxiv-digest] Error: --category parameter is required.');
    console.error('[arxiv-digest] Valid categories: cs.AI, cs.RO, cs.LG, cs.CL, cs.CV, cs.NE, cs.HC, cs.SY');
    process.exit(1);
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openaiApiBase = process.env.OPENAI_API_BASE;
  const openaiModel = process.env.OPENAI_MODEL;

  if (!geminiApiKey && !openaiApiKey) {
    console.error('[arxiv-digest] Error: Missing API key. Set GEMINI_API_KEY and/or OPENAI_API_KEY.');
    console.error('[arxiv-digest] Gemini key: https://aistudio.google.com/apikey');
    process.exit(1);
  }

  const aiClient = createAIClient({
    geminiApiKey,
    openaiApiKey,
    openaiApiBase,
    openaiModel,
  });

  const category = ARXIV_CATEGORIES[categoryCode];

  if (!outputPath) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    outputPath = `./arxiv-digest-${categoryCode}-${dateStr}.md`;
  }

  console.log(`[arxiv-digest] === ArXiv Academic Digest ===`);
  console.log(`[arxiv-digest] Category: ${categoryCode} (${category.name})`);
  console.log(`[arxiv-digest] Time range: ${hours} hours`);
  console.log(`[arxiv-digest] Top N: ${topN}`);
  console.log(`[arxiv-digest] Language: ${lang}`);
  console.log(`[arxiv-digest] Output: ${outputPath}`);
  console.log(`[arxiv-digest] AI provider: ${geminiApiKey ? 'Gemini (primary)' : 'OpenAI-compatible (primary)'}`);
  if (openaiApiKey) {
    const resolvedBase = (openaiApiBase?.trim() || OPENAI_DEFAULT_API_BASE).replace(/\/+$/, '');
    const resolvedModel = openaiModel?.trim() || inferOpenAIModel(resolvedBase);
    console.log(`[arxiv-digest] Fallback: ${resolvedBase} (model=${resolvedModel})`);
  }
  console.log('');

  const timer = new Timer();

  // Step 1: Fetch ArXiv feed
  console.log(`[arxiv-digest] Step 1/5: Fetching ArXiv ${categoryCode} feed...`);
  const { papers: allPapers, error } = await fetchSingleArxivFeed(categoryCode);
  console.log(`[arxiv-digest] ✓ Step 1 completed in ${Timer.format(timer.lap())}`);

  if (error) {
    console.error(`[arxiv-digest] Error fetching feed: ${error.message}`);
    process.exit(1);
  }

  if (allPapers.length === 0) {
    console.error('[arxiv-digest] Error: No papers fetched from ArXiv feed.');
    process.exit(1);
  }

  // Log fetch statistics
  const oldestPaper = allPapers[allPapers.length - 1];
  const newestPaper = allPapers[0];
  console.log(`[arxiv-digest] Fetched ${allPapers.length} papers from ArXiv API`);
  console.log(`[arxiv-digest] Time range: ${oldestPaper.pubDate.toISOString().slice(0, 10)} to ${newestPaper.pubDate.toISOString().slice(0, 10)}`);

  // Step 2: Filter by time range
  console.log(`[arxiv-digest] Step 2/5: Filtering by time range (${hours} hours)...`);
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentPapers = allPapers.filter(p => p.pubDate.getTime() > cutoffTime.getTime());

  console.log(`[arxiv-digest] Found ${recentPapers.length} papers within last ${hours} hours`);
  console.log(`[arxiv-digest] ✓ Step 2 completed in ${Timer.format(timer.lap())}`);

  if (recentPapers.length === 0) {
    console.error(`[arxiv-digest] Error: No papers found within the last ${hours} hours.`);
    console.error(`[arxiv-digest] Try increasing --hours (e.g., --hours 72 for three days)`);
    process.exit(1);
  }

  // Step 3: Score papers
  console.log(`[arxiv-digest] Step 3/5: AI scoring ${recentPapers.length} papers...`);
  const { scoredPapers, topicPapers } = await scorePapersWithAI(recentPapers, category.name, aiClient);
  console.log(`[arxiv-digest] ✓ Step 3 completed in ${Timer.format(timer.lap())}`);
  console.log(`[arxiv-digest] Found ${topicPapers.length} topic-related papers (VLA/VLN/WorldModel)`);

  // Sort by total score and select top N
  const sortedPapers = scoredPapers
    .sort((a, b) => {
      const scoreA = a.scores.novelty + a.scores.significance + a.scores.clarity;
      const scoreB = b.scores.novelty + b.scores.significance + b.scores.clarity;
      return scoreB - scoreA;
    })
    .slice(0, topN);

  // Step 4: Generate summaries
  console.log(`[arxiv-digest] Step 4/5: Generating AI summaries...`);
  const summaries = await summarizePapers(sortedPapers, aiClient, lang);
  console.log(`[arxiv-digest] ✓ Step 4 completed in ${Timer.format(timer.lap())}`);

  // Build final paper objects
  const finalPapers: ArxivPaper[] = sortedPapers.map((sp, i) => {
    const sm = summaries.get(i) || {
      titleZh: sp.paper.title,
      summary: sp.paper.description.slice(0, 300),
      reason: ''
    };

    const totalScore = sp.scores.novelty + sp.scores.significance + sp.scores.clarity;

    return {
      title: sp.paper.title,
      titleZh: sm.titleZh,
      link: sp.paper.link,
      arxivId: sp.arxivId,
      authors: sp.authors,
      abstract: sp.paper.description,
      contributions: sp.contributions,
      summary: sm.summary,
      reason: sm.reason,
      keywords: sp.keywords,
      pubDate: sp.paper.pubDate,
      scores: sp.scores,
      totalScore,
    };
  });

  // Update topic papers with Chinese titles from final papers
  const finalTopicPapers = topicPapers.map(tp => {
    const matchingPaper = finalPapers.find(fp => fp.arxivId === tp.arxivId);
    return {
      ...tp,
      titleZh: matchingPaper?.titleZh || tp.title
    };
  });

  // Step 5: Generate highlights
  console.log(`[arxiv-digest] Step 5/5: Generating research highlights...`);
  const highlights = await generateHighlights(finalPapers, category.name, aiClient, lang);
  console.log(`[arxiv-digest] ✓ Step 5 completed in ${Timer.format(timer.lap())}`);

  // Generate report
  const report = generateArxivDigestReport(finalPapers, categoryCode, hours, lang, highlights, {
    totalPapers: allPapers.length,
    filteredPapers: recentPapers.length,
  }, finalTopicPapers);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report);

  console.log('');
  console.log(`[arxiv-digest] ✅ Done!`);
  console.log(`[arxiv-digest] 📁 Report: ${outputPath}`);
  console.log(`[arxiv-digest] 📊 Stats: ${allPapers.length} papers → ${recentPapers.length} recent → ${finalPapers.length} selected`);
  console.log(`[arxiv-digest] ⏱ Total time: ${Timer.format(timer.elapsed())}`);

  if (finalPapers.length > 0) {
    console.log('');
    console.log(`[arxiv-digest] 🏆 Top 3 Preview:`);
    for (let i = 0; i < Math.min(3, finalPapers.length); i++) {
      const p = finalPapers[i];
      const avgScore = ((p.scores.novelty + p.scores.significance + p.scores.clarity) / 3).toFixed(1);
      console.log(`  ${i + 1}. ${p.titleZh || p.title} (${avgScore}/10)`);
      console.log(`     ${p.summary.slice(0, 80)}...`);
    }
  }
}

await main().catch((err) => {
  console.error(`[arxiv-digest] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
