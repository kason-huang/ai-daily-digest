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
const FEED_CONCURRENCY = 10;
const GEMINI_BATCH_SIZE = 10;
const MAX_CONCURRENT_GEMINI = 4;

// AI retry configuration
const AI_MAX_RETRIES = 5;
const AI_INITIAL_RETRY_DELAY_MS = 2000; // Start with 2 seconds
const AI_MAX_RETRY_DELAY_MS = 60000;    // Max 60 seconds between retries

// 90 RSS feeds from Hacker News Popularity Contest 2025 (curated by Karpathy) + 8 extended feeds
const RSS_FEEDS: RssFeed[] = [
  { name: "simonwillison.net", xmlUrl: "https://simonwillison.net/atom/everything/", htmlUrl: "https://simonwillison.net" },
  { name: "jeffgeerling.com", xmlUrl: "https://www.jeffgeerling.com/blog.xml", htmlUrl: "https://jeffgeerling.com" },
  { name: "seangoedecke.com", xmlUrl: "https://www.seangoedecke.com/rss.xml", htmlUrl: "https://seangoedecke.com" },
  { name: "krebsonsecurity.com", xmlUrl: "https://krebsonsecurity.com/feed/", htmlUrl: "https://krebsonsecurity.com" },
  { name: "daringfireball.net", xmlUrl: "https://daringfireball.net/feeds/main", htmlUrl: "https://daringfireball.net" },
  { name: "ericmigi.com", xmlUrl: "https://ericmigi.com/rss.xml", htmlUrl: "https://ericmigi.com" },
  { name: "maurycyz.com", xmlUrl: "https://maurycyz.com/index.xml", htmlUrl: "https://maurycyz.com" },
  { name: "pluralistic.net", xmlUrl: "https://pluralistic.net/feed/", htmlUrl: "https://pluralistic.net" },
  { name: "shkspr.mobi", xmlUrl: "https://shkspr.mobi/blog/feed/", htmlUrl: "https://shkspr.mobi" },
  { name: "lcamtuf.substack.com", xmlUrl: "https://lcamtuf.substack.com/feed", htmlUrl: "https://lcamtuf.substack.com" },
  { name: "mitchellh.com", xmlUrl: "https://mitchellh.com/feed.xml", htmlUrl: "https://mitchellh.com" },
  { name: "dynomight.net", xmlUrl: "https://dynomight.net/feed.xml", htmlUrl: "https://dynomight.net" },
  { name: "devblogs.microsoft.com/oldnewthing", xmlUrl: "https://devblogs.microsoft.com/oldnewthing/feed", htmlUrl: "https://devblogs.microsoft.com/oldnewthing" },
  { name: "righto.com", xmlUrl: "https://www.righto.com/feeds/posts/default", htmlUrl: "https://righto.com" },
  { name: "lucumr.pocoo.org", xmlUrl: "https://lucumr.pocoo.org/feed.atom", htmlUrl: "https://lucumr.pocoo.org" },
  { name: "skyfall.dev", xmlUrl: "https://skyfall.dev/rss.xml", htmlUrl: "https://skyfall.dev" },
  { name: "garymarcus.substack.com", xmlUrl: "https://garymarcus.substack.com/feed", htmlUrl: "https://garymarcus.substack.com" },
  { name: "overreacted.io", xmlUrl: "https://overreacted.io/rss.xml", htmlUrl: "https://overreacted.io" },
  { name: "timsh.org", xmlUrl: "https://timsh.org/rss/", htmlUrl: "https://timsh.org" },
  { name: "johndcook.com", xmlUrl: "https://www.johndcook.com/blog/feed/", htmlUrl: "https://johndcook.com" },
  { name: "gilesthomas.com", xmlUrl: "https://gilesthomas.com/feed/rss.xml", htmlUrl: "https://gilesthomas.com" },
  { name: "matklad.github.io", xmlUrl: "https://matklad.github.io/feed.xml", htmlUrl: "https://matklad.github.io" },
  { name: "derekthompson.org", xmlUrl: "https://www.theatlantic.com/feed/author/derek-thompson/", htmlUrl: "https://derekthompson.org" },
  { name: "evanhahn.com", xmlUrl: "https://evanhahn.com/feed.xml", htmlUrl: "https://evanhahn.com" },
  { name: "terriblesoftware.org", xmlUrl: "https://terriblesoftware.org/feed/", htmlUrl: "https://terriblesoftware.org" },
  { name: "rakhim.exotext.com", xmlUrl: "https://rakhim.exotext.com/rss.xml", htmlUrl: "https://rakhim.exotext.com" },
  { name: "joanwestenberg.com", xmlUrl: "https://joanwestenberg.com/rss", htmlUrl: "https://joanwestenberg.com" },
  { name: "xania.org", xmlUrl: "https://xania.org/feed", htmlUrl: "https://xania.org" },
  { name: "nesbitt.io", xmlUrl: "https://nesbitt.io/feed.xml", htmlUrl: "https://nesbitt.io" },
  { name: "construction-physics.com", xmlUrl: "https://www.construction-physics.com/feed", htmlUrl: "https://construction-physics.com" },
  { name: "tedium.co", xmlUrl: "https://feed.tedium.co/", htmlUrl: "https://tedium.co" },
  { name: "susam.net", xmlUrl: "https://susam.net/feed.xml", htmlUrl: "https://susam.net" },
  { name: "entropicthoughts.com", xmlUrl: "https://entropicthoughts.com/feed.xml", htmlUrl: "https://entropicthoughts.com" },
  { name: "buttondown.com/hillelwayne", xmlUrl: "https://buttondown.com/hillelwayne/rss", htmlUrl: "https://buttondown.com/hillelwayne" },
  { name: "dwarkesh.com", xmlUrl: "https://www.dwarkeshpatel.com/feed", htmlUrl: "https://dwarkesh.com" },
  { name: "borretti.me", xmlUrl: "https://borretti.me/feed.xml", htmlUrl: "https://borretti.me" },
  { name: "wheresyoured.at", xmlUrl: "https://www.wheresyoured.at/rss/", htmlUrl: "https://wheresyoured.at" },
  { name: "jayd.ml", xmlUrl: "https://jayd.ml/feed.xml", htmlUrl: "https://jayd.ml" },
  { name: "minimaxir.com", xmlUrl: "https://minimaxir.com/index.xml", htmlUrl: "https://minimaxir.com" },
  { name: "geohot.github.io", xmlUrl: "https://geohot.github.io/blog/feed.xml", htmlUrl: "https://geohot.github.io" },
  { name: "paulgraham.com", xmlUrl: "https://www.aaronsw.com/2002/feeds/pgessays.rss", htmlUrl: "https://paulgraham.com" },
  { name: "filfre.net", xmlUrl: "https://www.filfre.net/feed/", htmlUrl: "https://filfre.net" },
  { name: "blog.jim-nielsen.com", xmlUrl: "https://blog.jim-nielsen.com/feed.xml", htmlUrl: "https://blog.jim-nielsen.com" },
  { name: "dfarq.homeip.net", xmlUrl: "https://dfarq.homeip.net/feed/", htmlUrl: "https://dfarq.homeip.net" },
  { name: "jyn.dev", xmlUrl: "https://jyn.dev/atom.xml", htmlUrl: "https://jyn.dev" },
  { name: "geoffreylitt.com", xmlUrl: "https://www.geoffreylitt.com/feed.xml", htmlUrl: "https://geoffreylitt.com" },
  { name: "downtowndougbrown.com", xmlUrl: "https://www.downtowndougbrown.com/feed/", htmlUrl: "https://downtowndougbrown.com" },
  { name: "brutecat.com", xmlUrl: "https://brutecat.com/rss.xml", htmlUrl: "https://brutecat.com" },
  { name: "eli.thegreenplace.net", xmlUrl: "https://eli.thegreenplace.net/feeds/all.atom.xml", htmlUrl: "https://eli.thegreenplace.net" },
  { name: "abortretry.fail", xmlUrl: "https://www.abortretry.fail/feed", htmlUrl: "https://abortretry.fail" },
  { name: "fabiensanglard.net", xmlUrl: "https://fabiensanglard.net/rss.xml", htmlUrl: "https://fabiensanglard.net" },
  { name: "bogdanthegeek.github.io", xmlUrl: "https://bogdanthegeek.github.io/blog/index.xml", htmlUrl: "https://bogdanthegeek.github.io" },
  { name: "hugotunius.se", xmlUrl: "https://hugotunius.se/feed.xml", htmlUrl: "https://hugotunius.se" },
  { name: "gwern.net", xmlUrl: "https://gwern.substack.com/feed", htmlUrl: "https://gwern.net" },
  { name: "berthub.eu", xmlUrl: "https://berthub.eu/articles/index.xml", htmlUrl: "https://berthub.eu" },
  { name: "chadnauseam.com", xmlUrl: "https://chadnauseam.com/rss.xml", htmlUrl: "https://chadnauseam.com" },
  { name: "simone.org", xmlUrl: "https://simone.org/feed/", htmlUrl: "https://simone.org" },
  { name: "it-notes.dragas.net", xmlUrl: "https://it-notes.dragas.net/feed/", htmlUrl: "https://it-notes.dragas.net" },
  { name: "beej.us", xmlUrl: "https://beej.us/blog/rss.xml", htmlUrl: "https://beej.us" },
  { name: "hey.paris", xmlUrl: "https://hey.paris/index.xml", htmlUrl: "https://hey.paris" },
  { name: "danielwirtz.com", xmlUrl: "https://danielwirtz.com/rss.xml", htmlUrl: "https://danielwirtz.com" },
  { name: "matduggan.com", xmlUrl: "https://matduggan.com/rss/", htmlUrl: "https://matduggan.com" },
  { name: "refactoringenglish.com", xmlUrl: "https://refactoringenglish.com/index.xml", htmlUrl: "https://refactoringenglish.com" },
  { name: "worksonmymachine.substack.com", xmlUrl: "https://worksonmymachine.substack.com/feed", htmlUrl: "https://worksonmymachine.substack.com" },
  { name: "philiplaine.com", xmlUrl: "https://philiplaine.com/index.xml", htmlUrl: "https://philiplaine.com" },
  { name: "steveblank.com", xmlUrl: "https://steveblank.com/feed/", htmlUrl: "https://steveblank.com" },
  { name: "danieldelaney.net", xmlUrl: "https://danieldelaney.net/feed", htmlUrl: "https://danieldelaney.net" },
  { name: "troyhunt.com", xmlUrl: "https://www.troyhunt.com/rss/", htmlUrl: "https://troyhunt.com" },
  { name: "herman.bearblog.dev", xmlUrl: "https://herman.bearblog.dev/feed/", htmlUrl: "https://herman.bearblog.dev" },
  { name: "tomrenner.com", xmlUrl: "https://tomrenner.com/index.xml", htmlUrl: "https://tomrenner.com" },
  { name: "blog.pixelmelt.dev", xmlUrl: "https://blog.pixelmelt.dev/rss/", htmlUrl: "https://blog.pixelmelt.dev" },
  { name: "martinalderson.com", xmlUrl: "https://martinalderson.com/feed.xml", htmlUrl: "https://martinalderson.com" },
  { name: "danielchasehooper.com", xmlUrl: "https://danielchasehooper.com/feed.xml", htmlUrl: "https://danielchasehooper.com" },
  { name: "chiark.greenend.org.uk/~sgtatham", xmlUrl: "https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/feed.xml", htmlUrl: "https://chiark.greenend.org.uk/~sgtatham" },
  { name: "grantslatton.com", xmlUrl: "https://grantslatton.com/rss.xml", htmlUrl: "https://grantslatton.com" },
  { name: "experimental-history.com", xmlUrl: "https://www.experimental-history.com/feed", htmlUrl: "https://experimental-history.com" },
  { name: "anildash.com", xmlUrl: "https://anildash.com/feed.xml", htmlUrl: "https://anildash.com" },
  { name: "aresluna.org", xmlUrl: "https://aresluna.org/main.rss", htmlUrl: "https://aresluna.org" },
  { name: "michael.stapelberg.ch", xmlUrl: "https://michael.stapelberg.ch/feed.xml", htmlUrl: "https://michael.stapelberg.ch" },
  { name: "miguelgrinberg.com", xmlUrl: "https://blog.miguelgrinberg.com/feed", htmlUrl: "https://miguelgrinberg.com" },
  { name: "keygen.sh", xmlUrl: "https://keygen.sh/blog/feed.xml", htmlUrl: "https://keygen.sh" },
  { name: "mjg59.dreamwidth.org", xmlUrl: "https://mjg59.dreamwidth.org/data/rss", htmlUrl: "https://mjg59.dreamwidth.org" },
  { name: "computer.rip", xmlUrl: "https://computer.rip/rss.xml", htmlUrl: "https://computer.rip" },

  // ============================================================================
  // Extended: AI/ML Paper Sources
  // ============================================================================

  // ArXiv Feeds (AI/ML/Robotics papers - Core for VLA, World Models, Embodied AI)
  { name: "ArXiv CS.AI", xmlUrl: "https://rss.arxiv.org/rss/cs.AI", htmlUrl: "https://arxiv.org/list/cs.AI/recent", category: "arxiv" },
  { name: "ArXiv CS.RO (Robotics)", xmlUrl: "https://rss.arxiv.org/rss/cs.RO", htmlUrl: "https://arxiv.org/list/cs.RO/recent", category: "arxiv" },
  { name: "ArXiv CS.LG (ML)", xmlUrl: "https://rss.arxiv.org/rss/cs.LG", htmlUrl: "https://arxiv.org/list/cs.LG/recent", category: "arxiv" },
  { name: "ArXiv CS.CV (Vision)", xmlUrl: "https://rss.arxiv.org/rss/cs.CV", htmlUrl: "https://arxiv.org/list/cs.CV/recent", category: "arxiv" },
  { name: "ArXiv CS.CL (LLM/NLP)", xmlUrl: "https://rss.arxiv.org/rss/cs.CL", htmlUrl: "https://arxiv.org/list/cs.CL/recent", category: "arxiv" },
  { name: "ArXiv CS.NE (Neural)", xmlUrl: "https://rss.arxiv.org/rss/cs.NE", htmlUrl: "https://arxiv.org/list/cs.NE/recent", category: "arxiv" },
  { name: "ArXiv CS.HC (HCI)", xmlUrl: "https://rss.arxiv.org/rss/cs.HC", htmlUrl: "https://arxiv.org/list/cs.HC/recent", category: "arxiv" },
  { name: "ArXiv CS.SY (Control)", xmlUrl: "https://rss.arxiv.org/rss/cs.SY", htmlUrl: "https://arxiv.org/list/cs.SY/recent", category: "arxiv" },

  // AI Lab Blogs (Top-tier AI Model Research)
  { name: "Google DeepMind", xmlUrl: "https://deepmind.google/blog/feed/basic/", htmlUrl: "https://deepmind.google/blog/", category: "ai-lab" },
  { name: "OpenAI News", xmlUrl: "https://openai.com/news/rss.xml", htmlUrl: "https://openai.com/news", category: "ai-lab" },
  { name: "Microsoft Research", xmlUrl: "https://www.microsoft.com/en-us/research/blog/feed/", htmlUrl: "https://www.microsoft.com/en-us/research/blog", category: "ai-lab" },
  { name: "Google AI Blog", xmlUrl: "https://blog.google/technology/ai/rss/", htmlUrl: "https://blog.google/technology/ai/", category: "ai-lab" },
  { name: "AWS Machine Learning", xmlUrl: "https://aws.amazon.com/blogs/machine-learning/feed/", htmlUrl: "https://aws.amazon.com/blogs/machine-learning", category: "ai-lab" },
  { name: "Microsoft Azure AI", xmlUrl: "https://techcommunity.microsoft.com/t5/artificial-intelligence/bg-p/ArtificialIntelligence/rss", htmlUrl: "https://techcommunity.microsoft.com/t5/artificial-intelligence/ct-p/ArtificialIntelligence", category: "ai-lab" },

  // Research Labs (Embodied AI & Robotics Focus)
  { name: "BAIR Blog (Berkeley AI)", xmlUrl: "https://bair.berkeley.edu/blog/feed.xml", htmlUrl: "https://bair.berkeley.edu/blog", category: "research" },
  { name: "MIT AI News", xmlUrl: "https://news.mit.edu/rss/topic/artificial-intelligence2", htmlUrl: "https://news.mit.edu/topic/artificial-intelligence2", category: "research" },
  { name: "Stanford AI Lab (SAIL)", xmlUrl: "https://ai.stanford.edu/blog/feed.xml", htmlUrl: "https://ai.stanford.edu/blog", category: "research" },
  { name: "CMU Robotics Institute", xmlUrl: "https://www.ri.cmu.edu/feed/", htmlUrl: "https://www.ri.cmu.edu", category: "research" },

  // AI Media & Communities (Agentic AI, Model Research)
  { name: "The Gradient", xmlUrl: "https://thegradient.pub/rss/", htmlUrl: "https://thegradient.pub", category: "ai-media" },
  { name: "Distill.pub (ML Research)", xmlUrl: "https://distill.pub/rss.xml", htmlUrl: "https://distill.pub", category: "ai-media" },
  { name: "Towards Data Science", xmlUrl: "https://towardsdatascience.com/feed", htmlUrl: "https://towardsdatascience.com", category: "ai-media" },
  { name: "Machine Learning Mastery", xmlUrl: "https://machinelearningmastery.com/feed/", htmlUrl: "https://machinelearningmastery.com", category: "ai-media" },
  { name: "AI News", xmlUrl: "https://artificialintelligence-news.com/feed/", htmlUrl: "https://artificialintelligence-news.com", category: "ai-media" },
  { name: "Jay Alammar's Blog", xmlUrl: "https://jalammar.github.io/feed.xml", htmlUrl: "https://jalammar.github.io", category: "ai-media" },

  // Robotics & Embodied AI Media
  { name: "The Robot Report", xmlUrl: "https://www.therobotreport.com/rss", htmlUrl: "https://www.therobotreport.com", category: "robotics" },
  { name: "Robotics Business Review", xmlUrl: "https://roboticsbusinessreview.com/feed/", htmlUrl: "https://roboticsbusinessreview.com", category: "robotics" },
  { name: "Robohub", xmlUrl: "https://robohub.org/feed/", htmlUrl: "https://robohub.org", category: "robotics" },
];

