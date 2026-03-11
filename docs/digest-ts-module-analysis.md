# `scripts/digest.ts` 模块分析

> 本文档详细分析 AI Daily Digest 项目的核心代码模块
>
> 代码文件: `scripts/digest.ts` (1262 行 TypeScript)
>

## 目录

- [1. 常量定义层](#1-常量定义层-lines-8-16)
- [2. RSS Feed 数据源](#2-rss-feed-数据源-lines-17-165)
- [3. 类型系统](#3-类型系统-lines-167-234)
- [4. XML解析引擎](#4-xml解析引擎-lines-240-355)
- [5. Feed获取层](#5-feed获取层-lines-357-427)
- [6. AI提供商抽象](#6-ai提供商抽象-lines-429-556)
- [7. AI评分引擎](#7-ai评分引擎-lines-568-692)
- [8. AI摘要生成](#8-ai摘要生成-lines-694-797)
- [9. 趋势分析](#9-趋势分析-lines-799-833)
- [10. 可视化模块](#10-可视化模块-lines-835-951)
- [11. 报告生成器](#11-报告生成器-lines-953-1064)
- [12. CLI入口](#12-cli入口-lines-1066-1261)
- [数据流总结](#数据流总结)
- [设计亮点](#设计亮点)

---

## 1. 常量定义层 (Lines 8-16)

```typescript
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENAI_DEFAULT_API_BASE = 'https://api.openai.com/v1';
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const FEED_FETCH_TIMEOUT_MS = 15_000;
const FEED_CONCURRENCY = 10;
const GEMINI_BATCH_SIZE = 15;
const MAX_CONCURRENT_GEMINI = 4;
```

### 功能
定义全局配置常量，控制API端点、超时、并发和批处理参数。

### 设计要点
- **超时控制**: 15秒防止RSS feed请求挂起
- **并发控制**: 10个feed并行获取，4个AI批次并行处理
- **批处理**: 15篇文章/AI请求，平衡处理速度与AI上下文窗口限制
- **API灵活性**: 支持Gemini主用 + OpenAI兼容API备用

---

## 2. RSS Feed 数据源 (Lines 17-165)

### 数据结构
98个RSS源，分为7个类别：

```typescript
type FeedCategory = 'blog' | 'arxiv' | 'ai-lab' | 'conference' | 'research' | 'ai-media' | 'robotics';
```

### 分类策略

| 类别 | 数量 | 说明 | 示例 |
|------|------|------|------|
| **blog** | 90 | Karpathy精选技术博客 | simonwillison.net, daringfireball.net |
| **arxiv** | 8 | ArXiv预印本 | cs.AI, cs.RO, cs.LG, cs.CV, cs.CL |
| **ai-lab** | 10 | 顶级AI实验室 | DeepMind, OpenAI, Anthropic, Meta AI |
| **research** | 10 | 学术研究机构 | BAIR Berkeley, MIT CSAIL, Stanford SAIL |
| **ai-media** | 8 | AI专业媒体 | The Gradient, Distill.pub, VentureBeat AI |
| **robotics** | 4 | 机器人专业媒体 | The Robot Report, Robohub |

### Feed接口定义
```typescript
interface RssFeed {
  name: string;      // 显示名称
  xmlUrl: string;    // RSS feed地址
  htmlUrl: string;   // 网站首页
  category?: FeedCategory;  // 可选分类标签
}
```

---

## 3. 类型系统 (Lines 167-234)

### 核心类型

```typescript
// 文章分类ID（6大类）
type CategoryId = 'ai-ml' | 'security' | 'engineering' | 'tools' | 'opinion' | 'other';

// 分类元数据（emoji + 标签）
const CATEGORY_META: Record<CategoryId, { emoji: string; label: string }> = {
  'ai-ml':       { emoji: '🤖', label: 'AI / ML' },
  'security':    { emoji: '🔒', label: '安全' },
  'engineering': { emoji: '⚙️', label: '工程' },
  'tools':       { emoji: '🛠', label: '工具 / 开源' },
  'opinion':     { emoji: '💡', label: '观点 / 杂谈' },
  'other':       { emoji: '📝', label: '其他' },
};
```

### 数据模型

```typescript
// 原始文章结构
interface Article {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

// AI评分后的文章结构
interface ScoredArticle extends Article {
  score: number;              // 总分 (relevance + quality + timeliness)
  scoreBreakdown: {
    relevance: number;        // 相关性分 (1-10)
    quality: number;          // 质量分 (1-10)
    timeliness: number;       // 时效性分 (1-10)
  };
  category: CategoryId;       // 分类标签
  keywords: string[];         // 关键词列表 (2-4个)
  titleZh: string;           // 中文标题
  summary: string;           // 摘要
  reason: string;            // 推荐理由
}
```

### AI响应接口

```typescript
// 评分响应
interface GeminiScoringResult {
  results: Array<{
    index: number;
    relevance: number;
    quality: number;
    timeliness: number;
    category: string;
    keywords: string[];
  }>;
}

// 摘要响应
interface GeminiSummaryResult {
  results: Array<{
    index: number;
    titleZh: string;
    summary: string;
    reason: string;
  }>;
}
```

### 设计特点
- **类型安全**: TypeScript严格类型检查
- **继承关系**: Article → ScoredArticle 渐进式增强
- **AI接口**: 明确的请求/响应结构，便于调试

---

## 4. XML解析引擎 (Lines 240-355)

### 核心功能
无依赖的RSS/Atom解析，支持两种主流格式。

### 格式检测

```typescript
function parseRSSItems(xml: string): Array<{...}> {
  const isAtom = xml.includes('<feed') &&
                 xml.includes('xmlns="http://www.w3.org/2005/Atom"');

  if (isAtom) {
    // Atom格式解析: <entry>
  } else {
    // RSS格式解析: <item>
  }
}
```

### 辅助函数

#### HTML清理
```typescript
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')           // 移除标签
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .trim();
}
```

#### CDATA提取
```typescript
function extractCDATA(text: string): string {
  const cdataMatch = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return cdataMatch ? cdataMatch[1] : text;
}
```

#### 标签内容提取
```typescript
function getTagContent(xml: string, tagName: string): string {
  const patterns = [
    new RegExp(`<${tagName}[^>]*>([\s\S]*?)</${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*/>`, 'i'),  // 自闭合标签
  ];

  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match?.[1]) {
      return extractCDATA(match[1]).trim();
    }
  }
  return '';
}
```

#### 属性值提取
```typescript
function getAttrValue(xml: string, tagName: string, attrName: string): string {
  const pattern = new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']*)["'][^>]*/?>`, 'i');
  const match = xml.match(pattern);
  return match?.[1] || '';
}
```

### 支持的RSS格式

#### RSS 2.0 示例
```xml
<item>
  <title>文章标题</title>
  <link>https://example.com/article</link>
  <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
  <description><![CDATA[文章描述...]]></description>
</item>
```

#### Atom 1.0 示例
```xml
<entry>
  <title>文章标题</title>
  <link href="https://example.com/article" rel="alternate"/>
  <published>2024-01-01T00:00:00Z</published>
  <content type="html"><![CDATA[文章内容...]]></content>
</entry>
```

### 容错机制
- 多种日期格式解析 (RFC 822, ISO 8601)
- 缺失字段的默认值处理
- `guid` 作为 `link` 的后备
- `content:encoded` 作为 `description` 的后备

---

## 5. Feed获取层 (Lines 357-427)

### 单个Feed获取

```typescript
async function fetchFeed(feed): Promise<Article[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(feed.xmlUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Daily-Digest/1.0 (RSS Reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });

    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const items = parseRSSItems(xml);

    return items.map(item => ({
      title: item.title,
      link: item.link,
      pubDate: parseDate(item.pubDate) || new Date(0),
      description: item.description,
      sourceName: feed.name,
      sourceUrl: feed.htmlUrl,
    }));
  } catch (error) {
    // 静默失败，只记录警告
    if (!msg.includes('abort')) {
      console.warn(`[digest] ✗ ${feed.name}: ${msg}`);
    }
    return [];
  }
}
```

### 批量并发获取

```typescript
async function fetchAllFeeds(feeds): Promise<Article[]> {
  const allArticles: Article[] = [];
  let successCount = 0;
  let failCount = 0;

  // 分批并发，每批10个feed
  for (let i = 0; i < feeds.length; i += FEED_CONCURRENCY) {
    const batch = feeds.slice(i, i + FEED_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchFeed));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allArticles.push(...result.value);
        successCount++;
      } else {
        failCount++;
      }
    }

    const progress = Math.min(i + FEED_CONCURRENCY, feeds.length);
    console.log(`[digest] Progress: ${progress}/${feeds.length} feeds processed (${successCount} ok, ${failCount} failed)`);
  }

  return allArticles;
}
```

### 容错机制
- **超时控制**: AbortController 15秒超时
- **并发限制**: 每批10个，避免过载
- **Promise.allSettled**: 单个失败不影响整体
- **静默失败**: 只记录警告，不中断执行

---

## 6. AI提供商抽象 (Lines 429-556)

### 统一接口

```typescript
interface AIClient {
  call(prompt: string): Promise<string>;
}
```

### Gemini实现

```typescript
async function callGemini(prompt: string, apiKey: string): Promise<string> {
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

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
```

### OpenAI兼容实现

```typescript
async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  apiBase: string,
  model: string
): Promise<string> {
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

  // 支持字符串和数组两种content格式
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  }
  return '';
}
```

### 模型推断

```typescript
function inferOpenAIModel(apiBase: string): string {
  const base = apiBase.toLowerCase();
  if (base.includes('deepseek')) return 'deepseek-chat';
  return OPENAI_DEFAULT_MODEL;  // gpt-4o-mini
}
```

### 客户端工厂（带自动降级）

```typescript
function createAIClient(config): AIClient {
  const state = {
    geminiEnabled: Boolean(config.geminiApiKey?.trim()),
    fallbackLogged: false,
  };

  return {
    async call(prompt: string): Promise<string> {
      // 优先尝试Gemini
      if (state.geminiEnabled && state.geminiApiKey) {
        try {
          return await callGemini(prompt, state.geminiApiKey);
        } catch (error) {
          // 失败后降级到OpenAI兼容API
          if (state.openaiApiKey) {
            if (!state.fallbackLogged) {
              console.warn(`[digest] Gemini failed, switching to OpenAI-compatible fallback`);
              state.fallbackLogged = true;
            }
            state.geminiEnabled = false;
            return callOpenAICompatible(prompt, state.openaiApiKey, state.openaiApiBase, state.openaiModel);
          }
          throw error;
        }
      }

      // 直接使用OpenAI兼容API
      if (state.openaiApiKey) {
        return callOpenAICompatible(prompt, state.openaiApiKey, state.openaiApiBase, state.openaiModel);
      }

      throw new Error('No AI API key configured.');
    },
  };
}
```

### 设计亮点
- **统一接口**: Gemini和OpenAI兼容API共用同一接口
- **自动降级**: Gemini失败自动切换到备用API
- **智能推断**: 根据API base URL自动推断模型名
- **格式兼容**: 支持多种content格式（字符串/数组）

---

## 7. AI评分引擎 (Lines 568-692)

### 评分提示词构建

```typescript
function buildScoringPrompt(articles): string {
  return `你是一个专注于AI前沿技术的策展人，正在为一份面向AI研究者和从业者的每日摘要筛选文章。

**特别关注领域：** AI模型（LLM、多模态模型、Agentic AI、智能体）、具身智能（机器人操作、自主导航、VLA模型、世界模型）、模型本质研究。

请对以下文章进行三个维度的评分（1-10 整数，10 分最高），并为每篇文章分配一个分类标签和提取 2-4 个关键词。

## 评分维度

### 1. 相关性 (relevance) - 对AI/技术从业者的价值
**⭐ AI模型与具身智能内容加权：**
- **10: AI模型突破（LLM架构、多模态、Agent系统、VLA模型、世界模型）、具身智能（机器人操作控制、导航SLAM、仿真训练）、Agentic AI**
- 9: AI/ML前沿研究、深度学习技术、机器人系统
- 7-8: 机器学习应用、计算机视觉、NLP技术
- 5-6: 对特定技术领域有价值
- 1-4: 与AI/技术行业关联不大

### 2. 质量 (quality) - 文章本身的深度和写作质量
- 10: 深度分析，原创洞见，引用丰富（论文+实验+benchmark）
- 7-9: 有深度，观点独到，技术细节充分
- 4-6: 信息准确，表达清晰
- 1-3: 浅尝辄止或纯转述

### 3. 时效性 (timeliness) - 当前是否值得阅读
- 10: 正在发生的重大事件/刚发布的重要工具/最新论文
- 7-9: 近期热点相关
- 4-6: 常青内容，不过时
- 1-3: 过时或无时效价值

## 分类标签（必须从以下选一个）
- ai-ml: AI模型、LLM、多模态、Agentic AI、具身智能、机器学习
- security: 安全、隐私、漏洞、加密相关
- engineering: 软件工程、架构、编程语言、系统设计
- tools: 开发工具、开源项目、新发布的库/框架
- opinion: 行业观点、个人思考、职业发展、文化评论
- other: 以上都不太适合的

## 关键词提取
提取 2-4 个最能代表文章主题的关键词（用英文，简短）。
**优先关键词：** LLM, multimodal, VLA, world-model, robotics, manipulation, navigation, SLAM, agent, transformer, diffusion, RL, foundation-model

请严格按 JSON 格式返回...`;
}
```

### 批量评分

```typescript
async function scoreArticlesWithAI(articles, aiClient): Promise<Map> {
  const allScores = new Map();

  // 构建带索引的文章列表
  const indexed = articles.map((article, index) => ({
    index,
    title: article.title,
    description: article.description,
    sourceName: article.sourceName,
  }));

  // 分批处理，每批15篇
  const batches = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }

  // 并发处理批次，每次4批
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildScoringPrompt(batch);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<GeminiScoringResult>(responseText);

        // 解析结果并存储到Map
        for (const result of parsed.results) {
          const clamp = (v: number) => Math.min(10, Math.max(1, Math.round(v)));
          const cat = validCategories.has(result.category) ? result.category : 'other';
          allScores.set(result.index, {
            relevance: clamp(result.relevance),
            quality: clamp(result.quality),
            timeliness: clamp(result.timeliness),
            category: cat,
            keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 4) : [],
          });
        }
      } catch (error) {
        // 失败时赋予默认分数
        for (const item of batch) {
          allScores.set(item.index, {
            relevance: 5, quality: 5, timeliness: 5,
            category: 'other', keywords: []
          });
        }
      }
    });

    await Promise.all(promises);
    console.log(`[digest] Scoring progress: ${Math.min(i + MAX_CONCURRENT_GEMINI, batches.length)}/${batches.length} batches`);
  }

  return allScores;
}
```

### 批处理策略

| 参数 | 值 | 说明 |
|------|------|------|
| `GEMINI_BATCH_SIZE` | 15 | 每批处理文章数 |
| `MAX_CONCURRENT_GEMINI` | 4 | 并发批次数 |
| 总并发 | 60 | 同时最多60篇文章在处理 |

### 容错机制
- **默认分数**: 失败时赋予 5/5/5 的中等分数
- **类别验证**: 只接受预定义的6个类别
- **分数限制**: 强制1-10范围
- **关键词限制**: 最多4个

---

## 8. AI摘要生成 (Lines 694-797)

### 摘要提示词构建

```typescript
function buildSummaryPrompt(articles, lang): string {
  const langInstruction = lang === 'zh'
    ? '请用中文撰写摘要和推荐理由。如果原文是英文，请翻译为中文。标题翻译也用中文。'
    : 'Write summaries, reasons, and title translations in English.';

  return `你是一个技术内容摘要专家。请为以下文章完成三件事：

1. **中文标题** (titleZh): 将英文标题翻译成自然的中文。如果原标题已经是中文则保持不变。
2. **摘要** (summary): 4-6 句话的结构化摘要，让读者不点进原文也能了解核心内容。包含：
   - 文章讨论的核心问题或主题（1 句）
   - 关键论点、技术方案或发现（2-3 句）
   - 结论或作者的核心观点（1 句）
3. **推荐理由** (reason): 1 句话说明"为什么值得读"，区别于摘要（摘要说"是什么"，推荐理由说"为什么"）。

${langInstruction}

摘要要求：
- 直接说重点，不要用"本文讨论了..."、"这篇文章介绍了..."这种开头
- 包含具体的技术名词、数据、方案名称或观点
- 保留关键数字和指标（如性能提升百分比、用户数、版本号等）
- 如果文章涉及对比或选型，要点出比较对象和结论
- 目标：读者花 30 秒读完摘要，就能决定是否值得花 10 分钟读原文

请严格按 JSON 格式返回...`;
}
```

### 批量摘要

```typescript
async function summarizeArticles(articles, aiClient, lang): Promise<Map> {
  const summaries = new Map();

  const indexed = articles.map(a => ({
    index: a.index,
    title: a.title,
    description: a.description,
    sourceName: a.sourceName,
    link: a.link,
  }));

  // 分批处理
  const batches = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }

  // 并发处理
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildSummaryPrompt(batch, lang);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<GeminiSummaryResult>(responseText);

        for (const result of parsed.results) {
          summaries.set(result.index, {
            titleZh: result.titleZh || '',
            summary: result.summary || '',
            reason: result.reason || '',
          });
        }
      } catch (error) {
        // 失败时使用原文作为后备
        for (const item of batch) {
          summaries.set(item.index, {
            titleZh: item.title,
            summary: item.title,
            reason: ''
          });
        }
      }
    });

    await Promise.all(promises);
  }

  return summaries;
}
```

### 摘要结构

```
1. titleZh (中文标题)
   └─ 英文标题 → 自然中文翻译

