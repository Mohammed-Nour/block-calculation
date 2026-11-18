import os
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = Path(__file__).with_name("migrations")


def database_path() -> Path:
    configured = os.environ.get("BLOCKCALC_DB_PATH")
    return Path(configured) if configured else BACKEND_ROOT / "data" / "blockcalc.sqlite3"


@contextmanager
def transaction(path: Path, *, write: bool = False) -> Iterator[sqlite3.Connection]:
    with closing(sqlite3.connect(path, isolation_level=None)) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA recursive_triggers = ON")
        with connection:
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield connection


def _statements(script: str) -> Iterator[str]:
    # executescript commits a pending transaction, so execute each complete statement directly.
    statement = ""
    for line in script.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            yield statement
            statement = ""
    if statement.strip():
        raise ValueError("Incomplete statement at the end of the migration")


def migrate(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(MIGRATIONS.glob("*.sql"))
    versions = [int(file.name.split("_", 1)[0]) for file in files]
    if not files or versions != list(range(1, len(files) + 1)):
        raise ValueError("Migration versions must be consecutive, starting at 1")

    with transaction(path, write=True) as connection:
        current_version = connection.execute("PRAGMA user_version").fetchone()[0]
        if current_version > len(files):
            raise RuntimeError(f"Database schema {current_version} is newer than this application")

        for version, file in zip(versions[current_version:], files[current_version:], strict=True):
            for statement in _statements(file.read_text(encoding="utf-8")):
                connection.execute(statement)
            connection.execute(f"PRAGMA user_version = {version}")


if __name__ == "__main__":
    path = database_path()
    migrate(path)
    print(f"Database migrations applied to {path}")
