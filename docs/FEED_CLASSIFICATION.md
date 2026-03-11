# AI Daily Digest - 完整领域分类体系

本文档详细说明 AI Daily Digest 的 14 个内容分类体系，涵盖 111 个 RSS feeds 的分类映射。

## 📊 总览

| 维度 | 数量 | 说明 |
|------|------|------|
| **RSS Feeds 总数** | 111 | 90 个技术博客 + 8 个 ArXiv 分类 + 8 个 AI Lab/Research/Robotics + 5 个 AI 媒体 |
| **内容分类** | 14 | 6 个基础分类 + 8 个 ArXiv 细分领域 |

---

## 🏷️ 基础分类（6 个）

适用于博客、媒体文章、技术博客等非学术论文内容。

| ID | Emoji | 中文名称 | 英文名称 | 适用范围 | 典型来源 |
|----|-------|---------|---------|---------|---------|
| **ai-ml** | 🤖 | AI / ML | AI / ML | 通用 AI、LLM、多模态、Agentic AI、具身智能 | Simon Willison, Jeff Geerling, Sebastian Goedecke |
| **security** | 🔒 | 安全 | Security | 网络安全、隐私保护、漏洞分析 | Krebs on Security |
| **engineering** | ⚙️ | 工程 | Engineering | 软件工程、架构设计、系统设计、编程语言 | Eric Migurdsky, Maurycy Z. |
| **tools** | 🛠 | 工具 / 开源 | Tools / Open Source | 开发工具、开源项目、新发布的库/框架 | 各种技术博客 |
| **opinion** | 💡 | 观点 / 杂谈 | Opinion / Miscellaneous | 行业观点、技术思考、职业发展 | Daring Fireball, 个人博客 |
| **other** | 📝 | 其他 | Other | 不适合上述分类的内容 | - |

---

## 🎓 ArXiv 细分领域（8 个）

**仅用于 ArXiv 来源的学术论文**，根据 ArXiv 计算机科学分类进行细分。

| ID | ArXiv代码 | Emoji | 中文名称 | 英文名称 | 研究方向 | 典型主题 |
|----|-----------|-------|---------|---------|---------|---------|
| **arxiv-cl** | CS.CL | 🗣️ | 计算与语言 / LLM | Computation and Language | NLP、LLM、对话系统 | Transformer, GPT, BERT, 机器翻译, 语音识别 |
| **arxiv-lg** | CS.LG | 🧠 | 机器学习 | Machine Learning | ML 理论、深度学习、强化学习 | 深度学习, 强化学习, 贝叶斯方法, 优化理论 |
| **arxiv-cv** | CS.CV | 👁️ | 计算机视觉 | Computer Vision | 图像、视频处理、3D 视觉 | 图像识别, 目标检测, 视频分析, 3D 重建 |
| **arxiv-ai** | CS.AI | 🤖 | 人工智能 | Artificial Intelligence | 通用 AI、知识推理、规划 | 知识图谱, 逻辑推理, 多智能体系统 |
| **arxiv-ro** | CS.RO | 🦾 | 机器人学 | Robotics | 机器人控制、运动规划、SLAM | 运动控制, 路径规划, SLAM, 机械臂操纵 |
| **arxiv-sy** | CS.SY | 🎛️ | 系统与控制 | Systems and Control | 控制理论、系统优化、自动化 | 控制理论, 系统优化, 信号处理, 自动化 |
| **arxiv-ne** | CS.NE | 🔮 | 神经与进化计算 | Neural and Evolutionary Computing | 神经网络、进化算法 | 神经网络架构, 进化算法, 遗传算法 |
| **arxiv-hc** | CS.HC | 👤 | 人机交互 | Human-Computer Interaction | HCI、用户界面、交互设计 | 用户界面, 交互设计, 可视化, 用户体验 |

### ArXiv 分类说明

