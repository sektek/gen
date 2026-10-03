import type { RegistryEntry } from './registry-entry.js';

export type ResolvedGenerator = {
  namespace: string;
  entries: RegistryEntry[];
};
