import type { CostRollupResult, ExplosionResult, RequirementLine, ResolutionContext } from '@aiao/rxdb-plugin-bom';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, type Router } from '@angular/router';
import { filter } from 'rxjs';

/** 各业务页共同使用的显式工作条件。 */
export interface BomWorkspaceContext {
  rootKey: string;
  asOfDate: string;
  plannedQty: string;
  plannedUom: string;
  unit: number | null;
  lot: string;
  alternativeNo: number | null;
  configSelection: Record<string, string[]>;
  substituteSelections: NonNullable<ResolutionContext['substituteSelections']>;
}

/** 已确认条件下的展开结果；仅在当前数据库代次内复用。 */
export interface BomExplosionView {
  result: ExplosionResult;
  selected: RequirementLine | null;
  context: BomWorkspaceContext;
  key: string;
  epoch: number;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const config = (value: unknown): value is Record<string, string[]> =>
  record(value) &&
  Object.values(value).every(entry => Array.isArray(entry) && entry.every(item => typeof item === 'string'));
const substitutes = (value: unknown): value is NonNullable<ResolutionContext['substituteSelections']> =>
  record(value) &&
  Object.values(value).every(
    entry =>
      record(entry) &&
      (entry['memberKey'] === undefined || typeof entry['memberKey'] === 'string') &&
      (entry['allocation'] === undefined ||
        (record(entry['allocation']) && Object.values(entry['allocation']).every(amount => typeof amount === 'string')))
  );

/** 保留查询输入、URL 与返回后的已确认结果，不持久化领域计算副本。 */
@Injectable({ providedIn: 'root' })
export class BomWorkspaceState {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = signal<Router | null>(null);
  private readonly routeError = signal('');
  readonly rootKey = signal('SC-100');
  readonly asOfDate = signal('2026-09-22');
  readonly plannedQty = signal('1');
  readonly plannedUom = signal('pcs');
  readonly unit = signal<number | null>(137);
  readonly lot = signal('');
  readonly alternativeNo = signal<number | null>(null);
  readonly configSelection = signal<Record<string, string[]>>({ 颜色: ['红'] });
  readonly substituteSelections = signal<NonNullable<ResolutionContext['substituteSelections']>>({});
  readonly selectedItem = signal('M3');
  readonly jointSourceKey = signal('');
  readonly guideStep = signal(0);
  readonly resumePath = signal('/explosion');
  readonly explosion = signal<BomExplosionView | null>(null);
  readonly cost = signal<{ result: CostRollupResult; key: string; epoch: number } | null>(null);
  readonly context = computed<BomWorkspaceContext>(() => ({
    rootKey: this.rootKey(),
    asOfDate: this.asOfDate(),
    plannedQty: this.plannedQty(),
    plannedUom: this.plannedUom(),
    unit: this.unit(),
    lot: this.lot(),
    alternativeNo: this.alternativeNo(),
    configSelection: this.configSelection(),
    substituteSelections: this.substituteSelections()
  }));
  readonly contextKey = computed(() => JSON.stringify(this.context()));
  readonly resolutionOptions = computed(() => ({
    plannedUom: this.plannedUom(),
    ...(this.unit() === null ? {} : { unit: this.unit()! }),
    ...(this.lot().trim() ? { lot: this.lot().trim() } : {}),
    ...(this.alternativeNo() === null ? {} : { alternativeNo: this.alternativeNo()! }),
    configSelection: this.configSelection(),
    ...(Object.keys(this.substituteSelections()).length ? { substituteSelections: this.substituteSelections() } : {})
  }));
  readonly queryParams = computed<Record<string, string>>(() => ({
    root: this.rootKey(),
    date: this.asOfDate(),
    qty: this.plannedQty(),
    uom: this.plannedUom(),
    unit: this.unit() === null ? 'none' : String(this.unit()),
    lot: this.lot(),
    alternative: this.alternativeNo() === null ? '' : String(this.alternativeNo()),
    config: JSON.stringify(this.configSelection()),
    substitutes: JSON.stringify(this.substituteSelections()),
    item: this.selectedItem(),
    costSource: this.jointSourceKey(),
    guide: String(this.guideStep())
  }));
  readonly validationError = computed(() => {
    const date = this.asOfDate();
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      return '请填写有效的生效日期。';
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(this.plannedQty()) || !/[1-9]/.test(this.plannedQty()))
      return '计划量必须是大于 0 的十进制数。';
    if (this.unit() !== null && (!Number.isSafeInteger(this.unit()) || this.unit()! < 1))
      return '序列号必须是从 1 起的整数。';
    if (this.alternativeNo() !== null && (!Number.isSafeInteger(this.alternativeNo()) || this.alternativeNo()! < 1))
      return '备选方案必须是从 1 起的整数。';
    return this.routeError();
  });

