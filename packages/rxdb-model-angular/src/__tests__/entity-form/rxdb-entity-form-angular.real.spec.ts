import type { EntityFormData, FormFieldChangeEvent, FormFieldConfig, FormValidationResult } from '@aiao/rxdb-model';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntityFormComponent } from '../../entity-form/rxdb-entity-form-angular';

/**
 * EntityFormComponent —— **真实组件源码**（specs/027 T025a）。
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

describe('EntityFormComponent（真实组件）', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function render(
    inputs: Partial<{
      fields: FormFieldConfig[];
      data: EntityFormData;
      mode: 'view' | 'edit' | 'create';
      showActions: boolean;
    }> = {}
  ) {
    const fixture = TestBed.createComponent(EntityFormComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('fields', inputs.fields ?? FIELDS);
    fixture.componentRef.setInput('data', inputs.data ?? DATA);
    fixture.componentRef.setInput('mode', inputs.mode ?? 'edit');
    if (inputs.showActions !== undefined) fixture.componentRef.setInput('showActions', inputs.showActions);

    const fieldChanged: FormFieldChangeEvent[] = [];
    const formSubmitted: EntityFormData[] = [];
    const formCancelled: unknown[] = [];
    const validationErrors: FormValidationResult[] = [];
    component.fieldChanged.subscribe(e => fieldChanged.push(e));
    component.formSubmitted.subscribe(e => formSubmitted.push(e));
    component.formCancelled.subscribe(() => formCancelled.push(null));
    component.validationErrors.subscribe(e => validationErrors.push(e));
    fixture.detectChanges();

    return { fixture, component, fieldChanged, formSubmitted, formCancelled, validationErrors };
  }

  /** 按显示名定位字段的 fieldset。 */
  function fieldset(fixture: { nativeElement: HTMLElement }, displayName: string): HTMLElement {
    const legends = [...fixture.nativeElement.querySelectorAll('legend')] as HTMLElement[];
    const legend = legends.find(l => l.textContent?.trim() === displayName);
    if (!legend) throw new Error(`legend not found: ${displayName}`);
    return legend.parentElement as HTMLElement;
  }

  it('隐藏字段不渲染，其余字段按序渲染', () => {
    const { fixture } = render();
    const legends = [...fixture.nativeElement.querySelectorAll('legend')].map(l => l.textContent?.trim());

    expect(legends).toHaveLength(FIELDS.length - 1);
    expect(legends).not.toContain('隐藏字段');
    expect(legends[0]).toBe('名称');
  });

  it('12 类字段渲染对应控件', () => {
    const { fixture } = render();

    expect(fieldset(fixture, '名称').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(fixture, '启用').querySelector('input[type=checkbox]')).toBeTruthy();
    expect(fieldset(fixture, '状态').querySelector('select')).toBeTruthy();
    expect(fieldset(fixture, '截止时间').querySelector('input[type=datetime-local]')).toBeTruthy();
    expect(fieldset(fixture, '分数').querySelector('input[type=number]')).toBeTruthy();
    expect(fieldset(fixture, '数量').querySelector('input[type=number]')).toBeTruthy();
    expect(fieldset(fixture, '标签').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(fixture, '权重').querySelector('input[type=text]')).toBeTruthy();
    expect(fieldset(fixture, '元数据').querySelector('textarea')).toBeTruthy();
    expect(fieldset(fixture, '属性').querySelector('textarea')).toBeTruthy();
    expect(fieldset(fixture, '负责人').querySelector('select')).toBeTruthy();
    expect(fieldset(fixture, '头像').querySelector('select')).toBeTruthy();
    expect(fieldset(fixture, '备注').querySelector('input[type=text]')).toBeTruthy();
  });

  it('enum 渲染全部枚举值，nullable 时带 (空) 选项', () => {
    const { fixture } = render();
    const options = [...fieldset(fixture, '状态').querySelectorAll('option')].map(o => o.textContent?.trim());

    expect(options).toEqual(['(空)', 'new', 'doing', 'done']);
  });

  it('关系字段经 relatedEntityProvider 渲染选项', () => {
    const { fixture } = render();
    fixture.componentRef.setInput('relatedEntityProvider', (entityName: string) =>
      entityName === 'User' ?
        [
          { id: 'u-1', displayName: '张三' },
          { id: 'u-2', displayName: '李四' }
        ]
      : [{ id: 'a-1', displayName: 'logo.png' }]
    );
    fixture.detectChanges();

    const ownerOptions = [...fieldset(fixture, '负责人').querySelectorAll('option')].map(o => o.textContent?.trim());
    expect(ownerOptions).toEqual(['(空)', '张三', '李四']);

    const avatarOptions = [...fieldset(fixture, '头像').querySelectorAll('option')].map(o => o.textContent?.trim());
    expect(avatarOptions).toEqual(['(空)', 'logo.png']);
  });

  it('view 模式全部只读：渲染展示值而非输入控件', () => {
    const { fixture } = render({ mode: 'view' });

    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.input-ghost').length).toBe(FIELDS.length - 1);
  });

  it('view 模式按 formatEntityFieldValue 格式化展示：数组/布尔/JSON/关系显示名', () => {
    const { fixture } = render({ mode: 'view' });
    fixture.componentRef.setInput('relatedEntityProvider', (entityName: string) =>
      entityName === 'User' ? [{ id: 'u-1', displayName: '张三' }] : []
    );
    fixture.detectChanges();

    const ghost = (name: string): string =>
      fieldset(fixture, name).querySelector('.input-ghost')?.textContent?.trim() ?? '';

    expect(ghost('标签')).toBe('a, b');
    expect(ghost('启用')).toBe('true');
    expect(ghost('元数据')).toBe('{"theme":"dark"}');
    expect(ghost('负责人')).toBe('张三');
    // 未命中的关系值回退到格式化后的原始值（avatar 为 null → 空串）
    expect(ghost('头像')).toBe('');
  });

  it('edit 模式下 readonly 字段也只读展示', () => {
    const fields = [{ field: 'locked', displayName: '锁定', type: 'string', readonly: true }] as FormFieldConfig[];
    const { fixture } = render({ fields, data: { locked: 'no-touch' } });

    expect(fieldset(fixture, '锁定').querySelector('.input-ghost')).toBeTruthy();
    expect(fieldset(fixture, '锁定').textContent).toContain('no-touch');
  });

  it('checkbox 变更走 fieldChanged，携带解析值与旧值', () => {
    const { fixture, fieldChanged } = render();
    const checkbox = fieldset(fixture, '启用').querySelector('input[type=checkbox]') as HTMLInputElement;

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fieldChanged).toEqual([{ field: 'active', type: 'boolean', value: false, previousValue: true }]);
    expect(fixture.componentInstance.formData()['active']).toBe(false);
  });

  it('number 输入解析为数字，stringArray 按逗号拆分', () => {
    const { fixture, component, fieldChanged } = render();

    component.onFieldChange(
      FIELDS.find(f => f.field === 'score')!,
      '4.5'
    );
    component.onFieldChange(
      FIELDS.find(f => f.field === 'tags')!,
      'x, y , z'
    );
    fixture.detectChanges();

    expect(fieldChanged.at(-2)).toMatchObject({ field: 'score', type: 'number', value: 4.5 });
    expect(fieldChanged.at(-1)).toMatchObject({ field: 'tags', type: 'stringArray', value: ['x', 'y', 'z'] });
    expect(component.formData()['tags']).toEqual(['x', 'y', 'z']);
  });

  it('枚举变更写入解析后的字符串', () => {
    const { fixture, component } = render();
    const select = fieldset(fixture, '状态').querySelector('select') as HTMLSelectElement;

    select.value = 'done';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.formData()['status']).toBe('done');
  });

  it('必填缺失时 onSubmit 阻止提交并输出 validationErrors', () => {
    const { fixture, component, formSubmitted, validationErrors } = render({ data: { ...DATA, name: '' } });

    component.onSubmit();
    fixture.detectChanges();

    expect(formSubmitted).toEqual([]);
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].valid).toBe(false);
    expect(validationErrors[0].errors[0]).toMatchObject({ field: 'name' });
  });

  it('校验通过时 onSubmit 输出当前表单数据', () => {
    const { component, formSubmitted } = render();

    component.onFieldChange(FIELDS[0], 'Bob');
    component.onSubmit();

    expect(formSubmitted).toHaveLength(1);
    expect(formSubmitted[0]['name']).toBe('Bob');
  });

  it('onCancel 重置为初始数据并输出 formCancelled', () => {
    const { component, formCancelled } = render();

    component.onFieldChange(FIELDS[0], 'Changed');
    expect(component.formData()['name']).toBe('Changed');

    component.onCancel();

    expect(component.formData()['name']).toBe('Alice');
    expect(formCancelled).toHaveLength(1);
  });

  it('showActions=false 不渲染保存/取消按钮，showActions 默认渲染', () => {
    expect(render().fixture.nativeElement.textContent).toContain('保存');
    expect(render({ showActions: false }).fixture.nativeElement.textContent).not.toContain('保存');
  });

  it('create 模式与 edit 一致渲染可编辑控件', () => {
    const { fixture } = render({ mode: 'create' });

    expect(fieldset(fixture, '名称').querySelector('input[type=text]')).toBeTruthy();
  });

  it('解析抛错时输出 validationErrors 且不更新表单数据', () => {
    const { component, fieldChanged, validationErrors } = render();
    const evilValue = {
      toString: () => {
        throw new Error('无法转换的值');
      }
    };

    component.onFieldChange(
      FIELDS.find(f => f.field === 'tags')!,
      evilValue
    );

    expect(fieldChanged).toEqual([]);
    expect(validationErrors).toHaveLength(1);
    expect(validationErrors[0].valid).toBe(false);
    // parseEntityFieldValueStrict 契约：displayName 前缀 + 结构化失败原因
    expect(validationErrors[0].errors[0]).toMatchObject({ field: 'tags', message: '标签 无法转换的值' });
    expect(component.formData()['tags']).toEqual(['a', 'b']);
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

describe('EntityFormComponent format 语义控件（真实组件）', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  function render(
    inputs: Partial<{ fields: FormFieldConfig[]; data: EntityFormData; mode: 'view' | 'edit' | 'create' }> = {}
  ) {
    const fixture = TestBed.createComponent(EntityFormComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('fields', inputs.fields ?? FORMAT_FIELDS);
    fixture.componentRef.setInput('data', inputs.data ?? FORMAT_DATA);
    fixture.componentRef.setInput('mode', inputs.mode ?? 'edit');

    const fieldChanged: FormFieldChangeEvent[] = [];
    const validationErrors: FormValidationResult[] = [];
    component.fieldChanged.subscribe(e => fieldChanged.push(e));
    component.validationErrors.subscribe(e => validationErrors.push(e));
    fixture.detectChanges();

    return { fixture, component, fieldChanged, validationErrors };
  }

  function fieldset(fixture: { nativeElement: HTMLElement }, displayName: string): HTMLElement {
    const legends = [...fixture.nativeElement.querySelectorAll('legend')] as HTMLElement[];
    const legend = legends.find(l => l.textContent?.trim() === displayName);
    if (!legend) throw new Error(`legend not found: ${displayName}`);
    return legend.parentElement as HTMLElement;
  }

  it('bigint 渲染数字输入模式文本框', () => {
    const { fixture } = render();
    const input = fieldset(fixture, '大整数').querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('numeric');
    expect(input.value).toBe('42');
  });

  it('binary 渲染 hex 文本域并回显字节', () => {
    const { fixture } = render();
    const textarea = fieldset(fixture, '字节序列').querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('dead');
  });

  it('color 渲染取色器与 hex 文本输入', () => {
    const { fixture } = render();
    const fs = fieldset(fixture, '颜色');
    expect(fs.querySelector('input[type=color]')).toBeTruthy();
    expect(fs.querySelector('input[type=text]')).toBeTruthy();
  });

  it('url / email 渲染对应原生输入类型', () => {
    const { fixture } = render();
    expect(fieldset(fixture, '主页').querySelector('input[type=url]')).toBeTruthy();
    expect(fieldset(fixture, '邮箱').querySelector('input[type=email]')).toBeTruthy();
  });

  it('multilineText 渲染多行文本域', () => {
    const { fixture } = render();
    expect(fieldset(fixture, '正文').querySelector('textarea')).toBeTruthy();
  });

  it('rating 数字输入带 min / max / step', () => {
    const { fixture } = render();
    const input = fieldset(fixture, '评分').querySelector('input[type=number]') as HTMLInputElement;
    expect(input.min).toBe('1');
    expect(input.max).toBe('5');
    expect(input.step).toBe('0.5');
  });

  it('currency 与 duration 数字输入带单位标注', () => {
    const { fixture } = render();
    expect(fieldset(fixture, '价格').textContent).toContain('CNY');
    expect(fieldset(fixture, '时长').textContent).toContain('s');
  });

  it('dateTime display=date 渲染 date 输入', () => {
    const { fixture } = render();
    expect(fieldset(fixture, '生日').querySelector('input[type=date]')).toBeTruthy();
  });

  it('stringArray + enum 渲染复选组并回显选中项', () => {
    const { fixture } = render();
    const checkboxes = [...fieldset(fixture, '多选').querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
    expect(fieldset(fixture, '多选').textContent).toContain('甲');
    expect(fieldset(fixture, '多选').textContent).toContain('乙');
  });

  it('复选组切换按数组输出 fieldChanged', () => {
    const { fixture, fieldChanged } = render();
    const input = fieldset(fixture, '多选').querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement;
    // 浏览器点击会先翻转 checked 再派发 change，这里按同样顺序模拟
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(fieldChanged).toHaveLength(1);
    expect(fieldChanged[0].field).toBe('labels');
    expect(fieldChanged[0].value).toEqual(['a', 'b']);
  });

  it('enum options 渲染 label 且 disabled 选项不可选', () => {
    const { fixture } = render();
    const options = [...fieldset(fixture, '状态二').querySelectorAll('option')];
    expect(options.map(o => o.textContent?.trim())).toEqual(['叉', '勾']);
    expect((options[1] as HTMLOptionElement).disabled).toBe(true);
  });

  it('dateTime display=time / datetime 映射对应输入类型与管道格式', () => {
    const { component } = render();
    const base = FORMAT_FIELDS.find(f => f.field === 'birthday')!;

    const time: FormFieldConfig = { ...base, format: { kind: 'dateTime', display: 'time' } };
    expect(component.dateInputType(time)).toBe('time');
    expect(component.datePipeFormat(time)).toBe('HH:mm');

    const datetime: FormFieldConfig = { ...base, format: { kind: 'dateTime', display: 'datetime' } };
    expect(component.dateInputType(datetime)).toBe('datetime-local');
    expect(component.datePipeFormat(datetime)).toBe('yyyy-MM-ddTHH:mm');
  });

  it('percentage 渲染 % 单位标注，phone 字符串渲染 tel 输入', () => {
    const fields: FormFieldConfig[] = [
      { field: 'pct', displayName: '百分比', type: 'number', format: { kind: 'percentage' } },
      { field: 'tel', displayName: '电话', type: 'string', format: { kind: 'phone' } }
    ];
    const { fixture } = render({ fields, data: { pct: 0.5, tel: '10086' } });

    expect(fieldset(fixture, '百分比').textContent).toContain('%');
    expect(fieldset(fixture, '电话').querySelector('input[type=tel]')).toBeTruthy();
  });

  it('colorValue 补全 # 前缀，非法值退回黑色', () => {
    const { component } = render();
    const accent = FORMAT_FIELDS.find(f => f.field === 'accent')!;

    expect(component.colorValue(accent)).toBe('#22c55e');

    component.onFieldChange(accent, '22c55e');
    expect(component.colorValue(accent)).toBe('#22c55e');

    component.onFieldChange(accent, 'red');
    expect(component.colorValue(accent)).toBe('#000000');
  });

  it('binaryToHex 只回显 Uint8Array，其它形态退回空串', () => {
    const { component } = render();
    expect(component.binaryToHex(new Uint8Array([0x0a, 0x0b]))).toBe('0a0b');
    expect(component.binaryToHex('dead')).toBe('');
  });

  it('multiSelected 兼容逗号字符串存储形态，非数组非字符串返回 false', () => {
    const { component } = render({ data: { ...FORMAT_DATA, labels: 'a,b' } });
    const labels = FORMAT_FIELDS.find(f => f.field === 'labels')!;

    expect(component.multiSelected(labels, 'a')).toBe(true);
    expect(component.multiSelected(labels, 'c')).toBe(false);

    const dur = FORMAT_FIELDS.find(f => f.field === 'dur')!;
    expect(component.multiSelected(dur, 'a')).toBe(false);
  });

  it('onMultiSelectChange 兼容逗号字符串形态的勾选与取消', () => {
    const labels = FORMAT_FIELDS.find(f => f.field === 'labels')!;

    const checked = render({ data: { ...FORMAT_DATA, labels: 'a' } });
    checked.component.onMultiSelectChange(labels, 'b', true);
    expect(checked.component.formData()['labels']).toEqual(['a', 'b']);

    const unchecked = render({ data: { ...FORMAT_DATA, labels: 'a,b' } });
    unchecked.component.onMultiSelectChange(labels, 'a', false);
    expect(unchecked.component.formData()['labels']).toEqual(['b']);
  });

  it('view 模式：枚举值未命中 options 回退原值，stringArray 兼容逗号字符串与未命名选项', () => {
    const { fixture } = render({ mode: 'view', data: { ...FORMAT_DATA, labels: 'a,c', status2: 'z' } });
    const ghost = (name: string): string =>
      fieldset(fixture, name).querySelector('.input-ghost')?.textContent?.trim() ?? '';

    expect(ghost('多选')).toBe('甲, c');
    expect(ghost('状态二')).toBe('z');
  });

  it('view 模式按 format 展示（currency / binary / rating）', () => {
    const { fixture } = render({ mode: 'view' });
    expect(fieldset(fixture, '价格').textContent).toContain('9.9 CNY');
    expect(fieldset(fixture, '字节序列').textContent).toContain('dead');
    expect(fieldset(fixture, '评分').textContent).toContain('3.5 ★');
  });
});
