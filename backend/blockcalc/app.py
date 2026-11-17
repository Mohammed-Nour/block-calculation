import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import database_path, migrate
from .settings import router as settings_router


def create_app(path: Path | None = None) -> FastAPI:
    db_path = path if path is not None else database_path()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        migrate(db_path)
        yield

    app = FastAPI(title="BlockCalc API", lifespan=lifespan)
    app.state.database_path = db_path
    origins = os.environ.get("BLOCKCALC_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
        allow_methods=["GET", "PUT"],
        allow_headers=["Content-Type"],
    )
    app.include_router(settings_router)
    return app


app = create_app()
