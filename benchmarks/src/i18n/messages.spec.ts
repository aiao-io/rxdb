import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';
import { benchmarksEnMessages, benchmarksZhMessages } from './messages';
import { benchmarkCatalogs } from './runtime';

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

  it('界面装饰文案与清理诊断均按语言解析', () => {
    expect(zh.t('app.footer', { adapter: 'wa-sqlite' })).toBe('RxDB Benchmarks · 本地优先数据基础设施 · wa-sqlite ·');
    expect(en.t('app.footer', { adapter: 'wa-sqlite' })).toBe(
      'RxDB Benchmarks · local-first data infrastructure · wa-sqlite ·'
    );
    expect(zh.t('results.awaitingRun')).toBe('等待运行 · 空闲');
    expect(en.t('results.awaitingRun')).toBe('awaiting run · idle');
    expect(zh.t('score.weightLabel', { weight: 35 })).toBe('权重 35%');
    expect(en.t('score.weightLabel', { weight: 35 })).toBe('w / 35%');
    expect(zh.t('gitDemo.flow')).toBe('克隆 → 状态 → 修改 → 提交 → 分支 → 切换 → 重开');
    expect(en.t('gitDemo.flow')).toBe('clone → status → modify → commit → branch → checkout → reopen');
    expect(zh.t('gitStep.cleanDetail')).toBe('工作区干净，无改动');
    expect(en.t('gitStep.cleanDetail')).toBe('clean');
    expect(zh.t('clearDb.done')).toBe('Benchmark 存储清理完成 ✅');
    expect(en.t('clearDb.done')).toBe('Benchmark storage cleanup complete ✅');
    expect(zh.t('clearDb.deleteBlocked', { name: 'benchmark-db-run-1' })).toBe('删除 benchmark-db-run-1 被阻塞');
    expect(en.t('clearDb.deleteBlocked', { name: 'benchmark-db-run-1' })).toBe(
      'Deleting benchmark-db-run-1 is blocked'
    );
    expect(zh.t('clearDb.failedDatabases', { count: 2 })).toBe('2 个 IndexedDB 数据库清理失败');
    expect(en.t('clearDb.failedDatabases', { count: 2 })).toBe('2 IndexedDB database(s) failed to clean up');
  });

  it('未命中的 key 返回 key 本身并记录为缺失', () => {
    expect(zh.t('no.such.key')).toBe('no.such.key');
  });
});
