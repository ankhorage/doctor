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
  readonly #exports = new Map<string, Promise<StaticValue>>();

  constructor(private readonly packageRoot: string) {}

  /*** Resolve a named local export without importing or running its module. */
  async resolveAsync(modulePath: string, exportName: string): Promise<StaticValue> {
    const key = `${modulePath}:${exportName}`;
    const cached = this.#exports.get(key);
    if (cached !== undefined) return cached;
    const resolution = this.resolveUncachedAsync(modulePath, exportName);
    this.#exports.set(key, resolution);
    return resolution;
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
      await this.environmentAsync(source, modulePath),
    );
  }

  /*** Build imported and declared static values for a source module. */
  async environmentAsync(
    source: ts.SourceFile,
    modulePath: string,
  ): Promise<Map<string, StaticValue>> {
    const environment = new Map<string, StaticValue>();
    for (const statement of source.statements)
      if (ts.isImportDeclaration(statement))
        await this.addImportAsync(environment, statement, modulePath);
    for (const statement of source.statements)
      if (ts.isVariableStatement(statement))
        await this.addDeclarationsAsync(environment, statement);
    return environment;
  }

  /*** Add named local import values to a static environment. */
  async addImportAsync(
    environment: Map<string, StaticValue>,
    statement: ts.ImportDeclaration,
    fromPath: string,
  ): Promise<void> {
    if (!ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause === undefined)
      return;
    if (statement.importClause.isTypeOnly) return;
    const bindings = statement.importClause.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings))
      throw new Error('Capability catalogs support only named local value imports.');
    const modulePath = await resolveImportPathAsync(
      this.packageRoot,
      fromPath,
      statement.moduleSpecifier.text,
    );
    for (const binding of bindings.elements)
      if (!binding.isTypeOnly)
        environment.set(
          binding.name.text,
          await this.resolveAsync(modulePath, binding.propertyName?.text ?? binding.name.text),
        );
  }

  /*** Add top-level static constant declarations to an environment. */
  async addDeclarationsAsync(
    environment: Map<string, StaticValue>,
    statement: ts.VariableStatement,
  ): Promise<void> {
    if (!isConstDeclaration(statement.declarationList)) return;
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined)
        environment.set(
          declaration.name.text,
          await this.evaluateAsync(declaration.initializer, environment),
        );
  }

  /*** Evaluate an allowed static expression. */
  async evaluateAsync(
    expression: ts.Expression,
    environment: Map<string, StaticValue>,
  ): Promise<StaticValue> {
    const node = unwrapExpression(expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isIdentifier(node)) return readEnvironmentValue(environment, node.text);
    if (ts.isArrayLiteralExpression(node)) return this.arrayAsync(node, environment);
    if (ts.isObjectLiteralExpression(node)) return this.objectAsync(node, environment);
    if (ts.isTemplateExpression(node)) return this.templateAsync(node, environment);
    if (ts.isCallExpression(node)) return this.mapAsync(node, environment);
    throw new Error(`Unsupported static capability expression: ${node.getText()}.`);
  }

  /*** Evaluate a static array literal. */
  arrayAsync(
    node: ts.ArrayLiteralExpression,
    environment: Map<string, StaticValue>,
  ): Promise<readonly StaticValue[]> {
    return Promise.all(
      node.elements.map((element) => {
        if (ts.isSpreadElement(element))
          throw new Error('Catalog array spreads are not supported.');
        return this.evaluateAsync(element, environment);
      }),
    );
  }

  /*** Evaluate static object properties and descriptor spreads. */
  async objectAsync(
    node: ts.ObjectLiteralExpression,
    environment: Map<string, StaticValue>,
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
        result[property.name.text] = readEnvironmentValue(environment, property.name.text);
      else throw new Error(`Unsupported static capability property: ${property.getText()}.`);
    }
    return result;
  }

  /*** Evaluate a template literal whose substitutions are scalar static values. */
  async templateAsync(
    node: ts.TemplateExpression,
    environment: Map<string, StaticValue>,
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
    environment: Map<string, StaticValue>,
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
    return Promise.all(
      values.map((value) =>
        this.evaluateAsync(
          body,
          new Map<string, StaticValue>([...environment.entries(), [parameterName, value]]),
        ),
      ),
    );
  }
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

/*** Read a declared static value. */
function readEnvironmentValue(
  environment: ReadonlyMap<string, StaticValue>,
  name: string,
): StaticValue {
  const value = environment.get(name);
  if (value === undefined) throw new Error(`Unsupported dynamic capability value: ${name}.`);
  return value;
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