2. summary (4-6句结构化摘要)
   ├─ 第1句: 核心问题/主题
   ├─ 第2-3句: 关键论点/技术方案
   └─ 第4句: 结论/核心观点

3. reason (1句话推荐理由)
   └─ "为什么值得读"（区别于摘要）
```

### 语言支持
- **zh**: 中文输出（默认）
- **en**: 英文输出

### 容错机制
- 失败时使用原文标题作为 `titleZh` 和 `summary`
- 空字符串作为 `reason` 的后备

---

## 9. 趋势分析 (Lines 799-833)

### 今日看点生成

```typescript
async function generateHighlights(articles, aiClient, lang): Promise<string> {
  const articleList = articles.slice(0, 10).map((a, i) =>
    `${i + 1}. [${a.category}] ${a.titleZh || a.title} — ${a.summary.slice(0, 100)}`
  ).join('\n');

  const langNote = lang === 'zh' ? '用中文回答。' : 'Write in English.';

  const prompt = `根据以下今日精选技术文章列表，写一段 3-5 句话的"今日看点"总结。
要求：
- 提炼出今天技术圈的 2-3 个主要趋势或话题
- 不要逐篇列举，要做宏观归纳
- 风格简洁有力，像新闻导语
${langNote}

文章列表：
${articleList}

直接返回纯文本总结，不要 JSON，不要 markdown 格式。`;

  try {
    const text = await aiClient.call(prompt);
    return text.trim();
  } catch (error) {
    console.warn(`[digest] Highlights generation failed: ${error}`);
    return '';
  }
}
```

### 功能特点
- **宏观归纳**: 从Top 10文章中提取2-3个趋势
- **新闻风格**: 简洁有力的导语式总结
- **拒绝枚举**: 明确要求"不要逐篇列举"
- **纯文本输出**: 直接返回可用的文本

### 输出示例

```
今日AI领域聚焦于多模态大模型的突破性进展，多家实验室同时发布视觉-语言-动作统一模型。具身智能成为热点，机器人操作数据集和仿真训练平台显著增长，显示出VLA模型向实用化快速演进。
```

---

## 10. 可视化模块 (Lines 835-951)

### 10.1 饼图生成

```typescript
function generateCategoryPieChart(articles): string {
  const catCount = new Map<CategoryId, number>();
  for (const a of articles) {
    catCount.set(a.category, (catCount.get(a.category) || 0) + 1);
  }

  const sorted = Array.from(catCount.entries()).sort((a, b) => b[1] - a[1]);

  let chart = '```mermaid\n';
  chart += `pie showData\n`;
  chart += `    title "文章分类分布"\n`;
  for (const [cat, count] of sorted) {
    const meta = CATEGORY_META[cat];
    chart += `    "${meta.emoji} ${meta.label}" : ${count}\n`;
  }
  chart += '```\n';

  return chart;
}
```

### 10.2 柱状图生成

```typescript
function generateKeywordBarChart(articles): string {
  // 统计关键词频率
  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const kw of a.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  // 排序并取Top 12
  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const labels = sorted.map(([k]) => `"${k}"`).join(', ');
  const values = sorted.map(([, v]) => v).join(', ');
  const maxVal = sorted[0][1];

  let chart = '```mermaid\n';
  chart += `xychart-beta horizontal\n`;
  chart += `    title "高频关键词"\n`;
  chart += `    x-axis [${labels}]\n`;
  chart += `    y-axis "出现次数" 0 --> ${maxVal + 2}\n`;
  chart += `    bar [${values}]\n`;
  chart += '```\n';

  return chart;
}
```

### 10.3 ASCII文本图

```typescript
function generateAsciiBarChart(articles): string {
  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const kw of a.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

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
```

### 10.4 标签云

```typescript
function generateTagCloud(articles): string {
  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const kw of a.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // Top 3加粗，其他普通
  return sorted
    .map(([word, count], i) =>
      i < 3 ? `**${word}**(${count})` : `${word}(${count})`
    )
    .join(' · ');
}
```

### 可视化对比

| 格式 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **Mermaid饼图** | GitHub/Obsidian | 交互式、美观 | 需要渲染器支持 |
| **Mermaid柱状图** | GitHub/Obsidian | 专业、清晰 | 需要渲染器支持 |
| **ASCII文本图** | 终端/纯文本 | 通用性强 | 视觉效果简单 |
| **标签云** | 快速浏览 | 简洁、省空间 | 信息密度低 |

---

## 11. 报告生成器 (Lines 953-1064)

### 报告结构

```markdown
# 📰 AI 博客每日精选 — {date}

> 来自 Karpathy 推荐的 98 个顶级技术博客，AI 精选 Top {count}

## 📝 今日看点
{AI生成的趋势总结}

---

## 🏆 今日必读
🥇 **[文章1]**
> 摘要
💡 **为什么值得读**: 推荐理由
🏷️ 关键词

🥈 **[文章2]**
...

---

## 📊 数据概览
| 扫描源 | 抓取文章 | 时间范围 | 精选 |
|:---:|:---:|:---:|:---:|
| {成功}/{总数} | {总数} 篇 → {过滤} 篇 | {hours}h | **{精选} 篇** |

### 分类分布
{Mermaid饼图}

### 高频关键词
{Mermaid柱状图}

<details>
<summary>📈 纯文本关键词图（终端友好）</summary>

{ASCII文本图}

</details>

### 🏷️ 话题标签
{标签云}

---

## 🤖 AI / ML
### 1. [文章标题]
[原文链接](url) — **来源** · {时间} · ⭐ {总分}/30
> 摘要
🏷️ 关键词

---

## 🔒 安全
...

*生成信息*
```

### 核心函数

```typescript
function generateDigestReport(articles, highlights, stats): string {
  let report = `# 📰 AI 博客每日精选 — ${dateStr}\n\n`;
  report += `> 来自 Karpathy 推荐的 ${stats.totalFeeds} 个顶级技术博客，AI 精选 Top ${articles.length}\n\n`;

  // 今日看点
  if (highlights) {
    report += `## 📝 今日看点\n\n${highlights}\n\n---\n\n`;
  }

  // Top 3 详细展示
  if (articles.length >= 3) {
    report += `## 🏆 今日必读\n\n`;
    for (let i = 0; i < 3; i++) {
      const a = articles[i];
      const medal = ['🥇', '🥈', '🥉'][i];
      const catMeta = CATEGORY_META[a.category];

      report += `${medal} **${a.titleZh || a.title}**\n\n`;
      report += `[${a.title}](${a.link}) — ${a.sourceName} · ${humanizeTime(a.pubDate)} · ${catMeta.emoji} ${catMeta.label}\n\n`;
      report += `> ${a.summary}\n\n`;
      if (a.reason) {
        report += `💡 **为什么值得读**: ${a.reason}\n\n`;
      }
      if (a.keywords.length > 0) {
        report += `🏷️ ${a.keywords.join(', ')}\n\n`;
      }
    }
    report += `---\n\n`;
  }

  // 数据概览
  report += `## 📊 数据概览\n\n`;
  report += `| 扫描源 | 抓取文章 | 时间范围 | 精选 |\n`;
  report += `|:---:|:---:|:---:|:---:|\n`;
  report += `| ${stats.successFeeds}/${stats.totalFeeds} | ${stats.totalArticles} 篇 → ${stats.filteredArticles} 篇 | ${stats.hours}h | **${articles.length} 篇** |\n\n`;

  // 可视化图表
  report += generateCategoryPieChart(articles);
  report += generateKeywordBarChart(articles);
  report += generateAsciiBarChart(articles);
  report += generateTagCloud(articles);

  // 按分类展示所有文章
  const categoryGroups = new Map<CategoryId, ScoredArticle[]>();
  for (const a of articles) {
    const list = categoryGroups.get(a.category) || [];
    list.push(a);
    categoryGroups.set(a.category, list);
  }

  const sortedCategories = Array.from(categoryGroups.entries())
    .sort((a, b) => b[1].length - a[1].length);

  let globalIndex = 0;
  for (const [catId, catArticles] of sortedCategories) {
    const catMeta = CATEGORY_META[catId];
    report += `## ${catMeta.emoji} ${catMeta.label}\n\n`;

    for (const a of catArticles) {
      globalIndex++;
      const scoreTotal = a.scoreBreakdown.relevance + a.scoreBreakdown.quality + a.scoreBreakdown.timeliness;

      report += `### ${globalIndex}. ${a.titleZh || a.title}\n\n`;
      report += `[${a.title}](${a.link}) — **${a.sourceName}** · ${humanizeTime(a.pubDate)} · ⭐ ${scoreTotal}/30\n\n`;
      report += `> ${a.summary}\n\n`;
      if (a.keywords.length > 0) {
        report += `🏷️ ${a.keywords.join(', ')}\n\n`;
      }
      report += `---\n\n`;
    }
  }

  // 页脚
  report += `*生成于 ${dateStr} ${time} | 扫描 ${stats.successFeeds} 源 → 获取 ${stats.totalArticles} 篇 → 精选 ${articles.length} 篇*\n`;
  report += `*基于 [Hacker News Popularity Contest 2025](https://refactoringenglish.com/tools/hn-popularity/) RSS 源列表，由 [Andrej Karpathy](https://x.com/karpathy) 推荐*\n`;
  report += `*由「懂点儿AI」制作，欢迎关注同名微信公众号获取更多 AI 实用技巧 💡*\n`;

  return report;
}
```

### 设计特点
- **分层展示**: Top 3详细，其他按分类展示
- **多格式图表**: 兼容不同渲染环境
- **丰富元数据**: 来源、时间、分数、关键词
- **友好链接**: 原文链接可点击
- **双语标题**: 中文标题 + 英文原文

---

## 12. CLI入口 (Lines 1066-1261)

### 帮助信息

```typescript
function printUsage(): never {
  console.log(`AI Daily Digest - AI-powered RSS digest focused on AI Models & Embodied AI

Usage:
  bun scripts/digest.ts [options]

Options:
  --hours <n>     Time range in hours (default: 24 for latest content)
  --top-n <n>     Number of top articles to include (default: 15)
  --lang <lang>   Summary language: zh or en (default: zh)
  --output <path> Output file path (default: ./digest-YYYYMMDD.md)
  --help          Show this help

Environment:
  GEMINI_API_KEY   Recommended primary key. Get one at https://aistudio.google.com/apikey
  OPENAI_API_KEY   Optional fallback key for OpenAI-compatible APIs
  OPENAI_API_BASE  Optional fallback base URL (default: https://api.openai.com/v1)
  OPENAI_MODEL     Optional fallback model (default: deepseek-chat for DeepSeek base, else gpt-4o-mini)

Examples:
  bun scripts/digest.ts --hours 24 --top-n 15 --lang zh
  bun scripts/digest.ts --hours 72 --top-n 20 --lang en --output ./my-digest.md

Feed Sources:
  • 8 ArXiv categories (AI, Robotics, Vision, LLM, Neural, HCI, Control, ML)
  • 10 Top AI Labs (Google DeepMind, OpenAI, Meta AI, Microsoft Research, etc.)
  • 10 Research Labs (Berkeley BAIR, Stanford SAIL, MIT CSAIL, CMU Robotics, etc.)
  • 8 AI Media (The Gradient, Distill, VentureBeat AI, etc.)
  • 4 Robotics Media (The Robot Report, Robohub, IEEE Spectrum Automation, etc.)
`);
  process.exit(0);
}
```

### 主函数流程

```typescript
async function main(): Promise<void> {
  // 1. 解析命令行参数
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  let hours = 24;
  let topN = 15;
  let lang: 'zh' | 'en' = 'zh';
  let outputPath = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--hours' && args[i + 1]) {
      hours = parseInt(args[++i], 10);
    } else if (arg === '--top-n' && args[i + 1]) {
      topN = parseInt(args[++i], 10);
    } else if (arg === '--lang' && args[i + 1]) {
      lang = args[++i] as 'zh' | 'en';
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i];
    }
  }

  // 2. 获取API密钥
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openaiApiBase = process.env.OPENAI_API_BASE;
  const openaiModel = process.env.OPENAI_MODEL;

  if (!geminiApiKey && !openaiApiKey) {
    console.error('[digest] Error: Missing API key. Set GEMINI_API_KEY and/or OPENAI_API_KEY.');
    process.exit(1);
  }

  // 3. 创建AI客户端
  const aiClient = createAIClient({
    geminiApiKey,
    openaiApiKey,
    openaiApiBase,
    openaiModel,
  });

  // 4. 设置输出路径
  if (!outputPath) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    outputPath = `./digest-${dateStr}.md`;
  }

  // 5. 打印配置
  console.log(`[digest] === AI Daily Digest ===`);
  console.log(`[digest] Time range: ${hours} hours`);
  console.log(`[digest] Top N: ${topN}`);
  console.log(`[digest] Language: ${lang}`);
  console.log(`[digest] Output: ${outputPath}`);
  console.log('');

  // 6. 执行五步工作流
  console.log(`[digest] Step 1/5: Fetching ${RSS_FEEDS.length} RSS feeds...`);
  const allArticles = await fetchAllFeeds(RSS_FEEDS);

  if (allArticles.length === 0) {
    console.error('[digest] Error: No articles fetched from any feed.');
    process.exit(1);
  }

  console.log(`[digest] Step 2/5: Filtering by time range (${hours} hours)...`);
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentArticles = allArticles.filter(a => a.pubDate.getTime() > cutoffTime.getTime());

  console.log(`[digest] Found ${recentArticles.length} articles within last ${hours} hours`);

  if (recentArticles.length === 0) {
    console.error(`[digest] Error: No articles found within the last ${hours} hours.`);
    console.error(`[digest] Try increasing --hours (e.g., --hours 168 for one week)`);
    process.exit(1);
  }

  console.log(`[digest] Step 3/5: AI scoring ${recentArticles.length} articles...`);
  const scores = await scoreArticlesWithAI(recentArticles, aiClient);

  const scoredArticles = recentArticles.map((article, index) => {
    const score = scores.get(index) || {
      relevance: 5, quality: 5, timeliness: 5,
      category: 'other' as CategoryId, keywords: []
    };
    return {
      ...article,
      totalScore: score.relevance + score.quality + score.timeliness,
      breakdown: score,
    };
  });

  scoredArticles.sort((a, b) => b.totalScore - a.totalScore);
  const topArticles = scoredArticles.slice(0, topN);

  console.log(`[digest] Top ${topN} articles selected (score range: ${topArticles[topArticles.length - 1]?.totalScore || 0} - ${topArticles[0]?.totalScore || 0})`);

  console.log(`[digest] Step 4/5: Generating AI summaries...`);
  const indexedTopArticles = topArticles.map((a, i) => ({ ...a, index: i }));
  const summaries = await summarizeArticles(indexedTopArticles, aiClient, lang);

  const finalArticles: ScoredArticle[] = topArticles.map((a, i) => {
    const sm = summaries.get(i) || {
      titleZh: a.title,
      summary: a.description.slice(0, 200),
      reason: ''
    };
    return {
      title: a.title,
      link: a.link,
      pubDate: a.pubDate,
      description: a.description,
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl,
      score: a.totalScore,
      scoreBreakdown: {
        relevance: a.breakdown.relevance,
        quality: a.breakdown.quality,
        timeliness: a.breakdown.timeliness,
      },
      category: a.breakdown.category,
      keywords: a.breakdown.keywords,
      titleZh: sm.titleZh,
      summary: sm.summary,
      reason: sm.reason,
    };
  });

  console.log(`[digest] Step 5/5: Generating today's highlights...`);
  const highlights = await generateHighlights(finalArticles, aiClient, lang);

  // 7. 生成报告
  const successfulSources = new Set(allArticles.map(a => a.sourceName));

  const report = generateDigestReport(finalArticles, highlights, {
    totalFeeds: RSS_FEEDS.length,
    successFeeds: successfulSources.size,
    totalArticles: allArticles.length,
    filteredArticles: recentArticles.length,
    hours,
    lang,
  });

  // 8. 写入文件
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report);

  // 9. 打印结果
  console.log('');
  console.log(`[digest] ✅ Done!`);
  console.log(`[digest] 📁 Report: ${outputPath}`);
  console.log(`[digest] 📊 Stats: ${successfulSources.size} sources → ${allArticles.length} articles → ${recentArticles.length} recent → ${finalArticles.length} selected`);

  if (finalArticles.length > 0) {
    console.log('');
    console.log(`[digest] 🏆 Top 3 Preview:`);
    for (let i = 0; i < Math.min(3, finalArticles.length); i++) {
      const a = finalArticles[i];
      console.log(`  ${i + 1}. ${a.titleZh || a.title}`);
      console.log(`     ${a.summary.slice(0, 80)}...`);
    }
  }
}
```

### 五步工作流

```
Step 1/5: 获取RSS (fetchAllFeeds)
  └─ 98个feed并发获取

