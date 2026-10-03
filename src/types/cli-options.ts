export type CliOptions = {
  yes?: boolean;
  install?: boolean;
  force?: boolean;
  dest: string;
  [schemaKey: string]: unknown;
};
