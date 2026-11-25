import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CatalogItemChanges, CatalogRemoteItem } from './catalog-remote';
import { CATALOG_CATEGORIES } from './catalog-sync-rule';

/**
 * 编辑框要读的商品字段：远端的一行与本机的实体都给得出。
 *
 * @remarks
 * 生成的实体类型把可空列写成可选（`cost?: number | null`），这里同样接受缺省。
 */
export type CatalogEditableItem = Pick<CatalogRemoteItem, 'id' | 'name' | 'category' | 'price'> & {
  readonly cost?: number | null;
};

/** 编辑框交给面板的保存请求：改哪一行、改成什么。 */
export interface CatalogItemEdit {
  readonly id: string;
  readonly changes: CatalogItemChanges;
}

let nextEditorId = 0;

/**
 * 编辑一件商品的名称、分类、售价与成本价：模拟服务端那边直写远端，或在本机改（US-034）。
 *
 * @remarks
 * 原生 `<dialog>` 模态打开，焦点约束与 Esc 关闭交给浏览器；表单只在打开时渲染，页面上不留一份隐藏的同名输入框。
 * 这里只交出修改：写到哪里、成败与何时关上由面板决定，写入失败时框不关，失败原因经 `error` 显示在框里。
 * 页面上可以同时摆两个编辑框（本机一个、模拟服务端一个），标题的 id 各用各的。
 */
@Component({
  selector: 'app-catalog-item-editor',
  imports: [FormsModule],
  template: `
    <dialog class="modal" #dialog [attr.aria-labelledby]="titleId" (close)="reset()">
      @if ($item(); as item) {
        <form class="modal-box flex flex-col gap-2" (ngSubmit)="submit(item)">
          <h3 class="text-lg font-bold" [id]="titleId">{{ heading() }}</h3>
          <p class="text-base-content/60 text-sm">{{ note() }}</p>
          <label class="fieldset">
            <span class="fieldset-legend">名称</span>
            <input class="input w-full" [ngModel]="$name()" (ngModelChange)="$name.set($event)" name="name" required />
          </label>
          <label class="fieldset">
            <span class="fieldset-legend">分类</span>
            <select
              class="select w-full"
              [ngModel]="$category()"
              (ngModelChange)="$category.set($event)"
              name="category"
            >
              @for (category of categories; track category) {
                <option [value]="category">{{ category }}</option>
              }
            </select>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="fieldset">
              <span class="fieldset-legend">售价</span>
              <input
                class="input w-full"
                [ngModel]="$price()"
                (ngModelChange)="$price.set($event)"
                min="0"
                name="price"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label class="fieldset">
              <span class="fieldset-legend">成本价</span>
              <input
                class="input w-full"
                [ngModel]="$cost()"
                (ngModelChange)="$cost.set($event)"
                min="0"
                name="cost"
                required
                step="0.01"
                type="number"
              />
            </label>
          </div>
          @if (error(); as error) {
            <div class="alert alert-error" role="alert">{{ error }}</div>
          }
          <div class="modal-action">
            <button class="btn" (click)="close()" type="button">取消</button>
            <button class="btn btn-primary" [disabled]="busy() || !$changes()" type="submit">
              @if (busy()) {
                <span class="loading loading-spinner loading-xs"></span>
              }
              保存
            </button>
          </div>
        </form>
      }
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogItemEditor {
  readonly #injector = inject(Injector);
  readonly #item = signal<CatalogEditableItem | null>(null);
  readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly categories = CATALOG_CATEGORIES;

  /** 对话框标题 */
  readonly heading = input('编辑商品');
  /** 标题下的说明：这次修改写到哪里、什么时候生效 */
  readonly note = input('行留在原来的区，本机数据要等下一次同步才变。改了分类，公开商品可能移出或移入同步规则。');
  /** 面板正在写入 */
  readonly busy = input(false);
  /** 上一次写入失败的原因 */
  readonly error = input<string | null>(null);
  readonly titleId = `catalog-item-editor-title-${nextEditorId++}`;
  /** 点「保存」：交出这一行要改成什么 */
  readonly save = output<CatalogItemEdit>();

  /** 正在编辑的商品；没打开时为 `null` */
  readonly $item = this.#item.asReadonly();
  readonly $name = signal('');
  readonly $category = signal('');
  /** 数字框清空时是 `null` */
  readonly $price = signal<number | null>(null);
  readonly $cost = signal<number | null>(null);
  /** 能保存时要写回的内容：名称去掉首尾空格后不为空，售价与成本价都填了且不为负 */
  readonly $changes = computed<CatalogItemChanges | null>(() => {
    const name = this.$name().trim();
    const price = this.$price();
    const cost = this.$cost();
    if (!name || !isAmount(price) || !isAmount(cost)) return null;
    return { name, category: this.$category(), price, cost };
  });

  /** 以这件商品的现值打开 */
  open(item: CatalogEditableItem): void {
    this.#item.set(item);
    this.$name.set(item.name);
    this.$category.set(item.category);
    this.$price.set(item.price);
    this.$cost.set(item.cost ?? null);
    // 表单下一次渲染才出现：渲染出来再模态打开，浏览器才会把焦点放进第一个输入框
    afterNextRender(() => this.dialogRef().nativeElement.showModal(), { injector: this.#injector });
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }

  /** 关上之后撤掉表单 */
  reset(): void {
    this.#item.set(null);
  }

  submit(item: CatalogEditableItem): void {
    const changes = this.$changes();
    if (changes) this.save.emit({ id: item.id, changes });
  }
}

function isAmount(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}
