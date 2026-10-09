FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG GEN_VERSION=latest
RUN npm install -g "@sektek/gen@${GEN_VERSION}" @sektek/generator-base @sektek/generator-js \
  && npm cache clean --force

RUN mkdir -p /home/gen /work && chmod 777 /home/gen /work
ENV HOME=/home/gen

WORKDIR /work
ENTRYPOINT ["gen"]
