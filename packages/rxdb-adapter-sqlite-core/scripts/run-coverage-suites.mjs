/** 串行跑各段，结果保持输入顺序。不同段会共享浏览器与数据库资源。 */
export const runCoverageSuites = async (suiteNames, runSuite) => {
  const pending = suiteNames.entries();
  const results = [];
  for (const [index, suiteName] of pending) results[index] = await runSuite(suiteName);
  return results;
};
