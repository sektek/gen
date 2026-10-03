import type { DestinationMode } from '@sektek/generator';

export type DestinationRootArgs = {
  destGiven: boolean;
  dest: string;
  mode: DestinationMode;
  projectName?: string;
  generateName?: () => string | PromiseLike<string>;
  options: Record<string, unknown>;
};
