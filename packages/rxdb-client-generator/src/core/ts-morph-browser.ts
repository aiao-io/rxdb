/**
 * @fileoverview 轻量级 TypeScript 解析器实现
 * 用于替代 ts-morph 在浏览器上的生成文件
 */

// ==================== 枚举和类型定义 ====================

/**
 * 变量声明类型枚举
 */
export enum VariableDeclarationKind {
  Var = 'var',
  Let = 'let',
  Const = 'const'
}

/**
 * 成员访问修饰符类型
 */
export type Scope = 'public' | 'protected' | 'private';

/**
 * 可选类型包装器
 */
export type OptionalKind<T> = T;

// ==================== 基础结构接口 ====================

/**
 * 装饰器结构
 */
export interface DecoratorStructure {
  name: string;
  arguments?: string[];
}

/**
 * 参数声明结构
 */
export interface ParameterDeclarationStructure {
  name: string;
  type?: string;
  hasQuestionToken?: boolean;
  initializer?: string;
  isRestParameter?: boolean;
}

/**
 * 变量声明结构
 */
export interface VariableDeclaration {
  name: string;
  type?: string;
  initializer?: string;
}

/**
 * 属性声明结构
 */
export interface PropertyDeclarationStructure {
  name: string;
  type?: string;
  initializer?: string;
  docs?: string[];
  isReadonly?: boolean;
  isStatic?: boolean;
  hasQuestionToken?: boolean;
  hasExclamationToken?: boolean;
  scope?: Scope;
}

/**
 * 方法声明结构
 */
export interface MethodDeclarationStructure {
  name: string;
  returnType?: string;
  parameters?: ParameterDeclarationStructure[];
  typeParameters?: string[];
  docs?: string[];
  isStatic?: boolean;
  isAsync?: boolean;
  hasQuestionToken?: boolean;
  scope?: Scope;
  statements?: string[];
}

/**
 * 构造函数数据结构
 */
export interface ConstructorData {
  parameters: ParameterDeclarationStructure[];
  docs: string[];
}

// ==================== 声明结构接口 ====================

/**
 * 类声明结构
 */
export interface ClassDeclarationStructure {
  name: string;
  extends?: string;
  implements?: string[];
  docs?: string[];
  isExported?: boolean;
  hasDeclareKeyword?: boolean;
  properties?: PropertyDeclarationStructure[];
  methods?: MethodDeclarationStructure[];
  decorators?: DecoratorStructure[];
}

/**
 * 接口声明结构
 */
export interface InterfaceDeclarationStructure {
  name: string;
  extends?: string[];
  docs?: string[];
  isExported?: boolean;
  properties?: PropertyDeclarationStructure[];
}

/**
 * 模块声明结构
 */
export interface ModuleDeclarationStructure {
  name: string;
  hasDeclareKeyword?: boolean;
  docs?: string[];
  interfaces?: InterfaceDeclarationStructure[];
}

/**
 * 类型别名声明结构
 */
export interface TypeAliasDeclarationStructure {
  name: string;
  type: string;
  docs?: string[];
  isExported?: boolean;
  hasDeclareKeyword?: boolean;
}

/**
 * 导入声明结构
 */
export interface ImportDeclarationStructure {
  namedImports?: string[];
  moduleSpecifier: string;
  isTypeOnly?: boolean;
}

/**
 * 导出声明结构
 */
export interface ExportDeclarationStructure {
  namedExports?: string[];
  moduleSpecifier?: string;
  isTypeOnly?: boolean;
}

/**
 * 变量语句结构
 */
export interface VariableStatementStructure {
  declarationKind: VariableDeclarationKind;
  hasDeclareKeyword?: boolean;
  isExported?: boolean;
  declarations: VariableDeclaration[];
}

// ==================== AST 节点接口 ====================

/**
 * AST节点接口
 */
export interface Node {
  getDecorators(): Decorator[];
  getName(): string | undefined;
  getBaseClass(): Node | undefined;
  getImplements(): Node[];
  getText(): string;
  getArguments?(): Node[];
}

/**
 * 装饰器接口
 */
export interface Decorator {
  getName(): string;
  getExpression(): Node;
}

/**
 * 类声明接口
 */
export interface ClassDeclaration extends Node {
  addJsDoc(doc: string): void;
  addProperties(properties: PropertyDeclarationStructure[]): void;
  addConstructor(constructor: ConstructorData): void;
  addMethods(methods: MethodDeclarationStructure[]): void;
  properties?: PropertyDeclarationStructure[];
  methods?: MethodDeclarationStructure[];
  constructorData?: ConstructorData;
  jsDoc?: string[];
}

