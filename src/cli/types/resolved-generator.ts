import type { RegistryEntry } from '../../types/registry-entry.js';

export type ResolvedGenerator = {
  namespace: string;
  entries: RegistryEntry[];
};
