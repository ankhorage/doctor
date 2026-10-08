import { promises as fs } from 'node:fs';
import path from 'node:path';

import * as ts from 'typescript';

type StaticValue = string | number | boolean | null | readonly StaticValue[] | StaticRecord;
interface StaticRecord {
  readonly [key: string]: StaticValue;
}

/*** Evaluate one named catalog export from the supported static TypeScript subset. */
export async function capabilityCatalogAstAsync(
  packageRoot: string,
  modulePath: string,
  exportName: string,
): Promise<unknown> {
  return new StaticCatalogResolver(packageRoot).resolveAsync(modulePath, exportName);
}

/*** Resolve static local imports and expressions without loading target modules. */
class StaticCatalogResolver {
  readonly #symbols = new Map<string, StaticValue>();
  readonly #activeSymbols: string[] = [];

  constructor(private readonly packageRoot: string) {}

  /*** Resolve a named local export without importing or running its module. */
  async resolveAsync(modulePath: string, exportName: string): Promise<StaticValue> {
    const key = `${modulePath}:${exportName}`;
    return this.resolveSymbolAsync(key, () => this.resolveUncachedAsync(modulePath, exportName));
  }

  /*** Resolve one local symbol while detecting recursive static references. */
  async resolveSymbolAsync(
    key: string,
    resolveAsync: () => Promise<StaticValue>,
  ): Promise<StaticValue> {
    const cached = this.#symbols.get(key);
    if (cached !== undefined) return cached;
    const cycleStart = this.#activeSymbols.indexOf(key);
    if (cycleStart >= 0)
      throw new Error(
        `Cyclic static capability reference: ${[...this.#activeSymbols.slice(cycleStart), key].join(' -> ')}.`,
      );
    this.#activeSymbols.push(key);
    try {
      const value = await resolveAsync();
      this.#symbols.set(key, value);
      return value;
    } finally {
      this.#activeSymbols.pop();
    }
  }

  /*** Find and evaluate the declaration owning one exported static value. */
  async resolveUncachedAsync(modulePath: string, exportName: string): Promise<StaticValue> {
    const source = ts.createSourceFile(
      modulePath,
      await fs.readFile(modulePath, 'utf8'),
      ts.ScriptTarget.ESNext,
      true,
    );
    const declaration = source.statements
      .filter((statement): statement is ts.VariableStatement => ts.isVariableStatement(statement))
      .filter(hasExportModifier)
      .filter((statement) => isConstDeclaration(statement.declarationList))
      .flatMap((statement) => statement.declarationList.declarations)
      .find((value) => ts.isIdentifier(value.name) && value.name.text === exportName);
    if (declaration?.initializer === undefined)
      throw new Error(`Unable to find static export ${exportName} in ${modulePath}.`);
    return this.evaluateAsync(
      declaration.initializer,
      new StaticCatalogScope(this, source, modulePath, this.packageRoot),
    );
  }

  /*** Evaluate an allowed static expression. */
  async evaluateAsync(
    expression: ts.Expression,
    environment: StaticCatalogScope,
  ): Promise<StaticValue> {
    const node = unwrapExpression(expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isIdentifier(node)) return environment.resolveAsync(node.text);
    if (ts.isArrayLiteralExpression(node)) return this.arrayAsync(node, environment);
    if (ts.isObjectLiteralExpression(node)) return this.objectAsync(node, environment);
    if (ts.isTemplateExpression(node)) return this.templateAsync(node, environment);
    if (ts.isCallExpression(node)) return this.mapAsync(node, environment);
    throw new Error(`Unsupported static capability expression: ${node.getText()}.`);
  }

  /*** Evaluate a static array literal. */
  arrayAsync(
    node: ts.ArrayLiteralExpression,
    environment: StaticCatalogScope,
  ): Promise<readonly StaticValue[]> {
    return this.evaluateElementsAsync(node.elements, environment);
  }

