# Base oficial fixada; atualizar tag e digest juntos após conferir os scanners.
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /app/apps/site /app/apps/portal && chown -R node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/site/package.json ./apps/site/package.json
COPY --chown=node:node apps/portal/package.json ./apps/portal/package.json
RUN npm ci --ignore-scripts --include=optional --no-fund --no-audit

FROM dependencies AS source
COPY --chown=node:node . .

FROM source AS site-build
ARG NEXT_PUBLIC_PORTAL_LOGIN_URL
ENV NEXT_PUBLIC_PORTAL_LOGIN_URL=${NEXT_PUBLIC_PORTAL_LOGIN_URL}
RUN npm run build --workspace @ete-conectada/site
RUN node scripts/check-standalone.mjs site

FROM source AS portal-build
RUN npm run build --workspace @ete-conectada/portal
RUN node scripts/check-standalone.mjs portal

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
WORKDIR /app
# Standalone não instala pacotes ao iniciar. Não distribuir os CLIs do build.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack
COPY --from=source /app/shared/fonts/*OFL.txt /app/licenses/fonts/
COPY --from=source /app/scripts/start-standalone.mjs /app/start-standalone.mjs
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+process.env.HEALTHCHECK_PATH,{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

FROM runtime AS site
WORKDIR /app/apps/site
ENV HEALTHCHECK_PATH=/
COPY --from=site-build /app/apps/site/.next/standalone /app
COPY --from=site-build /app/apps/site/public ./public
COPY --from=site-build /app/apps/site/.next/static ./.next/static
CMD ["node", "/app/start-standalone.mjs"]

FROM runtime AS portal
WORKDIR /app/apps/portal
ENV HEALTHCHECK_PATH=/login
COPY --from=portal-build /app/apps/portal/.next/standalone /app
COPY --from=portal-build /app/apps/portal/public ./public
COPY --from=portal-build /app/apps/portal/.next/static ./.next/static
CMD ["node", "/app/start-standalone.mjs"]
