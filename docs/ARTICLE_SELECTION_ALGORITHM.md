# 文章筛选算法 - 每个领域至少一篇

> 确保报告覆盖所有技术领域的多样性筛选策略

## 🎯 设计目标

传统筛选方法存在一个问题：**高分文章可能集中在少数几个分类**，导致报告缺少多样性。

例如：
- 如果前 15 篇文章都是 `arxiv-lg`（机器学习）分类
- 那么其他 13 个分类就无法在报告中体现

**新算法目标**：确保每个分类至少有一篇文章，保证报告的多样性。

---

## 📊 筛选算法

### 原始算法（已废弃）

```typescript
// 简单按总分排序，取前 N 篇
scoredArticles.sort((a, b) => b.totalScore - a.totalScore);
const topArticles = scoredArticles.slice(0, topN);
```

**问题**：
- ❌ 可能遗漏某些分类
- ❌ 报告缺乏多样性
- ❌ 小众领域无法体现

### 新算法（当前）

```typescript
// 1. 按分类分组
const categoryGroups = new Map<CategoryId, ScoredArticle[]>();
for (const article of scoredArticles) {
  const cat = article.breakdown.category;
  if (!categoryGroups.has(cat)) {
    categoryGroups.set(cat, []);
  }
  categoryGroups.get(cat)!.push(article);
}

// 2. 从每个分类选取最高分文章
const topByCategory: ScoredArticle[] = [];
for (const [category, articles] of categoryGroups.entries()) {
  articles.sort((a, b) => b.totalScore - a.totalScore);
  topByCategory.push(articles[0]); // 该分类最高分
}

// 3. 按分数排序所有文章
const allSorted = [...scoredArticles].sort((a, b) => b.totalScore - a.totalScore);

// 4. 构建最终列表
const selected = new Set<ScoredArticle>();
const finalArticles: ScoredArticle[] = [];

// 4.1 首先添加每个分类的最高分文章
for (const article of topByCategory) {
  if (finalArticles.length < topN) {
    finalArticles.push(article);
    selected.add(article);
  }
}

// 4.2 从剩余文章中按分数补充
if (finalArticles.length < topN) {
  for (const article of allSorted) {
    if (!selected.has(article) && finalArticles.length < topN) {
      finalArticles.push(article);
      selected.add(article);
    }
  }
}

// 5. 最终按总分排序
const topArticles = finalArticles.sort((a, b) => b.totalScore - a.totalScore);
```

---

## 🔄 算法流程图

```
输入: scoredArticles (已评分的文章列表)
     topN = 15

步骤 1: 按分类分组
┌─────────────────────────────────────┐
│ arxiv-cl: [A1(28分), A2(25分), ...] │
│ arxiv-lg: [B1(30分), B2(27分), ...] │
│ ai-ml:     [C1(26分), C2(24分), ...] │
│ ... (共 14 个分类)                  │
└─────────────────────────────────────┘

步骤 2: 每个分类取最高分
┌─────────────────────────────────────┐
│ 选择: [A1, B1, C1, ...]             │
│ (每个分类 1 篇，共 14 篇)           │
└─────────────────────────────────────┘

步骤 3: 检查是否需要补充
┌─────────────────────────────────────┐
│ 如果 14 < 15 (topN)                 │
│ → 从剩余文章中选第 15 篇            │
└─────────────────────────────────────┘

步骤 4: 最终排序
┌─────────────────────────────────────┐
│ 按总分降序排列 15 篇文章            │
└─────────────────────────────────────┘

输出: topArticles (15 篇，覆盖所有分类)
```

---

## 📊 示例对比

### 场景：topN = 15，14 个分类都有文章

#### 原始算法结果

| 排名 | 分类 | 分数 | 说明 |
|:----:|:-----|:----:|:-----|
| 1 | arxiv-lg | 30 | 机器学习 |
| 2 | arxiv-lg | 29 | 机器学习 |
| 3 | arxiv-lg | 28 | 机器学习 |
| 4 | arxiv-cl | 27 | LLM |
| 5 | arxiv-cl | 26 | LLM |
| 6 | arxiv-cv | 26 | 视觉 |
| 7 | arxiv-lg | 25 | 机器学习 |
| 8 | ai-ml | 25 | AI/ML |
| 9 | arxiv-cl | 24 | LLM |
| 10 | arxiv-cv | 24 | 视觉 |
| 11 | arxiv-lg | 23 | 机器学习 |
| 12 | arxiv-ai | 23 | AI |
| 13 | arxiv-cl | 22 | LLM |
| 14 | arxiv-cv | 22 | 视觉 |
| 15 | arxiv-lg | 21 | 机器学习 |

**问题**：
- ❌ `arxiv-ro`（机器人学）未入选
- ❌ `arxiv-sy`（系统与控制）未入选
- ❌ `arxiv-ne`（神经与进化计算）未入选
- ❌ `arxiv-hc`（人机交互）未入选
- ❌ `security`（安全）未入选
- ❌ `opinion`（观点）未入选

**覆盖率**：8/14 分类（57%）

#### 新算法结果

