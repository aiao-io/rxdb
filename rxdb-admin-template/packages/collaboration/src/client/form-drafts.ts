/** 页面刷新数据时保留用户尚未提交的表单输入；跨账号或任务不复用。 */
export class FormDrafts {
  private context = '';
  private readonly values = new Map<string, { value: string; checked: boolean }>();
  private keyName = '';
  private persistentContext = '';
  private readonly persistent = new Map<string, { value: string; checked: boolean }>();
  constructor(private readonly host: HTMLElement) {}
  remember = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.dataset['recordId'] || !target.dataset['formKey']) return;
    const key = this.key(target);
    const value = { value: target.value, checked: target instanceof HTMLInputElement && target.checked };
    this.values.set(key, value);
    if (!target.dataset['persistentDraft']) return;
    this.persistent.set(key, value);
    sessionStorage.setItem(this.keyName, JSON.stringify([...this.persistent]));
  };
  restore(context: string, persistentContext = context): void {
    if (this.persistentContext !== persistentContext) {
      this.persistent.clear();
      this.persistentContext = persistentContext;
      this.keyName = `admin-collaboration-form:${persistentContext}`;
      const saved = sessionStorage.getItem(this.keyName);
      if (saved) for (const [key, value] of JSON.parse(saved) as [string, { value: string; checked: boolean }][]) this.persistent.set(key, value);
    }
    if (this.context !== context) this.values.clear();
    this.context = context;
    for (const control of this.controls()) {
      const key = this.key(control);
      const draft = control.dataset['persistentDraft'] ? this.persistent.get(key) : this.values.get(key);
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