// ============================================================================
// Types
// ============================================================================

type CategoryId =
  // 原有 6 个基础分类
  'ai-ml' | 'security' | 'engineering' | 'tools' | 'opinion' | 'other' |
  // 新增 8 个 ArXiv 细分领域
  'arxiv-cl' | 'arxiv-lg' | 'arxiv-cv' | 'arxiv-ai' |
  'arxiv-ro' | 'arxiv-sy' | 'arxiv-ne' | 'arxiv-hc' |
  // 新增 3 个热门研究子领域
  'arxiv-emb' | 'arxiv-wm' | 'arxiv-mllm';

export const CATEGORY_META: Record<CategoryId, { emoji: string; label: string; description: string }> = {
  // 原有基础分类
  'ai-ml':       { emoji: '🤖', label: 'AI / ML', description: '通用 AI 与机器学习' },
  'security':    { emoji: '🔒', label: '安全', description: '网络安全、隐私保护' },
  'engineering': { emoji: '⚙️', label: '工程', description: '软件工程、架构设计' },
  'tools':       { emoji: '🛠', label: '工具 / 开源', description: '开发工具、开源项目' },
  'opinion':     { emoji: '💡', label: '观点 / 杂谈', description: '行业观点、技术思考' },
  'other':       { emoji: '📝', label: '其他', description: '其他领域' },

  // 新增 ArXiv 细分领域
  'arxiv-cl':    { emoji: '🗣️', label: '计算与语言 / LLM', description: 'ArXiv CS.CL: NLP、LLM、对话系统' },
  'arxiv-lg':    { emoji: '🧠', label: '机器学习', description: 'ArXiv CS.LG: ML 理论、深度学习' },
  'arxiv-cv':    { emoji: '👁️', label: '计算机视觉', description: 'ArXiv CS.CV: 图像、视频处理' },
  'arxiv-ai':    { emoji: '🤖', label: '人工智能', description: 'ArXiv CS.AI: 通用 AI、知识推理' },
  'arxiv-ro':    { emoji: '🦾', label: '机器人学', description: 'ArXiv CS.RO: 机器人、运动控制' },
  'arxiv-sy':    { emoji: '🎛️', label: '系统与控制', description: 'ArXiv CS.SY: 控制理论、系统优化' },
  'arxiv-ne':    { emoji: '🔮', label: '神经与进化计算', description: 'ArXiv CS.NE: 神经网络、进化算法' },
  'arxiv-hc':    { emoji: '👤', label: '人机交互', description: 'ArXiv CS.HC: HCI、用户体验' },

  // 新增热门研究子领域
  'arxiv-emb':   { emoji: '🦾', label: '具身与导航', description: 'Embodied AI、导航与SLAM、机器人学习、VLA模型、传感器-运动控制' },
  'arxiv-wm':    { emoji: '🌍', label: '世界模型', description: 'World Models、环境模型、仿真、动力学学习、预测模型' },
  'arxiv-mllm':  { emoji: '🎨', label: '多模态LLM', description: '多模态大语言模型、视觉-语言模型、多模态推理、对齐' },
};

