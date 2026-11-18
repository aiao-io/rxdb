/** 表单草稿管理的控件：输入框、多行文本框与下拉选择。 */
type DraftControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * 协作面板重绘时保留面板里尚未提交的输入（任务名称、评论、回复、冲突处理选择等）与 details 的展开状态；跨账号或任务不复用。
 * 团队任务的记录编辑在应用的模型驱动编辑界面里，不经过这里。
 */
export class FormDrafts {
  private context = '';
  private readonly disclosures = new Map<string, boolean>();
  private readonly values = new Map<string, { value: string; checked: boolean }>();
  private keyName = '';
  private persistentContext = '';
  private readonly persistent = new Map<string, { value: string; checked: boolean }>();
  constructor(private readonly host: HTMLElement) {}
  remember = (event: Event): void => {
    const target = event.target;
    if (!(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ))
      return;
    if (!target.dataset['formKey']) return;
    const key = this.key(target);
    const value = { value: target.value, checked: target instanceof HTMLInputElement && target.checked };
    this.values.set(key, value);
    if (!target.dataset['persistentDraft']) return;
    this.persistent.set(key, value);
    sessionStorage.setItem(this.keyName, JSON.stringify([...this.persistent]));
  };
  rememberDisclosures(): void {
    for (const details of this.host.querySelectorAll<HTMLDetailsElement>('details[data-disclosure-key]'))
      this.disclosures.set(details.dataset['disclosureKey']!, details.open);
  }
  /** 该键的 details 在上一次重绘前是否展开；内容较大的 details 据此决定重绘时要不要生成并加载内容。 */
  isOpen(key: string): boolean {
    return this.disclosures.get(key) === true;
  }
  /** 键盘焦点正落在哪个 details 的 summary 上（返回该 details 的键）；重绘前读取，重绘后交给 `focusDisclosure`。 */
  focusedDisclosure(): string | undefined {
    const active = document.activeElement;
    if (!active || active.tagName !== 'SUMMARY' || !this.host.contains(active)) return undefined;
    return active.parentElement?.dataset['disclosureKey'];
  }
  /** 重绘后把焦点还给同键 details 的 summary，避免展开一个折叠项后键盘用户丢失位置。 */
  focusDisclosure(key: string): void {
    for (const details of this.host.querySelectorAll<HTMLDetailsElement>('details[data-disclosure-key]'))
      if (details.dataset['disclosureKey'] === key)
        details.querySelector<HTMLElement>(':scope > summary')?.focus({ preventScroll: true });
  }
  restore(context: string, persistentContext = context): void {
    if (this.persistentContext !== persistentContext) {
      this.persistent.clear();
      this.persistentContext = persistentContext;
      this.keyName = `admin-collaboration-form:${persistentContext}`;
      const saved = sessionStorage.getItem(this.keyName);
      if (saved)
        for (const [key, value] of JSON.parse(saved) as [string, { value: string; checked: boolean }][])
          this.persistent.set(key, value);
    }
    if (this.context !== context) {
      this.values.clear();
      this.disclosures.clear();
    }
    this.context = context;
    for (const details of this.host.querySelectorAll<HTMLDetailsElement>('details[data-disclosure-key]'))
      details.open = this.disclosures.get(details.dataset['disclosureKey']!) === true;
    for (const control of this.controls()) {
      const key = this.key(control);
      const draft = control.dataset['persistentDraft'] ? this.persistent.get(key) : this.values.get(key);
      if (!draft) continue;
      if (!(control instanceof HTMLSelectElement) && control.readOnly) continue;
      if (control instanceof HTMLSelectElement && ![...control.options].some(option => option.value === draft.value))
        continue;
      control.value = draft.value;
      if (control instanceof HTMLInputElement) control.checked = draft.checked;
    }
  }
  private controls(): DraftControl[] {
    return [...this.host.querySelectorAll<DraftControl>('[data-form-key]')];
  }
  private key(control: DraftControl): string {
    const label = control.dataset['formKey'];
    return `${label}:${this.controls()
      .filter(other => other.dataset['formKey'] === label)
      .indexOf(control)}`;
  }
}
