import type { EntityFormData, FormFieldChangeEvent, FormFieldConfig, FormValidationResult } from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EntityForm from '../../entity-form/EntityForm.vue';

/**
 * EntityForm —— **真实组件源码**（对齐 Angular 侧）。
 *
 * 覆盖 12 类字段渲染、view 模式只读展示、fieldChanged / formSubmitted /
 * formCancelled / validationErrors 四条输出链路；解析与校验全部走
 * `@aiao/rxdb-model` 的真实 `parseEntityFieldValue` / `validateForm`。
 * 不复制任何组件逻辑到 spec 内。
 */

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

/** 暴露给测试的内部访问器类型（defineExpose 的面）。 */
type EntityFormVM = InstanceType<typeof EntityForm> & {
  formData: EntityFormData;
  initialData: EntityFormData;
  isReadonly: boolean;
  onFieldChange(field: FormFieldConfig, rawValue: unknown): void;
  onSubmit(): void;
  onCancel(): void;
  isFieldReadonly(field: FormFieldConfig): boolean;
  isWideField(field: FormFieldConfig): boolean;
  isTextareaFormat(field: FormFieldConfig): boolean;
  dateInputType(field: FormFieldConfig): 'date' | 'datetime-local' | 'time';
  datePipeFormat(field: FormFieldConfig): string;
  numericBounds(field: FormFieldConfig): { min?: number; max?: number; step?: number };
  numericUnitLabel(field: FormFieldConfig): string;
  enumOptionLabel(field: FormFieldConfig, value: string): string;
  enumOptionDisabled(field: FormFieldConfig, value: string): boolean;
  textInputType(field: FormFieldConfig): string;
  colorValue(field: FormFieldConfig): string;
  binaryToHex(value: unknown): string;
  multiSelected(field: FormFieldConfig, value: string): boolean;
  onMultiSelectChange(field: FormFieldConfig, value: string, checked: boolean): void;
};

