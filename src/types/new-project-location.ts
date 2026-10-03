import type { WorkspaceRoot } from './workspace-root.js';

export type NewProjectLocation = {
  parentDir: string;
  workspace?: WorkspaceRoot;
};