  constructor() {
    effect(() => {
      const router = this.router();
      const params = this.queryParams();
      if (!router) return;
      const navigation = router.currentNavigation();
      if (!router.navigated || navigation !== null || this.validationError()) return;
      const current = router.parseUrl(router.url).queryParams;
      if (Object.entries(params).every(([key, value]) => current[key] === value)) return;
      void router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  /** 根组件建立一次 URL 同步，普通面板可独立注入工作条件。 */
  bindRouter(router: Router): void {
    if (this.router()) return;
    this.restore(router.parseUrl(router.url).queryParams);
    router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => {
        this.restore(router.parseUrl(event.urlAfterRedirects).queryParams);
        const path = event.urlAfterRedirects.split(/[?#]/)[0];
        if (path !== '/') this.resumePath.set(path);
      });
    this.router.set(router);
  }

  /** 恢复显式链接；保留无效输入供用户修正，禁止静默换成默认条件。 */
  restore(params: Record<string, unknown>): void {
    this.routeError.set('');
    const strings = {
      root: this.rootKey,
      date: this.asOfDate,
      qty: this.plannedQty,
      uom: this.plannedUom,
      lot: this.lot,
      item: this.selectedItem,
      costSource: this.jointSourceKey
    };
    Object.entries(strings).forEach(([key, target]) => {
      if (typeof params[key] === 'string') target.set(params[key]);
    });
    if (typeof params['unit'] === 'string') this.unit.set(params['unit'] === 'none' ? null : Number(params['unit']));
    if (typeof params['alternative'] === 'string')
      this.alternativeNo.set(params['alternative'] === '' ? null : Number(params['alternative']));
    if (typeof params['guide'] === 'string') this.guideStep.set(Math.max(0, Math.min(3, Number(params['guide']) || 0)));
    try {
      if (typeof params['config'] === 'string') {
        const value: unknown = JSON.parse(params['config']);
        if (!config(value)) throw new Error('链接中的产品配置无效，请重新选择场景。');
        this.configSelection.set(value);
      }
      if (typeof params['substitutes'] === 'string') {
        const value: unknown = JSON.parse(params['substitutes']);
        if (!substitutes(value)) throw new Error('链接中的替代选择无效，请重新选择。');
        this.substituteSelections.set(value);
      }
    } catch {
      this.routeError.set('链接中的产品配置或替代选择无效，请重新选择场景。');
    }
  }

  /** 场景与任务快捷入口显式更新共同条件。 */
  update(patch: Partial<BomWorkspaceContext>): void {
    this.routeError.set('');
    if (patch.rootKey !== undefined) this.rootKey.set(patch.rootKey);
    if (patch.asOfDate !== undefined) this.asOfDate.set(patch.asOfDate);
    if (patch.plannedQty !== undefined) this.plannedQty.set(patch.plannedQty);
    if (patch.plannedUom !== undefined) this.plannedUom.set(patch.plannedUom);
    if (patch.unit !== undefined) this.unit.set(patch.unit);
    if (patch.lot !== undefined) this.lot.set(patch.lot);
    if (patch.alternativeNo !== undefined) this.alternativeNo.set(patch.alternativeNo);
    if (patch.configSelection !== undefined) this.configSelection.set(patch.configSelection);
    if (patch.substituteSelections !== undefined) this.substituteSelections.set(patch.substituteSelections);
  }
}
