/** 智能体定义：frontmatter 声明名称、默认模型与工具清单，正文是系统提示词。 */
export interface AgentDefinition {
  name: string;
  model: string;
  tools: string[];
  system: string;
}

type Fields = Record<string, string | string[]>;

function readFrontmatter(frontmatter: string): Fields {
  const fields: Fields = {};
  let list: string[] | undefined;
  for (const line of frontmatter.split('\n').filter(item => item.trim())) {
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item && !list) throw new Error(`列表项不在列表键下：${line.trim()}`);
    if (item && list) {
      list.push(item[1].trim());
      continue;
    }
    const pair = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`无法解析的 frontmatter 行：${line}`);
    list = pair[2] === '' ? [] : undefined;
    fields[pair[1]] = list ?? pair[2].trim();
  }
  return fields;
}

/**
 * 解析智能体定义文件。
 *
 * frontmatter 只支持字符串与字符串列表；更复杂的配置应该写在代码里，而不是定义文件里。
 */
export function parseAgentDefinition(source: string): AgentDefinition {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match) throw new Error('智能体定义必须以 --- frontmatter 开头');
  const fields = readFrontmatter(match[1]);
  const { name, model, tools } = fields;
  if (typeof name !== 'string' || typeof model !== 'string') throw new Error('智能体定义缺少字符串字段 name 或 model');
  if (!Array.isArray(tools)) throw new Error('智能体定义缺少 tools 列表（可以为空）');
  const system = match[2].trim();
  if (!system) throw new Error('智能体定义的正文（系统提示词）为空');
  return { name, model, tools, system };
}

/** 从注册表里取出清单列出的工具；清单里有未注册的名称时直接报错，让定义错误在启动时暴露。 */
export function pickTools<T>(registry: Readonly<Record<string, T>>, names: readonly string[]): Record<string, T> {
  return Object.fromEntries(
    names.map(name => {
      if (!(name in registry))
        throw new Error(`智能体定义列出了未注册的工具 ${name}，已注册：${Object.keys(registry).join(', ')}`);
      return [name, registry[name]];
    })
  );
}
