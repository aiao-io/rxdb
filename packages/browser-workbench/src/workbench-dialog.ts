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
