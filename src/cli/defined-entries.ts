/**
 * Drops keys whose value is `undefined`. A JS config file can define a key
 * as undefined (e.g. derived from an unset env var), and for the same reason
 * `resolve()` does this (options.ts): an own `undefined` key would otherwise
 * win a spread over a real value from an earlier layer, unlike a key that's
 * simply absent.
 *
 * @param config - A config layer, possibly containing own `undefined` keys.
 * @returns The same entries, minus any whose value is `undefined`.
 */
export function definedEntries(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
}
