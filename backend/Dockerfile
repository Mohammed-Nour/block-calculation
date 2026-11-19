FROM ghcr.io/astral-sh/uv:0.11.31@sha256:ecd4de2f060c64bea0ff8ecb182ddf46ba3fcccdc8a60cfdbaf20d1a047d7437 AS uv
FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-managed-python
COPY blockcalc ./blockcalc
RUN useradd --uid 10001 --create-home blockcalc && mkdir /data /backups && chown blockcalc:blockcalc /data /backups
ENV PATH="/app/.venv/bin:$PATH" BLOCKCALC_DB_PATH=/data/blockcalc.sqlite3
USER blockcalc
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3).close()"
CMD ["uvicorn", "blockcalc.app:app", "--host", "0.0.0.0", "--port", "8000"]
