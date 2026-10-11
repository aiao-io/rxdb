import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { auditEntryDocs } from './ai-entry-docs.mjs';

const source = await readFile(new URL('./__fixtures__/ai-entry-docs/index.d.ts', import.meta.url), 'utf8');

test('入口声明包含完整初始化、事务正反例与交叉提示', () => {
  assert.deepEqual(auditEntryDocs(source, 'fixture/index.d.ts'), []);
});

test('缺少三类插件说明会定位 RxDB.use', () => {
  const errors = auditEntryDocs(source.replace('系统贡献', '其他'), 'fixture/index.d.ts');
  assert.ok(errors.some(error => error.includes('RxDB.use') && error.includes('fixture/index.d.ts')));
});

test('普通插件晚装立即安装的语义不能丢失', () => {
  const broken = source.replace('立即安装', '登记插件');
  assert.ok(auditEntryDocs(broken, 'fixture/index.d.ts').some(error => error.includes('RxDB.use')));
});

test('缺少 connect 的 init 时序会失败', () => {
  const broken = source.replace('首次 connect() 同步调用 init()', '连接适配器');
  assert.ok(auditEntryDocs(broken, 'fixture/index.d.ts').some(error => error.includes('RxDB.connect')));
});

test('第二个 transaction 重载缺反例不能被第一个掩盖', () => {
  const marker = '❌ await adapter.transaction(async () => { await entity.save(); }); 会重新排队，等待自己。';
  const at = source.lastIndexOf(marker);
  const broken = source.slice(0, at) + source.slice(at + marker.length);
  assert.ok(auditEntryDocs(broken, 'fixture/index.d.ts').some(error => error.includes('transaction[2]')));
});

test('缺失入口或 executor/save 交叉提示都明确失败', () => {
  assert.ok(auditEntryDocs('declare class RxDB {}', 'empty.d.ts').length >= 4);
  assert.ok(
    auditEntryDocs(source.replace('TransactionExecutor.getRepository', '仓储'), 'fixture/index.d.ts').some(error =>
      error.includes('EntityBase.save')
    )
  );
});

test('实际声明按文件拆分时，入口 re-export 仍能关联各声明的说明', () => {
  const markers = [
    'declare class RxDB {',
    'declare class RxDBAdapterLocalBase {',
    'interface TransactionExecutor {',
    'declare class EntityBase {'
  ];
  const files = { 'fixture/index.d.ts': 'export * from "./RxDB.js";' };
  for (const [index, marker] of markers.entries()) {
    const start = source.indexOf(marker);
    const end = index + 1 < markers.length ? source.indexOf(markers[index + 1]) : source.length;
    files[`fixture/module${index}.d.ts`] = source.slice(start, end);
  }
  assert.deepEqual(auditEntryDocs(files, 'fixture/index.d.ts'), []);
});