// ==================== 辅助接口 ====================

/**
 * 枚举成员结构
 */
export interface EnumMemberStructure {
  name: string;
  value?: string | number;
}

/**
 * 枚举声明结构
 */
export interface EnumDeclarationStructure {
  name: string;
  isExported?: boolean;
  isConst?: boolean;
  docs?: string[];
  members?: EnumMemberStructure[];
}

/**
 * 添加接口后的返回类型
 */
export interface AddedInterface {
  addProperty(prop: PropertyDeclarationStructure): void;
}

/**
 * 添加模块后的返回类型
 */
export interface AddedModule {
  addInterface(iface: InterfaceDeclarationStructure): AddedInterface;
}

/**
 * 生成器使用的轻量源文件接口。
 *
 * 该接口只维护内存中的 TypeScript 结构和文本，不连接真实文件系统；CLI 的磁盘提交由
 * 构建器负责。使用 {@link getText} 读取内容；`save`/`saveSync` 为兼容 ts-morph 调用方保留，
 * 但会明确抛出不支持文件系统的错误。
 */
export interface SourceFile {
  addClass(structure: ClassDeclarationStructure): ClassDeclaration;
  addInterface(structure: InterfaceDeclarationStructure): AddedInterface;
  addModule(structure: ModuleDeclarationStructure): AddedModule;
  addTypeAlias(structure: TypeAliasDeclarationStructure): TypeAliasDeclarationStructure;
  addEnum(structure: EnumDeclarationStructure): EnumDeclarationStructure;
  addImportDeclaration(structure: ImportDeclarationStructure): void;
  addExportDeclaration(structure: ExportDeclarationStructure): void;
  addVariableStatement(structure: VariableStatementStructure): void;
  getClasses(): ClassDeclaration[];
  getFilePath(): string;
  getText(): string;
  setContent(content: string): void;
  /**
   * 异步兼容入口。
   * @throws {Error} 始终抛出；内存生成器不提供文件系统写入
   */
  save(): Promise<void>;
  /**
   * 同步兼容入口。
   * @throws {Error} 始终抛出；内存生成器不提供文件系统写入
   */
  saveSync(): void;
}

// ==================== 代码生成器类 ====================

/**
 * 代码生成器
 * 负责将 AST 结构转换为 TypeScript 代码
 */
class CodeGenerator {
  static unsupported(feature: string): never {
    throw new Error(`Unsupported declaration feature: ${feature}`);
  }

  /**
   * 渲染单个参数
   */
  static renderParameter(param: ParameterDeclarationStructure, index: number): string {
    const parts: string[] = [];

    if (param.initializer !== undefined) this.unsupported(`parameter initializer (${param.name})`);
    if (param.isRestParameter && param.hasQuestionToken) {
      this.unsupported(`optional rest parameter (${param.name})`);
    }

    if (index > 0) parts.push(', ');

    if (param.isRestParameter) parts.push('...');
    parts.push(param.name);

    if (param.hasQuestionToken) parts.push('?');

    if (param.type) parts.push(`: ${param.type}`);

    return parts.join('');
  }

  /**
   * 渲染参数列表
   */
  static renderParameterList(parameters?: ParameterDeclarationStructure[]): string {
    if (!parameters?.length) return '';
    const restIndex = parameters.findIndex(parameter => parameter.isRestParameter);
    if (restIndex !== -1 && restIndex !== parameters.length - 1) {
      this.unsupported(`non-final rest parameter (${parameters[restIndex]!.name})`);
    }
    return parameters.map((param, idx) => this.renderParameter(param, idx)).join('');
  }

  /**
   * 渲染单个变量声明
   */
  static renderVariableDeclaration(decl: VariableDeclaration, index: number): string {
    const parts: string[] = [];

    if (index > 0) parts.push(', ');

    parts.push(decl.name);

    if (decl.type) parts.push(`: ${decl.type}`);

    if (decl.initializer) parts.push(` = ${decl.initializer}`);

    return parts.join('');
  }

  /**
   * 渲染变量声明列表
   */
  static renderVariableDeclarationList(declarations: VariableDeclaration[]): string {
    if (!declarations?.length) return '';
    return declarations.map((decl, idx) => this.renderVariableDeclaration(decl, idx)).join('');
  }