export type { CategoryId };

// Feed source categories for organization
type FeedCategory = 'blog' | 'arxiv' | 'ai-lab' | 'conference' | 'research' | 'ai-media' | 'robotics';

interface RssFeed {
  name: string;
  xmlUrl: string;
  htmlUrl: string;
  category?: FeedCategory;
}

interface Article {
  title: string;
  link: string;
  pubDate: Date;
  description: string;
  sourceName: string;
  sourceUrl: string;
}

// 临时类型：评分后但未总结的文章
interface TempScoredArticle extends Article {
  totalScore: number;
  breakdown: {
    relevance: number;
    quality: number;
    timeliness: number;
    category: CategoryId;
    keywords: string[];
  };
}

interface ScoredArticle extends Article {
  score: number;
  scoreBreakdown: {
    relevance: number;
    quality: number;
    timeliness: number;
  };
  category: CategoryId;
  keywords: string[];
  titleZh: string;
  summary: string;
  reason: string;
}

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

interface GeminiSummaryResult {
  results: Array<{
    index: number;
    titleZh: string;
    summary: string;
    reason: string;
  }>;
}

interface FeedError {
  feedName: string;
  feedUrl: string;
  errorType: '404' | 'network' | 'timeout' | 'parse' | 'other';
  message: string;
}

