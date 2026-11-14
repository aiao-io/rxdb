import { BehaviorSubject, Observable } from 'rxjs';

import type { SchemaInspector } from './schema-probe';
import { DESKTOP_SCHEMA_VERSION, isSchemaRecord } from './schema-version';

/** 另一个标签页已把库升到比本构建更新的 schema：本标签页拒绝写入。 */
export class DesktopSchemaStaleError extends Error {
  constructor(
    readonly found: number,
    readonly current: number
  ) {
    super(`库的 schema 版本是 ${found}，高于本页面的构建（${current}）：刷新页面后再继续`);
    this.name = 'DesktopSchemaStaleError';
  }
}

/**
 * 写前守卫（ADESK-US-106 的「两个版本的标签页并存」）：新版本升级了库之后，仍开着的旧版本标签页
 * 在**下一次写库前**读版本记录，发现比自己新就拒绝写入并通知界面，不把库写坏。
 * 和降级保护是同一套判定（记录版本高于本构建），只是发生在启动之后。
 *
 * 库的版本确认与当前构建一致后才 {@link enable}；启动期的建表与升级不经过它。
 */
export class SchemaGuard {
  readonly #stale = new BehaviorSubject<number | null>(null);
  #inspector: SchemaInspector | null = null;

  /** 库已被更新的构建升级过时发出那个版本；其余时候是 `null`。 */
  readonly stale$: Observable<number | null> = this.#stale.asObservable();

  /** 启动期确认库与本构建一致后启用，之后每次写库前检查。 */
  enable(inspector: SchemaInspector): void {
    this.#inspector = inspector;
  }

  /** 写库之前调用；库已被更新的构建升级过则抛 {@link DesktopSchemaStaleError}。 */
  async assertWritable(): Promise<void> {
    const known = this.#stale.value;
    if (known !== null) throw new DesktopSchemaStaleError(known, DESKTOP_SCHEMA_VERSION);
    if (!this.#inspector) return;
    const record = await this.#inspector.readRecord();
    if (isSchemaRecord(record) && record.version > DESKTOP_SCHEMA_VERSION) {
      this.#stale.next(record.version);
      throw new DesktopSchemaStaleError(record.version, DESKTOP_SCHEMA_VERSION);
    }
  }
}
