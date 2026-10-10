import * as ts from 'typescript';

/*** Find the static top-level declaration that owns a local identifier. */
export function findStaticDeclaration(
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
export function findImportBinding(
  source: ts.SourceFile,
  name: string,
): ts.ImportDeclaration | undefined {
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
export function isConstDeclaration(list: ts.VariableDeclarationList): boolean {
  return (list.flags & ts.NodeFlags.Const) !== 0;
}

/*** Unwrap TypeScript syntax which does not alter a runtime value. */
export function unwrapExpression(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
    ? unwrapExpression(expression.expression)
    : expression;
}

/*** Detect an exported variable statement. */
export function hasExportModifier(statement: ts.VariableStatement): boolean {
  return (
    statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
  );
}
