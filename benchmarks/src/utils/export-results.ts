import type { BenchmarkResult } from '../constants';

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 中和 CSV 公式注入：Excel/Sheets 会执行以 `= + - @ TAB CR` 开头的单元格，
 * 且**加引号并不能阻止**（引号只影响分隔符解析，不影响公式求值）。
 * 正确做法是给危险单元格前缀一个单引号，使其被当作纯文本。
 *
 * @internal 导出仅供单元测试
 */
export function sanitizeForFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * 转义 CSV 单元格：先中和公式注入，再按 RFC 4180 处理引号/分隔符/换行
 *
 * @internal 导出仅供单元测试
 */
export function escapeCsvCell(value: string): string {
  const sanitized = sanitizeForFormula(value);
  const escaped = sanitized.replace(/"/g, '""');
  if (/[",\n\r]/.test(sanitized)) {
    return `"${escaped}"`;
  }
  return escaped;
}

/**
 * 将基准测试结果导出为 JSON 文件
 */
export function exportResultsAsJSON(results: BenchmarkResult[]): void {
  const data = {
    timestamp: new Date().toISOString(),
    results: results.map(r => ({
      name: r.name,
      duration: r.duration,
      memory: r.memory,
      expectation: r.expectation,
      extra: r.extra
    }))
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(URL.createObjectURL(blob), `rxdb-benchmark-${Date.now()}.json`);
}

/**
 * 将基准测试结果导出为 CSV 文件
 */
export function exportResultsAsCSV(results: BenchmarkResult[]): void {
  const headers = ['测试场景', '耗时(ms)', '内存(MB)', '期望值', '备注'];
  const rows = results.map(r => [
    r.name,
    r.duration.toFixed(2),
    r.memory ? (r.memory / 1024 / 1024).toFixed(2) : '-',
    r.expectation || '-',
    r.extra || '-'
  ]);

  const csv = [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(URL.createObjectURL(blob), `rxdb-benchmark-${Date.now()}.csv`);
}
