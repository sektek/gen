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
/path/to/gen/scripts/gen-docker.sh js:app --yes --language typescript --dest ./my-project
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
seen, so for example `js:lib` run from a subdirectory won't nest under the workspace's `libs/`, and
`--dest` must point inside the current directory.

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

Config-file defaults (`gen.config.{js,yaml,json}`, discovered by walking the directory tree from
`cwd` up to the filesystem root, plus the home directory) pre-fill both modes — see
`src/config.ts`/`src/schema.ts` for the resolution order (`CLI flag > config-hierarchy value > schema
hardcoded default`).