interface AIClient {
  call(prompt: string): Promise<string>;
}

// ============================================================================
// RSS/Atom Parsing (using Bun's built-in HTMLRewriter or manual XML parsing)
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
  // Handle namespaced and non-namespaced tags
  const patterns = [
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'),
    new RegExp(`<${tagName}[^>]*/>`, 'i'), // self-closing
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match?.[1]) {
      return extractCDATA(match[1]).trim();
    }
  }
  return '';
}

function getAttrValue(xml: string, tagName: string, attrName: string): string {
  const pattern = new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']*)["'][^>]*/?>`, 'i');
  const match = xml.match(pattern);
  return match?.[1] || '';
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  // Try common RSS date formats
  // RFC 822: "Mon, 01 Jan 2024 00:00:00 GMT"
  const rfc822 = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (rfc822) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  
  return null;
}

function parseRSSItems(xml: string): Array<{ title: string; link: string; pubDate: string; description: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];
  
  // Detect format: Atom vs RSS
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"') || xml.includes('<feed ');
  
  if (isAtom) {
    // Atom format: <entry>
    const entryPattern = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let entryMatch;
    while ((entryMatch = entryPattern.exec(xml)) !== null) {
      const entryXml = entryMatch[1];
      const title = stripHtml(getTagContent(entryXml, 'title'));
      
      // Atom link: <link href="..." rel="alternate"/>
      let link = getAttrValue(entryXml, 'link[^>]*rel="alternate"', 'href');
      if (!link) {
        link = getAttrValue(entryXml, 'link', 'href');
      }
      
      const pubDate = getTagContent(entryXml, 'published') 
        || getTagContent(entryXml, 'updated');
      
      const description = stripHtml(
        getTagContent(entryXml, 'summary') 
        || getTagContent(entryXml, 'content')
      );
      
      if (title || link) {
        items.push({ title, link, pubDate, description: description.slice(0, 500) });
      }
    }
  } else {
    // RSS format: <item>
    const itemPattern = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(xml)) !== null) {
      const itemXml = itemMatch[1];
      const title = stripHtml(getTagContent(itemXml, 'title'));
      const link = getTagContent(itemXml, 'link') || getTagContent(itemXml, 'guid');
      const pubDate = getTagContent(itemXml, 'pubDate') 
        || getTagContent(itemXml, 'dc:date')
        || getTagContent(itemXml, 'date');
      const description = stripHtml(
        getTagContent(itemXml, 'description') 
        || getTagContent(itemXml, 'content:encoded')
      );
      
      if (title || link) {
        items.push({ title, link, pubDate, description: description.slice(0, 500) });
      }
    }
  }
  
  return items;
}

// ============================================================================
// Feed Fetching
// ============================================================================

async function fetchFeed(feed: { name: string; xmlUrl: string; htmlUrl: string }): Promise<{ articles: Article[], error?: FeedError }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

    const response = await fetch(feed.xmlUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Daily-Digest/1.0 (RSS Reader)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });

    clearTimeout(timeout);

    if (response.status === 404) {
      return {
        articles: [],
        error: {
          feedName: feed.name,
          feedUrl: feed.xmlUrl,
          errorType: '404',
          message: 'HTTP 404 - Feed not found'
        }
      };
    }

    if (!response.ok) {
      return {
        articles: [],
        error: {
          feedName: feed.name,
          feedUrl: feed.xmlUrl,
          errorType: 'other',
          message: `HTTP ${response.status} - ${response.statusText}`
        }
      };
    }

    const xml = await response.text();
    const items = parseRSSItems(xml);

    return {
      articles: items.map(item => ({
        title: item.title,
        link: item.link,
        pubDate: parseDate(item.pubDate) || new Date(0),
        description: item.description,
        sourceName: feed.name,
        sourceUrl: feed.htmlUrl,
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

    // Only log non-timeout errors to reduce noise
    if (errorType !== 'timeout') {
      console.warn(`[digest] ✗ ${feed.name}: ${msg}`);
    } else {
      console.warn(`[digest] ✗ ${feed.name}: timeout`);
    }

    return {
      articles: [],
      error: {
        feedName: feed.name,
        feedUrl: feed.xmlUrl,
        errorType,
        message: msg
      }
    };
  }
}

async function fetchAllFeeds(feeds: typeof RSS_FEEDS): Promise<{ articles: Article[], errors: FeedError[] }> {
  const allArticles: Article[] = [];
  const feedErrors: FeedError[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < feeds.length; i += FEED_CONCURRENCY) {
    const batch = feeds.slice(i, i + FEED_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(fetchFeed));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { articles, error } = result.value;
        if (articles.length > 0) {
          allArticles.push(...articles);
          successCount++;
        }
        if (error) {
          feedErrors.push(error);
          failCount++;
        }
      } else {
        failCount++;
      }
    }

    const progress = Math.min(i + FEED_CONCURRENCY, feeds.length);
    console.log(`[digest] Progress: ${progress}/${feeds.length} feeds processed (${successCount} ok, ${failCount} failed)`);
  }

  console.log(`[digest] Fetched ${allArticles.length} articles from ${successCount} feeds (${failCount} failed)`);
  return { articles: allArticles, errors: feedErrors };
}

// ============================================================================
// AI Providers (Gemini + OpenAI-compatible fallback)
// ============================================================================

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simple timer for tracking elapsed time in minutes
 */
class Timer {
  private startTime: number;
  private lastLap: number;

  constructor() {
    this.startTime = Date.now();
    this.lastLap = this.startTime;
  }

  /** Get total elapsed time since timer started (in minutes) */
  elapsed(): number {
    return (Date.now() - this.startTime) / 1000 / 60;
  }

  /** Get time since last lap call (in minutes) */
  lap(): number {
    const now = Date.now();
    const elapsed = (now - this.lastLap) / 1000 / 60;
    this.lastLap = now;
    return elapsed;
  }

  /** Format time in minutes with 2 decimal places */
  static format(minutes: number): string {
    if (minutes < 1) {
      return `${Math.round(minutes * 60)}s`;
    }
    return `${minutes.toFixed(2)}min`;
  }
}

/**
 * Calculate exponential backoff delay with jitter
 * Uses "full jitter" strategy: random between 0 and 2^attempt * baseDelay
 */
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = Math.min(
    AI_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
    AI_MAX_RETRY_DELAY_MS
  );
  // Add jitter: +/- 25% random variation
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, exponentialDelay + jitter);
}

/**
 * Check if an error is a rate limit error (429) that should be retried
 */
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

/**
 * Execute an async function with exponential backoff retry logic
 * Specifically designed to handle 429 rate limit errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries: number = AI_MAX_RETRIES
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if it's not a rate limit error or we've exhausted retries
      if (!isRateLimitError(error) || attempt >= maxRetries) {
        throw lastError;
      }

      const delay = calculateRetryDelay(attempt);
      console.warn(`[digest] ${context} hit rate limit (attempt ${attempt + 1}/${maxRetries + 1}), retrying after ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
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
              console.warn(`[digest] Gemini failed, switching to OpenAI-compatible fallback (${state.openaiApiBase}, model=${state.openaiModel}). Reason: ${reason}`);
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
  // Strip markdown code blocks if present
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(jsonText) as T;
}

