import type { DesignEntity, DesignProperty } from '../../models/index.js';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CodeGeneratorService } from '../../services/code-generator.service';
import { designToSqlSchema } from '../../sql/design-to-schema';

describe('client and SQL schema consistency', () => {
  it('uses the same logical field, physical column, type, and nullability', () => {
    TestBed.configureTestingModule({ providers: [CodeGeneratorService] });
    const service = TestBed.inject(CodeGeneratorService);
    const entity = {
      id: 'post',
      name: 'Post',
      tableName: 'posts',
      displayName: null,
      entityNamespace: 'public',
      extendsBase: 'EntityBase',
      repositoryType: 'Repository',
      sortOrder: 'a0'
    } as unknown as DesignEntity;
    const property = {
      id: 'title',
      designEntityId: 'post',
      name: 'title',
      columnName: 'post_title',
      propertyType: 'string',
      isRequired: true,
      isNullable: false,
      isUnique: false,
      isReadonly: false,
      isSortable: false,
      defaultValue: null,
      displayName: null,
      sortOrder: 'a0'
    } as unknown as DesignProperty;

    const metadata = service.toMetadataOptions(entity, [property], [], [], [entity]);
    const generated = service.generate([metadata]);
    const runtime = generated.files.find(file => file.path === 'index.js')?.content ?? '';
    const declarations = generated.files.find(file => file.path === 'index.d.ts')?.content ?? '';
    const sql = designToSqlSchema({
      entities: [{ id: 'post', name: 'Post', tableName: 'posts', extendsBase: 'EntityBase' }],
      properties: [
        {
          id: 'title',
          name: 'title',
          columnName: 'post_title',
          propertyType: 'string',
          isRequired: true,
          isNullable: false,
          isUnique: false,
          defaultValue: null,
          sortOrder: 'a0'
        }
      ],
      relations: [],
      indexes: [],
      propertyEntityIds: { title: 'post' }
    });
    const column = sql.tables[0]?.columns.find(value => value.name === 'post_title');

    expect(runtime).toContain('columnName: "post_title"');
    expect(declarations).toContain('title: string;');
    expect(column).toMatchObject({ name: 'post_title', type: 'text', nullable: false });
  });
});
