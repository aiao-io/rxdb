export const uncapitalizeFirst = (lower: string): Uncapitalize<string> => {
  if (!lower) return '';
  return (lower.substring(0, 1).toLowerCase() + lower.substring(1, lower.length)) as Uncapitalize<string>;
};

/**
 * 首字母小写
 * @param str
 * @returns
 */
export const uncapitalize = (str: string): Uncapitalize<string> => {
  if (!str) return '';
  const lower = str.toLowerCase();
  return uncapitalizeFirst(lower);
};
