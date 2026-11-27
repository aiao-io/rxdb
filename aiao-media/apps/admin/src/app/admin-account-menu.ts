import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { accountLabel } from './admin-profile';

/** 顶栏身份入口与可用键盘操作的账户菜单。 */
@Component({
  selector: 'app-admin-account-menu',
  imports: [RouterLink],
  templateUrl: './admin-account-menu.html',
  styleUrl: './admin-account-menu.css',
  host: {
    '(document:pointerdown)': 'closeOutside($event)',
    '(keydown.escape)': 'escape($event)',
    '(focusout)': 'focusOut($event)'
  }
})
export class AdminAccountMenu {
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly userId = input.required<string>();
  readonly email = input<string | null | undefined>();
  readonly displayName = input<string | null>();
  readonly logout = output<void>();
  readonly open = signal(false);
  readonly label = computed(() => accountLabel(this.displayName(), this.email(), this.userId()));

  readonly initial = computed(() => [...this.label()][0].toUpperCase());

  toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  show(last = false): void {
    this.open.set(true);
    afterNextRender(
      () => {
        if (!this.open()) return;
        const items = this.items();
        items.at(last ? -1 : 0)?.focus();
      },
      { injector: this.injector }
    );
  }

  move(event: KeyboardEvent): void {
    const items = this.items();
    const current = items.findIndex(item => item === document.activeElement);
    const offset = event.key === 'ArrowUp' ? -1 : 1;
    const index =
      event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : (current + offset + items.length) % items.length;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    items[index]?.focus();
  }

  activateLink(event: Event): void {
    event.preventDefault();
    (event.currentTarget as HTMLAnchorElement).click();
  }

  escape(event: Event): void {
    if (!this.open()) return;
    event.preventDefault();
    event.stopPropagation();
    this.close(true);
  }

  close(returnFocus = false): void {
    this.open.set(false);
    if (returnFocus) this.element.nativeElement.querySelector<HTMLButtonElement>('.account-trigger')?.focus();
  }

  closeOutside(event: PointerEvent): void {
    if (!this.element.nativeElement.contains(event.target as Node)) this.close();
  }

  focusOut(event: FocusEvent): void {
    if (!this.element.nativeElement.contains(event.relatedTarget as Node | null)) this.close();
  }

  signOut(): void {
    this.close();
    this.logout.emit();
  }

  private items(): HTMLElement[] {
    return [...this.element.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }
}
