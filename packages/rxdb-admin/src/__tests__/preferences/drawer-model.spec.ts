import { describe, expect, it, vi } from 'vitest';
import { adminEnMessages, adminZhHansMessages, createAdminI18n, translateAdmin } from '../../i18n/index.js';
import { defaultPreferences } from '../../preferences/defaults.js';
import { buildDrawerModel, type DrawerModelInput, type DrawerRow } from '../../preferences/drawer-model.js';
import { applyPatch } from '../../preferences/merge.js';
import { BUILTIN_PREFERENCE_ITEMS, extensionToItem, type PreferenceExtension } from '../../preferences/schema/index.js';

const build = (patch: object = {}, extra: Partial<DrawerModelInput> = {}, locale = 'zh-Hans') => {
  const i18n = createAdminI18n(locale);
  const write = vi.fn();
  const model = buildDrawerModel({
    prefs: applyPatch(defaultPreferences, patch),
    items: BUILTIN_PREFERENCE_ITEMS,
    translate: key => translateAdmin(i18n, key),
    sources: {
      themes: [],
      locales: [
        { value: '', label: '跟随运行时' },
        { value: 'zh-Hans', label: '简体中文' }
      ],
      timezones: [{ value: '', labelKey: 'prefs.option.app.timezone.system' }]
    },
    write,
    ...extra
  });
  const rows = model.flatMap(tab => tab.sections.flatMap(section => section.rows));
  const row = (path: string): DrawerRow => {
    const found = rows.find(candidate => candidate.path === path);
    if (!found) throw new Error(`missing row ${path}`);
    return found;
  };
  return { model, rows, row, write };
};

