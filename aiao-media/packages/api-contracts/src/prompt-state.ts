/** Public templates are inert text and a small, explicitly declared node schema. */
export type PromptNode = {
  type: 'doc' | 'paragraph' | 'text' | 'hardBreak' | 'templateField';
  text?: string;
  attrs?: { fieldId: string; value?: string };
  content?: PromptNode[];
};
export type PromptField = {
  id: string;
  label: string;
  defaultValue: string;
  required: boolean;
};
export type PromptState = {
  document: PromptNode;
  fields: PromptField[];
  values: Record<string, string>;
};
export const DEMO_PROMPT_LIMIT = 2000;
export function plainPrompt(text: string): PromptState {
  return {
    fields: [],
    values: {},
    document: {
      type: 'doc',
      content: text.split('\n').map(line => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : []
      }))
    }
  };
}
export function serializePrompt(state: PromptState): {
  text: string;
  issues: string[];
  valid: boolean;
} {
  const issues: string[] = [];
  let text = '';
  try {
    if (
      !state ||
      !Array.isArray(state.fields) ||
      state.fields.length > 20 ||
      typeof state.values !== 'object' ||
      !state.values
    )
      throw new Error('模板状态无效');
    const definitions = new Map<string, PromptField>();
    for (const field of state.fields) {
      if (
        !field ||
        !/^[a-z][a-z0-9-]{0,39}$/.test(field.id) ||
        definitions.has(field.id) ||
        typeof field.label !== 'string' ||
        !field.label.trim() ||
        field.label.length > 40 ||
        typeof field.required !== 'boolean' ||
        typeof field.defaultValue !== 'string' ||
        field.defaultValue.length > 4000
      )
        throw new Error('模板字段定义无效');
      definitions.set(field.id, field);
    }
    if (Object.keys(state.values).some(id => !definitions.has(id))) throw new Error('模板包含未知字段值');
    const seen = new Set<string>();
    let nodes = 0;
    function inline(node: PromptNode): string {
      if (
        ++nodes > 10000 ||
        !node ||
        node.content ||
        Object.keys(node).some(key => !['type', 'text', 'attrs'].includes(key))
      )
        throw new Error('模板节点无效');
      if (node.type === 'text' && typeof node.text === 'string' && !node.attrs) return node.text;
      if (node.type === 'hardBreak' && node.text === undefined && !node.attrs) return '\n';
      if (
        node.type !== 'templateField' ||
        node.text !== undefined ||
        !node.attrs ||
        Object.keys(node.attrs).some(key => !['fieldId', 'value'].includes(key))
      )
        throw new Error('模板节点无效');
      const field = definitions.get(node.attrs.fieldId);
      if (!field) throw new Error('模板引用了未知字段');
      seen.add(field.id);
      const value = state.values[field.id];
      if (typeof value !== 'string' || value.length > 4000) throw new Error('模板字段值无效');
      if (field.required && !value.trim()) issues.push(`请填写「${field.label}」`);
      return value;
    }
    const doc = state.document;
    if (
      !doc ||
      doc.type !== 'doc' ||
      !Array.isArray(doc.content) ||
      doc.content.length > 1000 ||
      Object.keys(doc).some(key => !['type', 'content'].includes(key))
    )
      throw new Error('模板文档无效');
    text = doc.content
      .map(paragraph => {
        if (
          paragraph.type !== 'paragraph' ||
          Object.keys(paragraph).some(key => !['type', 'content'].includes(key)) ||
          (paragraph.content && !Array.isArray(paragraph.content))
        )
          throw new Error('模板段落无效');
        return (paragraph.content ?? []).map(inline).join('');
      })
      .join('\n');
    for (const field of definitions.values())
      if (field.required && !seen.has(field.id)) issues.push(`模板缺少「${field.label}」节点`);
    if (text.length > DEMO_PROMPT_LIMIT) issues.push(`最终文本超过 ${DEMO_PROMPT_LIMIT} 字，输入已保留`);
    if (!text.trim()) issues.push('请输入描述');
  } catch (error) {
    issues.push(error instanceof Error ? error.message : '模板无效');
  }
  return { text, issues: [...new Set(issues)], valid: issues.length === 0 };
}
