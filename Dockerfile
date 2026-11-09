FROM python:3.12-slim
WORKDIR /app
COPY run_server.py ./
COPY web/ ./web/
ENV HOST=0.0.0.0 PORT=8080 TERRAIN_CACHE_DIR=/tmp/terrain_cache PYTHONUNBUFFERED=1
USER 65532:65532
EXPOSE 8080
CMD ["python3", "run_server.py", "--no-browser"]
