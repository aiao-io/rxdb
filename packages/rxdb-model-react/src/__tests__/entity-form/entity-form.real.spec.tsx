/**
 * EntityForm —— **真实组件源码**（Angular `rxdb-entity-form-angular.real.spec.ts` 的 React 移植）。
 *
 * 覆盖 12 类字段渲染、view 模式只读展示、fieldChanged / formSubmitted /
 * formCancelled / validationErrors 四条回调链路；解析与校验全部走
 * `@aiao/rxdb-model` 的真实 `parseEntityFieldValueStrict` / `validateForm`。
 * 不复制任何组件逻辑到 spec 内。
 */
import type { EntityFormData, FormFieldChangeEvent, FormFieldConfig, FormValidationResult } from '@aiao/rxdb-model';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntityForm } from '../../entity-form/entity-form';

const FIELDS: FormFieldConfig[] = [
  { field: 'name', displayName: '名称', type: 'string', required: true },
  { field: 'active', displayName: '启用', type: 'boolean' },
  { field: 'status', displayName: '状态', type: 'enum', enumValues: ['new', 'doing', 'done'], nullable: true },
  { field: 'due', displayName: '截止时间', type: 'date' },
  { field: 'score', displayName: '分数', type: 'number' },
  { field: 'count', displayName: '数量', type: 'integer' },
  { field: 'tags', displayName: '标签', type: 'stringArray' },
  { field: 'weights', displayName: '权重', type: 'numberArray' },
  { field: 'meta', displayName: '元数据', type: 'json' },
  { field: 'props', displayName: '属性', type: 'keyValue' },
  { field: 'owner', displayName: '负责人', type: 'manyToOne', relatedEntityName: 'User' },
  { field: 'avatar', displayName: '头像', type: 'oneToOne', relatedEntityName: 'Asset' },
  { field: 'note', displayName: '备注', type: 'string' },
  { field: 'secret', displayName: '隐藏字段', type: 'string', hidden: true }
];

const DATA: EntityFormData = {
  name: 'Alice',
  active: true,
  status: 'doing',
  due: '2025-01-02T03:04:00.000Z',
  score: 4.5,
  count: 3,
  tags: ['a', 'b'],
  weights: [1.5, 2],
  meta: { theme: 'dark' },
  props: { width: 100 },
  owner: 'u-1',
  avatar: null,
  note: 'hello'
};