  /**
   * 渲染 JSDoc 注释
   */
  static renderJsDoc(docs: string[], indentSize = 0): string {
    if (!docs?.length) return '';

    const indent = ' '.repeat(indentSize);
    const docLines = docs
      .flatMap(doc => doc.split(/\r\n?|\n|\u2028|\u2029/u))
      .map(line => {
        const content = line.replace(/\*\//g, '*\\/');
        return `${indent} *${content ? ` ${content}` : ''}`;
      })
      .join('\n');

    return `${indent}/**\n${docLines}\n${indent} */\n`;
  }

  /**
   * 渲染属性
   */
  static renderProperty(prop: PropertyDeclarationStructure, indentSize: number, isInterface = true): string {
    const indent = ' '.repeat(indentSize);
    const parts: string[] = [];

    if (prop.initializer !== undefined) this.unsupported(`property initializer (${prop.name})`);
    if (prop.hasExclamationToken) this.unsupported(`definite assignment property (${prop.name})`);
    if (isInterface && prop.scope) this.unsupported(`interface property scope (${prop.name})`);
    if (isInterface && prop.isStatic) this.unsupported(`static interface property (${prop.name})`);

    if (prop.docs?.length) {
      parts.push(this.renderJsDoc(prop.docs, indentSize));
    }

    parts.push(indent);

    if (prop.scope) parts.push(`${prop.scope} `);
    if (prop.isStatic) parts.push('static ');
    if (prop.isReadonly) parts.push('readonly ');

    parts.push(prop.name);

    if (prop.hasQuestionToken) parts.push('?');

    if (prop.type) parts.push(`: ${prop.type}`);

    parts.push(';\n');

    return parts.join('');
  }

  /**
   * 渲染接口块
   */
  static renderInterfaceBlock(
    iface: InterfaceDeclarationStructure,
    indentSize: number,
    includeExportKeyword: boolean
  ): string {
    const indent = ' '.repeat(indentSize);
    const parts: string[] = [];

    if (iface.docs?.length) {
      parts.push(this.renderJsDoc(iface.docs, indentSize));
    }

    parts.push(indent);

    if (includeExportKeyword && iface.isExported) {
      parts.push('export ');
    }

    parts.push(`interface ${iface.name}`);

    if (iface.extends?.length) {
      parts.push(` extends ${iface.extends.join(', ')}`);
    }

    parts.push(' {\n');

    if (iface.properties?.length) {
      iface.properties.forEach(prop => {
        parts.push(this.renderProperty(prop, indentSize + 2));
      });
    }

    parts.push(`${indent}}\n`);

    return parts.join('');
  }

  /**
   * 渲染导入声明
   */
  static renderImports(imports: ImportDeclarationStructure[]): string {
    if (!imports.length) return '';

    const lines = imports
      .filter(imp => imp.namedImports?.length)
      .map(imp => `import { ${imp.namedImports!.join(', ')} } from '${imp.moduleSpecifier}';`);

    return lines.length ? lines.join('\n') + '\n\n' : '';
  }

  /**
   * 渲染导出声明
   */
  static renderExports(exports: ExportDeclarationStructure[]): string {
    if (!exports.length) return '';

    const lines = exports.map(exp => {
      const typeKeyword = exp.isTypeOnly ? 'type ' : '';
      const namedPart = exp.namedExports?.length ? `{ ${exp.namedExports.join(', ')} }` : '*';
      const fromPart = exp.moduleSpecifier ? ` from '${exp.moduleSpecifier}'` : '';
      return `export ${typeKeyword}${namedPart}${fromPart};`;
    });

    return lines.join('\n') + '\n\n';
  }

  /**
   * 渲染类型别名
   */
  static renderTypeAliases(typeAliases: TypeAliasDeclarationStructure[]): string {
    if (!typeAliases.length) return '';

    return typeAliases
      .map(alias => {
        const parts: string[] = [];

        if (alias.docs?.length) {
          parts.push(this.renderJsDoc(alias.docs, 0));
        }

        if (alias.isExported) parts.push('export ');
        if (alias.hasDeclareKeyword) parts.push('declare ');

        parts.push(`type ${alias.name} = ${alias.type};\n\n`);

        return parts.join('');
      })
      .join('');
  }

  /**
   * 渲染模块声明
   */
  static renderModules(modules: ModuleDeclarationStructure[]): string {
    if (!modules.length) return '';

    return modules
      .map(module => {
        const parts: string[] = [];

        if (module.docs?.length) {
          parts.push(this.renderJsDoc(module.docs, 0));
        }

        if (module.hasDeclareKeyword) parts.push('declare ');

        parts.push(`module ${module.name} {\n`);

        if (module.interfaces?.length) {
          module.interfaces.forEach(iface => {
            parts.push(this.renderInterfaceBlock(iface, 2, false));
          });
        }

        parts.push('}\n\n');

        return parts.join('');
      })
      .join('');
  }

  /**
   * 渲染类声明
   */
  static renderClass(cls: LightweightClassDeclaration): string {
    const className = cls.getName();
    if (!className) return '';

    const structure = cls.getStructure();
    if (structure.decorators?.length) this.unsupported(`class decorators (${className})`);
    if (structure.isExported === false) this.unsupported(`non-exported class (${className})`);
    if (structure.hasDeclareKeyword === false) this.unsupported(`non-declare class (${className})`);

    const parts: string[] = [];

    // JSDoc 注释
    const docs = cls.jsDoc?.length ? cls.jsDoc : [className];
    parts.push(this.renderJsDoc(docs));

    // 类声明
    parts.push(`export declare class ${className}`);

    // 继承
    const baseClass = cls.getBaseClass();
    if (baseClass) {
      const baseClassName = baseClass.getName();
      if (baseClassName) {
        parts.push(` extends ${baseClassName}`);
      }
    }

    // 实现
    const implementsList = cls.getImplements();
    if (implementsList.length) {
      const implNames = implementsList.map(impl => impl.getText()).join(', ');
      parts.push(` implements ${implNames}`);
    }

    parts.push(' {\n');

    // 属性
    if (cls.properties?.length) {
      cls.properties.forEach(prop => {
        parts.push(this.renderProperty(prop, 2, false));
      });
    }

    // 构造函数
    if (cls.constructorData) {
      const { parameters, docs } = cls.constructorData;
      if (docs?.length) {
        parts.push(this.renderJsDoc(docs, 2));
      }
      parts.push(`  constructor(${this.renderParameterList(parameters)});\n`);
    }

    // 方法
    if (cls.methods?.length) {
      cls.methods.forEach(method => {
        if (method.isAsync) this.unsupported(`async method (${className}.${method.name})`);
        if (method.statements?.length) this.unsupported(`method statements (${className}.${method.name})`);
        if (method.docs?.length) {
          parts.push(this.renderJsDoc(method.docs, 2));
        }

        const methodParts: string[] = ['  '];

        if (method.scope) methodParts.push(`${method.scope} `);
        if (method.isStatic) methodParts.push('static ');

        const typeParameters = method.typeParameters?.length ? `<${method.typeParameters.join(', ')}>` : '';
        const questionToken = method.hasQuestionToken ? '?' : '';
        methodParts.push(
          `${method.name}${questionToken}${typeParameters}(${this.renderParameterList(method.parameters)})`
        );

        if (method.returnType) methodParts.push(`: ${method.returnType}`);

        methodParts.push(';\n');

        parts.push(methodParts.join(''));
      });
    }

    parts.push('}\n\n');

    return parts.join('');
  }

  /**
   * 渲染枚举声明
   */
  static renderEnums(enums: EnumDeclarationStructure[]): string {
    if (!enums.length) return '';

    return enums
      .map(enumDecl => {
        const parts: string[] = [];

        if (enumDecl.docs?.length) {
          parts.push(this.renderJsDoc(enumDecl.docs, 0));
        }

        if (enumDecl.isExported) parts.push('export ');
        if (enumDecl.isConst) parts.push('const ');

        parts.push(`enum ${enumDecl.name} {\n`);

        if (enumDecl.members?.length) {
          enumDecl.members.forEach((member, idx) => {
            const isLast = idx === enumDecl.members!.length - 1;
            if (member.value !== undefined) {
              const val = typeof member.value === 'string' ? `"${member.value}"` : String(member.value);
              parts.push(`  ${member.name} = ${val}${isLast ? '' : ','}\n`);
            } else {
              parts.push(`  ${member.name}${isLast ? '' : ','}\n`);
            }
          });
        }

        parts.push('}\n\n');

        return parts.join('');
      })
      .join('');
  }

  /**
   * 渲染变量声明
   */
  static renderVariables(variables: VariableStatementStructure[]): string {
    if (!variables.length) return '';

    return variables
      .map(variable => {
        const parts: string[] = [];

        if (variable.isExported) parts.push('export ');
        if (variable.hasDeclareKeyword) parts.push('declare ');

        parts.push(`${variable.declarationKind} `);
        parts.push(this.renderVariableDeclarationList(variable.declarations));
        parts.push(';\n\n');

        return parts.join('');
      })
      .join('');
  }
}

// ==================== 辅助类 ====================

/**
 * 接口辅助类
 */
export class InterfaceHelper implements InterfaceDeclarationStructure {
  name!: string;
  extends?: string[];
  docs?: string[];
  isExported?: boolean;
  properties: PropertyDeclarationStructure[] = [];

