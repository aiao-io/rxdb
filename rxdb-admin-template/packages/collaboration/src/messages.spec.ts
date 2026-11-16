import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { collaborationEnglish, collaborationEnMessages, collaborationZhMessages } from './messages.js';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
const han = /\p{Script=Han}/u;
const placeholders = (text: string) => [...text.matchAll(/\{v\d+\}/g)].map(match => match[0]).sort();

/**
 * 含汉字的带插值模板字符串无法成为词条键，默认一律拦下。
 * 仅允许不会经 HTTP 返回给浏览器的启动期运维报错；每条都必须写明理由，且只对指定文件的原文生效。
 */
const interpolatedAllowlist: readonly { file: string; source: string; reason: string }[] = [
  {
    file: 'server/main.ts',
    source: '`缺少环境变量 ${name}`',
    reason: '服务进程启动时缺少环境变量的运维报错，只写入进程日志，不进入任何 HTTP 响应'
  },
  {
    file: 'server/bootstrap.ts',
    source: '`缺少环境变量 ${name}`',
    reason: '初始化命令行缺少环境变量的运维报错，只写入终端，不进入任何 HTTP 响应'
  }
];

const isText = (node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
const isTx = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'tx';

/**
 * 返回该文件里违反词条约定的位置，格式为「文件:行 说明」：
 * 含汉字的字面量必须是目录的键；带插值的汉字模板无法作键；
 * tx 的占位符取值不会再被翻译，其中直接出现的汉字字面量必须先包一层 tx。
 */
function findProblems(file: string, source: string, catalog: Record<string, string>): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const problems: string[] = [];
  const report = (node: ts.Node, message: string) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    problems.push(`${file}:${line} ${message}`);
  };
  const untranslatedValues = (node: ts.Node): void => {
    if (isTx(node)) return;
    if (isText(node) && han.test(node.text))
      report(node, `占位符取值里的汉字字面量没有先经 tx 翻译：${JSON.stringify(node.text)}`);
    ts.forEachChild(node, untranslatedValues);
  };
  const visit = (node: ts.Node): void => {
    if (isText(node) && han.test(node.text)) {
      if (!Object.hasOwn(catalog, node.text)) report(node, `缺少英文词条：${JSON.stringify(node.text)}`);
    } else if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join('');
      const code = node.getText(sourceFile);
      const allowed = interpolatedAllowlist.some(item => item.file === file && item.source === code);
      if (han.test(text) && !allowed) report(node, `带插值的汉字模板字符串无法作词条键：${code}`);
    } else if (isTx(node) && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
      ts.forEachChild(node.arguments[1], untranslatedValues);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return problems;
}

/** 扫描 src 下所有非测试源文件；英文目录本身与类型声明不在其内。 */
function scanSources(catalog: Record<string, string>): string[] {
  return readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
    .map(path => path.replaceAll('\\', '/'))
    .filter(path => path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.endsWith('.spec.ts'))
    .filter(path => path !== 'messages.ts')
    .sort()
    .flatMap(path => findProblems(path, readFileSync(`${sourceRoot}${path}`, 'utf8'), catalog));
}

describe('协作界面词条门禁', () => {
  it('源码里每个含汉字的字符串字面量都是英文目录的键，带插值的汉字模板必须在白名单内', () => {
    expect(scanSources(collaborationEnglish)).toEqual([]);
  });

  it('从目录里删掉任何一个仍在使用的键，门禁都会变红', () => {
    const incomplete = Object.fromEntries(
      Object.entries(collaborationEnglish).filter(([key]) => key !== '评论不能为空')
    );
    expect(scanSources(incomplete)).toContainEqual(expect.stringContaining('缺少英文词条："评论不能为空"'));
  });

  it('白名单里的模板只对指定文件生效，且每条都写明了理由', () => {
    expect(interpolatedAllowlist.every(item => item.reason.length > 0)).toBe(true);
    const code = 'export const message = `缺少环境变量 ${name}`;';
    expect(findProblems('server/main.ts', code, {})).toEqual([]);
    expect(findProblems('client/mount.ts', code, {})).toEqual([expect.stringContaining('client/mount.ts:1')]);
  });

  it('逐类识别字面量：普通字符串、无插值模板、带插值模板；注释与非汉字内容不参与', () => {
    const source = [
      '/** 中文注释不是词条 */',
      "const covered = '已有词条';",
      "const missing = '没有词条';",
      'const plain = `无插值模板`;',
      'const interpolated = `共 ${count} 条`;',
      'const english = `total ${count}`;',
      "// 行注释：'不是字符串'",
      "const unrelated = 'ascii，：（）～';"
    ].join('\n');
    expect(findProblems('sample.ts', source, { 已有词条: 'Covered' })).toEqual([
      'sample.ts:3 缺少英文词条："没有词条"',
      'sample.ts:4 缺少英文词条："无插值模板"',
      'sample.ts:5 带插值的汉字模板字符串无法作词条键：`共 ${count} 条`'
    ]);
  });

  it('tx 的占位符取值里直接写汉字字面量会漏翻译：必须先经 tx；数据与非汉字取值不受影响', () => {
    const catalog = { '共 {v0} 项': 'Total {v0}', 暂无: 'None', 空: 'Empty' };
    const source = [
      "tx('共 {v0} 项', { v0: tx('暂无') });",
      "tx('共 {v0} 项', { v0: count });",
      "tx('共 {v0} 项', { v0: list.join('、') });",
      "tx('共 {v0} 项', { v0: head ?? '空' });",
      "tx('共 {v0} 项', { v0: names.join(', ') || '暂无' });",
      "other('共 {v0} 项', { v0: '暂无' });"
    ].join('\n');
    expect(findProblems('sample.ts', source, catalog)).toEqual([
      'sample.ts:4 占位符取值里的汉字字面量没有先经 tx 翻译："空"',
      'sample.ts:5 占位符取值里的汉字字面量没有先经 tx 翻译："暂无"'
    ]);
  });
});

describe('英文目录一致性', () => {
  it('中英文消息表键集一致，占位符在键与英文值里完全对应', () => {
    expect(Object.keys(collaborationEnMessages)).toEqual(Object.keys(collaborationZhMessages));
    const mismatched = Object.entries(collaborationEnglish)
      .filter(([zh, en]) => !en.trim() || placeholders(zh).join() !== placeholders(en).join())
      .map(([zh]) => zh);
    expect(mismatched).toEqual([]);
  });
});
