/**
 * 首字母大写
 *
 * @example capitalize('hello') -> 'Hello'
 */
export const capitalize = (str: string): Capitalize<string> => {
  if (!str) return '';
  const lower = str.toLowerCase();
  return capitalizeFirst(lower);
};

export const capitalizeFirst = (lower: string): Capitalize<string> => {
  if (!lower) return '';
  return (lower.substring(0, 1).toUpperCase() + lower.substring(1, lower.length)) as Capitalize<string>;
};