// ============================================================================
// AI Scoring
// ============================================================================

function buildScoringPrompt(articles: Array<{ index: number; title: string; description: string; sourceName: string }>): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\n${a.description.slice(0, 300)}`
  ).join('\n\n---\n\n');

  return `你是一个专注于AI前沿技术的策展人，正在为一份面向AI研究者和从业者的每日摘要筛选文章。

**特别关注领域：** AI模型（LLM架构、多模态、Agentic AI、智能体）、**工程实践与工具**、行业洞察、具身智能（世界模型、VLA）、**前沿研究论文**（ArXiv 最新成果）

请对以下文章进行三个维度的评分（1-10 整数，10 分最高），并为每篇文章分配一个分类标签和提取 2-4 个关键词。

## 评分维度

### 1. 相关性 (relevance) - 对AI/技术从业者的价值
**⭐ 平衡覆盖多元技术领域：**
- **10: LLM架构突破、Agentic AI、重要开源工具/框架、深度技术分析、工程最佳实践、模型训练/优化**
- 9: AI/ML前沿研究、多模态模型、具身智能（VLA模型、世界模型、机器人）、系统设计
- 7-8: 机器学习应用、编程语言特性、技术观点、计算机视觉、NLP技术
- 5-6: 对特定技术领域有价值
- 1-4: 与AI/技术行业关联不大

### 2. 质量 (quality) - 文章本身的深度和写作质量
- 10: 深度分析，原创洞见，引用丰富（论文+实验+benchmark）
- 7-9: 有深度，观点独到，技术细节充分
- 4-6: 信息准确，表达清晰
- 1-3: 浅尝辄止或纯转述

### 3. 时效性 (timeliness) - 当前是否值得阅读
- 10: 正在发生的重大事件/刚发布的重要工具/框架/最新论文
- 7-9: 近期热点相关
- 4-6: 常青内容，不过时
- 1-3: 过时或无时效价值

## 分类标签（必须从以下选一个）

### 基础分类（适用于博客文章、技术贴）
- ai-ml: AI模型、LLM、多模态、Agentic AI、具身智能、通用机器学习
- security: 安全、隐私、漏洞、加密相关
- engineering: 软件工程、架构、编程语言、系统设计
- tools: 开发工具、开源项目、新发布的库/框架
- opinion: 行业观点、个人思考、职业发展、文化评论
- other: 以上都不太适合的