  constructor(data: InterfaceDeclarationStructure) {
    Object.assign(this, data);
    if (!this.properties) this.properties = [];
  }

  addProperty(prop: PropertyDeclarationStructure): void {
    const existing = this.properties.find(property => property.name === prop.name);
    if (existing) {
      const signatureOf = (property: PropertyDeclarationStructure): string =>
        JSON.stringify([
          property.name,
          property.type,
          property.initializer,
          property.isReadonly,
          property.isStatic,
          property.hasQuestionToken,
          property.hasExclamationToken,
          property.scope
        ]);
      if (signatureOf(existing) === signatureOf(prop)) return;
      throw new Error(
        `Interface "${this.name}" property "${prop.name}" has incompatible duplicate signatures: ` +
          `existing type "${existing.type ?? 'unknown'}" conflicts with incoming type "${prop.type ?? 'unknown'}"`
      );
    }
    this.properties.push(prop);
  }
}

/**
 * 轻量级类声明实现
 */
class LightweightClassDeclaration implements ClassDeclaration {
  private structure: ClassDeclarationStructure;
  private decorators: Decorator[];

  public properties: PropertyDeclarationStructure[] = [];
  public methods: MethodDeclarationStructure[] = [];
  public constructorData?: ConstructorData;
  public jsDoc: string[] = [];