describe('EntityForm（真实组件）', () => {
  function renderForm(
    props: Partial<{
      fields: FormFieldConfig[];
      data: EntityFormData;
      mode: 'view' | 'edit' | 'create';
      showActions: boolean;
      relatedEntityProvider: (entityName: string) => Array<{ id: string; displayName: string }>;
    }> = {}
  ) {
    const fieldChanged: FormFieldChangeEvent[] = [];
    const formSubmitted: EntityFormData[] = [];
    const formCancelled: unknown[] = [];
    const validationErrors: FormValidationResult[] = [];
    const utils = render(
      <EntityForm
        fields={props.fields ?? FIELDS}
        data={props.data ?? DATA}
        mode={props.mode ?? 'edit'}
        showActions={props.showActions}
        relatedEntityProvider={props.relatedEntityProvider}
        onFieldChanged={event => fieldChanged.push(event)}
        onFormSubmitted={data => formSubmitted.push(data)}
        onFormCancelled={() => formCancelled.push(null)}
        onValidationErrors={result => validationErrors.push(result)}
      />
    );
    return { ...utils, fieldChanged, formSubmitted, formCancelled, validationErrors };
  }

  /** 按显示名定位字段的 fieldset。 */
  function fieldset(container: HTMLElement, displayName: string): HTMLElement {
    const legends = [...container.querySelectorAll('legend')] as HTMLElement[];
    const legend = legends.find(l => l.textContent?.trim() === displayName);
    if (!legend) throw new Error(`legend not found: ${displayName}`);
    return legend.parentElement as HTMLElement;
  }

  it('隐藏字段不渲染，其余字段按序渲染', () => {
    const { container } = renderForm();
    const legends = [...container.querySelectorAll('legend')].map(l => l.textContent?.trim());

    expect(legends).toHaveLength(FIELDS.length - 1);
    expect(legends).not.toContain('隐藏字段');
    expect(legends[0]).toBe('名称');
  });

  it('12 类字段渲染对应控件', () => {
    const { container } = renderForm();

    expect(fieldset(container, '名称').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(container, '启用').querySelector('input[type=checkbox]')).toBeTruthy();
    expect(fieldset(container, '状态').querySelector('select')).toBeTruthy();
    expect(fieldset(container, '截止时间').querySelector('input[type=datetime-local]')).toBeTruthy();
    expect(fieldset(container, '分数').querySelector('input[type=number]')).toBeTruthy();
    expect(fieldset(container, '数量').querySelector('input[type=number]')).toBeTruthy();
    expect(fieldset(container, '标签').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(container, '权重').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(container, '元数据').querySelector('textarea')).toBeTruthy();
    expect(fieldset(container, '属性').querySelector('textarea')).toBeTruthy();
    expect(fieldset(container, '负责人').querySelector('select')).toBeTruthy();
    expect(fieldset(container, '头像').querySelector('select')).toBeTruthy();
    expect(fieldset(container, '备注').querySelector('input[type=text]')).toBeTruthy();
  });

  it('enum 渲染全部枚举值，nullable 时带 (空) 选项', () => {
    const { container } = renderForm();
    const options = [...fieldset(container, '状态').querySelectorAll('option')].map(o => o.textContent?.trim());

    expect(options).toEqual(['(空)', 'new', 'doing', 'done']);
  });

  it('关系字段经 relatedEntityProvider 渲染选项', () => {
    const { container, rerender } = renderForm();
    rerender(
      <EntityForm
        fields={FIELDS}
        data={DATA}
        mode='edit'
        relatedEntityProvider={(entityName: string) =>
          entityName === 'User' ?
            [
              { id: 'u-1', displayName: '张三' },
              { id: 'u-2', displayName: '李四' }
            ]
          : [{ id: 'a-1', displayName: 'logo.png' }]
        }
      />
    );

    const ownerOptions = [...fieldset(container, '负责人').querySelectorAll('option')].map(o => o.textContent?.trim());
    expect(ownerOptions).toEqual(['(空)', '张三', '李四']);

    const avatarOptions = [...fieldset(container, '头像').querySelectorAll('option')].map(o => o.textContent?.trim());
    expect(avatarOptions).toEqual(['(空)', 'logo.png']);
  });

  it('view 模式全部只读：渲染展示值而非输入控件', () => {
    const { container } = renderForm({ mode: 'view' });

    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelectorAll('.input-ghost').length).toBe(FIELDS.length - 1);
  });

  it('view 模式按 formatEntityFieldValue 格式化展示：数组/布尔/JSON/关系显示名', () => {
    const { container } = renderForm({ mode: 'view' });
    const ghost = (name: string): string =>
      fieldset(container, name).querySelector('.input-ghost')?.textContent?.trim() ?? '';

    expect(ghost('标签')).toBe('a, b');
    expect(ghost('启用')).toBe('true');
    expect(ghost('元数据')).toBe('{"theme":"dark"}');
    expect(ghost('头像')).toBe('');
  });

  it('view 模式关系显示名经 provider 命中回显，未命中回退格式化值', () => {
    const { container } = renderForm({
      mode: 'view',
      relatedEntityProvider: (entityName: string) => (entityName === 'User' ? [{ id: 'u-1', displayName: '张三' }] : [])
    });
    const ghost = (name: string): string =>
      fieldset(container, name).querySelector('.input-ghost')?.textContent?.trim() ?? '';

    expect(ghost('负责人')).toBe('张三');
    // 未命中的关系值回退到格式化后的原始值（avatar 为 null → 空串）
    expect(ghost('头像')).toBe('');
  });

  it('edit 模式下 readonly 字段也只读展示', () => {
    const fields = [{ field: 'locked', displayName: '锁定', type: 'string', readonly: true }] as FormFieldConfig[];
    const { container } = renderForm({ fields, data: { locked: 'no-touch' } });

    expect(fieldset(container, '锁定').querySelector('.input-ghost')).toBeTruthy();
    expect(fieldset(container, '锁定').textContent).toContain('no-touch');
  });

  it('checkbox 变更走 fieldChanged，携带解析值与旧值', () => {
    const { container, fieldChanged } = renderForm();
    const checkbox = fieldset(container, '启用').querySelector('input[type=checkbox]') as HTMLInputElement;

    // React 的 checkbox onChange 由 click 驱动（浏览器默认翻转 checked）
    fireEvent.click(checkbox);

    expect(fieldChanged).toEqual([{ field: 'active', type: 'boolean', value: false, previousValue: true }]);
  });

  it('number 输入解析为数字，stringArray 按逗号拆分', () => {
    const { container, fieldChanged } = renderForm();

    // React 对受控输入做值追踪：DOM 值未变化时不派发 onChange（Angular 原生监听则会），
    // 因此这里改用与初值不同的新值驱动
    fireEvent.change(fieldset(container, '分数').querySelector('input')!, { target: { value: '9.5' } });
    fireEvent.change(fieldset(container, '标签').querySelector('input')!, { target: { value: 'x, y , z' } });

    expect(fieldChanged.at(-2)).toMatchObject({ field: 'score', type: 'number', value: 9.5 });
    expect(fieldChanged.at(-1)).toMatchObject({ field: 'tags', type: 'stringArray', value: ['x', 'y', 'z'] });
  });

  it('枚举变更写入解析后的字符串', () => {
    const { container } = renderForm();
    const select = fieldset(container, '状态').querySelector('select') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'done' } });

    const changed = container.querySelector('select') as HTMLSelectElement;
    expect((changed.querySelector('option[value=done]') as HTMLOptionElement).selected).toBe(true);
  });

  it('必填缺失时 onSubmit 阻止提交并输出 validationErrors', () => {
    const { container, formSubmitted, validationErrors } = renderForm({ data: { ...DATA, name: '' } });

    fireEvent.submit(container.querySelector('form')!);

    expect(formSubmitted).toEqual([]);
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].valid).toBe(false);
    expect(validationErrors[0].errors[0]).toMatchObject({ field: 'name' });
  });

  it('校验通过时 onSubmit 输出当前表单数据', () => {
    const { container, formSubmitted } = renderForm();

    fireEvent.change(fieldset(container, '名称').querySelector('input')!, { target: { value: 'Bob' } });
    fireEvent.submit(container.querySelector('form')!);

    expect(formSubmitted).toHaveLength(1);
    expect(formSubmitted[0]['name']).toBe('Bob');
  });

  it('onCancel 重置为最近一次输入数据并输出 formCancelled', () => {
    const { container, formCancelled } = renderForm();

    fireEvent.change(fieldset(container, '名称').querySelector('input')!, { target: { value: 'Changed' } });
    expect(fieldset(container, '名称').querySelector('input')!.value).toBe('Changed');

    fireEvent.click(container.querySelector('button')!);

    expect(fieldset(container, '名称').querySelector('input')!.value).toBe('Alice');
    expect(formCancelled).toHaveLength(1);
  });

  it('showActions=false 不渲染保存/取消按钮，showActions 默认渲染', () => {
    expect(renderForm().container.textContent).toContain('保存');
    expect(renderForm({ showActions: false }).container.textContent).not.toContain('保存');
  });

  it('create 模式与 edit 一致渲染可编辑控件', () => {
    const { container } = renderForm({ mode: 'create' });

    expect(fieldset(container, '名称').querySelector('input[type=text]')).toBeTruthy();
  });

  it('解析失败时输出 validationErrors 且不更新表单数据', () => {
    // Angular 侧经 onFieldChange 直接注入「toString 抛错」的值覆盖 catch 分支；
    // React 走 DOM 事件，输入值只能是字符串 —— 用非法 JSON 覆盖同一条
    // 「解析失败 → validationErrors + 表单数据不变」链路（parseEntityFieldValueStrict 契约）
    const { container, fieldChanged, validationErrors } = renderForm();

    fireEvent.change(fieldset(container, '元数据').querySelector('textarea')!, { target: { value: '{"bad' } });

    expect(fieldChanged).toEqual([]);
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].valid).toBe(false);
    // parseEntityFieldValueStrict 契约：displayName 前缀 + 结构化失败原因
    expect(validationErrors[0].errors[0]).toMatchObject({ field: 'meta', message: '元数据 JSON 格式不正确' });
    expect(fieldset(container, '元数据').querySelector('textarea')!.value).toBe('{"theme":"dark"}');
  });
});