### ArXiv 论文分类（仅用于 ArXiv 来源的学术论文）
- arxiv-cl: 计算与语言（CS.CL）- NLP、LLM、对话系统、机器翻译、语音识别
- arxiv-lg: 机器学习（CS.LG）- ML 理论、深度学习、强化学习、贝叶斯方法
- arxiv-cv: 计算机视觉（CS.CV）- 图像识别、目标检测、视频分析、3D 视觉
- arxiv-ai: 人工智能（CS.AI）- 通用 AI、知识推理、规划、多智能体系统
- arxiv-ro: 机器人学（CS.RO）- 机器人控制、运动规划、SLAM、操纵
- arxiv-sy: 系统与控制（CS.SY）- 控制理论、系统优化、自动化、信号处理
- arxiv-ne: 神经与进化计算（CS.NE）- 神经网络架构、进化算法、遗传算法
- arxiv-hc: 人机交互（CS.HC）- HCI、用户界面、交互设计、可视化
- arxiv-emb: 具身与导航 - Embodied AI、视觉导航、SLAM、机器人学习、VLA模型、传感器-运动控制
- arxiv-wm: 世界模型 - 环境模型、世界仿真、动力学预测、基于模型的强化学习、视频预测
- arxiv-mllm: 多模态LLM - 视觉-语言模型、多模态理解与生成、对齐、视觉指令微调

**重要提示**：
- 如果文章来源是 ArXiv（如 "ArXiv CS.AI"、"ArXiv CS.RO"），优先使用对应的 arxiv-* 分类
- 如果来源是博客或媒体，使用基础分类（ai-ml、security 等）

## 关键词提取
提取 2-4 个最能代表文章主题的关键词（用英文，简短）。
**优先关键词：** LLM, agent, multimodal, transformer, engineering, tools, framework, VLA, world-model, robotics, diffusion, RL, foundation-model, embodied, navigation, SLAM, sensorimotor, vision-language, VLM

## 待评分文章

${articlesList}

请严格按 JSON 格式返回，不要包含 markdown 代码块或其他文字：
{
  "results": [
    {
      "index": 0,
      "relevance": 8,
      "quality": 7,
      "timeliness": 9,
      "category": "engineering",
      "keywords": ["Rust", "compiler", "performance"]
    }
  ]
}`;
}

async function scoreArticlesWithAI(
  articles: Article[],
  aiClient: AIClient
): Promise<Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>> {
  const allScores = new Map<number, { relevance: number; quality: number; timeliness: number; category: CategoryId; keywords: string[] }>();
  
  const indexed = articles.map((article, index) => ({
    index,
    title: article.title,
    description: article.description,
    sourceName: article.sourceName,
  }));
  
  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }
  
  console.log(`[digest] AI scoring: ${articles.length} articles in ${batches.length} batches`);
  
  const validCategories = new Set<string>([
    'ai-ml', 'security', 'engineering', 'tools', 'opinion', 'other',
    'arxiv-cl', 'arxiv-lg', 'arxiv-cv', 'arxiv-ai',
    'arxiv-ro', 'arxiv-sy', 'arxiv-ne', 'arxiv-hc',
    'arxiv-emb', 'arxiv-wm', 'arxiv-mllm'
  ]);
  
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      try {
        const prompt = buildScoringPrompt(batch);
        const responseText = await aiClient.call(prompt);
        const parsed = parseJsonResponse<GeminiScoringResult>(responseText);
        
        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            const clamp = (v: number) => Math.min(10, Math.max(1, Math.round(v)));
            const cat = (validCategories.has(result.category) ? result.category : 'other') as CategoryId;
            allScores.set(result.index, {
              relevance: clamp(result.relevance),
              quality: clamp(result.quality),
              timeliness: clamp(result.timeliness),
              category: cat,
              keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 4) : [],
            });
          }
        }
      } catch (error) {
        console.warn(`[digest] Scoring batch failed: ${error instanceof Error ? error.message : String(error)}`);
        for (const item of batch) {
          allScores.set(item.index, { relevance: 5, quality: 5, timeliness: 5, category: 'other', keywords: [] });
        }
      }
    });
    
    await Promise.all(promises);
    console.log(`[digest] Scoring progress: ${Math.min(i + MAX_CONCURRENT_GEMINI, batches.length)}/${batches.length} batches`);
  }
  
  return allScores;
}

// ============================================================================
// AI Summarization
// ============================================================================

function buildSummaryPrompt(
  articles: Array<{ index: number; title: string; description: string; sourceName: string; link: string }>,
  lang: 'zh' | 'en'
): string {
  const articlesList = articles.map(a =>
    `Index ${a.index}: [${a.sourceName}] ${a.title}\nURL: ${a.link}\n${a.description.slice(0, 800)}`
  ).join('\n\n---\n\n');

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

## 待摘要文章

${articlesList}

请严格按 JSON 格式返回：
{
  "results": [
    {
      "index": 0,
      "titleZh": "中文翻译的标题",
      "summary": "摘要内容...",
      "reason": "推荐理由..."
    }
  ]
}`;
}

async function summarizeArticles(
  articles: Array<Article & { index: number }>,
  aiClient: AIClient,
  lang: 'zh' | 'en'
): Promise<Map<number, { titleZh: string; summary: string; reason: string }>> {
  const summaries = new Map<number, { titleZh: string; summary: string; reason: string }>();

  const indexed = articles.map(a => ({
    index: a.index,
    title: a.title,
    description: a.description,
    sourceName: a.sourceName,
    link: a.link,
  }));

  const batches: typeof indexed[] = [];
  for (let i = 0; i < indexed.length; i += GEMINI_BATCH_SIZE) {
    batches.push(indexed.slice(i, i + GEMINI_BATCH_SIZE));
  }

  console.log(`[digest] Generating summaries for ${articles.length} articles in ${batches.length} batches`);

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_GEMINI) {
    const batchGroup = batches.slice(i, i + MAX_CONCURRENT_GEMINI);
    const promises = batchGroup.map(async (batch) => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
        try {
          const prompt = buildSummaryPrompt(batch, lang);
          const responseText = await aiClient.call(prompt);
          const parsed = parseJsonResponse<GeminiSummaryResult>(responseText);

          if (parsed.results && Array.isArray(parsed.results)) {
            for (const result of parsed.results) {
              summaries.set(result.index, {
                titleZh: result.titleZh || '',
                summary: result.summary || '',
                reason: result.reason || '',
              });
            }
          }

          // Success: break retry loop
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Don't retry on last attempt
          if (attempt >= AI_MAX_RETRIES) {
            break;
          }

          const delay = Math.min(
            AI_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
            AI_MAX_RETRY_DELAY_MS
          );

          console.warn(`[digest] Summary batch failed (attempt ${attempt + 1}/${AI_MAX_RETRIES + 1}), retrying after ${Math.round(delay / 1000)}s: ${lastError.message}`);
          await sleep(delay);
        }
      }

      // All retries exhausted: use fallback
      console.warn(`[digest] Summary batch failed after ${AI_MAX_RETRIES + 1} attempts, using fallback`);
      for (const item of batch) {
        summaries.set(item.index, { titleZh: item.title, summary: item.title, reason: '' });
      }
    });

    await Promise.all(promises);
    console.log(`[digest] Summary progress: ${Math.min(i + MAX_CONCURRENT_GEMINI, batches.length)}/${batches.length} batches`);
  }

  return summaries;
}