  constructor(structure: ClassDeclarationStructure) {
    this.structure = structure;
    this.decorators = (structure.decorators ?? []).map(decorator => ({
      getName: () => decorator.name,
      getExpression: () => ({
        getName: () => decorator.name,
        getText: () => `${decorator.name}(${(decorator.arguments ?? []).join(', ')})`,
        getDecorators: () => [],
        getImplements: () => [],
        getBaseClass: () => undefined,
        getArguments: () =>
          (decorator.arguments ?? []).map(argument => ({
            getName: () => undefined,
            getText: () => argument,
            getDecorators: () => [],
            getImplements: () => [],
            getBaseClass: () => undefined
          }))
      })
    }));
  }

  getStructure(): Readonly<ClassDeclarationStructure> {
    return this.structure;
  }

  addJsDoc(doc: string): void {
    this.jsDoc.push(doc);
  }

  addProperties(properties: PropertyDeclarationStructure[]): void {
    this.properties.push(...properties);
  }

  addConstructor(constructor: ConstructorData): void {
    this.constructorData = constructor;
  }

  addMethods(methods: MethodDeclarationStructure[]): void {
    this.methods.push(...methods);
  }

  getDecorators(): Decorator[] {
    return this.decorators;
  }

  getName(): string | undefined {
    return this.structure.name;
  }

  getBaseClass(): Node | undefined {
    if (!this.structure.extends) return undefined;

    return {
      getName: () => this.structure.extends,
      getText: () => this.structure.extends!,
      getDecorators: () => [],
      getImplements: () => [],
      getBaseClass: () => undefined
    };
  }

  getImplements(): Node[] {
    return (this.structure.implements || []).map(impl => ({
      getName: () => impl,
      getText: () => impl,
      getDecorators: () => [],
      getImplements: () => [],
      getBaseClass: () => undefined
    }));
  }

  getText(): string {
    return this.structure.name || '';
  }
}

// ==================== 源文件实现 ====================

/**
 * 轻量级源文件实现
 */
class LiteDBSourceFile implements SourceFile {
  private filePath: string;
  private classes: LightweightClassDeclaration[] = [];
  private interfaces: InterfaceHelper[] = [];
  private modules: ModuleDeclarationStructure[] = [];
  private typeAliases: TypeAliasDeclarationStructure[] = [];
  private enums: EnumDeclarationStructure[] = [];
  private imports: ImportDeclarationStructure[] = [];
  private exports: ExportDeclarationStructure[] = [];
  private variables: VariableStatementStructure[] = [];
  private fileContent = '';

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  addClass(structure: ClassDeclarationStructure): ClassDeclaration {
    const cls = new LightweightClassDeclaration(structure);

    // 应用结构中的属性和方法
    if (structure.properties) {
      cls.addProperties(structure.properties);
    }
    if (structure.methods) {
      cls.addMethods(structure.methods);
    }
    if (structure.docs) {
      structure.docs.forEach(doc => cls.addJsDoc(doc));
    }

    this.classes.push(cls);
    return cls;
  }

