import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { auditEntryDocs, auditTransactionOverrides } from './ai-entry-docs.mjs';

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

test('两个 transaction 重载的 TSDoc 漂移时失败', () => {
  const marker = '会重新排队，等待自己。';
  const at = source.lastIndexOf(marker);
  const drifted = source.slice(0, at) + '会重新排队，最终等待自己。' + source.slice(at + marker.length);
  assert.ok(auditEntryDocs(drifted, 'fixture/index.d.ts').some(error => error.includes('两个重载的 TSDoc 必须一致')));
});

test('同名声明逐个检查：带说明的影子声明不能掩盖缺说明的声明', () => {
  const saveDoc = '  /** 事务内使用 TransactionExecutor.getRepository，参见 RxDBAdapterLocalBase.transaction。 */\n';
  const shadowed = {
    'fixture/index.d.ts': source.replace(saveDoc, ''),
    'fixture/shadow.d.ts': `declare class EntityBase {\n${saveDoc}  save: () => Promise<this>;\n}\n`
  };
  assert.ok(
    auditEntryDocs(shadowed, 'fixture/index.d.ts').some(
      error => error.includes('fixture/index.d.ts') && error.includes('EntityBase.save')
    )
  );
  const duplicated = { 'fixture/index.d.ts': source, 'fixture/copy.d.ts': source };
  assert.ok(auditEntryDocs(duplicated, 'fixture/index.d.ts').some(error => error.includes('必须有两个重载')));
});

test('适配器 transaction 覆写自带 TSDoc 会遮住基类正反例，沿继承链逐级检出', () => {
  const sources = {
    'pglite.ts':
      'export class RxDBAdapterPGlite extends RxDBAdapterLocalBase {\n  /** 自己的说明 */\n  async transaction() {}\n}\n',
    'sqlite-base.ts':
      'export abstract class RxDBAdapterSqliteBase extends RxDBAdapterLocalBase {\n  // 实现备注\n  async transaction() {}\n}\n',
    'wa-sqlite.ts':
      'export class RxDBAdapterWaSqlite extends RxDBAdapterSqliteBase {\n  /** 遮住基类 */\n  override async transaction() {}\n}\n',
    'client.ts': 'export class PGliteClient {\n  /** 客户端自己的事务 */\n  async transaction() {}\n}\n'
  };
  const errors = auditTransactionOverrides(sources);
  assert.deepEqual(errors.map(error => error.slice(0, error.indexOf(':'))).sort(), ['pglite.ts', 'wa-sqlite.ts']);
  assert.ok(errors.every(error => error.includes('RxDBAdapterLocalBase.transaction')));
});
