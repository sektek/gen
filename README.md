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

## Running with Docker

The repo's `Dockerfile` builds an image with `git`, `@sektek/gen`, `@sektek/generator-base` and
`@sektek/generator-js` installed from npm, so `gen` runs without a local Node install. Build it once
from a checkout of this repo (pin `@sektek/gen` with `--build-arg GEN_VERSION=<version>`; default
`latest`):

```sh
docker build -t sektek/gen .
```

`scripts/gen-docker.sh` runs the local `sektek/gen` image against the current directory and passes
every argument through to `gen`. It never builds or pulls the image; if `sektek/gen` isn't present
locally it exits with an error. Generated files are owned by you, not root. From the directory you
want to generate into:

```sh
/path/to/gen/scripts/gen-docker.sh list
/path/to/gen/scripts/gen-docker.sh js:app --no-interactive --language typescript --dest ./my-project
```

- The wizard runs when your terminal is a TTY; with piped or redirected stdin/stdout `gen` runs in
  automated mode.
- `GITHUB_TOKEN` and `GH_TOKEN`, when set on the host, are forwarded to the container by name (the
  value never appears on the command line). Use them for `--create-repo`; `gh auth token` isn't
  available inside the container.
- `~/.gitconfig` (read-only) and any `~/gen.config.{js,yaml,json}` are mounted into the container's
  home directory.

### Limits

Only the current directory, plus `~/.gitconfig` and `~/gen.config.*`, is visible to the container.
A `gen.config.*` in a parent directory and an npm workspace root above the current directory are not
seen, so for example `js:lib` run from a subdirectory won't nest under the workspace's `libs/`.

`--dest` is resolved inside the container, where the current directory is mounted at `/work`. Give
it a path relative to the current directory (`--dest ./my-project`). An absolute host path such as
`--dest "$PWD/my-project"` doesn't exist in the container, so gen writes there, reports success, and
the files are lost when the container exits.

## Usage

```sh
gen <generator> [options]   # e.g. gen js:app, gen base:workspace, gen @acme/widget:app
gen list                    # see every available namespace from the installed default packages
gen list <scope>/<name>     # e.g. gen list @acme/widget — list one specific package's namespaces
```

`<generator>` is `[@scope/]name[:subgen]`, generalized to any installed `@<scope>/generator-<name>`
package, not just the two defaults: an unprefixed bare name (e.g. `gen gitconfig`) defaults to
`@sektek/base:<name>`; `name:subgen` (e.g. `gen js:gitconfig`) defaults to scope `sektek`; a
fully-qualified `@scope/name:subgen` (e.g. `gen @acme/widget:app`) reaches any other installed
package the same way. Runs interactively when stdout/stdin are both a TTY, or pass `--no-interactive` to force
automated mode.

## How options work

A generator's options come from that generator's `static prompts()`, not from a schema in `gen`. Each
prompt declares a name, a kind (`text`, `boolean`, `select` or `list`), an optional default
(`provider`), an optional `includePrompt` gate and, for `select`, its `choices`. Composed generators
bring their own prompts, and a prompt shared by several of them (such as `author`) is merged into one.
`gen` derives everything else from that list:

- **Flags** are named after the prompt (kebab-case) and its kind. A text or select prompt gets
  `--<name> <value>` (e.g. `--language <value>`). A boolean that defaults to true gets the negated form
  `--no-<name>` (e.g. `--no-git-init`, `--no-private`); one that defaults to false gets `--<name>`
  (e.g. `--create-repo`). A list prompt gets a comma-delimited `--<name> <list>` plus a singular,
  repeatable `--<singular> <pkg>`; both can be combined:

  ```sh
  gen js:app --no-interactive --dependencies lodash,zod --dependency chalk@5
  ```

- **The wizard** asks the prompts in the order `prompts()` returns them, skipping any whose
  `includePrompt` is false for the answers so far and any already given as a flag. List prompts are
  never asked in the wizard; use their flags.
- **Non-interactive runs** (`--no-interactive`) use no wizard. A prompt whose `includePrompt` is false is
  not asked, but it still resolves to its default.

Run `gen <generator> --help` to see the flags for a namespace.

Config-file defaults (`gen.config.{js,yaml,json}`, discovered by walking the directory tree from
`cwd` up to the filesystem root, plus the home directory) pre-fill both modes. Each option resolves, in
order, from the CLI flag, then the config-file value, then the prompt's default. Defaults are computed
in `prompts()` order, so a prompt's default can depend on the values of the prompts before it (which
include flag and config values). In the wizard, a config value pre-fills its step but does not skip it;
only a flag does. An option the prompt marks `required` that resolves to nothing is an error, as is a
`select` value outside its `choices`.

### Third-party generator packages

Any installed `@<scope>/generator-<name>` package gets flags and a wizard from its `prompts()` the same
way, with no changes to `gen`. To make a generator drivable, declare each option it reads as a prompt in
its `static prompts()`, reusing a shared prompt from `@sektek/generator` (such as `authorPrompt`) where
one exists rather than redefining it. If it composes generators from another package, list that package
in its `dependencies` so `gen` can resolve the composed namespaces.
