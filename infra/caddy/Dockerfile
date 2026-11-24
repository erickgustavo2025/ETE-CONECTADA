# syntax=docker/dockerfile:1
# Go 1.26.10 corrige GO-2026-6809; x/net 0.62.0 inclui GO-2026-6860.
FROM golang:1.26.10-alpine3.24@sha256:27f2d3b83cfc5803c8078f8e730af0f7c431bf067afaec8f60a36fb763187cba AS builder
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOCACHE=/go/cache
RUN mkdir -p /build /out /go/cache && chown -R 1000:1000 /build /out /go
USER 1000:1000
WORKDIR /build
COPY --chown=1000:1000 go.mod go.sum main.go ./
COPY --chown=1000:1000 third_party ./third_party
# Grafo/checksums versionados; o build não atualiza dependências.
RUN go mod download && go mod verify \
    && go test -mod=readonly github.com/go-jose/go-jose/v3/... \
    && go build -mod=readonly -trimpath -buildvcs=false -o /out/caddy . \
    && go version -m /out/caddy > /out/build-info.txt

FROM scratch
COPY --from=builder /out/caddy /usr/bin/caddy
COPY --from=builder /out/build-info.txt /usr/share/caddy/build-info.txt
COPY --from=builder /build/go.mod /build/go.sum /usr/share/caddy/
COPY --from=builder /build/third_party/go-jose-v3/LICENSE /usr/share/licenses/go-jose-v3/LICENSE
COPY --from=builder /build/third_party/go-jose-v3/BACKPORT.md /usr/share/caddy/go-jose-v3-backport.md
COPY --from=builder /go/pkg/mod/github.com/caddyserver/caddy/v2@v2.11.7/LICENSE /usr/share/licenses/caddy/LICENSE
COPY --from=builder /usr/local/go/LICENSE /usr/share/licenses/go/LICENSE
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
USER 1000:1000
WORKDIR /srv
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