// ── bigint / binary / format 语义控件 ──────────────────────────────────────

const FORMAT_FIELDS: FormFieldConfig[] = [
  { field: 'big', displayName: '大整数', type: 'bigint' },
  { field: 'blob', displayName: '字节序列', type: 'binary' },
  { field: 'accent', displayName: '颜色', type: 'string', format: { kind: 'color', colorSpace: 'hex' } },
  { field: 'homepage', displayName: '主页', type: 'string', format: { kind: 'url', schemes: ['HTTPS'] } },
  { field: 'email', displayName: '邮箱', type: 'string', format: { kind: 'email' } },
  { field: 'body', displayName: '正文', type: 'string', format: { kind: 'multilineText' } },
  { field: 'rating', displayName: '评分', type: 'number', format: { kind: 'rating', min: 1, max: 5, step: 0.5 } },
  { field: 'price', displayName: '价格', type: 'number', format: { kind: 'currency', currency: 'CNY' } },
  { field: 'dur', displayName: '时长', type: 'integer', format: { kind: 'duration', unit: 's' } },
  { field: 'birthday', displayName: '生日', type: 'date', format: { kind: 'dateTime', display: 'date' } },
  {
    field: 'labels',
    displayName: '多选',
    type: 'stringArray',
    enumValues: ['a', 'b'],
    options: { a: { label: '甲', color: '#112233' }, b: { label: '乙' } },
    format: { kind: 'multiSelect' }
  },
  {
    field: 'status2',
    displayName: '状态二',
    type: 'enum',
    enumValues: ['x', 'y'],
    options: { x: { label: '叉' }, y: { label: '勾', disabled: true } }
  }
];

