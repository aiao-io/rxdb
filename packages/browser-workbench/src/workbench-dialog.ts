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
