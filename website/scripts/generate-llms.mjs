/**
 * 文档站 `llms.txt` / `llms-full.txt` 生成器（US-602 B），由 `src/plugins/llms-txt.js` 在 Docusaurus postBuild 调用。
 *
 * @remarks
 * 包选型、组合情景、安装命令与样例一律取自提交的 `requirements/generated/package-knowledge.json`：
 * 它由 `pnpm audit:package-graph` 逐字节校验，是包组合知识唯一的投递源。构建期不碰 git——
 * Netlify、Windows CI 与浅克隆里没有发布标签，现场推导要么构建失败，要么与提交的知识互相矛盾。
 * 站点地址取 Docusaurus 解析后的 `url` + `baseUrl`，生成器不硬编码域名；
 * 包的权威文档链接沿用 manifest `homepage` 的路径，重新挂到当前站点下。
 *
 * @module generate-llms
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** 两个文件的 UTF-8 字节上限；超限构建失败，不截断。 */
export const LLMS_LIMITS = {
  indexBytes: 128 * 1024,
  fullBytes: 12 * 1024 * 1024
};

/** 提交的包组合知识，相对仓库根。 */
export const KNOWLEDGE_PATH = 'requirements/generated/package-knowledge.json';

/** 角色的分组标题与无 `homepage` 时的文档入口；binding 在入口后接框架名。 */
const ROLES = new Map([
  ['core', { label: '核心包', docs: 'docs/getting-started/' }],
  ['backend', { label: '后端包', docs: 'docs/adapters/' }],
  ['plugin', { label: '插件包', docs: 'docs/plugins/' }],
  ['binding', { label: '框架绑定', docs: 'docs/frameworks/' }],
  ['capability', { label: '能力包', docs: 'docs/adapters/' }],
  ['shared-impl', { label: '共享实现', docs: 'docs/adapters/' }],
  ['model', { label: '模型包', docs: 'docs/' }],
  ['tool', { label: '工具包', docs: 'docs/' }],
  ['standalone', { label: '独立包', docs: 'docs/' }]
]);

function roleOf(packageInfo) {
  const role = ROLES.get(packageInfo.role);
  if (!role) throw new Error(`${packageInfo.name}: 未知角色 ${packageInfo.role}`);
  return role;
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

function packageLink(site, packageInfo) {
  const role = roleOf(packageInfo);
  const fallback = packageInfo.framework ? `${role.docs}${packageInfo.framework}/` : role.docs;
  const target = new URL(packageInfo.homepage ?? fallback, site);
  return new URL(`${target.pathname.slice(1)}${target.search}${target.hash}`, site).href;
}

function renderPackageLines(site, packages, version) {
  const lines = [];
  for (const [label, group] of Map.groupBy(packages, packageInfo => roleOf(packageInfo).label)) {
    lines.push(`### ${label}`, '');
    for (const packageInfo of group) {
      const slots = packageInfo.slots.length ? packageInfo.slots.join(', ') : '—';
      lines.push(
        `- \`${packageInfo.name}\` — ${packageInfo.description}`,
        `  - 版本：\`${packageInfo.version}\``,
        `  - 槽位：${slots}；宿主：${packageInfo.hosts.join(', ')}；框架：${packageInfo.framework ?? '—'}`,
        ...(packageInfo.retired ? [`  - 状态：已从仓库移除，\`${version}\` 之后不再发布`] : []),
        ...(packageInfo.notes ? [`  - 备注：${packageInfo.notes}`] : []),
        `  - 权威文档：${packageLink(site, packageInfo)}`,
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
      `- 插件（顺序不限）：${scenario.plugins.map(plugin => `\`${plugin.factory}\``).join('、') || '无'}`,
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
    '下面的样例取自仓库工作区源码，已在 CI 中以 Node + PGlite memory backend 执行过 CRUD 与事务。',
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

/**
 * 渲染两个文件的正文并校验字节上限。
 *
 * @param options.siteUrl - 站点根地址（含 `baseUrl`），如 `https://docs.aiao.io/`
 * @param options.knowledge - 提交的包组合知识
 * @param options.docs - 站点公开文档：`{ relativePath, source }`
 * @param options.limits - UTF-8 字节上限，默认 {@link LLMS_LIMITS}
 * @returns 两份正文与各自的 UTF-8 字节数
 * @throws 任一文件超出字节上限，或知识里出现未知角色时
 */
export function renderLlms({ siteUrl, knowledge, docs, limits = LLMS_LIMITS }) {
  const site = new URL(siteUrl);
  const releaseNames = new Set(knowledge.delivery.packages.map(packageInfo => packageInfo.name));
  const developmentOnly = knowledge.development.packages.filter(packageInfo => !releaseNames.has(packageInfo.name));
  const indexLines = [
    '# Aiao RxDB',
    '',
    `> 面向 AI 助手的 Aiao RxDB 发布包、组合情景与离线样例索引。发布版本：\`${knowledge.version}\`。`,
    '',
    `- 事实摘要：\`${knowledge.digest}\``,
    `- 文档站：${site.href}`,
    `- 完整文档：${new URL('llms-full.txt', site).href}`,
    '',
    '## 包选型',
    '',
    `索引只为发布标签 \`${knowledge.version}\` 中的包生成安装命令；每个 local / remote 槽位分别选择一个 backend。`,
    ''
  ];
  indexLines.push(...renderPackageLines(site, knowledge.delivery.packages, knowledge.version));
  if (developmentOnly.length) {
    indexLines.push(`## 未进入 \`${knowledge.version}\` 的工作区包`, '', '这些包当前没有可复制的安装命令：', '');
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

/**
 * 读提交的包组合知识与 `website/docs`，写出 `llms.txt` 与 `llms-full.txt`。
 *
 * @param options.root - 仓库根目录
 * @param options.outDir - 站点构建输出目录
 * @param options.siteUrl - 站点根地址（含 `baseUrl`）
 * @returns {@link renderLlms} 的结果
 */
export function generateLlms({ root, outDir, siteUrl }) {
  const knowledge = JSON.parse(readFileSync(join(root, KNOWLEDGE_PATH), 'utf8'));
  const docsRoot = join(root, 'website/docs');
  const docs = collectMarkdownFiles(docsRoot).map(file => ({
    relativePath: relative(docsRoot, file).replaceAll('\\', '/'),
    source: readFileSync(file, 'utf8')
  }));
  const rendered = renderLlms({ siteUrl, knowledge, docs });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'llms.txt'), rendered.index);
  writeFileSync(join(outDir, 'llms-full.txt'), rendered.full);
  console.log(
    `✅ LLM 文档生成：llms.txt ${rendered.indexBytes} B，llms-full.txt ${rendered.fullBytes} B，${docs.length} 个 Markdown 文件`
  );
  return rendered;
}
