import { isWorkbenchEditorEngine } from './editor.js';
import { isRuntimeId, RUNTIME_IDS, RUNTIME_LABELS, type RuntimeId } from './terminal/runtime-adapter.js';
import { createCodicon, type CodiconName } from './workbench-icons.js';
import { defaultWorkbenchPreferences, type WorkbenchPreferences } from './workbench-state.js';

/** 用户设置在修改时立即应用并持久化。 */
export interface WorkbenchSettingsOptions extends WorkbenchPreferences {
  readonly availableRuntimes: ReadonlySet<RuntimeId>;
  onApply(settings: WorkbenchPreferences): void;
}

type SettingKey = keyof WorkbenchPreferences;
type SettingCategory = 'all' | 'editor' | 'scm' | 'runtime';
interface SettingChoice {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}
interface SettingDefinition {
  readonly key: SettingKey;
  readonly name: string;
  readonly id: string;
  readonly category: SettingCategory;
  readonly title: string;
  readonly description: string;
  readonly choices: readonly SettingChoice[];
}
interface SettingEntry {
  readonly definition: SettingDefinition;
  readonly row: HTMLElement;
  readonly control: HTMLInputElement | HTMLSelectElement;
  readonly reset: HTMLButtonElement;
}

const categories: readonly (readonly [SettingCategory, string])[] = [
  ['all', '常用设置'],
  ['editor', '文本编辑器'],
  ['scm', '源代码管理'],
  ['runtime', '终端与运行']
];

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function iconButton(label: string, icon: CodiconName): HTMLButtonElement {
  const button = node('button', 'wb-settings-icon-button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(createCodicon(icon));
  return button;
}

function definitions(availableRuntimes: ReadonlySet<RuntimeId>): readonly SettingDefinition[] {
  return [
    {
      key: 'indentUnit',
      name: 'indent-unit',
      id: 'editor.tabSize',
      category: 'editor',
      title: '缩进大小',
      description: '控制每一级缩进使用的空格数。应用于所有已打开的文本编辑器。',
      choices: [2, 4, 8].map(size => ({ value: ' '.repeat(size), label: `${size} 个空格` }))
    },
    {
      key: 'editorEngine',
      name: 'editor-engine',
      id: 'workbench.editor.engine',
      category: 'editor',
      title: '编辑器引擎',
      description: '选择文本编辑器。切换后立即生效，并保留已打开文件的未保存内容。',
      choices: [
        { value: 'codemirror', label: 'CodeMirror' },
        { value: 'monaco', label: 'Monaco' }
      ]
    },
    {
      key: 'alwaysShowScmActions',
      name: 'always-show-scm-actions',
      id: 'scm.alwaysShowActions',
      category: 'scm',
      title: '始终显示行内操作',
      description: '在文件行上始终显示源代码管理的行内操作按钮。',
      choices: []
    },
    {
      key: 'runtime',
      name: 'runtime',
      id: 'terminal.runtime',
      category: 'runtime',
      title: '运行方式',
      description: '选择顶部“运行”使用的浏览器内运行方式。切换后将停止当前终端。',
      choices: RUNTIME_IDS.map(id => ({
        value: id,
        label: availableRuntimes.has(id) ? RUNTIME_LABELS[id] : `${RUNTIME_LABELS[id]}（待接入）`,
        disabled: !availableRuntimes.has(id)
      }))
    }
  ];
}

function setControlValue(entry: SettingEntry, settings: WorkbenchPreferences): void {
  if (entry.control instanceof HTMLInputElement) entry.control.checked = settings.alwaysShowScmActions;
  else entry.control.value = String(settings[entry.definition.key]);
}

function settingEntry(definition: SettingDefinition, settings: WorkbenchPreferences): SettingEntry {
  const row = node('div', 'wb-setting-row');
  row.dataset['settingId'] = definition.id;
  const control =
    definition.key === 'alwaysShowScmActions' ? document.createElement('input') : document.createElement('select');
  control.name = definition.name;
  control.id = `wb-setting-${definition.name}`;
  if (control instanceof HTMLInputElement) control.type = 'checkbox';
  else
    control.append(
      ...definition.choices.map(choice => {
        const option = node('option', '', choice.label);
        option.value = choice.value;
        option.disabled = choice.disabled ?? false;
        return option;
      })
    );
  const heading = node('label', 'wb-setting-title');
  heading.htmlFor = control.id;
  const category = categories.find(([id]) => id === definition.category)![1];
  heading.append(node('span', 'wb-setting-category', `${category}: `), definition.title);
  const description = node('label', 'wb-setting-description', definition.description);
  description.htmlFor = control.id;
  description.id = `${control.id}-description`;
  control.setAttribute('aria-label', definition.title);
  control.setAttribute('aria-describedby', description.id);
  const reset = iconButton(`重置${definition.title}`, 'discard');
  reset.classList.add('wb-setting-reset');
  const value = node('div', 'wb-setting-value');
  if (control instanceof HTMLInputElement) value.append(control, description);
  else value.append(description, control);
  row.append(heading, value, reset);
  const entry = { definition, row, control, reset };
  setControlValue(entry, settings);
  return entry;
}

function readSettings(entries: readonly SettingEntry[]): WorkbenchPreferences {
  const value = (key: SettingKey) => entries.find(entry => entry.definition.key === key)!.control.value;
  const runtime = value('runtime');
  if (!isRuntimeId(runtime)) throw new Error(`未知的运行方式：${runtime}`);
  const editorEngine = value('editorEngine');
  if (!isWorkbenchEditorEngine(editorEngine)) throw new Error(`未知的编辑器：${editorEngine}`);
  const scm = entries.find(entry => entry.definition.key === 'alwaysShowScmActions')!.control as HTMLInputElement;
  return { indentUnit: value('indentUnit'), editorEngine, runtime, alwaysShowScmActions: scm.checked };
}

function mountSettingsContents(dialog: HTMLDialogElement, options: WorkbenchSettingsOptions): HTMLInputElement {
  let settings: WorkbenchPreferences = options;
  let category: SettingCategory = 'all';
  let modifiedOnly = false;
  const entries = definitions(options.availableRuntimes).map(definition => settingEntry(definition, settings));
  const searchBar = node('div', 'wb-settings-search');
  const search = node('input', '');
  search.type = 'search';
  search.placeholder = '搜索设置';
  search.setAttribute('aria-label', '搜索设置');
  const status = node('span', 'wb-settings-count');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const clear = iconButton('清除设置搜索', 'clear-all');
  const modified = iconButton('仅显示已修改的设置', 'filter');
  searchBar.append(search, status, clear, modified);
  const scope = node('div', 'wb-settings-scope');
  scope.setAttribute('aria-label', '设置作用域');
  scope.append(
    node('span', 'wb-settings-scope-active', '用户'),
    node('span', 'wb-settings-save-hint', '更改自动保存到此浏览器')
  );
  const layout = node('div', 'wb-settings-layout');
  const navigation = node('nav', 'wb-settings-navigation');
  navigation.setAttribute('aria-label', '设置分类');
  const body = node('div', 'wb-settings-body');
  const heading = node('h2', 'wb-settings-heading');
  const empty = node('div', 'wb-settings-empty', '没有匹配的设置。请尝试其他关键词或清除筛选条件。');
  const categoryButtons = categories.map(([id, title]) => {
    const button = node('button', 'wb-settings-category-button');
    button.type = 'button';
    button.setAttribute('aria-label', title);
    button.append(node('span', '', title), node('span', 'wb-settings-category-count'));
    button.onclick = () => {
      category = id;
      refresh();
      body.scrollTop = 0;
    };
    navigation.append(button);
    return { id, title, button };
  });

  function refresh(): void {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = entries.filter(({ definition }) => {
      const text =
        `${definition.id} ${definition.title} ${definition.description} ${categories.find(([id]) => id === definition.category)![1]}`.toLowerCase();
      return (
        terms.every(term => text.includes(term)) &&
        (!modifiedOnly || settings[definition.key] !== defaultWorkbenchPreferences[definition.key])
      );
    });
    for (const entry of entries) {
      const changed = settings[entry.definition.key] !== defaultWorkbenchPreferences[entry.definition.key];
      entry.row.dataset['modified'] = String(changed);
      entry.reset.hidden = !changed;
      entry.row.hidden = !matches.includes(entry) || (category !== 'all' && entry.definition.category !== category);
    }
    for (const item of categoryButtons) {
      const count = matches.filter(entry => item.id === 'all' || entry.definition.category === item.id).length;
      item.button.lastElementChild!.textContent = String(count);
      item.button.disabled = item.id !== 'all' && count === 0;
      item.button.setAttribute('aria-current', String(item.id === category));
    }
    const count = entries.filter(entry => !entry.row.hidden).length;
    heading.textContent =
      category === 'all' && (terms.length || modifiedOnly) ?
        '搜索结果'
      : categories.find(([id]) => id === category)![1];
    status.textContent = `找到 ${count} 项设置`;
    empty.hidden = count !== 0;
    clear.disabled = search.value.length === 0;
    modified.setAttribute('aria-pressed', String(modifiedOnly));
  }

  function apply(): void {
    settings = readSettings(entries);
    options.onApply(settings);
    refresh();
  }

  for (const entry of entries) {
    entry.control.addEventListener('change', apply);
    entry.reset.onclick = () => {
      setControlValue(entry, defaultWorkbenchPreferences);
      apply();
      if (entry.row.hidden) search.focus();
    };
  }
  search.oninput = () => {
    category = 'all';
    refresh();
    body.scrollTop = 0;
  };
  search.onkeydown = event => {
    if (event.key === 'Enter') event.preventDefault();
  };
  clear.onclick = () => {
    search.value = '';
    category = 'all';
    refresh();
    search.focus();
  };
  modified.onclick = () => {
    modifiedOnly = !modifiedOnly;
    refresh();
  };
  body.append(heading, ...entries.map(entry => entry.row), empty);
  layout.append(navigation, body);
  const content = node('div', 'wb-settings-content');
  content.append(searchBar, scope, layout);
  dialog.append(content);
  refresh();
  return search;
}

/** 打开与 vscode.dev 一致的设置模式面板，同一工作台只保留一个实例。 */
export function openWorkbenchSettings(host: HTMLElement, options: WorkbenchSettingsOptions): void {
  const existing = host.querySelector<HTMLDialogElement>('.wb-settings-dialog');
  if (existing) {
    existing.querySelector<HTMLInputElement>('[aria-label="搜索设置"]')!.focus();
    return;
  }
  const previousFocus = document.activeElement;
  const dialog = node('dialog', 'wb-dialog wb-settings-dialog');
  dialog.setAttribute('aria-label', '设置');
  const header = node('header', 'wb-settings-header');
  const title = node('span', 'wb-settings-title', '设置');
  title.prepend(createCodicon('settings'));
  const maximize = iconButton('最大化设置', 'screen-full');
  maximize.setAttribute('aria-pressed', 'false');
  maximize.onclick = () => {
    const maximized = dialog.classList.toggle('wb-settings-maximized');
    maximize.setAttribute('aria-pressed', String(maximized));
    maximize.title = maximized ? '还原设置大小' : '最大化设置';
    maximize.replaceChildren(createCodicon(maximized ? 'screen-normal' : 'screen-full'));
  };
  const close = iconButton('关闭设置', 'close');
  close.onclick = () => dialog.close();
  header.append(title, maximize, close);
  dialog.append(header);
  const search = mountSettingsContents(dialog, options);
  dialog.oncancel = event => {
    event.preventDefault();
    dialog.close();
  };
  dialog.onclose = () => {
    dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  host.append(dialog);
  dialog.showModal();
  search.focus();
}
