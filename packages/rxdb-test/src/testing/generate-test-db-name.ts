/**
 * 为测试生成简短且唯一的数据库名称。
 */
export const generateTestDbName = (prefix = 'db') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
