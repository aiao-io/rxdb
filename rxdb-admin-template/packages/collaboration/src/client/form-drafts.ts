/** 页面刷新数据时保留用户尚未提交的表单输入；跨账号或任务不复用。 */
export class FormDrafts {
  private context = '';
  private readonly values = new Map<string, { value: string; checked: boolean }>();
  constructor(private readonly host: HTMLElement) {}
  remember = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.dataset['recordId'] || !target.dataset['formKey']) return;
    const key = this.key(target);
    this.values.set(key, { value: target.value, checked: target instanceof HTMLInputElement && target.checked });
  };
  restore(context: string): void {
    if (this.context !== context) this.values.clear();
    this.context = context;
    for (const control of this.controls()) {
      const draft = this.values.get(this.key(control));
      if (!draft) continue;
      if (control instanceof HTMLInputElement && control.readOnly) continue;
      if (control instanceof HTMLSelectElement && ![...control.options].some(option => option.value === draft.value)) continue;
      control.value = draft.value;
      if (control instanceof HTMLInputElement) control.checked = draft.checked;
    }
  }
  private controls(): (HTMLInputElement | HTMLSelectElement)[] {
    return [...this.host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-form-key]:not([data-record-id])')];
  }
  private key(control: HTMLInputElement | HTMLSelectElement): string {
    const label = control.dataset['formKey'];
    return `${label}:${this.controls().filter(other => other.dataset['formKey'] === label).indexOf(control)}`;
  }
}
