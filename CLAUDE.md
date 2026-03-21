# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Daily Digest is an intelligent RSS aggregation tool that fetches articles from 111 RSS sources (90 top technical blogs curated by Andrej Karpathy's Hacker News Popularity Contest 2025, plus 8 ArXiv paper feeds, 3 AI lab blogs, 2 research labs, 2 robotics media sources, and 5 AI media sources) and uses AI to score, filter, and generate structured daily digests with Chinese translations. The project is a zero-dependency TypeScript application that runs on Bun.

## Running the Application

```bash
# Set API keys (Gemini primary, OpenAI-compatible as fallback)
export GEMINI_API_KEY="your-gemini-key"
export OPENAI_API_KEY="your-fallback-key"  # Optional
export OPENAI_API_BASE="https://api.deepseek.com/v1"  # Optional
export OPENAI_MODEL="deepseek-chat"  # Optional, auto-inferred from base

# Run digest generation
npx -y bun scripts/digest.ts --hours 48 --top-n 15 --lang zh --output ./digest.md
```

### Claude Code Skill Integration

The project integrates as a Claude Code Skill via `/digest` command. Configuration persists at `~/.hn-daily-digest/config.json`. See `SKILL.md` for the complete interactive workflow.

## Architecture

The entire application is contained in a single 1185-line TypeScript file (`scripts/digest.ts`). The architecture follows a five-stage pipeline:

```
RSS Fetching → Time Filtering → AI Scoring → AI Summarization → Trend Analysis → Report Generation
```

### Key Components

**1. RSS Feed Layer** (lines 18-380)
- 111 RSS feed definitions across multiple source types
  - **Original 90**: Individual technical blogs (category: `blog`, default)
  - **ArXiv feeds** (8): cs.CL, cs.LG, cs.CV, cs.AI, cs.RO, cs.SY, cs.NE, cs.HC for academic papers (category: `arxiv`)
  - **AI Lab Blogs** (3): Google DeepMind, OpenAI, Anthropic (category: `ai-lab`)
  - **Research Labs** (2): BAIR Berkeley, MIT AI (category: `research`)
  - **Robotics Media** (2): The Robot Report, IEEE Spectrum Automation (category: `robotics-media`)
  - **AI Media** (5): MIT Technology Review AI, VentureBeat AI, AI News, Synced, TNW AI (category: `ai-media`)
- Concurrent fetching with controlled concurrency (10 parallel, 15s timeout)
- XML parsing for both RSS 2.0 and Atom formats with manual CDATA handling
- Resilient error handling - individual feed failures don't stop execution

**Feed Source Categories:**
- `blog`: Individual technical blogs (default for original 90 feeds)
- `arxiv`: ArXiv preprint repositories (8 CS subcategories)
- `ai-lab`: Corporate research labs (OpenAI, DeepMind, Anthropic)
- `research`: University research groups (BAIR, MIT)
- `robotics-media`: Robotics industry news sources
- `ai-media`: AI-focused news and media outlets
- `conference`: Academic conferences (reserved for future)

**2. AI Provider Layer** (lines 369-480)
- Primary: Gemini API (`gemini-2.0-flash`)
- Fallback: OpenAI-compatible APIs (DeepSeek, OpenAI, etc.)
- `createAIClient()` factory function with automatic failover
- Both providers implement the same `AIClient` interface: `call(prompt: string): Promise<string>`

**3. Scoring System** (lines 567-623)
- Three-dimensional scoring: relevance, quality, timeliness (1-10 scale)
- Fourteen-category classification (6 basic + 8 ArXiv-specific, see Category System below)
- AI prioritizes ArXiv-specific categories for academic paper sources
- Batched AI calls (10 articles per batch, 2 concurrent batches)
- Keywords extraction (top 4 per article)

**4. Summarization Layer** (lines 629-720)
- Generates 4-6 sentence structured summaries covering: core problem → key arguments → conclusion
- Chinese title translation
- One-sentence "why worth reading" rationale
- Batched processing for Top N articles only

**5. Report Generator** (lines 888-1000)
- Structured Markdown with multiple visualization formats:
  - Mermaid pie charts (category distribution)
  - Mermaid bar charts (keyword frequency)
  - ASCII text charts (terminal-friendly fallback)
  - Tag clouds
- Bilingual output (English titles preserved as link text, Chinese titles displayed)
- Category-grouped article listing

**6. Trend Analysis** (lines 750-880)
- AI-generated macro trend summaries (2-3 high-level observations)
- Keyword frequency analysis with weighted scoring
- Category distribution statistics

### Data Flow

```typescript
Article {
  title, description, link, pubDate, sourceName
}
↓
ScoredArticle {
  title, titleZh, summary, reason, keywords,
  totalScore, scoreBreakdown: {relevance, quality, timeliness},
  category: CategoryId
}
↓
Markdown Report (6 sections)
```

