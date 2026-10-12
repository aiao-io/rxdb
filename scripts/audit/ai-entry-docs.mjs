/**
 * 核心高频入口的 TSDoc 门禁（US-602 AC#12）：按符号与重载归属检查实际打包的 `.d.ts`。
 *
 * @remarks
 * 这些短语是 AC#12 要求的语义锚点：`RxDB.use` 区分三类插件且保留「普通插件晚装立即安装」，
 * `RxDB.connect` 说明 `init()` 时序，`RxDBAdapterLocalBase.transaction` 两个重载带同一份 ✅ / ❌ 正反例，
 * `TransactionExecutor` 与 `EntityBase.save` 交叉指向事务入口。同名声明跨文件出现时逐个检查，影子声明不能掩盖缺失。
 *
 * 具体适配器的 `transaction` 覆写由 {@link auditTransactionOverrides} 读源码检查：覆写不带 TSDoc，
 * 语言服务才会沿继承链显示基类的正反例。
 */

import ts from 'typescript';

const documentation = node => (node.jsDoc ?? []).map(doc => doc.getText()).join('\n');

/**
 * 检查核心入口声明的 TSDoc。
 *
 * @param text - 单个 `.d.ts` 文本，或 `{ 文件名: 文本 }`（按文件拆分的实际产物）
 * @param sourcePath - 报错定位用的入口路径
 * @returns 问题列表，空数组即通过
 */
export function auditEntryDocs(text, sourcePath) {
  const sources = typeof text === 'string' ? [[sourcePath, text]] : Object.entries(text);
  const files = sources.map(([name, content]) => ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true));
  const errors = [];
  const declarations = Map.groupBy(
    files.flatMap(file => file.statements.filter(node => node.name)),
    node => node.name.text
  );
  const members = (type, name) =>
    (declarations.get(type) ?? []).flatMap(
      node => node.members?.filter(member => member.name?.getText() === name) ?? []
    );
  const requireDocs = (label, nodes, required) => {
    if (!nodes.length) errors.push(`${sourcePath}: ${label} 缺少声明`);
    for (const [index, node] of nodes.entries()) {
      const missing = required.filter(value => !documentation(node).includes(value));
      if (missing.length)
        errors.push(`${node.getSourceFile().fileName}: ${label}[${index + 1}] 缺少 ${missing.join('、')}`);
    }
  };
  requireDocs('RxDB.use', members('RxDB', 'use'), ['普通插件', '立即安装', '仓储', '系统贡献', 'init()', 'connect()']);
  requireDocs('RxDB.connect', members('RxDB', 'connect').slice(0, 1), ['init()', 'use()']);
  const transactions = members('RxDBAdapterLocalBase', 'transaction');
  if (transactions.length !== 2) errors.push(`${sourcePath}: RxDBAdapterLocalBase.transaction 必须有两个重载`);
  else if (documentation(transactions[0]) !== documentation(transactions[1]))
    errors.push(`${sourcePath}: RxDBAdapterLocalBase.transaction 两个重载的 TSDoc 必须一致`);
  requireDocs('RxDBAdapterLocalBase.transaction', transactions, [
    '@example',
    '✅',
    '❌',
    'executor.getRepository',
    'entity.save()',
    '排队'
  ]);
  if (
    !(declarations.get('TransactionExecutor') ?? []).some(node =>
      node.getFullText().includes('RxDBAdapterLocalBase.transaction')
    )
  )
    errors.push(`${sourcePath}: TransactionExecutor 缺少事务入口交叉提示`);
  requireDocs('EntityBase.save', members('EntityBase', 'save'), [
    'TransactionExecutor.getRepository',
    'RxDBAdapterLocalBase.transaction'
  ]);
  return errors;
}

/**
 * 具体适配器的 `transaction` 覆写不得自带 TSDoc。
 *
 * @remarks
 * 覆写没有 TSDoc 时，语言服务沿继承链显示 `RxDBAdapterLocalBase.transaction` 的正反例；
 * 覆写一旦自带 TSDoc 就整段遮住基类说明，持有具体适配器类型的调用方（如 `RxDBAdapterPGlite`）再也看不到 ❌ 反例。
 * 实现备注改写成 `//` 行注释。继承链按类名在给定源码里解析。
 *
 * @param sources - `{ 文件名: 源码 }`，取各适配器包 `src/` 下的非测试源码
 * @returns 问题列表，空数组即通过
 */
export function auditTransactionOverrides(sources) {
  const classes = Object.entries(sources).flatMap(([name, content]) =>
    ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true).statements.filter(ts.isClassDeclaration)
  );
  const parentOf = node =>
    node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0].expression.getText();
  const parents = new Map(classes.filter(node => node.name).map(node => [node.name.text, parentOf(node)]));
  const isAdapter = node => {
    const seen = new Set();
    for (let name = parentOf(node); name && !seen.has(name); name = parents.get(name)) {
      if (name === 'RxDBAdapterLocalBase') return true;
      seen.add(name);
    }
    return false;
  };
  return classes
    .filter(isAdapter)
    .flatMap(node =>
      node.members
        .filter(member => member.name?.getText() === 'transaction' && member.jsDoc?.length)
        .map(
          () =>
            `${node.getSourceFile().fileName}: ${node.name.text}.transaction 覆写自带 TSDoc，会遮住 RxDBAdapterLocalBase.transaction 的正反例（改用 // 注释）`
        )
    );
}
