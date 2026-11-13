import { describe, expect, it } from 'vitest';
import { DEMO_PROMPT_LIMIT, plainPrompt, serializePrompt, type PromptState } from './prompt-state';

const field = { id: 'subject', label: '主体', defaultValue: '', required: true };
const state = (value = '陶瓷杯'): PromptState => ({
  fields: [field],
  values: { subject: value },
  document: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '拍摄' },
          { type: 'templateField', attrs: { fieldId: 'subject' } },
          { type: 'hardBreak' },
          { type: 'text', text: '自然光' }
        ]
      }
    ]
  }
});

describe('生成提示词契约', () => {
  it('保留纯文本换行和空行，序列化不修改草稿', () => {
    const text = '第一行\n\n最后一行\n';
    const value = plainPrompt(text),
      before = structuredClone(value);
    expect(serializePrompt(value)).toEqual({ text, issues: [], valid: true });
    expect(value).toEqual(before);
  });
  it('将声明字段与换行组合成最终请求，保留用户输入', () => {
    const value = state(),
      before = structuredClone(value);
    expect(serializePrompt(value)).toEqual({ text: '拍摄陶瓷杯\n自然光', issues: [], valid: true });
    expect(value).toEqual(before);
  });
  it('缺少必填节点和空字段都阻止发送，但不清空输入', () => {
    expect(serializePrompt(state(' ')).issues).toContain('请填写「主体」');
    const value = state();
    value.document = plainPrompt('保留的正文').document;
    expect(serializePrompt(value)).toEqual({ text: '保留的正文', issues: ['模板缺少「主体」节点'], valid: false });
  });
  it('可选空字段可提交，超长输入保持完整并返回明确诊断', () => {
    const value = state('');
    value.fields = [{ ...field, required: false }];
    expect(serializePrompt(value).valid).toBe(true);
    const text = '字'.repeat(DEMO_PROMPT_LIMIT + 1);
    expect(serializePrompt(plainPrompt(text))).toEqual({
      text,
      issues: [`最终文本超过 ${DEMO_PROMPT_LIMIT} 字，输入已保留`],
      valid: false
    });
  });
  it.each([
    null,
    { fields: [], values: null },
    { fields: Array.from({ length: 21 }, () => field), values: {} },
    { ...state(), values: { subject: '杯子', privateKey: '敏感值' } },
    { ...state(), fields: [field, field] },
    { ...state(), fields: [{ ...field, label: '' }] },
    { ...state(), fields: [{ ...field, id: 'INVALID' }] },
    { ...state(), values: { subject: 'x'.repeat(4001) } },
    {
      ...state(),
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'templateField', attrs: { fieldId: 'unknown' } }] }]
      }
    },
    {
      ...state(),
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文', apiKey: '敏感值' }] }]
      }
    },
    { ...state(), document: { type: 'doc', content: [{ type: 'paragraph', content: '错误结构' }] } },
    { ...state(), document: { type: 'doc', content: [{ type: 'script', content: [] }] } },
    { ...state(), document: { type: 'paragraph', content: [] } }
  ])('拒绝无法安全组成请求的草稿 %j', value => {
    const result = serializePrompt(value as unknown as PromptState);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.join('')).not.toContain('敏感值');
  });
});