  /*** Evaluate static object properties and descriptor spreads. */
  async objectAsync(
    node: ts.ObjectLiteralExpression,
    environment: StaticCatalogScope,
  ): Promise<StaticRecord> {
    const result: Record<string, StaticValue> = {};
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const value = await this.evaluateAsync(property.expression, environment);
        if (!isStaticRecord(value))
          throw new Error('Capability descriptor spreads must be static objects.');
        Object.assign(result, value);
      } else if (
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      )
        result[property.name.text] = await this.evaluateAsync(property.initializer, environment);
      else if (ts.isShorthandPropertyAssignment(property))
        result[property.name.text] = await environment.resolveAsync(property.name.text);
      else throw new Error(`Unsupported static capability property: ${property.getText()}.`);
    }
    return result;
  }

  /*** Evaluate a template literal whose substitutions are scalar static values. */
  async templateAsync(
    node: ts.TemplateExpression,
    environment: StaticCatalogScope,
  ): Promise<string> {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const interpolation = await this.evaluateAsync(span.expression, environment);
      if (typeof interpolation === 'object' && interpolation !== null)
        throw new Error('Capability templates may interpolate only static scalar values.');
      value += `${interpolation}${span.literal.text}`;
    }
    return value;
  }

  /*** Evaluate Array.map with a single static arrow-function parameter. */
  async mapAsync(
    node: ts.CallExpression,
    environment: StaticCatalogScope,
  ): Promise<readonly StaticValue[]> {
    if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'map')
      throw new Error(`Unsupported static capability call: ${node.getText()}.`);
    const values = await this.evaluateAsync(node.expression.expression, environment);
    const callback = node.arguments.at(0);
    if (!isStaticArray(values) || callback === undefined || !ts.isArrowFunction(callback))
      throw new Error(`Unsupported static capability map: ${node.getText()}.`);
    const parameter = callback.parameters.at(0);
    const { body } = callback;
    if (parameter === undefined || !ts.isIdentifier(parameter.name) || !ts.isExpression(body))
      throw new Error(`Unsupported static capability map callback: ${callback.getText()}.`);
    const parameterName = parameter.name.text;
    const result: StaticValue[] = [];
    for (const value of values)
      result.push(await this.evaluateAsync(body, environment.withValue(parameterName, value)));
    return result;
  }

  /*** Evaluate static array elements in source order. */
  async evaluateElementsAsync(
    elements: ts.NodeArray<ts.Expression | ts.SpreadElement>,
    environment: StaticCatalogScope,
  ): Promise<readonly StaticValue[]> {
    const result: StaticValue[] = [];
    for (const element of elements) {
      if (ts.isSpreadElement(element)) throw new Error('Catalog array spreads are not supported.');
      result.push(await this.evaluateAsync(element, environment));
    }
    return result;
  }
}

/*** Resolve only static symbols reached from the requested catalog expression. */
class StaticCatalogScope {
  constructor(
    private readonly resolver: StaticCatalogResolver,
    private readonly source: ts.SourceFile,
    private readonly modulePath: string,
    private readonly packageRoot: string,
    private readonly values: ReadonlyMap<string, StaticValue> = new Map(),
  ) {}