**7. Article Selection Algorithm** (lines 1413-1445)
- **Diversity-first selection**: Ensures all 14 categories are represented in final report
- Algorithm steps:
  1. Group scored articles by category
  2. Select highest-scoring article from each category
  3. Fill remaining slots with next highest-scoring articles across all categories
  4. Sort final selection by total score
- Guarantees category coverage even when some categories have lower average scores
- Prevents report from being dominated by a single high-scoring category (e.g., machine learning papers)

## Important Constants

Located at top of `scripts/digest.ts`:
- `GEMINI_API_URL`: Gemini endpoint
- `FEED_FETCH_TIMEOUT_MS`: 15 second timeout for RSS feeds
- `FEED_CONCURRENCY`: 10 parallel feed fetches
- `GEMINI_BATCH_SIZE`: 10 articles per AI scoring batch
- `MAX_CONCURRENT_GEMINI`: 2 concurrent AI batches

**External Dependencies:**
- RSSHub public instance (rsshub.app) is used for Anthropic feed
- For production use, consider self-hosting RSSHub for better reliability

## Switching AI Providers

The project is designed for easy AI provider replacement. Only modify:
1. `GEMINI_API_URL` constant (line 9)
2. `callGemini()` function (lines 369-395) - request body format and response parsing
3. Environment variable names and CLI help text

The AI prompts are provider-agnostic and require no changes. For OpenAI-compatible APIs, the existing `callOpenAICompatible()` function can be used as a template.

## Category System

Fourteen categories defined in `CATEGORY_META` (lines 161-178):

### Basic Categories (6)
For blog posts, media articles, and general technical content:
- `ai-ml`: 🤖 AI / ML - General AI, LLMs, multimodal, Agentic AI, embodied intelligence
- `security`: 🔒 Security - Network security, privacy, vulnerabilities, encryption
- `engineering`: ⚙️ Engineering - Software engineering, architecture, system design, programming languages
- `tools`: 🛠 Tools / Open Source - Development tools, open source projects, new libraries/frameworks
- `opinion`: 💡 Opinion / Miscellaneous - Industry perspectives, technical thoughts, career development
- `other`: 📝 Other - Content not fitting above categories

### ArXiv-Specific Categories (8)
Only used for academic papers from ArXiv sources, mapped to ArXiv CS classifications:
- `arxiv-cl`: 🗣️ Computation and Language / LLM - NLP, LLMs, dialogue systems, machine translation, speech recognition (CS.CL)
- `arxiv-lg`: 🧠 Machine Learning - ML theory, deep learning, reinforcement learning, Bayesian methods (CS.LG)
- `arxiv-cv`: 👁️ Computer Vision - Image recognition, object detection, video analysis, 3D vision (CS.CV)
- `arxiv-ai`: 🤖 Artificial Intelligence - General AI, knowledge reasoning, planning, multi-agent systems (CS.AI)
- `arxiv-ro`: 🦾 Robotics - Robot control, motion planning, SLAM, manipulation (CS.RO)
- `arxiv-sy`: 🎛️ Systems and Control - Control theory, system optimization, automation, signal processing (CS.SY)
- `arxiv-ne`: 🔮 Neural and Evolutionary Computing - Neural network architectures, evolutionary algorithms, genetic algorithms (CS.NE)
- `arxiv-hc`: 👤 Human-Computer Interaction - HCI, user interfaces, interaction design, visualization (CS.HC)

**AI Classification Behavior:**
- For ArXiv sources: Prioritizes ArXiv-specific categories based on the paper's CS classification
- For blog/media sources: Uses basic categories based on content
- AI scoring prompt includes detailed guidance for selecting appropriate categories
- See `docs/FEED_CLASSIFICATION.md` and `docs/CATEGORIES_QUICK_REFERENCE.md` for complete details

## Error Handling Strategy

- RSS feed failures: Logged and skipped, doesn't stop execution
- AI API failures: Automatic fallback to OpenAI-compatible provider
- Scoring batch failures: Default scores (5/5/5) assigned, processing continues
- JSON parse failures: Attempts to extract JSON from markdown code blocks
- Individual article failures: Skipped, doesn't prevent report generation

## Configuration Persistence

When used via Claude Code Skill, configuration is stored at:
```
~/.hn-daily-digest/config.json
```

Structure: `geminiApiKey`, `timeRange`, `topN`, `language`, `lastUsed`

## Development Notes

- Zero npm dependencies - uses Bun's built-in `fetch` and XML parsing
- Single-file architecture for portability
- All AI prompts are in Chinese for domestic LLM compatibility
- Date/time handling uses native `Date` object with relative time formatting
- XML parsing manually handles CDATA sections for Atom feeds
- Output is always valid Markdown GitHub/Obsidian rendering

## Documentation

Additional documentation in `docs/`:
- `FEED_CLASSIFICATION.md` - Complete 14-category system with all 111 RSS feed mappings
- `CATEGORIES_QUICK_REFERENCE.md` - Quick reference for category selection
- `ARTICLE_SELECTION_ALGORITHM.md` - Diversity-first selection algorithm details
- `ARXIV_REFACTORING_SUMMARY.md` - ArXiv category implementation summary
