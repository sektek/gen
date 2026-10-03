/**
 * True for a value returned from a reloadable capability's provider (or
 * generateDefaultAsync) that still needs awaiting, vs one already resolved
 * synchronously — lets a synchronous provider (e.g. the project-name
 * step's own generateName) resolve within the same tick, with no
 * "Resolving…" flash, the same as before this capability generalized the
 * old generateDefault mechanism.
 *
 * @param value - The value to check.
 * @returns Whether `value` is thenable.
 */
export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
}
