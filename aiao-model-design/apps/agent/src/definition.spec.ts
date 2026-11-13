import { describe, expect, it } from 'vitest';
import { parseAgentDefinition, pickTools } from './definition';
import source from './model-designer.md';

const VALID = `---
name: model-designer
model: deepseek:deepseek-flash
tools:
  - inspect_model
  - add_entities
---

你是建模助手。
`;

describe('parseAgentDefinition', () => {
  it('解析名称、模型、工具清单与系统提示词', () => {
    expect(parseAgentDefinition(VALID)).toEqual({
      name: 'model-designer',
      model: 'deepseek:deepseek-flash',
      tools: ['inspect_model', 'add_entities'],
      system: '你是建模助手。'
    });
  });

  it('工具清单可以为空', () => {
    expect(parseAgentDefinition(VALID.replace(/tools:\n(?: {2}- .+\n)+/, 'tools:\n')).tools).toEqual([]);
  });

  it.each([
    ['缺少 frontmatter', '你是建模助手。', /frontmatter/],
    ['缺少 name', VALID.replace('name: model-designer\n', ''), /name/],
    ['缺少 model', VALID.replace('model: deepseek:deepseek-flash\n', ''), /model/],
    ['缺少 tools', VALID.replace(/tools:\n(?: {2}- .+\n)+/, ''), /tools/],
    ['正文为空', VALID.replace('你是建模助手。', ''), /系统提示词/],
    ['列表项不在列表键下', VALID.replace('name: model-designer', '  - stray'), /列表/],
    ['无法解析的行', VALID.replace('name: model-designer', 'name model-designer'), /无法解析/]
  ])('%s时报错', (_name, text, pattern) => {
    expect(() => parseAgentDefinition(text)).toThrow(pattern);
  });

  it('仓库里的智能体定义可以解析', () => {
    const definition = parseAgentDefinition(source);
    expect(definition.name).toBe('model-designer');
    expect(definition.tools.length).toBeGreaterThan(0);
  });
});

describe('pickTools', () => {
  const registry = { inspect_model: 'inspect', add_entities: 'add', link_entities: 'link' };

  it('只返回清单列出的工具', () => {
    expect(pickTools(registry, ['add_entities', 'inspect_model'])).toEqual({
      add_entities: 'add',
      inspect_model: 'inspect'
    });
  });

  it('清单里有未注册的工具时报错并列出已注册工具', () => {
    expect(() => pickTools(registry, ['send_email'])).toThrow(/send_email.*inspect_model, add_entities, link_entities/);
  });
});