Step 2/5: 时间过滤
  └─ 按hours参数过滤

Step 3/5: AI评分 (scoreArticlesWithAI)
  └─ 批量评分、排序、取Top N

Step 4/5: AI摘要 (summarizeArticles)
  └─ 为Top N生成摘要和翻译

Step 5/5: 趋势分析 (generateHighlights)
  └─ 生成今日看点

最终: 生成报告 (generateDigestReport)
```

### 参数验证
- 检查API密钥存在性
- 验证获取到的文章数量
- 验证时间过滤后的文章数量
- 提供友好的错误提示和解决方案

---

## 数据流总结

### 完整数据流图

```
┌─────────────────────────────────────────────────────────────────┐
│                        RSS_FEEDS (98个源)                        │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                │
│  │ blog   │  │ arxiv  │  │ ai-lab │  │research│ ...            │
│  │ (90)   │  │  (8)   │  │  (10)  │  │  (10)  │                │
│  └────────┘  └────────┘  └────────┘  └────────┘                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     fetchAllFeeds() 并发获取                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Promise.allSettled(10个并发)                              │   │
│  │ • AbortController 15s超时                                 │   │
│  │ • 失败静默跳过                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      allArticles[] (原始数据)                      │
│  Article { title, link, pubDate, description, sourceName }       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   时间过滤 (hours参数: 24/48/72)                   │
│  cutoffTime = Date.now() - hours * 60 * 60 * 1000               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    recentArticles[] (近期文章)                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              scoreArticlesWithAI() 批量评分                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 每15篇一批，4批并发                                      │   │
│  │ AI评分: relevance, quality, timeliness (1-10)            │   │
│  │ 分类: ai-ml/security/engineering/tools/opinion/other     │   │
│  │ 关键词: 2-4个英文关键词                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  scoredArticles[] (带分数)                         │
│  { totalScore, breakdown: { relevance, quality, timeliness } }   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      排序 + 取Top N                               │
│  scoredArticles.sort((a, b) => b.totalScore - a.totalScore)      │
│  const topArticles = scoredArticles.slice(0, topN)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              summarizeArticles() 批量摘要                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 每15篇一批，4批并发                                      │   │
│  │ AI生成: titleZh(中文标题), summary(摘要), reason(推荐理由)│   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  finalArticles[] (完整数据)                        │
│  ScoredArticle { titleZh, summary, reason, scoreBreakdown }      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│            generateHighlights() 趋势分析                          │
│  从Top 10提取2-3个宏观趋势                                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              generateDigestReport() 生成报告                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. 标题 + 日期 + 元数据                                   │   │
│  │ 2. 今日看点 (AI生成)                                     │   │
│  │ 3. Top 3 详细展示 (奖牌+摘要+推荐理由+关键词)              │   │
│  │ 4. 数据概览 (表格+饼图+柱状图+ASCII图+标签云)              │   │
│  │ 5. 按分类展示所有文章                                     │   │
│  │ 6. 页脚 (生成信息+来源说明)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Markdown文件 (digest-YYYYMMDD.md)                │
└─────────────────────────────────────────────────────────────────┘
```

### 数据转换

```typescript
// 阶段1: RSS原始数据
interface Article {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

// 阶段2: AI评分后
interface ScoredArticleExtended extends Article {
  totalScore: number;           // relevance + quality + timeliness
  breakdown: {
    relevance: number;
    quality: number;
    timeliness: number;
    category: CategoryId;
    keywords: string[];
  };
}

// 阶段3: 最终输出
interface ScoredArticle extends Article {
  score: number;
  scoreBreakdown: { relevance, quality, timeliness };
  category: CategoryId;
  keywords: string[];
  titleZh: string;
  summary: string;
  reason: string;
}
```

---

## 设计亮点

### 1. 零依赖架构
- **只使用Bun内置功能**: `fetch`, `XML parsing`, `Promise`, `RegExp`
- **无需npm install**: 单文件即可运行
- **部署简单**: `bun run scripts/digest.ts`

### 2. 容错性强
```typescript
// RSS获取层
Promise.allSettled()  // 单个失败不影响整体
AbortController       // 超时控制

// AI调用层
try {
  return await callGemini();
} catch {
  return await callOpenAICompatible();  // 自动降级
}

// 评分/摘要层
try {
  const parsed = parseJsonResponse(responseText);
} catch {
  // 赋予默认值，继续处理
  allScores.set(index, { relevance: 5, quality: 5, ... });
}
```

### 3. 批处理优化
| 层级 | 并发数 | 批大小 | 说明 |
|------|--------|--------|------|
| RSS获取 | 10 | - | 10个feed并发 |
| AI评分 | 4 | 15 | 4批×15篇=60篇并发 |
| AI摘要 | 4 | 15 | 4批×15篇=60篇并发 |

### 4. 类型安全
```typescript
type CategoryId = 'ai-ml' | 'security' | 'engineering' | 'tools' | 'opinion' | 'other';

interface Article { ... }
interface ScoredArticle extends Article { ... }
interface GeminiScoringResult { ... }
interface GeminiSummaryResult { ... }
```

### 5. 可扩展性
```typescript
// 添加新RSS源
const RSS_FEEDS: RssFeed[] = [
  ...现有源,
  { name: "新源", xmlUrl: "...", htmlUrl: "...", category: "blog" },
];

// 切换AI提供商
// 只需修改:
// 1. GEMINI_API_URL
// 2. callGemini()
// 3. 环境变量名

// 添加新分类
const CATEGORY_META: Record<CategoryId, ...> = {
  ...现有分类,
  'new-category': { emoji: '🆕', label: '新分类' },
};
```

### 6. 多格式输出
```typescript
// 兼容不同渲染环境
generateCategoryPieChart()    // Mermaid (GitHub/Obsidian)
generateAsciiBarChart()       // ASCII (终端/纯文本)
generateTagCloud()            // 简洁 (快速浏览)
```

### 7. 性能优化
- **并发控制**: 避免过载服务器/API
- **批处理**: 减少API调用次数
- **超时控制**: 快速失败，不阻塞
- **内存优化**: 流式处理，不保存所有中间结果

### 8. 用户体验
- **进度显示**: 每步完成后打印进度
- **Top 3预览**: 运行结束后展示前3名
- **友好错误**: 提供解决方案建议
- **灵活配置**: 命令行参数+环境变量

---

## 总结

`scripts/digest.ts` 是一个精心设计的 TypeScript 单文件应用，展示了以下工程实践：

1. **模块化设计**: 清晰的职责分离，每个函数专注单一功能
2. **类型驱动开发**: 完整的类型定义，编译时错误检查
3. **容错优先**: 多层错误处理，保证系统稳定性
4. **性能优化**: 并发、批处理、超时控制
5. **可维护性**: 代码结构清晰，易于扩展和修改
6. **用户体验**: 友好的输出和错误提示

整个项目从RSS获取到报告生成，形成了一个完整的自动化内容策展流水线。
