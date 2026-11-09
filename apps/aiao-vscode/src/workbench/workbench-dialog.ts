import type { ProjectTemplate } from './compiler/compiler-types.js';
import { createCodicon, createFileIcon } from './workbench-icons.js';

/** 新项目的名称与模板。 */
export interface NewWorkbenchProject {
  readonly name: string;
  readonly template: ProjectTemplate;
}

const projectChoices: readonly {
  readonly id: ProjectTemplate;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}[] = [
  { id: 'react', title: 'React', description: 'TypeScript · TSX', icon: 'main.tsx' },
  { id: 'vue', title: 'Vue', description: 'TypeScript · 单文件组件', icon: 'App.vue' },
  { id: 'angular', title: 'Angular', description: 'TypeScript · Standalone', icon: '' },
  { id: 'vanilla', title: 'Vanilla', description: 'TypeScript · 无框架', icon: 'main.ts' }
];

function projectChoiceCard(choice: (typeof projectChoices)[number]): HTMLLabelElement {
  const card = document.createElement('label');
  card.className = 'wb-project-template';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'template';
  input.value = choice.id;
  input.checked = choice.id === 'react';
  input.setAttribute('aria-label', choice.title);
  const icon = choice.icon ? createFileIcon(choice.icon) : document.createElement('span');
  icon.classList.add('wb-project-template-icon');
  if (!choice.icon) {
    icon.classList.add('wb-project-angular-icon');
    icon.textContent = 'A';
    icon.setAttribute('aria-hidden', 'true');
  }
  const text = document.createElement('span');
  text.className = 'wb-project-template-text';
  const title = document.createElement('strong');
  title.textContent = choice.title;
  const description = document.createElement('span');
  description.textContent = choice.description;
  text.append(title, description);
  const check = createCodicon('check');
  check.classList.add('wb-project-template-check');
  card.append(input, icon, text, check);
  return card;
}

function projectForm(initialName: string) {
  const form = document.createElement('form');
  form.method = 'dialog';
  const header = document.createElement('header');
  header.className = 'wb-project-dialog-header';
  const heading = document.createElement('h3');
  heading.textContent = '新建项目';
  const detail = document.createElement('p');
  detail.textContent = '选择一个模板，开始你的下一个想法。';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'wb-project-close';
  close.setAttribute('aria-label', '关闭');
  close.append(createCodicon('close'));
  header.append(heading, detail, close);

  const body = document.createElement('div');
  body.className = 'wb-project-dialog-body';
  const templates = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = '项目模板';
  const cards = document.createElement('div');
  cards.className = 'wb-project-template-grid';
  cards.append(...projectChoices.map(projectChoiceCard));
  templates.append(legend, cards);
  const nameLabel = document.createElement('label');
  nameLabel.className = 'wb-project-field';
  nameLabel.append('项目名称');
  const name = document.createElement('input');
  name.required = true;
  name.name = 'project-name';
  name.value = initialName;
  name.autocomplete = 'off';
  name.placeholder = '例如：我的第一个项目';
  name.setAttribute('aria-label', '项目名称');
  const hint = document.createElement('p');
  hint.className = 'wb-project-field-hint';
  hint.id = `wb-project-name-${crypto.randomUUID()}`;
  hint.setAttribute('aria-live', 'polite');
  name.setAttribute('aria-describedby', hint.id);
  nameLabel.append(name);
  body.append(templates, nameLabel, hint);

  const actions = document.createElement('footer');
  actions.className = 'wb-dialog-actions wb-project-dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '取消';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'wb-primary';
  submit.textContent = '创建项目';
  actions.append(cancel, submit);
  form.append(header, body, actions);
  const validateName = (): void => {
    const invalid = !name.value.trim();
    submit.disabled = invalid;
    name.setAttribute('aria-invalid', String(invalid));
    hint.dataset['error'] = String(invalid);
    hint.textContent = invalid ? '请输入项目名称' : '项目保存在此浏览器中，随时可以继续编辑。';
  };
  name.oninput = validateName;
  validateName();
  return { form, name, close, cancel };
}

