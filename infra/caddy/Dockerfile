# syntax=docker/dockerfile:1
# Go1.26.9 + x/net0.60.0 corrigem GO-2026-6607/6609/6611.
FROM golang:1.26.9-alpine3.24@sha256:3082400e369fa24d5fc60bca20edab3f6d604e0c5a690ec66b295eff4dd87ade AS builder
ENV CGO_ENABLED=0 GOTOOLCHAIN=local GOCACHE=/go/cache
RUN mkdir -p /build /out /go/cache && chown -R 1000:1000 /build /out /go
USER 1000:1000
WORKDIR /build
COPY --chown=1000:1000 go.mod go.sum main.go ./
# Grafo/checksums versionados; o build não atualiza dependências.
RUN go mod download && go mod verify \
    && go build -mod=readonly -trimpath -buildvcs=false -o /out/caddy . \
    && go version -m /out/caddy > /out/build-info.txt

FROM scratch
COPY --from=builder /out/caddy /usr/bin/caddy
COPY --from=builder /out/build-info.txt /usr/share/caddy/build-info.txt
COPY --from=builder /build/go.mod /build/go.sum /usr/share/caddy/
COPY --from=builder /go/pkg/mod/github.com/caddyserver/caddy/v2@v2.11.7/LICENSE /usr/share/licenses/caddy/LICENSE
COPY --from=builder /usr/local/go/LICENSE /usr/share/licenses/go/LICENSE
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
USER 1000:1000
WORKDIR /srv
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
