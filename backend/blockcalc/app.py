import os
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .db import database_path, migrate, transaction
from .projects import router as projects_router
from .production import router as production_router
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
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )
    app.include_router(settings_router)
    app.include_router(production_router)
    app.include_router(projects_router)

    @app.get("/health", tags=["Operations"])
    def health() -> dict:
        try:
            with transaction(db_path) as connection:
                version = connection.execute("PRAGMA user_version").fetchone()[0]
                settings = connection.execute("SELECT id FROM settings WHERE id = 1").fetchone()
                if settings is None:
                    raise sqlite3.DatabaseError("Settings unavailable")
        except (sqlite3.Error, OSError) as error:
            raise HTTPException(503, detail="Database unavailable") from error
        return {"status": "ok", "schema_version": version}

    return app


app = create_app()