  addInterface(structure: InterfaceDeclarationStructure): AddedInterface {
    let helper = this.interfaces.find(i => i.name === structure.name);

    if (!helper) {
      helper = new InterfaceHelper(structure);
      this.interfaces.push(helper);
    }

    return helper;
  }

  addModule(structure: ModuleDeclarationStructure): AddedModule {
    this.modules.push(structure);

    return {
      addInterface: (iface: InterfaceDeclarationStructure) => {
        const currentModule = this.modules[this.modules.length - 1]!;

        if (!currentModule.interfaces) {
          currentModule.interfaces = [];
        }

        currentModule.interfaces.push(iface);

        return {
          addProperty: (prop: PropertyDeclarationStructure) => {
            const module = this.modules[this.modules.length - 1]!;
            const currentIface = module.interfaces![module.interfaces!.length - 1];

            if (!currentIface.properties) {
              currentIface.properties = [];
            }

            currentIface.properties.push(prop);
          }
        };
      }
    };
  }

  addTypeAlias(structure: TypeAliasDeclarationStructure): TypeAliasDeclarationStructure {
    this.typeAliases.push(structure);
    return structure;
  }

  addImportDeclaration(structure: ImportDeclarationStructure): void {
    this.imports.push(structure);
  }

  addExportDeclaration(structure: ExportDeclarationStructure): void {
    this.exports.push(structure);
  }

  addEnum(structure: EnumDeclarationStructure): EnumDeclarationStructure {
    this.enums.push(structure);
    return structure;
  }

  addVariableStatement(structure: VariableStatementStructure): void {
    this.variables.push(structure);
  }

  getClasses(): ClassDeclaration[] {
    return this.classes;
  }

  getFilePath(): string {
    return this.filePath;
  }

  getText(): string {
    // 如果有预设内容，直接返回
    if (this.fileContent) return this.fileContent;

    // 生成 TypeScript 代码
    const parts: string[] = [
      CodeGenerator.renderImports(this.imports),
      CodeGenerator.renderExports(this.exports),
      CodeGenerator.renderTypeAliases(this.typeAliases),
      CodeGenerator.renderEnums(this.enums),
      CodeGenerator.renderModules(this.modules),
      this.interfaces.map(iface => CodeGenerator.renderInterfaceBlock(iface, 0, true) + '\n').join(''),
      this.classes.map(cls => CodeGenerator.renderClass(cls)).join(''),
      CodeGenerator.renderVariables(this.variables)
    ];

    return parts.join('');
  }

  setContent(content: string): void {
    this.fileContent = content;
  }

  async save(): Promise<void> {
    throw new Error('In-memory SourceFile does not provide filesystem save; use getText() or the CLI writer');
  }

  saveSync(): void {
    throw new Error('In-memory SourceFile does not provide filesystem save; use getText() or the CLI writer');
  }
}

// ==================== Project 类 ====================

/**
 * 轻量级 Project 类
 * 用于管理源文件集合
 */
export class Project {
  private files = new Map<string, SourceFile>();

  createSourceFile(filePath: string, content?: string): SourceFile {
    const sourceFile = new LiteDBSourceFile(filePath);

    if (content) {
      sourceFile.setContent(content);
    }

    this.files.set(filePath, sourceFile);
    return sourceFile;
  }

  addSourceFileAtPath(filePath: string): SourceFile {
    const sourceFile = new LiteDBSourceFile(filePath);
    this.files.set(filePath, sourceFile);
    return sourceFile;
  }

  getSourceFiles(): SourceFile[] {
    return Array.from(this.files.values());
  }
}

// ==================== Node 工具类 ====================

/**
 * Node 类型检查工具
 */
export const Node = {
  isDecoratable(node: unknown): node is Node {
    return (
      typeof node === 'object' && node !== null && 'getDecorators' in node && typeof node.getDecorators === 'function'
    );
  },

  isCallExpression(node: unknown): node is Node {
    return typeof node === 'object' && node !== null && 'getText' in node && typeof node.getText === 'function';
  }
};
