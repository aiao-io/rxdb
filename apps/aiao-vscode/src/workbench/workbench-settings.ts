/** 工作台设置对话框：对齐 vscode.dev 设置面板，含搜索框、分节与「标题 + 描述」设置行。 */
export interface WorkbenchSettingsOptions {
  readonly indentUnit: string;
  readonly alwaysShowScmActions: boolean;
  onApply(settings: { indentUnit: string; alwaysShowScmActions: boolean }): void;
}

const indentChoices: readonly (readonly [string, string])[] = [
  ['  ', '2 个空格'],
  ['    ', '4 个空格'],
  ['        ', '8 个空格']
];

/** 单个设置行：左侧标题与描述，右侧控件。 */
function buildSettingRow(title: string, description: string, control: HTMLElement): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'wb-setting-row';
  const text = document.createElement('span');
  text.className = 'wb-setting-text';
  const titleNode = document.createElement('span');
  titleNode.className = 'wb-setting-title';
  titleNode.textContent = title;
  const descriptionNode = document.createElement('span');
  descriptionNode.className = 'wb-setting-description';
  descriptionNode.textContent = description;
  text.append(titleNode, descriptionNode);
  row.append(text, control);
  return row;
}

/** 分节容器，携带节标题。 */
function buildSettingSection(title: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'wb-settings-section';
  const heading = document.createElement('div');
  heading.className = 'wb-settings-section-title';
  heading.textContent = title;
  section.append(heading);
  return section;
}

/** 按查询过滤设置行，空分节整体隐藏。 */
function filterSettingRows(body: HTMLElement, query: string): void {
  const normalized = query.trim().toLowerCase();
  for (const section of body.querySelectorAll<HTMLElement>('.wb-settings-section')) {
    let visible = 0;
    for (const row of section.querySelectorAll<HTMLElement>('.wb-setting-row')) {
      const matched = (row.textContent ?? '').toLowerCase().includes(normalized);
      row.hidden = !matched;
      if (matched) visible += 1;
    }
    section.hidden = visible === 0;
  }
}

export function openWorkbenchSettings(host: HTMLElement, options: WorkbenchSettingsOptions): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'wb-dialog wb-settings-dialog';
  dialog.setAttribute('aria-label', '设置');
  const form = document.createElement('form');
  form.method = 'dialog';

  const search = document.createElement('div');
  search.className = 'wb-settings-search';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'codicon codicon-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = '搜索设置';
  searchInput.setAttribute('aria-label', '搜索设置');
  search.append(searchIcon, searchInput);

  const body = document.createElement('div');
  body.className = 'wb-settings-body';

  const indentSelect = document.createElement('select');
  indentSelect.name = 'indent-unit';
  for (const [value, label] of indentChoices) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    indentSelect.append(option);
  }
  indentSelect.value = options.indentUnit;
  const editorSection = buildSettingSection('文本编辑器');
  editorSection.append(buildSettingRow('缩进大小', '制表符或缩进所用的空格数。', indentSelect));
  body.append(editorSection);

  const scmCheckbox = document.createElement('input');
  scmCheckbox.type = 'checkbox';
  scmCheckbox.checked = options.alwaysShowScmActions;
  const scmSection = buildSettingSection('源代码管理');
  scmSection.append(
    buildSettingRow('始终显示行内操作', '在文件行上始终显示源代码管理的行内操作按钮。', scmCheckbox)
  );
  body.append(scmSection);

  const actions = document.createElement('div');
  actions.className = 'wb-dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.onclick = () => dialog.close();
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = '确定';
  submit.className = 'wb-primary';
  actions.append(cancel, submit);

  form.onsubmit = () => {
    options.onApply({
      indentUnit: indentSelect.value,
      alwaysShowScmActions: scmCheckbox.checked
    });
  };

  searchInput.addEventListener('input', () => filterSettingRows(body, searchInput.value));
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') event.preventDefault();
  });

  dialog.onclose = () => dialog.remove();
  form.append(search, body, actions);
  dialog.append(form);
  host.append(dialog);
  dialog.showModal();
  searchInput.focus();
}
