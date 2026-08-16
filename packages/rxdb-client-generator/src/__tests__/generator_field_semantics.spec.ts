/**
 * @fileoverview US-012 阶段 C — AC#34 生成器透传 `format` / `enum` / `options`。
 *
 * 三者都是 JSON-safe 纯数据，现有 `transitionMetadata()` 的 JSON 往返就能原样搬运，
 * 因此本文件只证明「透传没坏」：结构不塌缩、产物可编译、三端编译档位表现一致。
 * `default` 的生成语义与管线重写属于 US-018，这里一概不碰。
 */

import { PropertyType, type EntityPropertyMetadataOptions } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import {
  compileGeneratedRuntime,
  FRAMEWORK_COMPILER_PROFILES,
  type FrameworkCompilerProfile,
  type GeneratedRuntimeSource
} from './helpers/generated-runtime.js';

/** 带全部三种语义键的属性表：判别对象、只读数组、展示元数据各覆盖一遍。 */
const SEMANTIC_PROPERTIES: EntityPropertyMetadataOptions[] = [
  { name: 'id', type: PropertyType.uuid, primary: true },
  { name: 'homepage', type: PropertyType.string, format: { kind: 'url', schemes: ['HTTPS', 'http'] } },
  {
    name: 'status',
    type: PropertyType.enum,
    enum: ['draft', 'in-review'],
    format: { kind: 'singleSelect' },
    options: { draft: { label: '草稿', color: '#888888' }, 'in-review': { label: '待审', disabled: true } }
  },
  {
    name: 'tags',
    type: PropertyType.stringArray,
    enum: ['alpha', 'beta'],
    format: { kind: 'multiSelect' },
    options: { alpha: { label: '甲' } }
  },
  { name: 'score', type: PropertyType.number, format: { kind: 'rating', min: 1, max: 5, step: 0.5 } }
];

/** 与 {@link SEMANTIC_PROPERTIES} 逐字段等价，只去掉 `format` 与 `options`；`enum` 保留（它本就参与类型推导）。 */
const PLAIN_PROPERTIES: EntityPropertyMetadataOptions[] = [
  { name: 'id', type: PropertyType.uuid, primary: true },
  { name: 'homepage', type: PropertyType.string },
  { name: 'status', type: PropertyType.enum, enum: ['draft', 'in-review'] },
  { name: 'tags', type: PropertyType.stringArray, enum: ['alpha', 'beta'] },
  { name: 'score', type: PropertyType.number }
];

const createGenerator = (properties: EntityPropertyMetadataOptions[]): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator();
  generator.addEntity({
    name: 'Article',
    namespace: 'public',
    displayName: 'Article',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties,
    computedProperties: [],
    relations: [],
    indexes: []
  });
  generator.exec();
  return generator;
};

const sourceTextOf = (generator: RxDBClientGenerator, extension: string): string =>
  generator
    .getSourceFiles()
    .filter(file => file.getFilePath().endsWith(extension))
    .map(file => file.getText())
    .join('\n');

const runtimeSourcesOf = (generator: RxDBClientGenerator): GeneratedRuntimeSource[] =>
  generator
    .getSourceFiles()
    .filter(file => file.getFilePath().endsWith('.js'))
    .map(file => ({ path: file.getFilePath(), text: file.getText() }));

/** 生成器为可读性做了缩进换行，断言只关心结构，因此比对前抹掉所有空白。 */
const compact = (text: string): string => text.replace(/\s+/g, '');

const PROFILE_NAMES = Object.keys(FRAMEWORK_COMPILER_PROFILES) as FrameworkCompilerProfile[];

