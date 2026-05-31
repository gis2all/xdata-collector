FROM node:20-bookworm-slim AS web-builder

WORKDIR /build/web-ui

COPY web-ui/package*.json ./
RUN npm ci

COPY web-ui ./
RUN npm run build

FROM python:3.13-slim AS runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    DEBIAN_FRONTEND=noninteractive \
    PIPX_HOME=/opt/pipx \
    PIPX_BIN_DIR=/usr/local/bin \
    NO_COLOR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git nodejs npm build-essential gyp \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip pipx -r requirements.txt \
    && python -m pipx install git+https://github.com/public-clis/twitter-cli.git@7c634e0d396b1e7af9f63315b414925fe4f29ae7

RUN npm_config_python=/usr/bin/python3 npm install -g xreach-cli@0.3.0

COPY . .
COPY --from=web-builder /build/web-ui/node_modules ./web-ui/node_modules
COPY --from=web-builder /build/web-ui/dist ./web-ui/dist

EXPOSE 8765 5177

CMD ["python", "run/api.py", "--host", "0.0.0.0", "--port", "8765"]
