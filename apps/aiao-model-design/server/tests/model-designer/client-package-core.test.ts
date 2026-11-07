// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ClientPackageError } from '../../src/routes/model-designer/client-package/npm-runner';
import { createClientPackageBuild } from '../../src/routes/model-designer/client-package/package-builder';

const request = {
  packageName: '@acme/blog-rxdb',
  generatedFiles: [
    { path: 'index.js', content: 'export class Post {}' },
    { path: 'index.d.ts', content: 'export declare class Post {}' }
  ],
  designContract: {
    entities: [
      {
        name: 'Post',
        properties: [{ name: 'title', columnName: 'post_title', type: 'string', required: true }],
        relations: []
      }
    ],
    metadata: { designName: 'Blog' }
  }
};

describe('client package builder', () => {
  it('creates a publishable dist/types layout with tightened peers', () => {
    const result = createClientPackageBuild(request, '1.0.0');

    expect(result.files.get('dist/index.js')).toBe('export class Post {}');
    expect(result.files.get('types/index.d.ts')).toBe('export declare class Post {}');
    expect(result.manifest).toMatchObject({
      name: '@acme/blog-rxdb',
      version: '1.0.0',
      type: 'module',
      files: ['dist', 'types', 'README.md'],
      exports: { '.': { import: './dist/index.js', types: './types/index.d.ts' } },
      peerDependencies: {
        '@aiao/rxdb': '>=0.0.21 <0.1.0',
        rxjs: '>=7.8.0 <8'
      }
    });
    expect(result.designRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.aiao.designRevision).toBe(result.designRevision);
  });

  it.each(['blog-rxdb', '@acme/blog', '@acme/Blog-rxdb', '@acme/blog rxdb'])(
    'rejects invalid package name %s',
    name => {
      expect(() => createClientPackageBuild({ ...request, packageName: name }, '1.0.0')).toThrow(ClientPackageError);
    }
  );

  it.each(['../secret.js', '/tmp/secret.js', 'nested/../../secret.d.ts'])(
    'rejects generated path traversal %s',
    path => {
      const generatedFiles = [{ path, content: 'secret' }, request.generatedFiles[1]];
      expect(() => createClientPackageBuild({ ...request, generatedFiles }, '1.0.0')).toThrow(ClientPackageError);
    }
  );

  it('requires both runtime and type declaration entry points', () => {
    expect(() =>
      createClientPackageBuild({ ...request, generatedFiles: [request.generatedFiles[0]] }, '1.0.0')
    ).toThrow('runtime and declaration');
  });
});
