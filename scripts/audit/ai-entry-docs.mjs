import ts from 'typescript';

const documentation = node => (node.jsDoc ?? []).map(doc => doc.getText()).join('\n');

export function auditEntryDocs(text, sourcePath) {
  const sources = typeof text === 'string' ? [[sourcePath, text]] : Object.entries(text);
  const files = sources.map(([name, content]) => ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true));
  const errors = [];
  const declarations = new Map(
    files.flatMap(file => file.statements.filter(node => node.name).map(node => [node.name.text, node]))
  );
  const members = (type, name) => declarations.get(type)?.members?.filter(node => node.name?.getText() === name) ?? [];
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
  requireDocs('RxDBAdapterLocalBase.transaction', transactions, [
    '@example',
    '✅',
    '❌',
    'executor.getRepository',
    'entity.save()',
    '排队'
  ]);
  const executor = declarations.get('TransactionExecutor');
  if (!executor?.getFullText().includes('RxDBAdapterLocalBase.transaction'))
    errors.push(`${sourcePath}: TransactionExecutor 缺少事务入口交叉提示`);
  requireDocs('EntityBase.save', members('EntityBase', 'save'), [
    'TransactionExecutor.getRepository',
    'RxDBAdapterLocalBase.transaction'
  ]);
  return errors;
}
