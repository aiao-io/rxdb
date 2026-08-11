/**
 * 共享 seeder：在测试 / benchmark 中向 collection 批量写入可预测语料。
 *
 * 语料采用确定性生成（无随机性），便于断言"包含/不包含"关键词；同一 seed 下
 * 跨次运行结果完全一致，方便 benchmark 对比。
 */

const TECH_TERMS = ['typescript', 'rxjs', 'sqlite', 'fts5', 'angular', 'react', 'vue', 'rxdb'];
const LIFE_TERMS = ['coffee', 'reading', 'cooking', 'gardening'];
const TRAVEL_TERMS = ['kyoto', 'paris', 'iceland', 'patagonia'];

const CATEGORIES = ['tech', 'life', 'travel'] as const;

/**
 * 生成 N 条 Article 文档。
 *
 * - title 包含可检索关键词（来自三个分类的固定词典）
 * - body 长度约 200 字符，含 1-3 个关键词重复
 * - tags 均匀采样自 `pickN(termsForCategory, 2)`，用于 stringArray FTS 验证
 *
 * @param count - 生成文档数量
 * @returns 待写入的 plain 文档数组（不包含 id/createdAt 等基础字段，由 Entity 层补全）
 */
export const seedArticles = (
  count: number
): Array<{
  title: string;
  body: string;
  category: 'tech' | 'life' | 'travel';
  tags: string[];
  authorId: string;
  viewCount: number;
}> => {
  const out: ReturnType<typeof seedArticles> = [];
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const terms =
      category === 'tech' ? TECH_TERMS
      : category === 'life' ? LIFE_TERMS
      : TRAVEL_TERMS;
    const t1 = terms[i % terms.length];
    const t2 = terms[(i + 1) % terms.length];
    out.push({
      title: `Article ${i}: ${t1} and ${t2}`,
      body: `${t1} introduction. We discuss ${t2} in depth, including ${t1} pitfalls and ${t2} best practices. Article number ${i}.`,
      category,
      tags: [t1, t2],
      authorId: `author-${i % 10}`,
      viewCount: i * 7
    });
  }
  return out;
};

/**
 * 生成 N 条 Comment，绑定到先前 seed 的 article 索引。
 */
export const seedComments = (
  count: number
): Array<{
  articleId: string;
  content: string;
  authorName: string;
}> => {
  const out: ReturnType<typeof seedComments> = [];
  for (let i = 0; i < count; i++) {
    out.push({
      articleId: `article-${i % 100}`,
      content: `Comment ${i}: I really enjoyed this read about ${TECH_TERMS[i % TECH_TERMS.length]}.`,
      authorName: `User ${i % 50}`
    });
  }
  return out;
};