const FORMAT_DATA: EntityFormData = {
  big: 42n,
  blob: new Uint8Array([0xde, 0xad]),
  accent: '#22c55e',
  homepage: 'https://example.com',
  email: 'a@example.com',
  body: 'line1\nline2',
  rating: 3.5,
  price: 9.9,
  dur: 120,
  birthday: '2026-01-02T00:00:00.000Z',
  labels: ['a'],
  status2: 'x'
};

describe('EntityForm format 语义控件（真实组件）', () => {
  function renderForm(
    props: Partial<{ fields: FormFieldConfig[]; data: EntityFormData; mode: 'view' | 'edit' | 'create' }> = {}
  ) {
    const fieldChanged: FormFieldChangeEvent[] = [];
    const validationErrors: FormValidationResult[] = [];
    const utils = render(
      <EntityForm
        fields={props.fields ?? FORMAT_FIELDS}
        data={props.data ?? FORMAT_DATA}
        mode={props.mode ?? 'edit'}
        onFieldChanged={event => fieldChanged.push(event)}
        onValidationErrors={result => validationErrors.push(result)}
      />
    );
    return { ...utils, fieldChanged, validationErrors };
  }

  function fieldset(container: HTMLElement, displayName: string): HTMLElement {
    const legends = [...container.querySelectorAll('legend')] as HTMLElement[];
    const legend = legends.find(l => l.textContent?.trim() === displayName);
    if (!legend) throw new Error(`legend not found: ${displayName}`);
    return legend.parentElement as HTMLElement;
  }

  it('bigint 渲染数字输入模式文本框', () => {
    const { container } = renderForm();
    const input = fieldset(container, '大整数').querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('numeric');
    expect(input.value).toBe('42');
  });

  it('binary 渲染 hex 文本域并回显字节', () => {
    const { container } = renderForm();
    const textarea = fieldset(container, '字节序列').querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('dead');
  });

  it('color 渲染取色器与 hex 文本输入', () => {
    const { container } = renderForm();
    const fs = fieldset(container, '颜色');
    expect(fs.querySelector('input[type=color]')).toBeTruthy();
    expect(fs.querySelector('input[type=text]')).toBeTruthy();
  });

  it('url / email 渲染对应原生输入类型', () => {
    const { container } = renderForm();
    expect(fieldset(container, '主页').querySelector('input[type=url]')).toBeTruthy();
    expect(fieldset(container, '邮箱').querySelector('input[type=email]')).toBeTruthy();
  });

  it('multilineText 渲染多行文本域', () => {
    const { container } = renderForm();
    expect(fieldset(container, '正文').querySelector('textarea')).toBeTruthy();
  });

  it('rating 数字输入带 min / max / step', () => {
    const { container } = renderForm();
    const input = fieldset(container, '评分').querySelector('input[type=number]') as HTMLInputElement;
    expect(input.min).toBe('1');
    expect(input.max).toBe('5');
    expect(input.step).toBe('0.5');
  });

  it('currency 与 duration 数字输入带单位标注', () => {
    const { container } = renderForm();
    expect(fieldset(container, '价格').textContent).toContain('CNY');
    expect(fieldset(container, '时长').textContent).toContain('s');
  });

  it('dateTime display=date 渲染 date 输入', () => {
    const { container } = renderForm();
    expect(fieldset(container, '生日').querySelector('input[type=date]')).toBeTruthy();
  });

  it('stringArray + enum 渲染复选组并回显选中项', () => {
    const { container } = renderForm();
    const checkboxes = [...fieldset(container, '多选').querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect(fieldset(container, '多选').textContent).toContain('甲');
    expect(fieldset(container, '多选').textContent).toContain('乙');
  });

  it('复选组切换按数组输出 fieldChanged', () => {
    const { container, fieldChanged } = renderForm();
    const input = fieldset(container, '多选').querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement;
    // React 的 checkbox onChange 由 click 驱动（浏览器默认翻转 checked）
    fireEvent.click(input);

    expect(fieldChanged).toHaveLength(1);
    expect(fieldChanged[0].field).toBe('labels');
    expect(fieldChanged[0].value).toEqual(['a', 'b']);
  });

  it('enum options 渲染 label 且 disabled 选项不可选', () => {
    const { container } = renderForm();
    const options = [...fieldset(container, '状态二').querySelectorAll('option')];
    expect(options.map(o => o.textContent?.trim())).toEqual(['叉', '勾']);
    expect((options[1] as HTMLOptionElement).disabled).toBe(true);
  });

  it('dateTime display=time / datetime 映射对应输入类型', () => {
    const base = FORMAT_FIELDS.find(f => f.field === 'birthday')!;
    const timeField: FormFieldConfig = { ...base, format: { kind: 'dateTime', display: 'time' } };
    const { container, rerender } = renderForm({ fields: [timeField] });
    expect(fieldset(container, '生日').querySelector('input[type=time]')).toBeTruthy();

    const datetimeField: FormFieldConfig = { ...base, format: { kind: 'dateTime', display: 'datetime' } };
    rerender(<EntityForm fields={[datetimeField]} data={{ birthday: '2026-01-02T00:00:00.000Z' }} mode='edit' />);
    expect(fieldset(container, '生日').querySelector('input[type=datetime-local]')).toBeTruthy();
  });

  it('percentage 渲染 % 单位标注，phone 字符串渲染 tel 输入', () => {
    const fields: FormFieldConfig[] = [
      { field: 'pct', displayName: '百分比', type: 'number', format: { kind: 'percentage', scale: '0..100' } },
      { field: 'tel', displayName: '电话', type: 'string', format: { kind: 'phone' } }
    ];
    const { container } = renderForm({ fields, data: { pct: 0.5, tel: '10086' } });

    expect(fieldset(container, '百分比').textContent).toContain('%');
    expect(fieldset(container, '电话').querySelector('input[type=tel]')).toBeTruthy();
  });

  it('colorValue 补全 # 前缀，非法值退回黑色', () => {
    const { container } = renderForm();
    const color = fieldset(container, '颜色').querySelector('input[type=color]') as HTMLInputElement;
    expect(color.value).toBe('#22c55e');

    fireEvent.change(fieldset(container, '颜色').querySelector('input[type=text]')!, { target: { value: '22c55e' } });
    expect(color.value).toBe('#22c55e');

    fireEvent.change(fieldset(container, '颜色').querySelector('input[type=text]')!, { target: { value: 'red' } });
    expect(color.value).toBe('#000000');
  });

  it('multiSelected 兼容逗号字符串存储形态', () => {
    const { container } = renderForm({ data: { ...FORMAT_DATA, labels: 'a,b' } });
    const checkboxes = [...fieldset(container, '多选').querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(true);
  });

  it('onMultiSelectChange 兼容逗号字符串形态的勾选与取消', () => {
    const { container, fieldChanged } = renderForm({ data: { ...FORMAT_DATA, labels: 'a' } });
    const second = fieldset(container, '多选').querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement;
    fireEvent.click(second);

    expect(fieldChanged[0].value).toEqual(['a', 'b']);
  });

  it('view 模式：枚举值未命中 options 回退原值，stringArray 兼容逗号字符串与未命名选项', () => {
    const { container } = renderForm({ mode: 'view', data: { ...FORMAT_DATA, labels: 'a,c', status2: 'z' } });
    const ghost = (name: string): string =>
      fieldset(container, name).querySelector('.input-ghost')?.textContent?.trim() ?? '';

    expect(ghost('多选')).toBe('甲, c');
    expect(ghost('状态二')).toBe('z');
  });

  it('view 模式按 format 展示（currency / binary / rating）', () => {
    const { container } = renderForm({ mode: 'view' });
    expect(fieldset(container, '价格').textContent).toContain('9.9 CNY');
    expect(fieldset(container, '字节序列').textContent).toContain('dead');
    expect(fieldset(container, '评分').textContent).toContain('3.5 ★');
  });
});
