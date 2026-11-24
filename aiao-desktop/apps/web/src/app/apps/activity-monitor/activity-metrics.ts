/** 活动监视器里一行进程（这里是桌面窗口）最少需要的字段。 */
export interface ActivityRow {
  readonly id: string;
  readonly appId: string;
  readonly title: string;
  readonly source: string;
}

/** 度量标签：CPU、内存、能耗、磁盘、网络。 */
export const METRIC_TABS = ['CPU', 'Memory', 'Energy', 'Disk', 'Network'] as const;

export type MetricTab = (typeof METRIC_TABS)[number];

/** 按窗口标题、来源或应用 id 过滤进程行；查询为空时保留原列表。 */
export const filterActivityRows = <T extends ActivityRow>(rows: readonly T[], query: string): readonly T[] => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return rows;
  return rows.filter(row =>
    `${row.title} ${row.source} ${row.appId}`.toLocaleLowerCase().includes(normalized)
  );
};

/** 字符串的稳定散列：同一行在同一个标签下永远显示同一个演示读数。 */
const hash = (value: string): number => {
  let result = 0;
  for (let index = 0; index < value.length; index++) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
};

/** 0..1 的演示读数，随行与标签变化。 */
const demoRatio = (tab: MetricTab, seed: string): number => (hash(`${tab}:${seed}`) % 1000) / 1000;

/** 各标签的演示读数（浏览器窗口不报告真实进程指标，数值由行身份稳定生成）。 */
export const metricValue = (tab: MetricTab, seed: string): string => {
  const ratio = demoRatio(tab, seed);
  switch (tab) {
    case 'CPU':
      return `${(ratio * 80 + 0.4).toFixed(1)}%`;
    case 'Memory':
      return `${(ratio * 900 + 64).toFixed(1)} MB`;
    case 'Energy':
      return `${(ratio * 100).toFixed(1)}`;
    case 'Disk':
      return `${(ratio * 180 + 2).toFixed(1)} MB`;
    case 'Network':
      return `${(ratio * 40 + 0.2).toFixed(1)} KB/s`;
  }
};

/** 各标签的读数说明。 */
export const METRIC_NOTES: Readonly<Record<MetricTab, string>> = {
  CPU: 'Percent of one desktop core.',
  Memory: 'Resident memory estimate.',
  Energy: 'Energy impact score.',
  Disk: 'Bytes read from storage.',
  Network: 'Bytes received per second.'
};