- **CS.CL (Computation and Language)**: 关注计算语言学和自然语言处理，包括大语言模型（LLM）、对话系统、机器翻译等
- **CS.LG (Machine Learning)**: 机器学习理论和应用，包括深度学习、强化学习、贝叶斯方法等
- **CS.CV (Computer Vision)**: 计算机视觉和图像处理，包括图像识别、目标检测、视频分析、3D 视觉等
- **CS.AI (Artificial Intelligence)**: 通用人工智能，包括知识推理、规划、多智能体系统等
- **CS.RO (Robotics)**: 机器人学，包括机器人控制、运动规划、SLAM、操纵等
- **CS.SY (Systems and Control)**: 系统与控制，包括控制理论、系统优化、自动化、信号处理等
- **CS.NE (Neural and Evolutionary Computing)**: 神经网络和进化计算，包括神经网络架构、进化算法、遗传算法等
- **CS.HC (Human-Computer Interaction)**: 人机交互，包括用户界面、交互设计、可视化、用户体验等

---

## 📡 RSS Feeds 分类映射

### 🎯 Karpathy's Hacker News Popularity Contest 2025（90 个技术博客）

**所有 90 个博客均使用基础分类**，根据文章内容动态分类为：`ai-ml`, `security`, `engineering`, `tools`, `opinion`, `other`

完整列表：
1. simonwillison.net - Simon Willison（AI、工具）
2. jeffgeerling.com - Jeff Geerling（工程、AI）
3. seangoedecke.com - Sean Goedecke（技术观点）
4. krebsonsecurity.com - Krebs on Security（**安全**）
5. daringfireball.net - Daring Fireball（**观点**）
6. ericmigi.com - Eric Migurdsky（**工程**）
7. maurycyz.com - Maurycy Z.（**工程**）
...（其余 83 个博客）

### 🎓 ArXiv 论文预印本（8 个分类）

| Feed Name | ArXiv 代码 | 分类 ID | 中文名称 |
|-----------|-----------|---------|---------|
| ArXiv CS.CL | cs.CL | `arxiv-cl` | 计算与语言 / LLM |
| ArXiv CS.LG | cs.LG | `arxiv-lg` | 机器学习 |
| ArXiv CS.CV | cs.CV | `arxiv-cv` | 计算机视觉 |
| ArXiv CS.AI | cs.AI | `arxiv-ai` | 人工智能 |
| ArXiv CS.RO | cs.RO | `arxiv-ro` | 机器人学 |
| ArXiv CS.SY | cs.SY | `arxiv-sy` | 系统与控制 |
| ArXiv CS.NE | cs.NE | `arxiv-ne` | 神经与进化计算 |
| ArXiv CS.HC | cs.HC | `arxiv-hc` | 人机交互 |

### 🏢 AI 实验室博客（3 个）

| Feed Name | 分类 ID | 说明 |
|-----------|---------|------|
| Google DeepMind Blog | `ai-ml` | AI 前沿研究 |
| OpenAI Blog | `ai-ml` | LLM、多模态、Agentic AI |
| Anthropic Blog | `ai-ml` | Claude、AI 安全 |

### 🔬 研究机构博客（2 个）

| Feed Name | 分类 ID | 说明 |
|-----------|---------|------|
| BAIR Berkeley Blog | `ai-ml` | Berkeley AI Research |
| MIT AI Blog | `ai-ml` | MIT CSAIL |

### 🤖 机器人学专业媒体（2 个）

| Feed Name | 分类 ID | 说明 |
|-----------|---------|------|
| The Robot Report | `arxiv-ro` | 机器人行业新闻 |
| IEEE Spectrum Automation | `arxiv-ro` | 自动化和机器人技术 |

### 📰 AI 媒体（5 个）

| Feed Name | 分类 ID | 说明 |
|-----------|---------|------|
| MIT Technology Review AI | `ai-ml` | AI 行业报道 |
| VentureBeat AI | `ai-ml` | AI 商业应用 |
| AI News | `ai-ml` | AI 新闻汇总 |
| Synced (机器之心) | `ai-ml` | 中文 AI 媒体 |
| TNW AI | `ai-ml` | 科技媒体 AI 板块 |

