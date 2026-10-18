/**
 * Folds a just-answered value into the wizard's running answers.
 *
 * @param prev - The answers accumulated so far.
 * @param key - The option key just answered.
 * @param value - The value just answered for `key`.
 * @returns The next answers state.
 */
export function mergeAnswer(
  prev: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { ...prev, [key]: value };
}
