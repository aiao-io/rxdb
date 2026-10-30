/** 最多同时跑两段，完成一段立即补位，结果保持输入顺序。 */
export const runCoverageSuites = async (suiteNames, runSuite) => {
  const pending = suiteNames.entries();
  const results = [];
  const worker = async () => {
    for (const [index, suiteName] of pending) results[index] = await runSuite(suiteName);
  };
  await Promise.all(Array.from({ length: Math.min(2, suiteNames.length) }, worker));
  return results;
};