describe('AC#34 — 生成器透传 format / enum / options', () => {
  it('format 判别对象连同配置项整份落进生成代码', () => {
    const runtime = compact(sourceTextOf(createGenerator(SEMANTIC_PROPERTIES), '.js'));

    expect(runtime).toContain(compact('format: { kind: "url", schemes: ["HTTPS", "http"] }'));
    expect(runtime).toContain(compact('format: { kind: "singleSelect" }'));
    expect(runtime).toContain(compact('format: { kind: "multiSelect" }'));
    expect(runtime).toContain(compact('format: { kind: "rating", min: 1, max: 5, step: 0.5 }'));
  });

  it('enum 只读数组保序透传，成员不被合并成单个字符串', () => {
    const runtime = compact(sourceTextOf(createGenerator(SEMANTIC_PROPERTIES), '.js'));

    expect(runtime).toContain(compact('enum: [ "draft", "in-review" ]'));
    expect(runtime).toContain(compact('enum: [ "alpha", "beta" ]'));
  });

  it('options 展示元数据整份透传，含 disabled 与需要引号的键', () => {
    const runtime = compact(sourceTextOf(createGenerator(SEMANTIC_PROPERTIES), '.js'));

    expect(runtime).toContain(
      compact('options: { draft: { label: "草稿", color: "#888888" }, "in-review": { label: "待审", disabled: true } }')
    );
    expect(runtime).toContain(compact('options: { alpha: { label: "甲" } }'));
  });

  it('三个语义键都不被塌缩成字符串或 [object Object]', () => {
    const runtime = sourceTextOf(createGenerator(SEMANTIC_PROPERTIES), '.js');

    expect(runtime).not.toContain('[object Object]');
    expect(runtime).not.toMatch(/\bformat:\s*["'`]/);
    expect(runtime).not.toMatch(/\benum:\s*["'`]/);
    expect(runtime).not.toMatch(/\boptions:\s*["'`]/);
  });

  it.each(PROFILE_NAMES)('生成的运行时产物在 %s 编译档位下零诊断', async profile => {
    const diagnostics = await compileGeneratedRuntime(runtimeSourcesOf(createGenerator(SEMANTIC_PROPERTIES)), profile);

    expect(diagnostics).toEqual([]);
  });

  it('同一份产物在三端编译档位下诊断完全一致', async () => {
    const sources = runtimeSourcesOf(createGenerator(SEMANTIC_PROPERTIES));
    const [angular, react, vue] = await Promise.all(
      PROFILE_NAMES.map(profile => compileGeneratedRuntime(sources, profile))
    );

    expect(PROFILE_NAMES).toStrictEqual(['angular', 'react', 'vue']);
    expect(react).toStrictEqual(angular);
    expect(vue).toStrictEqual(angular);
  });

  it('语义键一旦塌缩成字符串，编译必须失败（防止上面的编译断言变成空转）', async () => {
    const sources = runtimeSourcesOf(createGenerator(SEMANTIC_PROPERTIES)).map(source => ({
      path: source.path,
      text: source.text.replace(/format: \{\s*kind: "url",[\s\S]*?\}/, 'format: "url"')
    }));

    const diagnostics = await compileGeneratedRuntime(sources, 'angular');

    expect(diagnostics.join('\n')).toContain("Type 'string' is not assignable to type");
    expect(diagnostics.join('\n')).toContain('UrlFormat');
  });

  it('format 与 options 不改变生成的类型声明（INV-2）', () => {
    const withSemantics = sourceTextOf(createGenerator(SEMANTIC_PROPERTIES), '.d.ts');
    const withoutSemantics = sourceTextOf(createGenerator(PLAIN_PROPERTIES), '.d.ts');

    expect(withSemantics).not.toBe('');
    expect(withSemantics).toBe(withoutSemantics);
  });

  it('enum 在类型声明层展开为字面量联合而不是 string', () => {
    const declaration = sourceTextOf(createGenerator(SEMANTIC_PROPERTIES), '.d.ts');

    expect(declaration).toContain('status: "draft" | "in-review"');
    expect(declaration).not.toMatch(/\bstatus: string\b/);
  });
});
