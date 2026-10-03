export type GitConfigReader = (key: string) => Promise<string | undefined>;
