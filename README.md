# @sektek/gen

CLI for running `@sektek` generators directly, replacing `yo`. Drives
[`@sektek/generator-base`](https://github.com/sektek/generator-base) and
[`@sektek/generator-js`](https://github.com/sektek/generator-js) via `yeoman-environment`, in either
automated (CLI flags) or interactive (an `ink` wizard) mode.

## Installation

`@sektek/generator-base` and `@sektek/generator-js` are peer dependencies, resolved at runtime rather
than bundled — install whichever ones you actually want `gen` to drive alongside it:

```sh
npm install -g @sektek/gen @sektek/generator-base @sektek/generator-js
```

`gen` also works with any other `@<scope>/generator-<name>` package installed the same way (e.g.
`npm install -g @acme/generator-widget`) — see `gen list <scope>/<name>` below.

## Usage

```sh
gen <generator> [options]   # e.g. gen js:app, gen base:workspace
gen list                    # see every available namespace from the installed default packages
gen list <scope>/<name>     # e.g. gen list @acme/widget — list one specific package's namespaces
```

Unprefixed names default to `@sektek/base` (e.g. `gen gitconfig` → `@sektek/base:gitconfig`); use a
`js:` prefix to reach `@sektek/generator-js` instead (e.g. `gen js:gitconfig`). Runs interactively
when stdout/stdin are both a TTY, or pass `--yes` to force automated mode.

Config-file defaults (`gen.config.{js,yaml,json}`, discovered by walking the directory tree from
`cwd` up to the filesystem root, plus the home directory) pre-fill both modes — see
`src/config.ts`/`src/schema.ts` for the resolution order (`CLI flag > config-hierarchy value > schema
hardcoded default`).