// ============================================================================
// AI Highlights (Today's Trends)
// ============================================================================

async function generateHighlights(
  articles: ScoredArticle[],
  aiClient: AIClient,
  lang: 'zh' | 'en'
): Promise<string> {
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
    console.warn(`[digest] Highlights generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

// ============================================================================
// Visualization Helpers
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

function generateKeywordBarChart(articles: ScoredArticle[]): string {
  const kwCount = new Map<string, number>();
  for (const a of articles) {
    for (const kw of a.keywords) {
      const normalized = kw.toLowerCase();
      kwCount.set(normalized, (kwCount.get(normalized) || 0) + 1);
    }
  }

  const sorted = Array.from(kwCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  if (sorted.length === 0) return '';

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

function generateCategoryPieChart(articles: ScoredArticle[]): string {
  const catCount = new Map<CategoryId, number>();
  for (const a of articles) {
    catCount.set(a.category, (catCount.get(a.category) || 0) + 1);
  }

  if (catCount.size === 0) return '';

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

function generateAsciiBarChart(articles: ScoredArticle[]): string {
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

function generateTagCloud(articles: ScoredArticle[]): string {
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

  if (sorted.length === 0) return '';

  return sorted
    .map(([word, count], i) => i < 3 ? `**${word}**(${count})` : `${word}(${count})`)
    .join(' · ');
}

// ============================================================================
// Report Generation
// ============================================================================

function generateDigestReport(articles: ScoredArticle[], highlights: string, stats: {
  totalFeeds: number;
  successFeeds: number;
  totalArticles: number;
  filteredArticles: number;
  hours: number;
  lang: string;
  feedErrors?: FeedError[];
}): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  let report = `# 📰 AI 博客每日精选 — ${dateStr}\n\n`;
  report += `> 来自 Karpathy 推荐的 ${stats.totalFeeds} 个顶级技术博客，AI 精选 Top ${articles.length}\n\n`;

  // ── Today's Highlights ──
  if (highlights) {
    report += `## 📝 今日看点\n\n`;
    report += `${highlights}\n\n`;
    report += `---\n\n`;
  }

  // ── Feeds Status ──
  if (stats.feedErrors && stats.feedErrors.length > 0) {
    report += `## ⚠️ Feeds状态\n\n`;
    report += `成功获取 ${stats.successFeeds}/${stats.totalFeeds} 个feeds，${stats.feedErrors.length} 个失败\n\n`;

    // 按错误类型分组
    const errorsByType = new Map<string, FeedError[]>();
    for (const error of stats.feedErrors) {
      const list = errorsByType.get(error.errorType) || [];
      list.push(error);
      errorsByType.set(error.errorType, list);
    }

    for (const [errorType, errors] of errorsByType) {
      const typeLabel = {
        '404': '🔴 404错误',
        'timeout': '⏱️ 超时',
        'network': '🌐 网络错误',
        'parse': '📄 解析错误',
        'other': '❓ 其他错误'
      }[errorType] || errorType;

      report += `### ${typeLabel} (${errors.length})\n\n`;
      for (const error of errors) {
        report += `- **${error.feedName}**: ${error.message}\n`;
      }
      report += '\n';
    }

    report += `---\n\n`;
  }

  // ── Top 3 Deep Showcase ──
  if (articles.length >= 3) {
    report += `## 🏆 今日必读\n\n`;
    for (let i = 0; i < Math.min(3, articles.length); i++) {
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

  // ── Visual Statistics ──
  report += `## 📊 数据概览\n\n`;

  report += `| 扫描源 | 抓取文章 | 时间范围 | 精选 |\n`;
  report += `|:---:|:---:|:---:|:---:|\n`;
  report += `| ${stats.successFeeds}/${stats.totalFeeds} | ${stats.totalArticles} 篇 → ${stats.filteredArticles} 篇 | ${stats.hours}h | **${articles.length} 篇** |\n\n`;

  const pieChart = generateCategoryPieChart(articles);
  if (pieChart) {
    report += `### 分类分布\n\n${pieChart}\n`;
  }

  const barChart = generateKeywordBarChart(articles);
  if (barChart) {
    report += `### 高频关键词\n\n${barChart}\n`;
  }

  const asciiChart = generateAsciiBarChart(articles);
  if (asciiChart) {
    report += `<details>\n<summary>📈 纯文本关键词图（终端友好）</summary>\n\n${asciiChart}\n</details>\n\n`;
  }

  const tagCloud = generateTagCloud(articles);
  if (tagCloud) {
    report += `### 🏷️ 话题标签\n\n${tagCloud}\n\n`;
  }

  report += `---\n\n`;

  // ── Category-Grouped Articles ──
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

  // ── Footer ──
  report += `*生成于 ${dateStr} ${now.toISOString().split('T')[1]?.slice(0, 5) || ''} | 扫描 ${stats.successFeeds} 源 → 获取 ${stats.totalArticles} 篇 → 精选 ${articles.length} 篇*\n`;
  report += `*基于 [Hacker News Popularity Contest 2025](https://refactoringenglish.com/tools/hn-popularity/) RSS 源列表，由 [Andrej Karpathy](https://x.com/karpathy) 推荐*\n`;
  report += `*由「懂点儿AI」制作，欢迎关注同名微信公众号获取更多 AI 实用技巧 💡*\n`;

  return report;
}

// ============================================================================
// CLI
// ============================================================================

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
  throw new Error('process.exit failed'); // TypeScript never return
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) printUsage();

  let hours = 24;  // Default to 24h for latest AI/Robotics content
  let topN = 15;
  let lang: 'zh' | 'en' = 'zh';
  let outputPath = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--hours' && args[i + 1]) {
      hours = parseInt(args[++i]!, 10);
    } else if (arg === '--top-n' && args[i + 1]) {
      topN = parseInt(args[++i]!, 10);
    } else if (arg === '--lang' && args[i + 1]) {
      lang = args[++i] as 'zh' | 'en';
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = args[++i]!;
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openaiApiBase = process.env.OPENAI_API_BASE;
  const openaiModel = process.env.OPENAI_MODEL;

  if (!geminiApiKey && !openaiApiKey) {
    console.error('[digest] Error: Missing API key. Set GEMINI_API_KEY and/or OPENAI_API_KEY.');
    console.error('[digest] Gemini key: https://aistudio.google.com/apikey');
    process.exit(1);
  }

  const aiClient = createAIClient({
    geminiApiKey,
    openaiApiKey,
    openaiApiBase,
    openaiModel,
  });

  if (!outputPath) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    outputPath = `./digest-${dateStr}.md`;
  }

  console.log(`[digest] === AI Daily Digest ===`);
  console.log(`[digest] Time range: ${hours} hours`);
  console.log(`[digest] Top N: ${topN}`);
  console.log(`[digest] Language: ${lang}`);
  console.log(`[digest] Output: ${outputPath}`);
  console.log(`[digest] AI provider: ${geminiApiKey ? 'Gemini (primary)' : 'OpenAI-compatible (primary)'}`);
  if (openaiApiKey) {
    const resolvedBase = (openaiApiBase?.trim() || OPENAI_DEFAULT_API_BASE).replace(/\/+$/, '');
    const resolvedModel = openaiModel?.trim() || inferOpenAIModel(resolvedBase);
    console.log(`[digest] Fallback: ${resolvedBase} (model=${resolvedModel})`);
  }
  console.log('');

  // Start timing
  const timer = new Timer();

  console.log(`[digest] Step 1/5: Fetching ${RSS_FEEDS.length} RSS feeds...`);
  const { articles: allArticles, errors: feedErrors } = await fetchAllFeeds(RSS_FEEDS);
  console.log(`[digest] ✓ Step 1 completed in ${Timer.format(timer.lap())}`);

  if (allArticles.length === 0) {
    console.error('[digest] Error: No articles fetched from any feed. Check network connection.');
    process.exit(1);
  }

  console.log(`[digest] Step 2/5: Filtering by time range (${hours} hours)...`);
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentArticles = allArticles.filter(a => a.pubDate.getTime() > cutoffTime.getTime());

  console.log(`[digest] Found ${recentArticles.length} articles within last ${hours} hours`);
  console.log(`[digest] ✓ Step 2 completed in ${Timer.format(timer.lap())}`);

  if (recentArticles.length === 0) {
    console.error(`[digest] Error: No articles found within the last ${hours} hours.`);
    console.error(`[digest] Try increasing --hours (e.g., --hours 168 for one week)`);
    process.exit(1);
  }

  console.log(`[digest] Step 3/5: AI scoring ${recentArticles.length} articles...`);
  const scores = await scoreArticlesWithAI(recentArticles, aiClient);
  console.log(`[digest] ✓ Step 3 completed in ${Timer.format(timer.lap())}`);

  const scoredArticles = recentArticles.map((article, index) => {
    const score = scores.get(index) || { relevance: 5, quality: 5, timeliness: 5, category: 'other' as CategoryId, keywords: [] };
    return {
      ...article,
      totalScore: score.relevance + score.quality + score.timeliness,
      breakdown: score,
    };
  });

  // 新逻辑：确保每个分类至少有一篇文章
  // 1. 按分类分组，获取每个分类的最高分文章
  const categoryGroups = new Map<CategoryId, TempScoredArticle[]>();
  for (const article of scoredArticles) {
    const cat = article.breakdown.category;
    if (!categoryGroups.has(cat)) {
      categoryGroups.set(cat, []);
    }
    categoryGroups.get(cat)!.push(article);
  }

  // 2. 从每个分类选取最高分的文章
  const topByCategory: TempScoredArticle[] = [];
  for (const [category, articles] of categoryGroups.entries()) {
    articles.sort((a, b) => b.totalScore - a.totalScore);
    topByCategory.push(articles[0]); // 取该分类最高分文章
  }

  // 3. 按分数排序所有文章，用于补充剩余名额
  const allSorted = [...scoredArticles].sort((a, b) => b.totalScore - a.totalScore);

  // 4. 构建最终文章列表
  const selected = new Set<TempScoredArticle>();
  const selectedArticles: TempScoredArticle[] = [];

  // 4.1 首先添加每个分类的最高分文章
  for (const article of topByCategory) {
    if (selectedArticles.length < topN) {
      selectedArticles.push(article);
      selected.add(article);
    }
  }

  // 4.2 如果还有名额，从剩余文章中按分数排序补充
  if (selectedArticles.length < topN) {
    for (const article of allSorted) {
      if (!selected.has(article) && selectedArticles.length < topN) {
        selectedArticles.push(article);
        selected.add(article);
      }
    }
  }

  // 5. 按总分排序最终列表
  const topArticles = selectedArticles.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`[digest] Top ${topN} articles selected (covered ${categoryGroups.size} categories, score range: ${topArticles[topArticles.length - 1]?.totalScore || 0} - ${topArticles[0]?.totalScore || 0})`);

  console.log(`[digest] Step 4/5: Generating AI summaries...`);
  const indexedTopArticles = topArticles.map((a, i) => ({ ...a, index: i }));
  const summaries = await summarizeArticles(indexedTopArticles, aiClient, lang);
  console.log(`[digest] ✓ Step 4 completed in ${Timer.format(timer.lap())}`);

  const finalArticles: ScoredArticle[] = topArticles.map((a, i) => {
    const sm = summaries.get(i) || { titleZh: a.title, summary: a.description.slice(0, 200), reason: '' };
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
  console.log(`[digest] ✓ Step 5 completed in ${Timer.format(timer.lap())}`);

  const successfulSources = new Set(allArticles.map(a => a.sourceName));

  const report = generateDigestReport(finalArticles, highlights, {
    totalFeeds: RSS_FEEDS.length,
    successFeeds: successfulSources.size,
    totalArticles: allArticles.length,
    filteredArticles: recentArticles.length,
    hours,
    lang,
    feedErrors,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report);

  console.log('');
  console.log(`[digest] ✅ Done!`);
  console.log(`[digest] 📁 Report: ${outputPath}`);
  console.log(`[digest] 📊 Stats: ${successfulSources.size} sources → ${allArticles.length} articles → ${recentArticles.length} recent → ${finalArticles.length} selected`);
  console.log(`[digest] ⏱ Total time: ${Timer.format(timer.elapsed())}`);
  
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

await main().catch((err) => {
  console.error(`[digest] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
