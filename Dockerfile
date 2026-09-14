# Zero-dependency Node.js app: no npm install step, tiny image.
FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
# The slideshow served at /presentation (its build tooling is dockerignored).
COPY presentation/presentation-surplus.html ./presentation/
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "src/server.js"]