describe('EntityForm（真实组件）', () => {
  function render(
    inputs: Partial<{
      fields: FormFieldConfig[];
      data: EntityFormData;
      mode: 'view' | 'edit' | 'create';
      showActions: boolean;
    }> = {}
  ) {
    const wrapper = mount(EntityForm, {
      props: {
        fields: inputs.fields ?? FIELDS,
        data: inputs.data ?? DATA,
        mode: inputs.mode ?? 'edit',
        ...(inputs.showActions !== undefined ? { showActions: inputs.showActions } : {})
      }
    });
    const vm = wrapper.vm as unknown as EntityFormVM;
    return {
      wrapper,
      vm,
      // Vue emit 记录是 [payload][] 形态，这里取每条的 payload
      fieldChanged: () => (wrapper.emitted('fieldChanged') ?? []).map(e => e[0] as FormFieldChangeEvent),
      formSubmitted: () => (wrapper.emitted('formSubmitted') ?? []).map(e => e[0] as EntityFormData),
      formCancelled: () => (wrapper.emitted('formCancelled') ?? []).map(() => null),
      validationErrors: () => (wrapper.emitted('validationErrors') ?? []).map(e => e[0] as FormValidationResult)
    };
  }

  /** 按显示名定位字段的 fieldset。 */
  function fieldset(wrapper: { element: HTMLElement }, displayName: string): HTMLElement {
    const legends = [...wrapper.element.querySelectorAll('legend')] as HTMLElement[];
    const legend = legends.find(l => l.textContent?.trim() === displayName);
    if (!legend) throw new Error(`legend not found: ${displayName}`);
    return legend.parentElement as HTMLElement;
  }

  it('隐藏字段不渲染，其余字段按序渲染', () => {
    const { wrapper } = render();
    const legends = [...wrapper.element.querySelectorAll('legend')].map(l => l.textContent?.trim());

    expect(legends).toHaveLength(FIELDS.length - 1);
    expect(legends).not.toContain('隐藏字段');
    expect(legends[0]).toBe('名称');
  });

  it('12 类字段渲染对应控件', () => {
    const { wrapper } = render();

    expect(fieldset(wrapper, '名称').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(wrapper, '启用').querySelector('input[type=checkbox]')).toBeTruthy();
    expect(fieldset(wrapper, '状态').querySelector('select')).toBeTruthy();
    expect(fieldset(wrapper, '截止时间').querySelector('input[type=datetime-local]')).toBeTruthy();
    expect(fieldset(wrapper, '分数').querySelector('input[type=number]')).toBeTruthy();
    expect(fieldset(wrapper, '数量').querySelector('input[type=number]')).toBeTruthy();
    expect(fieldset(wrapper, '标签').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(wrapper, '权重').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(wrapper, '元数据').querySelector('textarea')).toBeTruthy();
    expect(fieldset(wrapper, '属性').querySelector('textarea')).toBeTruthy();
    expect(fieldset(wrapper, '负责人').querySelector('select')).toBeTruthy();
    expect(fieldset(wrapper, '头像').querySelector('select')).toBeTruthy();
    expect(fieldset(wrapper, '备注').querySelector('input[type=text]')).toBeTruthy();
  });

  it('enum 渲染全部枚举值，nullable 时带 (空) 选项', () => {
    const { wrapper } = render();
    const options = [...fieldset(wrapper, '状态').querySelectorAll('option')].map(o => o.textContent?.trim());

    expect(options).toEqual(['(空)', 'new', 'doing', 'done']);
  });

  it('关系字段经 relatedEntityProvider 渲染选项', async () => {
    const { wrapper } = render();
    await wrapper.setProps({
      relatedEntityProvider: (entityName: string) =>
        entityName === 'User' ?
          [
            { id: 'u-1', displayName: '张三' },
            { id: 'u-2', displayName: '李四' }
          ]
        : [{ id: 'a-1', displayName: 'logo.png' }]
    });

    const ownerOptions = [...fieldset(wrapper, '负责人').querySelectorAll('option')].map(o => o.textContent?.trim());
    expect(ownerOptions).toEqual(['(空)', '张三', '李四']);

    const avatarOptions = [...fieldset(wrapper, '头像').querySelectorAll('option')].map(o => o.textContent?.trim());
    expect(avatarOptions).toEqual(['(空)', 'logo.png']);
  });

  it('view 模式全部只读：渲染展示值而非输入控件', () => {
    const { wrapper } = render({ mode: 'view' });

    expect(wrapper.element.querySelector('input')).toBeNull();
    expect(wrapper.element.querySelector('select')).toBeNull();
    expect(wrapper.element.querySelector('textarea')).toBeNull();
    expect(wrapper.element.querySelectorAll('.input-ghost').length).toBe(FIELDS.length - 1);
  });

  it('view 模式按 formatEntityFieldValue 格式化展示：数组/布尔/JSON/关系显示名', async () => {
    const { wrapper } = render({ mode: 'view' });
    await wrapper.setProps({
      relatedEntityProvider: (entityName: string) => (entityName === 'User' ? [{ id: 'u-1', displayName: '张三' }] : [])
    });

    const ghost = (name: string): string =>
      fieldset(wrapper, name).querySelector('.input-ghost')?.textContent?.trim() ?? '';

    expect(ghost('标签')).toBe('a, b');
    expect(ghost('启用')).toBe('true');
    expect(ghost('元数据')).toBe('{"theme":"dark"}');
    expect(ghost('负责人')).toBe('张三');
    // 未命中的关系值回退到格式化后的原始值（avatar 为 null → 空串）
    expect(ghost('头像')).toBe('');
  });

  it('edit 模式下 readonly 字段也只读展示', () => {
    const fields = [{ field: 'locked', displayName: '锁定', type: 'string', readonly: true }] as FormFieldConfig[];
    const { wrapper } = render({ fields, data: { locked: 'no-touch' } });

    expect(fieldset(wrapper, '锁定').querySelector('.input-ghost')).toBeTruthy();
    expect(fieldset(wrapper, '锁定').textContent).toContain('no-touch');
  });

  it('checkbox 变更走 fieldChanged，携带解析值与旧值', async () => {
    const { wrapper, fieldChanged } = render();
    const checkbox = fieldset(wrapper, '启用').querySelector('input[type=checkbox]') as HTMLInputElement;

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await wrapper.vm.$nextTick();

    expect(fieldChanged()).toEqual([{ field: 'active', type: 'boolean', value: false, previousValue: true }]);
    expect((wrapper.vm as unknown as EntityFormVM).formData['active']).toBe(false);
  });

  it('number 输入解析为数字，stringArray 按逗号拆分', () => {
    const { vm, fieldChanged } = render();

    vm.onFieldChange(
      FIELDS.find(f => f.field === 'score')!,
      '4.5'
    );
    vm.onFieldChange(
      FIELDS.find(f => f.field === 'tags')!,
      'x, y , z'
    );

    expect(fieldChanged()?.at(-2)).toMatchObject({ field: 'score', type: 'number', value: 4.5 });
    expect(fieldChanged()?.at(-1)).toMatchObject({ field: 'tags', type: 'stringArray', value: ['x', 'y', 'z'] });
    expect(vm.formData['tags']).toEqual(['x', 'y', 'z']);
  });

  it('枚举变更写入解析后的字符串', async () => {
    const { wrapper, vm } = render();
    const select = fieldset(wrapper, '状态').querySelector('select') as HTMLSelectElement;

    select.value = 'done';
    select.dispatchEvent(new Event('change'));
    await wrapper.vm.$nextTick();

    expect(vm.formData['status']).toBe('done');
  });

  it('必填缺失时 onSubmit 阻止提交并输出 validationErrors', () => {
    const { vm, formSubmitted, validationErrors } = render({ data: { ...DATA, name: '' } });

    vm.onSubmit();

    expect(formSubmitted()).toEqual([]);
    expect(validationErrors()).toHaveLength(1);
    expect(validationErrors()?.[0].valid).toBe(false);
    expect(validationErrors()?.[0].errors[0]).toMatchObject({ field: 'name' });
  });

  it('校验通过时 onSubmit 输出当前表单数据', () => {
    const { vm, formSubmitted } = render();

    vm.onFieldChange(FIELDS[0], 'Bob');
    vm.onSubmit();

    expect(formSubmitted()).toHaveLength(1);
    expect(formSubmitted()?.[0]['name']).toBe('Bob');
  });

  it('onCancel 重置为初始数据并输出 formCancelled', () => {
    const { vm, formCancelled } = render();

    vm.onFieldChange(FIELDS[0], 'Changed');
    expect(vm.formData['name']).toBe('Changed');

    vm.onCancel();

    expect(vm.formData['name']).toBe('Alice');
    expect(formCancelled()).toHaveLength(1);
  });

  it('showActions=false 不渲染保存/取消按钮，showActions 默认渲染', () => {
    expect(render().wrapper.element.textContent).toContain('保存');
    expect(render({ showActions: false }).wrapper.element.textContent).not.toContain('保存');
  });

  it('create 模式与 edit 一致渲染可编辑控件', () => {
    const { wrapper } = render({ mode: 'create' });

    expect(fieldset(wrapper, '名称').querySelector('input[type=text]')).toBeTruthy();
  });

  it('解析抛错时输出 validationErrors 且不更新表单数据', () => {
    const { vm, fieldChanged, validationErrors } = render();
    const evilValue = {
      toString: () => {
        throw new Error('无法转换的值');
      }
    };

    vm.onFieldChange(
      FIELDS.find(f => f.field === 'tags')!,
      evilValue
    );

    expect(fieldChanged()).toEqual([]);
    expect(validationErrors()).toHaveLength(1);
    expect(validationErrors()?.[0].valid).toBe(false);
    // parseEntityFieldValueStrict 契约：displayName 前缀 + 结构化失败原因
    expect(validationErrors()?.[0].errors[0]).toMatchObject({ field: 'tags', message: '标签 无法转换的值' });
    expect(vm.formData['tags']).toEqual(['a', 'b']);
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
  function render(
    inputs: Partial<{ fields: FormFieldConfig[]; data: EntityFormData; mode: 'view' | 'edit' | 'create' }> = {}
  ) {
    const wrapper = mount(EntityForm, {
      props: {
        fields: inputs.fields ?? FORMAT_FIELDS,
        data: inputs.data ?? FORMAT_DATA,
        mode: inputs.mode ?? 'edit'
      }
    });
    const vm = wrapper.vm as unknown as EntityFormVM;
    return {
      wrapper,
      vm,
      fieldChanged: () => (wrapper.emitted('fieldChanged') ?? []).map(e => e[0] as FormFieldChangeEvent),
      validationErrors: () => (wrapper.emitted('validationErrors') ?? []).map(e => e[0] as FormValidationResult)
    };
  }

  function fieldset(wrapper: { element: HTMLElement }, displayName: string): HTMLElement {
    const legends = [...wrapper.element.querySelectorAll('legend')] as HTMLElement[];
    const legend = legends.find(l => l.textContent?.trim() === displayName);
    if (!legend) throw new Error(`legend not found: ${displayName}`);
    return legend.parentElement as HTMLElement;
  }

  it('bigint 渲染数字输入模式文本框', () => {
    const { wrapper } = render();
    const input = fieldset(wrapper, '大整数').querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('numeric');
    expect(input.value).toBe('42');
  });

  it('binary 渲染 hex 文本域并回显字节', () => {
    const { wrapper } = render();
    const textarea = fieldset(wrapper, '字节序列').querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('dead');
  });

  it('color 渲染取色器与 hex 文本输入', () => {
    const { wrapper } = render();
    const fs = fieldset(wrapper, '颜色');
    expect(fs.querySelector('input[type=color]')).toBeTruthy();
    expect(fs.querySelector('input[type=text]')).toBeTruthy();
  });

  it('url / email 渲染对应原生输入类型', () => {
    const { wrapper } = render();
    expect(fieldset(wrapper, '主页').querySelector('input[type=url]')).toBeTruthy();
    expect(fieldset(wrapper, '邮箱').querySelector('input[type=email]')).toBeTruthy();
  });

  it('multilineText 渲染多行文本域', () => {
    const { wrapper } = render();
    expect(fieldset(wrapper, '正文').querySelector('textarea')).toBeTruthy();
  });

  it('rating 数字输入带 min / max / step', () => {
    const { wrapper } = render();
    const input = fieldset(wrapper, '评分').querySelector('input[type=number]') as HTMLInputElement;
    expect(input.min).toBe('1');
    expect(input.max).toBe('5');
    expect(input.step).toBe('0.5');
  });

  it('currency 与 duration 数字输入带单位标注', () => {
    const { wrapper } = render();
    expect(fieldset(wrapper, '价格').textContent).toContain('CNY');
    expect(fieldset(wrapper, '时长').textContent).toContain('s');
  });

  it('dateTime display=date 渲染 date 输入', () => {
    const { wrapper } = render();
    expect(fieldset(wrapper, '生日').querySelector('input[type=date]')).toBeTruthy();
  });

  it('stringArray + enum 渲染复选组并回显选中项', () => {
    const { wrapper } = render();
    const checkboxes = [...fieldset(wrapper, '多选').querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect(fieldset(wrapper, '多选').textContent).toContain('甲');
    expect(fieldset(wrapper, '多选').textContent).toContain('乙');
  });

  it('复选组切换按数组输出 fieldChanged', async () => {
    const { wrapper, fieldChanged } = render();
    const input = fieldset(wrapper, '多选').querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement;
    // 浏览器点击会先翻转 checked 再派发 change，这里按同样顺序模拟
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(fieldChanged()).toHaveLength(1);
    expect(fieldChanged()?.[0].field).toBe('labels');
    expect(fieldChanged()?.[0].value).toEqual(['a', 'b']);
  });

  it('enum options 渲染 label 且 disabled 选项不可选', () => {
    const { wrapper } = render();
    const options = [...fieldset(wrapper, '状态二').querySelectorAll('option')];
    expect(options.map(o => o.textContent?.trim())).toEqual(['叉', '勾']);
    expect((options[1] as HTMLOptionElement).disabled).toBe(true);
  });

  it('dateTime display=time / datetime 映射对应输入类型与格式', () => {
    const { vm } = render();
    const base = FORMAT_FIELDS.find(f => f.field === 'birthday')!;

    const time: FormFieldConfig = { ...base, format: { kind: 'dateTime', display: 'time' } };
    expect(vm.dateInputType(time)).toBe('time');
    expect(vm.datePipeFormat(time)).toBe('HH:mm');

    const datetime: FormFieldConfig = { ...base, format: { kind: 'dateTime', display: 'datetime' } };
    expect(vm.dateInputType(datetime)).toBe('datetime-local');
    expect(vm.datePipeFormat(datetime)).toBe('yyyy-MM-ddTHH:mm');
  });

  it('percentage 渲染 % 单位标注，phone 字符串渲染 tel 输入', () => {
    const fields = [
      { field: 'pct', displayName: '百分比', type: 'number', format: { kind: 'percentage' } },
      { field: 'tel', displayName: '电话', type: 'string', format: { kind: 'phone' } }
    ] as FormFieldConfig[];
    const { wrapper } = render({ fields, data: { pct: 0.5, tel: '10086' } });

    expect(fieldset(wrapper, '百分比').textContent).toContain('%');
    expect(fieldset(wrapper, '电话').querySelector('input[type=tel]')).toBeTruthy();
  });

  it('colorValue 补全 # 前缀，非法值退回黑色', () => {
    const { vm } = render();
    const accent = FORMAT_FIELDS.find(f => f.field === 'accent')!;

    expect(vm.colorValue(accent)).toBe('#22c55e');

    vm.onFieldChange(accent, '22c55e');
    expect(vm.colorValue(accent)).toBe('#22c55e');

    vm.onFieldChange(accent, 'red');
    expect(vm.colorValue(accent)).toBe('#000000');
  });

  it('binaryToHex 只回显 Uint8Array，其它形态退回空串', () => {
    const { vm } = render();
    expect(vm.binaryToHex(new Uint8Array([0x0a, 0x0b]))).toBe('0a0b');
    expect(vm.binaryToHex('dead')).toBe('');
  });

  it('multiSelected 兼容逗号字符串存储形态，非数组非字符串返回 false', () => {
    const { vm } = render({ data: { ...FORMAT_DATA, labels: 'a,b' } });
    const labels = FORMAT_FIELDS.find(f => f.field === 'labels')!;

    expect(vm.multiSelected(labels, 'a')).toBe(true);
    expect(vm.multiSelected(labels, 'c')).toBe(false);

    const dur = FORMAT_FIELDS.find(f => f.field === 'dur')!;
    expect(vm.multiSelected(dur, 'a')).toBe(false);
  });

  it('onMultiSelectChange 兼容逗号字符串形态的勾选与取消', () => {
    const labels = FORMAT_FIELDS.find(f => f.field === 'labels')!;

    const checked = render({ data: { ...FORMAT_DATA, labels: 'a' } });
    checked.vm.onMultiSelectChange(labels, 'b', true);
    expect(checked.vm.formData['labels']).toEqual(['a', 'b']);

    const unchecked = render({ data: { ...FORMAT_DATA, labels: 'a,b' } });
    unchecked.vm.onMultiSelectChange(labels, 'a', false);
    expect(unchecked.vm.formData['labels']).toEqual(['b']);
  });

  it('view 模式：枚举值未命中 options 回退原值，stringArray 兼容逗号字符串与未命名选项', () => {
    const { wrapper } = render({ mode: 'view', data: { ...FORMAT_DATA, labels: 'a,c', status2: 'z' } });
    const ghost = (name: string): string =>
      fieldset(wrapper, name).querySelector('.input-ghost')?.textContent?.trim() ?? '';

    expect(ghost('多选')).toBe('甲, c');
    expect(ghost('状态二')).toBe('z');
  });

  it('view 模式按 format 展示（currency / binary / rating）', () => {
    const { wrapper } = render({ mode: 'view' });
    expect(fieldset(wrapper, '价格').textContent).toContain('9.9 CNY');
    expect(fieldset(wrapper, '字节序列').textContent).toContain('dead');
    expect(fieldset(wrapper, '评分').textContent).toContain('3.5 ★');
  });
});
