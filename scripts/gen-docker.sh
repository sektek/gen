#!/bin/sh
# Run gen in Docker against the current directory, using the local sektek/gen image.
# Usage: gen-docker.sh <gen args...>
set -eu

image=sektek/gen
container_home=/home/gen

if ! command -v docker >/dev/null 2>&1; then
  echo "gen-docker: docker was not found on PATH" >&2
  exit 127
fi

if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "gen-docker: image $image was not found locally" >&2
  exit 1
fi

# Options are prepended to the positional parameters so "$@" stays verbatim.
set -- "$image" "$@"

for name in GH_TOKEN GITHUB_TOKEN; do
  if [ -n "$(printenv "$name" || true)" ]; then
    set -- -e "$name" "$@"
  fi
done

for ext in js yaml json; do
  if [ -f "$HOME/gen.config.$ext" ]; then
    set -- -v "$HOME/gen.config.$ext:$container_home/gen.config.$ext:ro" "$@"
  fi
done

if [ -f "$HOME/.gitconfig" ]; then
  set -- -v "$HOME/.gitconfig:$container_home/.gitconfig:ro" "$@"
fi

set -- --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work "$@"

if [ -t 0 ] && [ -t 1 ]; then
  set -- -t "$@"
fi

exec docker run --rm -i "$@"