describe('buildDrawerModel', () => {
  it('页签固定五个，顺序与标题已翻译', () => {
    const { model } = build();
    expect(model.map(tab => tab.id)).toEqual(['appearance', 'layout', 'shortcuts', 'general', 'extension']);
    expect(model.map(tab => tab.label)).toEqual(['外观', '布局', '快捷键', '通用', '拓展']);
  });

  it('同一页签内按分组聚合，保持首次出现的顺序', () => {
    const appearance = build().model[0];
    expect(appearance.sections.map(section => section.id)).toEqual([
      'theme',
      'primaryColor',
      'radius',
      'fontSize',
      'chrome',
      'colorMode',
      'density'
    ]);
    expect(appearance.sections[4].rows.map(row => row.path)).toEqual(['theme.semiDarkSidebar', 'theme.semiDarkHeader']);
    expect(appearance.sections[0].title).toBe('主题');
  });

  it('没有扩展时「拓展」页签没有分组', () => {
    expect(build().model[4].sections).toEqual([]);
  });

  it('行带当前值、标题、控件与可操作状态', () => {
    const { row } = build({ sidebar: { width: 200 } });
    expect(row('sidebar.width')).toMatchObject({
      label: '侧栏宽度',
      value: 200,
      enabled: true,
      control: { kind: 'number', min: 160, max: 320, step: 1, unit: 'px', nullable: false }
    });
  });

  it('enabledWhen 依赖其他开关：侧栏关闭时其子项不可操作', () => {
    const { row } = build({ sidebar: { enable: false } });
    expect(row('sidebar.width').enabled).toBe(false);
    expect(row('sidebar.enable').enabled).toBe(true);
    expect(build({ content: { compact: 'wide' } }).row('content.compactWidth').enabled).toBe(true);
    expect(build().row('content.compactWidth').enabled).toBe(false);
  });

  it('分组只有一行且标题与分组标题相同时，行标题视觉隐藏', () => {
    const { row } = build();
    expect(row('theme.name').labelHidden).toBe(true);
    expect(row('theme.colorPrimary').labelHidden).toBe(true);
    expect(row('theme.radius').labelHidden).toBe(true);
    expect(row('theme.fontSize').labelHidden).toBe(false);
    expect(row('theme.semiDarkSidebar').labelHidden).toBe(false);
  });

  it('选项文案被翻译；卡片带预览类型', () => {
    const { row } = build();
    expect(row('app.layout').control).toEqual({
      kind: 'cards',
      preview: 'layout',
      options: [
        { value: 'sidebar-nav', label: '侧栏导航' },
        { value: 'header-sidebar-nav', label: '顶栏 + 侧栏' },
        { value: 'header-nav', label: '顶部导航' },
        { value: 'full-content', label: '全屏内容' }
      ]
    });
    expect(row('tabbar.styleType').control).toMatchObject({ preview: 'tabbar' });
    expect(row('transition.name').control).toMatchObject({ preview: 'transition' });
  });

  it('动态来源：语言与时区选项来自输入，labelKey 与字面量都能解析', () => {
    const { row } = build();
    expect(row('app.locale').control).toEqual({
      kind: 'select',
      options: [
        { value: '', label: '跟随运行时' },
        { value: 'zh-Hans', label: '简体中文' }
      ]
    });
    expect(row('app.timezone').control).toEqual({ kind: 'select', options: [{ value: '', label: '跟随浏览器' }] });
  });

  it('静态下拉直接解析自身选项', () => {
    expect(build().row('tabbar.persist').control).toEqual({
      kind: 'select',
      options: [
        { value: 'off', label: '不保存' },
        { value: 'session', label: '当前会话' },
        { value: 'local', label: '本机长期' }
      ]
    });
  });

  it('可空分段控件：多一个「默认」选项，null 显示为空串，选空串写入 null', () => {
    const { row, write } = build();
    const radius = row('theme.radius');
    expect(radius.control).toMatchObject({ kind: 'segmented' });
    expect((radius.control as { options: { value: string; label: string }[] }).options[0]).toEqual({
      value: '',
      label: '默认'
    });
    expect(radius.value).toBe('');
    radius.set('');
    expect(write).toHaveBeenCalledWith('theme.radius', null);
    radius.set('0.5');
    expect(write).toHaveBeenLastCalledWith('theme.radius', '0.5');
    expect(build({ theme: { radius: '0.5' } }).row('theme.radius').value).toBe('0.5');
  });

  it('非可空控件的 set 原样写入', () => {
    const { row, write } = build();
    row('app.compact').set(true);
    expect(write).toHaveBeenCalledWith('app.compact', true);
    expect(row('theme.fontSize').control).toMatchObject({ nullable: true });
    row('theme.fontSize').set(null);
    expect(write).toHaveBeenLastCalledWith('theme.fontSize', null);
  });

  it('文本项的占位符被翻译', () => {
    expect(build().row('copyright.companySiteLink').control).toEqual({ kind: 'text', placeholder: 'https://' });
    expect(build().row('logo.source').control).toEqual({ kind: 'text', placeholder: '留空只显示文字' });
  });

  it('专用控件与取色器原样透传', () => {
    const { row } = build();
    expect(row('theme.name').control).toEqual({ kind: 'themes' });
    expect(row('widget').control).toEqual({ kind: 'widgets' });
    expect(row('shortcuts').control).toEqual({ kind: 'shortcuts' });
    expect(row('theme.colorPrimary').control).toMatchObject({ kind: 'color' });
    expect(row('app.compact').control).toEqual({ kind: 'switch' });
  });

  describe('扩展项', () => {
    const tableSize: PreferenceExtension = {
      key: 'tableSize',
      type: 'number',
      defaultValue: 20,
      min: 10,
      max: 100,
      step: 10,
      label: '表格每页行数',
      hint: '影响所有实体列表',
      section: '数据表格'
    };

    it('进入「拓展」页签，字面量标题 / 说明 / 分组生效', () => {
      const { model } = build(
        { extension: { tableSize: 50 } },
        { items: [...BUILTIN_PREFERENCE_ITEMS, extensionToItem(tableSize)] }
      );
      const section = model[4].sections[0];
      expect(section.title).toBe('数据表格');
      expect(section.rows[0]).toMatchObject({
        path: 'extension.tableSize',
        label: '表格每页行数',
        hint: '影响所有实体列表',
        value: 50
      });
    });

    it('未指定分组时归入「应用设置」，labelKey 优先于字面量', () => {
      const switchExt: PreferenceExtension = {
        key: 'beta',
        type: 'switch',
        defaultValue: false,
        label: 'literal',
        labelKey: 'widget.lock',
        hintKey: 'widget.search'
      };
      const { model } = build({}, { items: [...BUILTIN_PREFERENCE_ITEMS, extensionToItem(switchExt)] });
      const row = model[4].sections[0].rows[0];
      expect(model[4].sections[0].title).toBe('应用设置');
      expect(row.label).toBe('锁屏');
      expect(row.hint).toBe('搜索');
    });
  });

  describe('文案完整性', () => {
    it('中英两份目录键集合完全一致', () => {
      expect(Object.keys(adminEnMessages).sort()).toEqual(Object.keys(adminZhHansMessages).sort());
    });

    it.each(['zh-Hans', 'en'])('%s：每个内置偏好项、分组、选项、占位符都有译文，没有漏成键名', locale => {
      const { model, rows } = build({}, {}, locale);
      const leaked: string[] = [];
      const check = (text: string | undefined): void => {
        if (text && /^(prefs|theme|widget)\./.test(text)) leaked.push(text);
      };
      for (const tab of model) {
        check(tab.label);
        for (const section of tab.sections) check(section.title);
      }
      for (const row of rows) {
        check(row.label);
        check(row.hint);
        const { control } = row;
        if ('options' in control) for (const option of control.options) check(option.label);
        if (control.kind === 'text') check(control.placeholder);
      }
      expect(leaked).toEqual([]);
    });
  });
});
