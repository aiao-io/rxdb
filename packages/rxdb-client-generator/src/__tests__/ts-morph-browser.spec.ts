import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  InterfaceHelper,
  Node,
  Project,
  VariableDeclarationKind,
  type ClassDeclarationStructure,
  type ImportDeclarationStructure,
  type InterfaceDeclarationStructure,
  type ModuleDeclarationStructure,
  type TypeAliasDeclarationStructure,
  type VariableStatementStructure
} from '../core/ts-morph-browser.js';

describe('ts_morph_browser', () => {
  beforeAll(() => {
    process.setMaxListeners(0);
  });
  describe('Project', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should create a new source file', () => {
      const sourceFile = project.createSourceFile('test.ts');
      expect(sourceFile).toBeDefined();
      expect(sourceFile.getFilePath()).toBe('test.ts');
    });

    it('should create source file with content', () => {
      const content = 'export class TestClass {}';
      const sourceFile = project.createSourceFile('test.ts', content);
      expect(sourceFile.getText()).toBe(content);
    });

    it('should add source file at path', () => {
      const sourceFile = project.addSourceFileAtPath('test.ts');
      expect(sourceFile).toBeDefined();
      expect(sourceFile.getFilePath()).toBe('test.ts');
    });

    it('should get all source files', () => {
      project.createSourceFile('file1.ts');
      project.createSourceFile('file2.ts');
      const files = project.getSourceFiles();
      expect(files).toHaveLength(2);
    });
  });

  describe('SourceFile - Class Declaration', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should add a simple class', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const classStructure: ClassDeclarationStructure = {
        name: 'MyClass',
        isExported: true
      };

      sourceFile.addClass(classStructure);
      const text = sourceFile.getText();

      expect(text).toContain('export declare class MyClass');
      expect(text).toContain('/**');
      expect(text).toContain(' * MyClass');
      expect(text).toContain(' */');
    });

    it('should add class with extends', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const classStructure: ClassDeclarationStructure = {
        name: 'ChildClass',
        extends: 'ParentClass'
      };

      sourceFile.addClass(classStructure);
      const text = sourceFile.getText();

      expect(text).toContain('export declare class ChildClass extends ParentClass');
    });

    it('should add class with implements', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const classStructure: ClassDeclarationStructure = {
        name: 'MyClass',
        implements: ['Interface1', 'Interface2']
      };

      sourceFile.addClass(classStructure);
      const text = sourceFile.getText();

      expect(text).toContain('implements Interface1, Interface2');
    });

    it('should add class with properties', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const classStructure: ClassDeclarationStructure = {
        name: 'MyClass',
        properties: [
          { name: 'id', type: 'string' },
          { name: 'count', type: 'number', hasQuestionToken: true }
        ]
      };

      sourceFile.addClass(classStructure);
      const text = sourceFile.getText();
      expect(text).toContain('id: string;');
      expect(text).toContain('count?: number;');
    });

    it('should add class with static property', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'MyClass' });
      cls.addProperties([{ name: 'instance', type: 'MyClass', isStatic: true }]);

      const text = sourceFile.getText();
      expect(text).toContain('static instance: MyClass;');
    });

    it('should add class with constructor', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'MyClass' });
      cls.addConstructor({
        parameters: [
          { name: 'id', type: 'string' },
          { name: 'age', type: 'number', hasQuestionToken: true }
        ],
        docs: ['Creates a new instance']
      });

      const text = sourceFile.getText();
      expect(text).toContain('/**');
      expect(text).toContain(' * Creates a new instance');
      expect(text).toContain('constructor(id: string, age?: number);');
    });

    it('should add class with methods', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'MyClass' });
      cls.addMethods([
        {
          name: 'getValue',
          returnType: 'string',
          docs: ['Gets the value']
        },
        {
          name: 'setValue',
          parameters: [{ name: 'value', type: 'string' }],
          returnType: 'void'
        }
      ]);

      const text = sourceFile.getText();
      expect(text).toContain('/**');
      expect(text).toContain(' * Gets the value');
      expect(text).toContain('getValue(): string;');
      expect(text).toContain('setValue(value: string): void;');
    });

    it('should add class with static method', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'MyClass' });
      cls.addMethods([
        {
          name: 'create',
          returnType: 'MyClass',
          isStatic: true
        }
      ]);

      const text = sourceFile.getText();
      expect(text).toContain('static create(): MyClass;');
    });

    it('should add JSDoc to class', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'MyClass' });
      cls.addJsDoc('This is a custom class description');
      cls.addJsDoc('@example new MyClass()');

      const text = sourceFile.getText();
      expect(text).toContain('/**');
      expect(text).toContain(' * This is a custom class description');
      expect(text).toContain(' * @example new MyClass()');
    });
  });

  describe('SourceFile - Interface Declaration', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should add a simple interface', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const interfaceStructure: InterfaceDeclarationStructure = {
        name: 'User',
        isExported: true
      };

      sourceFile.addInterface(interfaceStructure);
      const text = sourceFile.getText();

      expect(text).toContain('export interface User');
    });

    it('should add interface with extends', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const interfaceStructure: InterfaceDeclarationStructure = {
        name: 'Admin',
        extends: ['User', 'Permissions']
      };

      sourceFile.addInterface(interfaceStructure);
      const text = sourceFile.getText();

      expect(text).toContain('interface Admin extends User, Permissions');
    });

    it('should add interface with properties', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const interfaceStructure: InterfaceDeclarationStructure = {
        name: 'User',
        properties: [
          { name: 'id', type: 'string' },
          { name: 'name', type: 'string' },
          { name: 'email', type: 'string', hasQuestionToken: true }
        ]
      };

      sourceFile.addInterface(interfaceStructure);
      const text = sourceFile.getText();

      expect(text).toContain('id: string;');
      expect(text).toContain('name: string;');
      expect(text).toContain('email?: string;');
    });

    it('should add property to existing interface', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const iface = sourceFile.addInterface({ name: 'User' });
      iface.addProperty({ name: 'id', type: 'string' });
      iface.addProperty({ name: 'name', type: 'string' });

      const text = sourceFile.getText();
      expect(text).toContain('id: string;');
      expect(text).toContain('name: string;');
    });

    it('should keep identical duplicate properties idempotent', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const iface = sourceFile.addInterface({ name: 'User' });
      iface.addProperty({ name: 'id', type: 'string' });
      iface.addProperty({ name: 'id', type: 'string' });

      const text = sourceFile.getText();
      const idMatches = text.match(/id:/g);
      expect(idMatches).toHaveLength(1);
    });

    it('should add interface with docs', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const interfaceStructure: InterfaceDeclarationStructure = {
        name: 'User',
        docs: ['Represents a user in the system', '@interface']
      };

      sourceFile.addInterface(interfaceStructure);
      const text = sourceFile.getText();

      expect(text).toContain('/**');
      expect(text).toContain(' * Represents a user in the system');
      expect(text).toContain(' * @interface');
    });
  });

  describe('SourceFile - Type Alias', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should add a type alias', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const typeAlias: TypeAliasDeclarationStructure = {
        name: 'ID',
        type: 'string | number',
        isExported: true
      };

      sourceFile.addTypeAlias(typeAlias);
      const text = sourceFile.getText();

      expect(text).toContain('export type ID = string | number;');
    });

    it('should add type alias with declare keyword', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const typeAlias: TypeAliasDeclarationStructure = {
        name: 'GlobalType',
        type: 'any',
        hasDeclareKeyword: true
      };

      sourceFile.addTypeAlias(typeAlias);
      const text = sourceFile.getText();

      expect(text).toContain('declare type GlobalType = any;');
    });

    it('should add type alias with docs', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const typeAlias: TypeAliasDeclarationStructure = {
        name: 'ID',
        type: 'string | number',
        docs: ['Represents a unique identifier']
      };

      sourceFile.addTypeAlias(typeAlias);
      const text = sourceFile.getText();

      expect(text).toContain('/**');
      expect(text).toContain(' * Represents a unique identifier');
    });
  });

  describe('SourceFile - Import Declaration', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should add named imports', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const importDecl: ImportDeclarationStructure = {
        namedImports: ['Component', 'useState'],
        moduleSpecifier: 'react'
      };

      sourceFile.addImportDeclaration(importDecl);
      const text = sourceFile.getText();

      expect(text).toContain("import { Component, useState } from 'react';");
    });

    it('should render type-only named imports', () => {
      const sourceFile = project.createSourceFile('test.ts');
      sourceFile.addImportDeclaration({
        namedImports: ['Widget'],
        isTypeOnly: true,
        moduleSpecifier: './Widget.js'
      });

      expect(sourceFile.getText()).toContain("import type { Widget } from './Widget.js';");
    });

    it('should add multiple import declarations', () => {
      const sourceFile = project.createSourceFile('test.ts');
      sourceFile.addImportDeclaration({
        namedImports: ['Component'],
        moduleSpecifier: 'react'
      });
      sourceFile.addImportDeclaration({
        namedImports: ['observer'],
        moduleSpecifier: 'mobx-react'
      });

      const text = sourceFile.getText();
      expect(text).toContain("import { Component } from 'react';");
      expect(text).toContain("import { observer } from 'mobx-react';");
    });
  });

  describe('SourceFile - Enum Declaration', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('renders exported const enums with string and numeric members', () => {
      const sourceFile = project.createSourceFile('enums.ts');
      sourceFile.addEnum({
        name: 'Color',
        isExported: true,
        isConst: true,
        docs: ['UI colors'],
        members: [{ name: 'Red', value: 'red' }, { name: 'Blue', value: 2 }, { name: 'Green' }]
      });

      const text = sourceFile.getText();
      expect(text).toContain('/**');
      expect(text).toContain(' * UI colors');
      expect(text).toContain('export const enum Color');
      expect(text).toContain('Red = "red"');
      expect(text).toContain('Blue = 2');
      expect(text).toContain('Green');
    });

    it('renders plain enums without export when not requested', () => {
      const sourceFile = project.createSourceFile('enums.ts');
      sourceFile.addEnum({
        name: 'Status',
        members: [{ name: 'Open' }, { name: 'Closed' }]
      });

      const text = sourceFile.getText();
      expect(text).toContain('enum Status');
      expect(text).not.toContain('export enum Status');
      expect(text).toContain('Open,');
      expect(text).toContain('Closed');
    });
  });

  describe('SourceFile - Variable Statement', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should add const variable', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const variable: VariableStatementStructure = {
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: [{ name: 'VERSION', type: 'string', initializer: "'1.0.0'" }]
      };

      sourceFile.addVariableStatement(variable);
      const text = sourceFile.getText();

      expect(text).toContain("export const VERSION: string = '1.0.0';");
    });

    it('should add let variable', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const variable: VariableStatementStructure = {
        declarationKind: VariableDeclarationKind.Let,
        declarations: [{ name: 'counter', type: 'number' }]
      };

      sourceFile.addVariableStatement(variable);
      const text = sourceFile.getText();

      expect(text).toContain('let counter: number;');
    });

    it('should add variable with declare keyword', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const variable: VariableStatementStructure = {
        declarationKind: VariableDeclarationKind.Const,
        hasDeclareKeyword: true,
        declarations: [{ name: 'global', type: 'Window' }]
      };

      sourceFile.addVariableStatement(variable);
      const text = sourceFile.getText();

      expect(text).toContain('declare const global: Window;');
    });

    it('should add multiple variable declarations', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const variable: VariableStatementStructure = {
        declarationKind: VariableDeclarationKind.Let,
        declarations: [
          { name: 'x', type: 'number', initializer: '0' },
          { name: 'y', type: 'number', initializer: '0' }
        ]
      };

      sourceFile.addVariableStatement(variable);
      const text = sourceFile.getText();

      expect(text).toContain('let x: number = 0, y: number = 0;');
    });
  });

  describe('SourceFile - Module Declaration', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should add a module', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const module: ModuleDeclarationStructure = {
        name: 'MyNamespace',
        hasDeclareKeyword: true
      };

      sourceFile.addModule(module);
      const text = sourceFile.getText();

      expect(text).toContain('declare module MyNamespace');
    });

    it('should add module with interface', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const module = sourceFile.addModule({ name: 'MyNamespace' });
      module.addInterface({ name: 'Config' });

      const text = sourceFile.getText();
      expect(text).toContain('module MyNamespace');
      expect(text).toContain('interface Config');
    });

    it('should add module with interface and properties', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const module = sourceFile.addModule({ name: 'MyNamespace' });
      const iface = module.addInterface({ name: 'Config' });
      iface.addProperty({ name: 'apiUrl', type: 'string' });
      iface.addProperty({ name: 'timeout', type: 'number' });

      const text = sourceFile.getText();
      expect(text).toContain('apiUrl: string;');
      expect(text).toContain('timeout: number;');
    });

    it('should add module with docs', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const module: ModuleDeclarationStructure = {
        name: 'MyNamespace',
        docs: ['Application namespace']
      };

      sourceFile.addModule(module);
      const text = sourceFile.getText();

      expect(text).toContain('/**');
      expect(text).toContain(' * Application namespace');
    });
  });

  describe('InterfaceHelper', () => {
    it('should create interface helper', () => {
      const helper = new InterfaceHelper({ name: 'User' });
      expect(helper.name).toBe('User');
      expect(helper.properties).toEqual([]);
    });

    it('should add properties', () => {
      const helper = new InterfaceHelper({ name: 'User' });
      helper.addProperty({ name: 'id', type: 'string' });
      helper.addProperty({ name: 'name', type: 'string' });

      expect(helper.properties).toHaveLength(2);
    });

    it('should keep identical duplicate properties idempotent', () => {
      const helper = new InterfaceHelper({ name: 'User' });
      helper.addProperty({ name: 'id', type: 'string' });
      helper.addProperty({ name: 'id', type: 'string' });

      expect(helper.properties).toHaveLength(1);
      expect(helper.properties[0].type).toBe('string');
    });

    it('should reject incompatible duplicate property signatures', () => {
      const helper = new InterfaceHelper({ name: 'User' });
      helper.addProperty({ name: 'id', type: 'string' });

      expect(() => helper.addProperty({ name: 'id', type: 'number' })).toThrow(/User.*id.*string.*number/);
    });

    it('should preserve existing properties', () => {
      const helper = new InterfaceHelper({
        name: 'User',
        properties: [{ name: 'id', type: 'string' }]
      });

      expect(helper.properties).toHaveLength(1);
      helper.addProperty({ name: 'name', type: 'string' });
      expect(helper.properties).toHaveLength(2);
    });
  });

  describe('Node utilities', () => {
    it('should check if node is decoratable', () => {
      const validNode = {
        getDecorators: () => []
      };
      expect(Node.isDecoratable(validNode)).toBe(true);

      const invalidNode = { name: 'test' };
      expect(Node.isDecoratable(invalidNode)).toBe(false);

      expect(Node.isDecoratable(null)).toBe(false);
      expect(Node.isDecoratable(undefined)).toBe(false);
    });

    it('should check if node is call expression', () => {
      const validNode = {
        getText: () => 'test'
      };
      expect(Node.isCallExpression(validNode)).toBe(true);

      const invalidNode = { name: 'test' };
      expect(Node.isCallExpression(invalidNode)).toBe(false);

      expect(Node.isCallExpression(null)).toBe(false);
      expect(Node.isCallExpression(undefined)).toBe(false);
    });
  });

  describe('SourceFile - Complex scenarios', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should generate complete file with all features', () => {
      const sourceFile = project.createSourceFile('complex.ts');

      // 添加导入。
      sourceFile.addImportDeclaration({
        namedImports: ['Component', 'ReactNode'],
        moduleSpecifier: 'react'
      });

      // 添加类型别名。
      sourceFile.addTypeAlias({
        name: 'ID',
        type: 'string | number',
        isExported: true,
        docs: ['Unique identifier type']
      });

      // 添加接口。
      const userInterface = sourceFile.addInterface({
        name: 'User',
        isExported: true,
        docs: ['User entity']
      });
      userInterface.addProperty({ name: 'id', type: 'ID' });
      userInterface.addProperty({ name: 'name', type: 'string' });

      // 添加类。
      const cls = sourceFile.addClass({
        name: 'UserService',
        implements: ['Service']
      });
      cls.addProperties([{ name: 'users', type: 'User[]', isStatic: true }]);
      cls.addConstructor({
        parameters: [{ name: 'apiUrl', type: 'string' }],
        docs: ['Creates a new UserService']
      });
      cls.addMethods([
        {
          name: 'getUser',
          parameters: [{ name: 'id', type: 'ID' }],
          returnType: 'Promise<User>',
          docs: ['Fetches a user by ID']
        }
      ]);

      const text = sourceFile.getText();

      // 验证结构。
      expect(text).toContain("import { Component, ReactNode } from 'react';");
      expect(text).toContain('export type ID = string | number;');
      expect(text).toContain('export interface User');
      expect(text).toContain('export declare class UserService implements Service');
      expect(text).toContain('static users: User[];');
      expect(text).toContain('constructor(apiUrl: string);');
      expect(text).toContain('getUser(id: ID): Promise<User>;');
    });

    it('should handle empty source file', () => {
      const sourceFile = project.createSourceFile('empty.ts');
      const text = sourceFile.getText();
      expect(text).toBe('');
    });

    it('should preserve custom content', () => {
      const customContent = '// Custom TypeScript code\nexport const VALUE = 42;';
      const sourceFile = project.createSourceFile('custom.ts', customContent);
      expect(sourceFile.getText()).toBe(customContent);

      // 自定义内容应优先。
      sourceFile.addClass({ name: 'TestClass' });
      expect(sourceFile.getText()).toBe(customContent);
    });

    it('should handle property with all modifiers', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'MyClass' });
      cls.addProperties([
        {
          name: 'complexProp',
          type: 'string',
          isStatic: true,
          hasQuestionToken: true,
          docs: ['A complex property']
        }
      ]);

      const text = sourceFile.getText();
      expect(text).toContain('/**');
      expect(text).toContain(' * A complex property');
      expect(text).toContain('static complexProp?: string;');
    });

    it('should handle method with all features', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'MyClass' });
      cls.addMethods([
        {
          name: 'complexMethod',
          isStatic: true,
          parameters: [
            { name: 'required', type: 'string' },
            { name: 'optional', type: 'number', hasQuestionToken: true }
          ],
          returnType: 'Promise<void>',
          docs: ['A complex method', '@param required - Required parameter']
        }
      ]);

      const text = sourceFile.getText();
      expect(text).toContain('/**');
      expect(text).toContain(' * A complex method');
      expect(text).toContain('static complexMethod(required: string, optional?: number): Promise<void>;');
    });
  });

  describe('SourceFile - Save operations', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('rejects asynchronous filesystem save', async () => {
      const sourceFile = project.createSourceFile('test.ts');
      await expect(sourceFile.save()).rejects.toThrow('does not provide filesystem save');
    });

    it('rejects synchronous filesystem save', () => {
      const sourceFile = project.createSourceFile('test.ts');
      expect(() => sourceFile.saveSync()).toThrow('does not provide filesystem save');
    });
  });

  describe('SourceFile - Public structure contract', () => {
    it('renders supported member modifiers and rest parameters into valid TypeScript', () => {
      const project = new Project();
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'Service' });
      cls.addProperties([{ name: 'token', type: 'string', scope: 'private', isReadonly: true }]);
      cls.addMethods([
        {
          name: 'load',
          scope: 'protected',
          hasQuestionToken: true,
          parameters: [{ name: 'ids', type: 'string[]', isRestParameter: true }],
          returnType: 'void'
        }
      ]);

      const text = sourceFile.getText();
      expect(text).toContain('private readonly token: string;');
      expect(text).toContain('protected load?(...ids: string[]): void;');
      expect(
        transpileModule(text, {
          compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ESNext },
          reportDiagnostics: true
        }).diagnostics
      ).toEqual([]);
    });

    it.each([
      ['parameter initializer', () => ({ parameters: [{ name: 'value', initializer: '1' }] })],
      ['async method', () => ({ isAsync: true })],
      ['method statements', () => ({ statements: ['return;'] })]
    ])('rejects unsupported %s instead of ignoring it', (_name, createMethod) => {
      const project = new Project();
      const sourceFile = project.createSourceFile('test.ts');
      sourceFile.addClass({ name: 'Service', methods: [{ name: 'run', ...createMethod() }] });

      expect(() => sourceFile.getText()).toThrow(/Unsupported declaration feature/);
    });

    it.each([
      ['property initializer', { name: 'value', initializer: '1' }],
      ['definite assignment', { name: 'value', hasExclamationToken: true }]
    ])('rejects unsupported %s instead of ignoring it', (_name, property) => {
      const project = new Project();
      const sourceFile = project.createSourceFile('test.ts');
      sourceFile.addClass({ name: 'Service', properties: [property] });

      expect(() => sourceFile.getText()).toThrow(/Unsupported declaration feature/);
    });

    it.each([
      ['decorators', { name: 'Service', decorators: [{ name: 'sealed' }] }],
      ['non-exported class', { name: 'Service', isExported: false }],
      ['non-declare class', { name: 'Service', hasDeclareKeyword: false }]
    ])('rejects unsupported class %s instead of ignoring it', (_name, structure) => {
      const project = new Project();
      const sourceFile = project.createSourceFile('test.ts');
      sourceFile.addClass(structure);

      expect(() => sourceFile.getText()).toThrow(/Unsupported declaration feature/);
    });

    it.each([
      ['scope', { name: 'value', scope: 'private' as const }],
      ['static', { name: 'value', isStatic: true }]
    ])('rejects unsupported interface property %s', (_name, property) => {
      const project = new Project();
      const sourceFile = project.createSourceFile('test.ts');
      sourceFile.addInterface({ name: 'State', properties: [property] });

      expect(() => sourceFile.getText()).toThrow(/Unsupported declaration feature/);
    });
  });

  describe('ClassDeclaration API', () => {
    let project: Project;

    beforeEach(() => {
      project = new Project();
    });

    it('should get class name', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'TestClass' });
      expect(cls.getName()).toBe('TestClass');
    });

    it('should get base class', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'Child', extends: 'Parent' });
      const baseClass = cls.getBaseClass();
      expect(baseClass).toBeDefined();
      expect(baseClass?.getName()).toBe('Parent');
      expect(baseClass?.getText()).toBe('Parent');
    });

    it('should return undefined for no base class', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'TestClass' });
      expect(cls.getBaseClass()).toBeUndefined();
    });

    it('should get implements list', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({
        name: 'TestClass',
        implements: ['Interface1', 'Interface2']
      });
      const _implements = cls.getImplements();
      expect(_implements).toHaveLength(2);
      expect(_implements[0].getText()).toBe('Interface1');
      expect(_implements[1].getText()).toBe('Interface2');
    });

    it('should get empty implements list', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'TestClass' });
      expect(cls.getImplements()).toEqual([]);
    });

    it('should get decorators', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'TestClass' });
      expect(cls.getDecorators()).toEqual([]);
    });

    it('should get text', () => {
      const sourceFile = project.createSourceFile('test.ts');
      const cls = sourceFile.addClass({ name: 'TestClass' });
      expect(cls.getText()).toBe('TestClass');
    });
  });
});
