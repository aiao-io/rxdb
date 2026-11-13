import type { EntityType } from '@aiao/rxdb';
import { ErrorHandler, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, defer, from, switchMap } from 'rxjs';

import { DesktopData } from './desktop-data';

/**
 * 库就绪、且 `entity` 所属数据域的初始数据写完（首次读取时才写，D-18）之后才订阅的活查询，结果以 signal 交给模板；
 * 数据一变自动刷新。必须在注入上下文里调用（构造器或字段初始化器），宿主销毁时自动退订。
 *
 * 初始数据写不进去（例如种子模块加载失败）时，错误交给 `ErrorHandler` 报告，信号停在初值、不再订阅；
 * 失败的种子不留标记，下一次读取（例如重新打开应用）会重试。
 *
 * @param query 活查询
 * @param initialValue 订阅前的初值
 * @param entity 查询读的实体：它所属的数据域在第一次读取时被种下初始数据
 *
 * @example
 * ```ts
 * readonly notes = liveQuery(() => Note.findAll({ where: ALL, orderBy: [{ field: 'updatedAt', sort: 'desc' }] }), [], Note);
 * ```
 */
export function liveQuery<T>(query: () => Observable<T>, initialValue: T, entity: EntityType): Signal<T> {
  const data = inject(DesktopData);
  /* 库起不来（本地数据有问题）时不向每个订阅者重复报同一个错：原因由 DesktopData.problem 和阻断界面说明，这里保持初值。 */
  const ready = from(data.ready).pipe(catchError(() => EMPTY));
  const errors = inject(ErrorHandler);
  const seeded = defer(() => data.ensureSeeded(entity)).pipe(
    catchError((error: unknown) => {
      errors.handleError(error);
      return EMPTY;
    })
  );
  return toSignal(
    ready.pipe(
      switchMap(() => seeded),
      switchMap(query)
    ),
    { initialValue }
  );
}

/** 不带条件的查询：表里的全部行。 */
export const ALL_ROWS = { combinator: 'and' as const, rules: [] };
