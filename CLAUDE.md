# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Daily Digest is an intelligent RSS aggregation tool that fetches articles from 98 RSS sources (90 top technical blogs curated by Andrej Karpathy's Hacker News Popularity Contest 2025, plus ArXiv paper feeds and AI lab blogs) and uses AI to score, filter, and generate structured daily digests with Chinese translations. The project is a zero-dependency TypeScript application that runs on Bun.

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

**1. RSS Feed Layer** (lines 18-129, 190-380)
- 98 RSS feed definitions: 90 from Karpathy's curated list + 8 extended sources
  - **Original 90**: Individual technical blogs (category: `blog`, default)
  - **ArXiv feeds** (3): cs.AI, cs.RO, cs.LG for AI/ML/Robotics papers (category: `arxiv`)
  - **AI Lab Blogs** (3): Google DeepMind, OpenAI, Anthropic (category: `ai-lab`)
  - **Research Labs** (2): BAIR Berkeley, MIT AI (category: `research`)
- Concurrent fetching with controlled concurrency (10 parallel, 15s timeout)
- XML parsing for both RSS 2.0 and Atom formats with manual CDATA handling
- Resilient error handling - individual feed failures don't stop execution

**Feed Categories:**
- `blog`: Individual technical blogs (default for original 90 feeds)
- `arxiv`: ArXiv preprint repositories (cs.AI, cs.RO, cs.LG)
- `ai-lab`: Corporate research labs (OpenAI, DeepMind, Anthropic)
- `research`: University research groups (BAIR, MIT)
- `conference`: Academic conferences (reserved for future)

**2. AI Provider Layer** (lines 369-480)
- Primary: Gemini API (`gemini-2.0-flash`)
- Fallback: OpenAI-compatible APIs (DeepSeek, OpenAI, etc.)
- `createAIClient()` factory function with automatic failover
- Both providers implement the same `AIClient` interface: `call(prompt: string): Promise<string>`

**3. Scoring System** (lines 567-623)
- Three-dimensional scoring: relevance, quality, timeliness (1-10 scale)
- Six-category classification: `ai-ml`, `security`, `engineering`, `tools`, `opinion`, `other`
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

Six hardcoded categories with emoji and label mappings in `CATEGORY_META`:
- `ai-ml`: 🤖 AI / ML
- `security`: 🔒 Security
- `engineering`: ⚙️ Engineering
- `tools`: 🛠 Tools / Open Source
- `opinion`: 💡 Opinion / Miscellaneous
- `other`: 📝 Other

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