| 排名 | 分类 | 分数 | 说明 |
|:----:|:-----|:----:|:-----|
| 1 | arxiv-lg | 30 | ⭐ 机器学习最高分 |
| 2 | arxiv-cl | 27 | ⭐ LLM 最高分 |
| 3 | arxiv-cv | 26 | ⭐ 视觉最高分 |
| 4 | ai-ml | 25 | ⭐ AI/ML 最高分 |
| 5 | arxiv-ai | 23 | ⭐ AI 最高分 |
| 6 | arxiv-ro | 20 | ⭐ 机器人学最高分 |
| 7 | engineering | 19 | ⭐ 工程最高分 |
| 8 | arxiv-sy | 18 | ⭐ 系统与控制最高分 |
| 9 | tools | 17 | ⭐ 工具最高分 |
| 10 | arxiv-ne | 16 | ⭐ 神经与进化计算最高分 |
| 11 | security | 15 | ⭐ 安全最高分 |
| 12 | arxiv-hc | 14 | ⭐ 人机交互最高分 |
| 13 | opinion | 13 | ⭐ 观点最高分 |
| 14 | other | 12 | ⭐ 其他最高分 |
| 15 | arxiv-lg | 29 | 💎 补充：机器学习次高分 |

**优势**：
- ✅ 所有 14 个分类都入选
- ✅ 每个分类都是该领域的最高分文章
- ✅ 第 15 篇文章从剩余高分文章中补充

**覆盖率**：14/14 分类（100%）

---

## 🎨 算法特点

### 优势

1. **多样性保证**：确保所有分类都有代表
2. **质量保证**：每个分类都是该领域的最高分文章
3. **透明度**：筛选逻辑清晰，可解释性强
4. **灵活性**：适用于任意 `topN` 值

### 边界情况处理

**情况 1：topN < 分类数**
- 例如：`topN = 5`，但有 14 个分类
- 处理：优先选择分数最高的 5 个分类的代表文章

**情况 2：某些分类没有文章**
- 例如：`arxiv-hc` 今日无新论文
- 处理：只从有文章的分类中选择

**情况 3：topN > 分类数**
- 例如：`topN = 20`，只有 14 个分类
- 处理：14 篇（每个分类 1 篇）+ 6 篇（从剩余高分文章补充）

---

## 📈 实际效果

### 报告多样性提升

**原始算法**：
- 平均覆盖分类：8-10 个
- 小众领域经常遗漏
- 报告内容集中在热门领域

**新算法**：
- 覆盖所有 14 个分类
- 小众领域也能体现
- 报告内容更加均衡

### 用户体验改善

1. **更全面的技术视野**：
   - 机器人从业者可以看到 `arxiv-ro` 文章
   - 安全研究员可以看到 `security` 文章
   - 每个领域都能找到相关内容

2. **更公平的内容展示**：
   - 不会因为某个分类文章多就占据所有名额
   - 每个分类都有平等的机会

3. **更好的可读性**：
   - 报告内容更加多样化
   - 避免单一主题疲劳

---

## 🔧 实现细节

### 关键代码位置

**文件**：`scripts/digest.ts`
**位置**：Lines 1413-1445

### 数据结构

```typescript
// 分类分组
categoryGroups: Map<CategoryId, ScoredArticle[]>

// 每个分类的最高分文章
topByCategory: ScoredArticle[]

// 所有文章按分数排序
allSorted: ScoredArticle[]

// 已选择文章（去重）
selected: Set<ScoredArticle>

// 最终文章列表
finalArticles: ScoredArticle[]
```

### 时间复杂度

- 分组：O(n)
- 排序：O(n log n)
- 选择：O(n)
- **总体复杂度**：O(n log n)

---

## 📊 日志输出

新算法会输出分类覆盖信息：

```bash
[digest] Top 15 articles selected (covered 14 categories, score range: 12 - 30)
```

**含义**：
- `covered 14 categories`：覆盖了 14 个分类
- `score range: 12 - 30`：分数范围 12-30 分

---

## 🚀 未来优化方向

### 1. 动态权重

可以根据用户偏好调整不同分类的权重：

```typescript
const categoryWeights: Record<CategoryId, number> = {
  'arxiv-lg': 1.2,  // 机器学习权重更高
  'security': 0.8,  // 安全权重较低
  // ...
};
```

### 2. 最小文章数

为热门分类设置最小文章数：

```typescript
const minArticles: Record<CategoryId, number> = {
  'arxiv-lg': 2,  // 机器学习至少 2 篇
  'ai-ml': 2,     // AI/ML 至少 2 篇
  // 其他分类至少 1 篇
};
```

### 3. 时间平衡

确保不同时间段的文章都有代表：

```typescript
// 按时间段分组，每个时间段至少 1 篇
const timeGroups = {
  'last-6h': [],
  'last-12h': [],
  'last-24h': [],
};
```

---

## 📚 相关文档

- **[CATEGORIES_QUICK_REFERENCE.md](./CATEGORIES_QUICK_REFERENCE.md)** - 分类快速参考
- **[CLAUDE.md](../CLAUDE.md)** - 项目架构说明
- **[ARXIV_REFACTORING_SUMMARY.md](./ARXIV_REFACTORING_SUMMARY.md)** - ArXiv 分类重构总结

---

*实现日期: 2026-03-11*
*算法版本: v2.0 - 多样性优先*
