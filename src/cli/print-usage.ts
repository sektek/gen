/* eslint-disable no-console */

/**
 * Prints top-level usage: how to list generators and how to run one.
 */
export function printUsage(): void {
  console.log(
    [
      'Usage: gen <generator> [options]',
      '       gen list [<scope>/<name>]',
      '',
      "A bare '<name>' with no prefix defaults to '@sektek/base:<name>';",
      "use 'js:<name>' to reach a @sektek/js generator instead. Any other",
      "installed package works the same way: '<name>:<subgen>' defaults to",
      "scope 'sektek', or use a fully-qualified '@scope/name:subgen'.",
      '',
      'Examples:',
      '  $ gen list',
      '  $ gen list @acme/widget',
      '  $ gen js:app --yes --language typescript --dest ./my-project',
      '  $ gen readme',
      '  $ gen base:readme',
      '  $ gen @acme/widget:app',
    ].join('\n'),
  );
}