---

## 🔄 分类决策逻辑

### AI 评分时的分类规则

1. **优先检查来源**：
   - 如果 `sourceName` 包含 "ArXiv CS.XX"，优先使用对应的 `arxiv-*` 分类
   - 如果 `sourceName` 是博客/媒体，使用基础分类（`ai-ml`, `security` 等）

2. **ArXiv 论文分类规则**：
   - CS.CL → `arxiv-cl`（NLP、LLM、对话系统）
   - CS.LG → `arxiv-lg`（ML 理论、深度学习）
   - CS.CV → `arxiv-cv`（计算机视觉）
   - CS.AI → `arxiv-ai`（通用 AI、知识推理）
   - CS.RO → `arxiv-ro`（机器人学）
   - CS.SY → `arxiv-sy`（系统与控制）
   - CS.NE → `arxiv-ne`（神经网络、进化计算）
   - CS.HC → `arxiv-hc`（人机交互）

3. **基础分类规则**：
   - 涉及 AI 模型、LLM、多模态 → `ai-ml`
   - 涉及安全、隐私、漏洞 → `security`
   - 涉及软件工程、架构、系统设计 → `engineering`
   - 涉及开发工具、开源项目 → `tools`
   - 行业观点、个人思考 → `opinion`
   - 其他 → `other`

---

## 📈 分类统计

### 预期文章分布

| 分类 | 预期占比 | 说明 |
|------|---------|------|
| `arxiv-lg` | ~20% | 机器学习论文最多 |
| `arxiv-cl` | ~15% | LLM/NLP 研究热门 |
| `arxiv-cv` | ~12% | 计算机视觉论文 |
| `ai-ml` | ~25% | 博客 AI 内容 |
| `engineering` | ~10% | 工程实践文章 |
| `arxiv-ai` | ~5% | 通用 AI 论文 |
| `tools` | ~5% | 开发工具相关 |
| `opinion` | ~3% | 观点类文章 |
| `security` | ~2% | 安全相关 |
| `arxiv-ro` | ~2% | 机器人学论文 |
| `other` | ~1% | 其他内容 |
| `arxiv-sy` | <1% | 系统与控制 |
| `arxiv-ne` | <1% | 神经与进化计算 |
| `arxiv-hc` | <1% | 人机交互 |

---

## 🎯 使用示例

### 1. 查看分类元数据

```typescript
import { CATEGORY_META } from './digest.ts';

console.log(CATEGORY_META['arxiv-cl']);
// Output: { emoji: '🗣️', label: '计算与语言 / LLM', description: 'ArXiv CS.CL: NLP、LLM、对话系统' }
```

### 2. 按 ArXiv 分类筛选文章

```typescript
// 获取所有 LLM 相关的 ArXiv 论文
const llmPapers = articles.filter(a => a.category === 'arxiv-cl');

// 获取所有机器人学相关内容（论文 + 博客）
const robotics = articles.filter(a =>
  a.category === 'arxiv-ro' || a.category === 'ai-ml'
);
```

### 3. 生成分类统计报告

```typescript
const categoryStats = articles.reduce((acc, article) => {
  acc[article.category] = (acc[article.category] || 0) + 1;
  return acc;
}, {} as Record<CategoryId, number>);

console.log(categoryStats);
// Output: { 'arxiv-cl': 15, 'arxiv-lg': 23, 'ai-ml': 45, ... }
```

---

## 📝 更新日志

- **2026-03-11**: 初始版本，添加 8 个 ArXiv 细分领域分类
- **未来计划**: 支持用户自定义分类订阅、按分类筛选 RSS feeds

---

## 🔗 相关文档

- [项目 README](../README.md)
- [CLAUDE.md](../CLAUDE.md) - 项目架构说明
- [SKILL.md](../SKILL.md) - Claude Code Skill 使用指南
