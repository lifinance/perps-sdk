# syntax=docker/dockerfile:1.7

FROM golang:1.23.2-bullseye@sha256:ecb3fe70e1fd6cef4c5c74246a7525c3b7d59c48ea0589bbb0e57b1b37321fb9 AS build

ARG LIGHTER_GO_REPO=https://github.com/elliottech/lighter-go
ARG LIGHTER_GO_COMMIT=9d38261d1a4cc5c7211b383ba07a4d6e41604708

WORKDIR /src
RUN git init --quiet \
 && git remote add origin "$LIGHTER_GO_REPO" \
 && git fetch --quiet --depth 1 origin "$LIGHTER_GO_COMMIT" \
 && git checkout --quiet FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$LIGHTER_GO_COMMIT"

ENV GOTOOLCHAIN=local
RUN go mod download && go mod verify
RUN GOOS=js GOARCH=wasm go build -trimpath -buildvcs=false -o /out/lighter-signer.wasm ./web-wasm/

# wasm_exec.js is coupled to the toolchain that built the binary.
RUN cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" /out/wasm_exec.js

FROM scratch AS artifact
COPY --from=build /out/ /
