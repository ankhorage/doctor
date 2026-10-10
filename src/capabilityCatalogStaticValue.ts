export type StaticValue =
  | string
  | number
  | boolean
  | null
  | readonly StaticValue[]
  | StaticRecord;

export interface StaticRecord {
  readonly [key: string]: StaticValue;
}

/*** Narrow a static value to a descriptor-shaped record. */
export function isStaticRecord(value: StaticValue): value is StaticRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Narrow a static value to an array. */
export function isStaticArray(value: StaticValue): value is readonly StaticValue[] {
  return Array.isArray(value);
}

/*** Read one JSON-compatible array as static catalog materialization input. */
export function readStaticArray(value: unknown): readonly StaticValue[] | null {
  return Array.isArray(value) && value.every(isStaticValue) ? value : null;
}

/*** Narrow untrusted JSON-compatible input to the static evaluator value model. */
function isStaticValue(value: unknown): value is StaticValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (Array.isArray(value)) return value.every(isStaticValue);
  if (typeof value !== 'object') return false;
  return Object.values(value).every(isStaticValue);
}
