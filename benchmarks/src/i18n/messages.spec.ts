import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';
import { benchmarkCatalogs } from './runtime';
import { benchmarksEnMessages, benchmarksZhMessages } from './messages';

const zh = new I18n({ locale: 'zh-Hans', catalogs: benchmarkCatalogs, namespace: 'benchmarks' });
const en = new I18n({ locale: 'en', catalogs: benchmarkCatalogs, namespace: 'benchmarks' });

describe('benchmarks 目录', () => {
  it('中英文目录键集合完全一致', () => {
    expect(Object.keys(benchmarksEnMessages).sort()).toEqual(Object.keys(benchmarksZhMessages).sort());
  });

  it('zh-Hans 与 en 均能按默认命名空间翻译', () => {
    expect(zh.t('app.export')).toBe('导出');
    expect(en.t('app.export')).toBe('Export');
    expect(zh.t('results.emptyHint')).toBe('点击右上角「开始测试」运行性能基准测试');
    expect(en.t('results.emptyHint')).toBe('Click "Run benchmarks" in the top-right corner to run the benchmarks');
  });

  it('ICU 参数按语言格式化', () => {
    expect(zh.t('scenario.throughput.singleWrite', { count: 500 })).toBe('单条写入 (500 次)');
    expect(en.t('scenario.throughput.singleWrite', { count: 500 })).toBe('Single write (500 ops)');
    expect(zh.t('scenario.scalability.insertLabel', { sizeK: '10' })).toBe('插入 10K 条数据');
    expect(en.t('scenario.scalability.insertLabel', { sizeK: '10' })).toBe('Insert 10K records');
  });

  it('未命中的 key 返回 key 本身并记录为缺失', () => {
    expect(zh.t('no.such.key')).toBe('no.such.key');
  });
});
