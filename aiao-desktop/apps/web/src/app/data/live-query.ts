import { Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, from, switchMap } from 'rxjs';

import { DesktopData } from './desktop-data';

/**
 * 库就绪（连上并写完初始数据）之后才订阅的活查询，结果以 signal 交给模板；数据一变自动刷新。
 * 必须在注入上下文里调用（构造器或字段初始化器），宿主销毁时自动退订。
 *
 * @example
 * ```ts
 * readonly notes = liveQuery(() => Note.findAll({ where: ALL, orderBy: [{ field: 'updatedAt', sort: 'desc' }] }), []);
 * ```
 */
export function liveQuery<T>(query: () => Observable<T>, initialValue: T): Signal<T> {
  const data = inject(DesktopData);
  return toSignal(from(data.ready).pipe(switchMap(query)), { initialValue });
}

/** 不带条件的查询：表里的全部行。 */
export const ALL_ROWS = { combinator: 'and' as const, rules: [] };
