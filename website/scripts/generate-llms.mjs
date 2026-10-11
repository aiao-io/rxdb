import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildKnowledge,
  discoverRelease,
  readKnowledgeInput,
  scanPackages
} from '../../scripts/audit/package-graph.mjs';

export const LLMS_LIMITS = {
  indexBytes: 128 * 1024,
  fullBytes: 12 * 1024 * 1024
};

const ROLE_LABELS = new Map([
  ['core', '核心包'],
  ['backend', '后端包'],
  ['plugin', '插件包'],
  ['binding', '框架绑定'],
  ['capability', '能力包'],
  ['shared-impl', '共享实现'],
  ['model', '模型包'],
  ['tool', '工具包'],
  ['standalone', '独立包']
]);

const FALLBACK_PATHS = new Map([
  ['core', '/docs/getting-started/'],
  ['backend', '/docs/adapters/'],
  ['plugin', '/docs/plugins/'],
  ['binding', '/docs/frameworks/'],
  ['capability', '/docs/adapters/'],
  ['shared-impl', '/docs/adapters/'],
  ['model', '/docs/'],
  ['tool', '/docs/'],
  ['standalone', '/docs/']
]);

function parseArgument(name, args) {
  const prefix = `--${name}=`;
  return args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

export function readSiteUrl(configPath) {
  const source = readFileSync(configPath, 'utf8');
  const match = source.match(/\burl\s*:\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error(`${configPath}: 缺少 Docusaurus url`);
  if (!/^https?:\/\//.test(match[1])) throw new Error(`${configPath}: url 必须是 HTTP(S) URL`);
  const url = new URL(match[1]);
  return url.origin;
}

function collectMarkdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap(entry => {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(file);
      if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) return [];
      return [file];
    });
}

function stripFrontMatter(source) {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function toSiteLink(siteUrl, homepage, fallbackPath) {
  const base = new URL(siteUrl);
  const target = homepage ? new URL(homepage) : new URL(fallbackPath, base);
  return new URL(`${target.pathname}${target.search}${target.hash}`, base).toString();
}

function packageLink(siteUrl, packageInfo) {
  const fallback =
    packageInfo.role === 'binding' && packageInfo.framework ?
      `/docs/frameworks/${packageInfo.framework}/`
    : (FALLBACK_PATHS.get(packageInfo.role) ?? '/docs/');
  return toSiteLink(siteUrl, packageInfo.homepage, fallback);
}

function packageDescription(packageInfo) {
  return packageInfo.description || 'Aiao RxDB package.';
}

function packageGroups(packages) {
  const groups = new Map();
  for (const packageInfo of packages) {
    const label = ROLE_LABELS.get(packageInfo.role) ?? packageInfo.role;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(packageInfo);
  }
  return groups;
}

function renderPackageLines(siteUrl, packages) {
  const lines = [];
  for (const [label, group] of packageGroups(packages)) {
    lines.push(`### ${label}`, '');
    for (const packageInfo of group) {
      const slots = packageInfo.slots.length ? packageInfo.slots.join(', ') : '—';
      const hosts = packageInfo.hosts.join(', ');
      const framework = packageInfo.framework ?? '—';
      lines.push(
        `- \`${packageInfo.name}\` — ${packageDescription(packageInfo)}`,
        `  - 版本：\`${packageInfo.version}\``,
        `  - 槽位：${slots}；宿主：${hosts}；框架：${framework}`,
        `  - 权威文档：${packageLink(siteUrl, packageInfo)}`,
        `  - 安装：\`pnpm add ${packageInfo.name}@^${packageInfo.version}\``,
        ''
      );
    }
  }
  return lines;
}

function renderScenarios(knowledge) {
  const lines = [];
  for (const scenario of knowledge.delivery.scenarios) {
    lines.push(
      `### ${scenario.description}`,
      '',
      `- 必需包：${scenario.packages.map(name => `\`${name}\``).join('、')}`,
      `- 槽位：${
        Object.entries(scenario.slots)
          .map(([slot, name]) => `${slot} = \`${name}\``)
          .join('；') || '无'
      }`,
      `- 插件：${scenario.plugins.map(plugin => `\`${plugin.factory}\``).join(' → ') || '无'}`,
      `- 时序：${scenario.timing.join('、') || '无'}`,
      ''
    );
  }
  return lines;
}

function renderSample(knowledge) {
  return [
    '## 最小离线样例',
    '',
    '下面的样例已在 Node + PGlite memory backend 中执行过 CRUD 与事务。',
    '',
    '```sh',
    knowledge.sample.install,
    knowledge.sample.devInstall,
    '```',
    '',
    '```ts',
    knowledge.sample.source.trim(),
    '```',
    ''
  ];
}

export function renderLlms({ siteUrl, knowledge, manifests, docs, limits = LLMS_LIMITS }) {
  const releaseNames = new Set(knowledge.delivery.packages.map(packageInfo => packageInfo.name));
  const packageInfos = knowledge.delivery.packages.map(packageInfo => ({
    ...packageInfo,
    homepage: manifests.get(packageInfo.name)?.homepage
  }));
  const developmentOnly = knowledge.development.packages.filter(packageInfo => !releaseNames.has(packageInfo.name));
  const indexLines = [
    '# Aiao RxDB',
    '',
    `> 面向 AI 助手的 Aiao RxDB 发布包、组合情景与离线样例索引。发布版本：\`${knowledge.version}\`。`,
    '',
    `- 事实摘要：\`${knowledge.digest}\``,
    `- 文档站：${siteUrl}/`,
    `- 完整文档：${siteUrl}/llms-full.txt`,
    '',
    '## 包选型',
    '',
    '索引只为最近 `v*` 发布标签中的包生成安装命令；每个 local / remote 槽位分别选择一个 backend。',
    ''
  ];
  indexLines.push(...renderPackageLines(siteUrl, packageInfos));
  if (developmentOnly.length) {
    indexLines.push('## 未进入最近发布标签的工作区包', '', '这些包当前没有可复制的安装命令：', '');
    for (const packageInfo of developmentOnly) {
      indexLines.push(`- \`${packageInfo.name}\` — 未发布（仅当前工作树或 main），不生成安装命令。`);
    }
    indexLines.push('');
  }
  indexLines.push('## 组合情景', '', ...renderScenarios(knowledge), ...renderSample(knowledge));
  const index = indexLines.join('\n');
  const docsText = docs.map(doc => `## ${doc.relativePath}\n\n${stripFrontMatter(doc.source)}\n`).join('\n');
  const full = [
    '# Aiao RxDB 完整文档',
    '',
    `发布版本：\`${knowledge.version}\``,
    `事实摘要：\`${knowledge.digest}\``,
    '',
    '以下内容来自文档站公开 Markdown 与 API 文档源文件。',
    '',
    index,
    '---',
    '',
    docsText
  ].join('\n');
  const indexBytes = Buffer.byteLength(index, 'utf8');
  const fullBytes = Buffer.byteLength(full, 'utf8');
  if (indexBytes > limits.indexBytes) throw new Error(`llms.txt 超出 UTF-8 上限：${indexBytes} > ${limits.indexBytes}`);
  if (fullBytes > limits.fullBytes)
    throw new Error(`llms-full.txt 超出 UTF-8 上限：${fullBytes} > ${limits.fullBytes}`);
  return { index, full, indexBytes, fullBytes };
}

export function generateLlms({ root, outDir }) {
  const facts = JSON.parse(readFileSync(join(root, 'requirements/package-graph.json'), 'utf8'));
  const records = scanPackages(join(root, 'packages'));
  const release = discoverRelease(root);
  const knowledge = buildKnowledge(facts, records, release, readKnowledgeInput(root));
  const manifests = new Map(release.packages.map(record => [record.name, record.manifest]));
  const docsRoot = join(root, 'website/docs');
  const docs = collectMarkdownFiles(docsRoot).map(file => ({
    relativePath: relative(docsRoot, file).replaceAll('\\', '/'),
    source: readFileSync(file, 'utf8')
  }));
  const siteUrl = readSiteUrl(join(root, 'website/docusaurus.config.ts'));
  const rendered = renderLlms({ siteUrl, knowledge, manifests, docs });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'llms.txt'), rendered.index);
  writeFileSync(join(outDir, 'llms-full.txt'), rendered.full);
  console.log(
    `✅ LLM 文档生成：llms.txt ${rendered.indexBytes} B，llms-full.txt ${rendered.fullBytes} B，${docs.length} 个 Markdown 文件`
  );
  return rendered;
}

function main() {
  const root = resolve(import.meta.dirname, '../..');
  const outDir = parseArgument('out-dir', process.argv.slice(2)) ?? join(root, 'website/build');
  generateLlms({ root, outDir: resolve(outDir) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