  /*** Resolve a local constant or named local import when it is referenced. */
  async resolveAsync(name: string): Promise<StaticValue> {
    const value = this.values.get(name);
    if (value !== undefined) return value;
    const declaration = findStaticDeclaration(this.source, name);
    const initializer = declaration?.initializer;
    if (initializer !== undefined)
      return this.resolver.resolveSymbolAsync(`${this.modulePath}:${name}`, () =>
        this.resolver.evaluateAsync(initializer, this),
      );
    const imported = findImportBinding(this.source, name);
    if (imported === undefined) throw new Error(`Unsupported dynamic capability value: ${name}.`);
    if (!ts.isStringLiteral(imported.moduleSpecifier))
      throw new Error('Capability catalogs support only named local value imports.');
    const bindings = imported.importClause?.namedBindings;
    if (imported.importClause?.isTypeOnly || bindings === undefined)
      throw new Error(`Unsupported dynamic capability value: ${name}.`);
    if (!ts.isNamedImports(bindings))
      throw new Error('Capability catalogs support only named local value imports.');
    const binding = bindings.elements.find(
      (element) => !element.isTypeOnly && element.name.text === name,
    );
    if (binding === undefined) throw new Error(`Unsupported dynamic capability value: ${name}.`);
    const importPath = await resolveImportPathAsync(
      this.packageRoot,
      this.modulePath,
      imported.moduleSpecifier.text,
    );
    return this.resolver.resolveAsync(importPath, binding.propertyName?.text ?? binding.name.text);
  }

  /*** Add a static callback parameter without evaluating unrelated module symbols. */
  withValue(name: string, value: StaticValue): StaticCatalogScope {
    return new StaticCatalogScope(
      this.resolver,
      this.source,
      this.modulePath,
      this.packageRoot,
      new Map([...this.values, [name, value]]),
    );
  }
}

/*** Find the static top-level declaration that owns a local identifier. */
function findStaticDeclaration(
  source: ts.SourceFile,
  name: string,
): ts.VariableDeclaration | undefined {
  return source.statements
    .filter((statement): statement is ts.VariableStatement => ts.isVariableStatement(statement))
    .filter((statement) => isConstDeclaration(statement.declarationList))
    .flatMap((statement) => statement.declarationList.declarations)
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
}

/*** Find the import declaration that introduces a referenced local identifier. */
function findImportBinding(source: ts.SourceFile, name: string): ts.ImportDeclaration | undefined {
  return source.statements
    .filter((statement): statement is ts.ImportDeclaration => ts.isImportDeclaration(statement))
    .find((statement) => {
      const clause = statement.importClause;
      return (
        clause?.name?.text === name ||
        (clause?.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.some((element) => element.name.text === name))
      );
    });
}

/*** Determine whether a declaration list is immutable static catalog input. */
function isConstDeclaration(list: ts.VariableDeclarationList): boolean {
  return (list.flags & ts.NodeFlags.Const) !== 0;
}

/*** Resolve a local import to one source file inside the inspected package. */
async function resolveImportPathAsync(
  packageRoot: string,
  fromPath: string,
  specifier: string,
): Promise<string> {
  if (!specifier.startsWith('.'))
    throw new Error('Capability catalogs may import only local static metadata.');
  const candidate = path.resolve(path.dirname(fromPath), specifier);
  if (!isInsidePackage(packageRoot, candidate) && candidate !== packageRoot)
    throw new Error('Capability catalogs may not import outside their package.');
  for (const extension of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts'])
    if (await isFileAsync(`${candidate}${extension}`)) return `${candidate}${extension}`;
  throw new Error(`Unable to resolve static capability import ${specifier}.`);
}

/*** Unwrap TypeScript syntax which does not alter a runtime value. */
function unwrapExpression(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
    ? unwrapExpression(expression.expression)
    : expression;
}

/*** Narrow a static value to a descriptor-shaped record. */
function isStaticRecord(value: StaticValue): value is StaticRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Narrow a static value to an array. */
function isStaticArray(value: StaticValue): value is readonly StaticValue[] {
  return Array.isArray(value);
}

/*** Detect an exported variable statement. */
function hasExportModifier(statement: ts.VariableStatement): boolean {
  return (
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}

/*** Check whether a resolved path remains within the inspected package root. */
function isInsidePackage(packageRoot: string, candidate: string): boolean {
  const relativePath = path.relative(packageRoot, candidate);
  return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && relativePath !== '..';
}

/*** Check whether one candidate is a regular file. */
async function isFileAsync(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isFile();
  } catch {
    return false;
  }
}
