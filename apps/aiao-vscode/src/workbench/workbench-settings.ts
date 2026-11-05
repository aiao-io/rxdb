/** 工作台设置对话框：缩进大小与 SCM 行内操作常显，对齐 vscode.dev 左下「管理」入口。 */
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

export function openWorkbenchSettings(host: HTMLElement, options: WorkbenchSettingsOptions): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'wb-dialog wb-settings-dialog';
  dialog.setAttribute('aria-label', '设置');
  const form = document.createElement('form');
  form.method = 'dialog';
  const heading = document.createElement('h3');
  heading.textContent = '设置';
  const group = document.createElement('div');
  group.className = 'wb-settings-group';
  for (const [value, label] of indentChoices) {
    const row = document.createElement('label');
    row.className = 'wb-settings-row';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'indent-unit';
    radio.value = value;
    radio.checked = options.indentUnit === value;
    row.append(radio, document.createTextNode(label));
    group.append(row);
  }
  const scmRow = document.createElement('label');
  scmRow.className = 'wb-settings-row';
  const alwaysShowScmActions = document.createElement('input');
  alwaysShowScmActions.type = 'checkbox';
  alwaysShowScmActions.checked = options.alwaysShowScmActions;
  scmRow.append(alwaysShowScmActions, document.createTextNode('源代码管理：始终显示行内操作'));
  group.append(scmRow);
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
    const selected = [...form.querySelectorAll<HTMLInputElement>('input[name="indent-unit"]')].find(
      radio => radio.checked
    );
    options.onApply({
      indentUnit: selected?.value ?? options.indentUnit,
      alwaysShowScmActions: alwaysShowScmActions.checked
    });
  };
  dialog.onclose = () => dialog.remove();
  form.append(heading, group, actions);
  dialog.append(form);
  host.append(dialog);
  dialog.showModal();
}
