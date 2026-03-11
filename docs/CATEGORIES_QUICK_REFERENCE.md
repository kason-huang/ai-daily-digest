# AI Daily Digest - 分类快速参考

> 快速查看所有 14 个内容分类的简洁指南

## 📋 分类总览

```
总计: 14 个分类
├── 基础分类: 6 个（适用于博客、媒体文章）
└── ArXiv 分类: 8 个（适用于学术论文）
```

---

## 🏷️ 基础分类（6 个）

| ID | Emoji | 中文名称 | 适用范围 |
|:--:|:-----:|:---------|:---------|
| `ai-ml` | 🤖 | **AI / ML** | LLM、多模态、Agentic AI、具身智能、通用机器学习 |
| `security` | 🔒 | **安全** | 网络安全、隐私保护、漏洞分析 |
| `engineering` | ⚙️ | **工程** | 软件工程、架构设计、系统设计、编程语言 |
| `tools` | 🛠️ | **工具 / 开源** | 开发工具、开源项目、新发布的库/框架 |
| `opinion` | 💡 | **观点 / 杂谈** | 行业观点、技术思考、职业发展 |
| `other` | 📝 | **其他** | 不适合上述分类的内容 |

---

## 🎓 ArXiv 分类（8 个）

> 仅用于 ArXiv 来源的学术论文，对应 ArXiv 计算机科学分类

| ID | ArXiv代码 | Emoji | 中文名称 | 研究方向 |
|:--:|:---------:|:-----:|:---------|:---------|
| `arxiv-cl` | CS.CL | 🗣️ | **计算与语言 / LLM** | NLP、LLM、对话系统、机器翻译、语音识别 |
| `arxiv-lg` | CS.LG | 🧠 | **机器学习** | ML 理论、深度学习、强化学习、贝叶斯方法 |
| `arxiv-cv` | CS.CV | 👁️ | **计算机视觉** | 图像识别、目标检测、视频分析、3D 视觉 |
| `arxiv-ai` | CS.AI | 🤖 | **人工智能** | 通用 AI、知识推理、规划、多智能体系统 |
| `arxiv-ro` | CS.RO | 🦾 | **机器人学** | 机器人控制、运动规划、SLAM、操纵 |
| `arxiv-sy` | CS.SY | 🎛️ | **系统与控制** | 控制理论、系统优化、自动化、信号处理 |
| `arxiv-ne` | CS.NE | 🔮 | **神经与进化计算** | 神经网络架构、进化算法、遗传算法 |
| `arxiv-hc` | CS.HC | 👤 | **人机交互** | HCI、用户界面、交互设计、可视化 |

---

## 🎯 分类选择指南

### AI 评分时的分类规则

**1. 优先检查来源：**
- 如果来源是 **ArXiv**（如 "ArXiv CS.AI"、"ArXiv CS.RO"）
  → 优先使用对应的 `arxiv-*` 分类
- 如果来源是 **博客或媒体**
  → 使用基础分类（`ai-ml`、`security` 等）

**2. 基础分类选择：**
- 涉及 AI 模型、LLM、多模态 → `ai-ml`
- 涉及安全、隐私、漏洞 → `security`
- 涉及软件工程、架构、系统设计 → `engineering`
- 涉及开发工具、开源项目 → `tools`
- 行业观点、个人思考 → `opinion`
- 其他 → `other`

**3. ArXiv 分类映射：**
| ArXiv Feed | 分类 ID | 说明 |
|:-----------|:--------|:-----|
| ArXiv CS.CL | `arxiv-cl` | NLP、LLM |
| ArXiv CS.LG | `arxiv-lg` | 机器学习 |
| ArXiv CS.CV | `arxiv-cv` | 计算机视觉 |
| ArXiv CS.AI | `arxiv-ai` | 人工智能 |
| ArXiv CS.RO | `arxiv-ro` | 机器人学 |
| ArXiv CS.SY | `arxiv-sy` | 系统与控制 |
| ArXiv CS.NE | `arxiv-ne` | 神经与进化计算 |
| ArXiv CS.HC | `arxiv-hc` | 人机交互 |

---

## 💻 代码示例

### 导入类型和元数据

```typescript
import { CATEGORY_META, type CategoryId } from '../scripts/digest.ts';

// 获取分类元数据
const meta = CATEGORY_META['arxiv-cl'];
console.log(meta);
// { emoji: '🗣️', label: '计算与语言 / LLM', description: 'ArXiv CS.CL: NLP、LLM、对话系统' }
```

### 按分类筛选文章

```typescript
// 获取所有 LLM 相关的 ArXiv 论文
const llmPapers = articles.filter(a => a.category === 'arxiv-cl');

// 获取所有机器人学相关内容（论文 + 博客）
const robotics = articles.filter(a =>
  a.category === 'arxiv-ro' || a.category === 'ai-ml'
);

// 获取所有基础分类文章（非 ArXiv）
const blogPosts = articles.filter(a => !a.category.startsWith('arxiv-'));
```

### 生成分类统计

```typescript
const categoryStats = articles.reduce((acc, article) => {
  acc[article.category] = (acc[article.category] || 0) + 1;
  return acc;
}, {} as Record<CategoryId, number>);

// 按数量排序
const sorted = Object.entries(categoryStats)
  .sort((a, b) => b[1] - a[1])
  .map(([cat, count]) => {
    const meta = CATEGORY_META[cat as CategoryId];
    return `${meta.emoji} ${meta.label}: ${count} 篇`;
  });

console.log(sorted.join('\n'));
```

### 检查分类类型

```typescript
function isValidCategory(str: string): str is CategoryId {
  return str in CATEGORY_META;
}

// 使用
if (isValidCategory(userInput)) {
  const meta = CATEGORY_META[userInput];
  console.log(`分类: ${meta.emoji} ${meta.label}`);
}
```

---

## 📊 预期文章分布

| 分类 | 预期占比 | 说明 |
|:-----|:--------:|:-----|
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

## 📚 完整文档

- **[FEED_CLASSIFICATION.md](./FEED_CLASSIFICATION.md)** - 完整分类体系文档（包含所有 111 个 RSS feeds 的详细分类映射）
- **[ARXIV_REFACTORING_SUMMARY.md](./ARXIV_REFACTORING_SUMMARY.md)** - ArXiv 分类重构实施总结
- **[CLAUDE.md](../CLAUDE.md)** - 项目架构说明

---

## 🔄 版本历史

- **v1.0** (2026-03-11): 初始版本，14 个分类（6 基础 + 8 ArXiv）
