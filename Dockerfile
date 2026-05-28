FROM python:3.13-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    DEBIAN_FRONTEND=noninteractive \
    PIPX_HOME=/opt/pipx \
    PIPX_BIN_DIR=/usr/local/bin \
    NO_COLOR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates nodejs npm build-essential gyp \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir --upgrade pip pipx \
    && python -m pipx install git+https://github.com/public-clis/twitter-cli.git

RUN npm_config_python=/usr/bin/python3 npm install -g xreach-cli

COPY web-ui/package*.json ./web-ui/
RUN cd web-ui && npm ci

COPY . .

EXPOSE 8765 5177

CMD ["python", "run/api.py", "--host", "0.0.0.0", "--port", "8765"]
