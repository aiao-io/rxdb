/**
 * 主包 Agent Skill 的确定性渲染（US-602 C）：知识对象 → `packages/rxdb/skills/aiao-rxdb/SKILL.md`。
 *
 * @remarks
 * 正文只取 {@link buildKnowledge} 的 `delivery`（投递范围）与 `sample`（已验证样例源），
 * frontmatter 按锁定 exporter `skills-npm` 的 schema（`name` + `description`）。
 * 输出稳定排序、不含当前时间，超过 {@link SKILL_MAX_BYTES} 字节上限时报错而非截断。
 */

import { stableJson } from './package-knowledge.mjs';

/** SKILL.md 的 UTF-8 字节上限（US-602「体积预算」）。 */
export const SKILL_MAX_BYTES = 8192;

/** 主包 Skill 的安装名，与 `skills/` 下目录名一致。 */
export const SKILL_NAME = 'aiao-rxdb';

/** 情景时序令牌的可读文本。 */
const TIMING_TEXT = {
  'use-before-connect': '首次 connect() 之前 use',
  'use-before-init': 'init() 之前 use（即首次 connect() 之前）'
};

/** 只认纯 `---` 围栏的 frontmatter（与 skills-npm 的解析口径一致）。 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * 渲染 Skill 文本。
 *
 * @param knowledge - {@link buildKnowledge} 的结果
 * @param template - Markdown 模板，`{{字段}}` 只认 version / digest / packages / scenarios / sample
 * @returns 以换行结尾的 SKILL.md 文本
 * @throws 模板引用未知字段、frontmatter 缺 `name`/`description`、时序令牌没有可读文本或超出字节上限时
 */
export function renderSkill(knowledge, template) {
  const packages = [
    '| 包 | 角色 | 槽位 | 宿主/备注 | 框架 |',
    '| --- | --- | --- | --- | --- |',
    ...knowledge.delivery.packages.map(pkg => {
      const hostNotes = pkg.notes ? `${pkg.hosts.join(', ')}；${pkg.notes}` : pkg.hosts.join(', ');
      return `| ${pkg.name}${pkg.retired ? '（已退役）' : ''} | ${pkg.role} | ${pkg.slots.join(', ')} | ${hostNotes} | ${pkg.framework ?? ''} |`;
    })
  ].join('\n');
  const scenarios = knowledge.delivery.scenarios
    .map(scenario => {
      const timing = scenario.timing.map(token => {
        const text = TIMING_TEXT[token];
        if (!text) throw new Error(`时序令牌 ${token} 没有可读文本（情景 ${scenario.id}）`);
        return text;
      });
      const slots = Object.entries(scenario.slots)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([slot, name]) => `${slot}=${name}`)
        .join('、');
      return [
        `### ${scenario.description}`,
        `必需包：${scenario.packages.join('、')}`,
        `插件（注册工厂，顺序不限）：${scenario.plugins.map(plugin => plugin.factory).join('、') || '无'}`,
        `槽位：${slots || '无'}`,
        `时序：${timing.join('、') || '无'}`
      ].join('\n');
    })
    .join('\n\n');
  const sample = `\`\`\`sh\n${knowledge.sample.install}\n${knowledge.sample.devInstall}\n\`\`\`\n\n\`\`\`json\n${stableJson(knowledge.sample.compilerOptions).trim()}\n\`\`\`\n\n\`\`\`ts\n${knowledge.sample.source.trim()}\n\`\`\``;
  const fields = { version: knowledge.version, digest: knowledge.digest, packages, scenarios, sample };
  const markdown = template.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
    if (!(name in fields)) throw new Error(`模板包含未知字段 ${name}`);
    return fields[name];
  });
  const frontmatter = FRONTMATTER_RE.exec(markdown)?.[1];
  if (!frontmatter) throw new Error('SKILL.md 缺少 --- 围栏的 frontmatter');
  const name = frontmatter.match(/^name:\s*(\S+)\s*$/m)?.[1];
  if (name !== SKILL_NAME) throw new Error(`SKILL.md frontmatter name 必须为 ${SKILL_NAME}`);
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1];
  if (!description) throw new Error('SKILL.md frontmatter 缺少 description');
  const output = markdown.endsWith('\n') ? markdown : markdown + '\n';
  const bytes = Buffer.byteLength(output, 'utf8');
  if (bytes > SKILL_MAX_BYTES) throw new Error(`SKILL.md 超出 ${SKILL_MAX_BYTES} 字节上限（实际 ${bytes} 字节）`);
  return output;
}