/** 在一个弹窗内选择模板并命名；取消不创建项目。 */
export function requestWorkbenchProject(
  host: HTMLElement,
  initialName = '我的项目'
): Promise<NewWorkbenchProject | null> {
  const previous = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'wb-dialog wb-project-dialog';
  dialog.setAttribute('aria-label', '新建项目');
  const { form, name, close, cancel } = projectForm(initialName);
  let selected: ProjectTemplate = 'react';
  for (const [index, input] of [...form.querySelectorAll<HTMLInputElement>('input[type=radio]')].entries()) {
    input.onchange = () => {
      selected = projectChoices[index].id;
    };
  }
  return new Promise(resolve => {
    let value: NewWorkbenchProject | null = null;
    close.onclick = cancel.onclick = () => dialog.close();
    dialog.onclick = event => {
      if (event.target === dialog) dialog.close();
    };
    form.onsubmit = event => {
      event.preventDefault();
      if (!name.value.trim()) {
        name.focus();
        return;
      }
      value = { name: name.value.trim(), template: selected };
      dialog.close();
    };
    dialog.onclose = () => {
      dialog.remove();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      resolve(value);
    };
    dialog.append(form);
    host.append(dialog);
    dialog.showModal();
    name.focus();
    name.select();
  });
}

/** 请求一个具名文本值，取消时不执行后续动作。 */
export function requestWorkbenchText(host: HTMLElement, title: string, initial = ''): Promise<string | null> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'wb-dialog';
    const form = document.createElement('form');
    form.method = 'dialog';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const input = document.createElement('input');
    input.value = initial;
    input.required = true;
    input.setAttribute('aria-label', title);
    const actions = document.createElement('div');
    actions.className = 'wb-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.onclick = () => {
      dialog.close();
    };
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '确定';
    submit.className = 'wb-primary';
    actions.append(cancel, submit);
    form.append(heading, input, actions);
    dialog.append(form);
    host.append(dialog);
    let value: string | null = null;
    form.onsubmit = () => {
      value = input.value.trim() || null;
    };
    dialog.onclose = () => {
      dialog.remove();
      resolve(value);
    };
    dialog.showModal();
    input.focus();
    input.select();
  });
}

/** 用明确的操作按钮确认文件变更，取消不触发任何写入。 */
export function confirmWorkbenchAction(
  host: HTMLElement,
  title: string,
  description: string,
  confirmLabel = '丢弃更改'
): Promise<boolean> {
  const previous = document.activeElement;
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'wb-dialog wb-confirm-dialog';
    dialog.setAttribute('aria-label', title);
    const heading = document.createElement('h3');
    heading.textContent = title;
    const detail = document.createElement('p');
    detail.textContent = description;
    const actions = document.createElement('div');
    actions.className = 'wb-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = confirmLabel;
    confirm.className = 'wb-primary';
    let accepted = false;
    cancel.onclick = () => dialog.close();
    confirm.onclick = () => {
      accepted = true;
      dialog.close();
    };
    dialog.onclose = () => {
      dialog.remove();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      resolve(accepted);
    };
    actions.append(cancel, confirm);
    dialog.append(heading, detail, actions);
    host.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

/** 三选一确认（如「保存并切换 / 放弃更改 / 取消」），返回 null 表示取消。 */
export function requestWorkbenchChoice(
  host: HTMLElement,
  title: string,
  description: string,
  primaryLabel: string,
  secondaryLabel: string
): Promise<'primary' | 'secondary' | null> {
  const previous = document.activeElement;
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'wb-dialog wb-confirm-dialog';
    dialog.setAttribute('aria-label', title);
    const heading = document.createElement('h3');
    heading.textContent = title;
    const detail = document.createElement('p');
    detail.textContent = description;
    const actions = document.createElement('div');
    actions.className = 'wb-dialog-actions';
    const secondary = document.createElement('button');
    secondary.type = 'button';
    secondary.textContent = secondaryLabel;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '取消';
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.textContent = primaryLabel;
    primary.className = 'wb-primary';
    let choice: 'primary' | 'secondary' | null = null;
    secondary.onclick = () => {
      choice = 'secondary';
      dialog.close();
    };
    primary.onclick = () => {
      choice = 'primary';
      dialog.close();
    };
    cancel.onclick = () => dialog.close();
    dialog.onclose = () => {
      dialog.remove();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      resolve(choice);
    };
    actions.append(secondary, cancel, primary);
    dialog.append(heading, detail, actions);
    host.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
