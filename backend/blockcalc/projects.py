import json
import sqlite3
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

from .calculation import (
    CEMENT_BAG_KILOGRAMS,
    KILOGRAMS_PER_TON,
    MaterialCalculation,
    MaterialOrder,
    MissingCalculationInputs,
    calculate_materials,
)
from .db import transaction
from .settings import DatabasePath, PositiveCount, SettingsRead, SQLITE_MAX_INT, read_settings

router = APIRouter(prefix="/api/projects", tags=["Projects"])
ProjectId = Annotated[int, Path(gt=0, le=SQLITE_MAX_INT)]
RevisionNumber = Annotated[int, Path(gt=0, le=SQLITE_MAX_INT)]
ProjectStatus = Literal[
    "draft", "planned", "in_production", "partially_ready", "ready", "collected", "cancelled",
]


class ProjectDraft(MaterialOrder):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    requested_start_at: AwareDatetime


class ProjectUpdate(ProjectDraft):
    version: PositiveCount


class EstimateInputs(BaseModel):
    model_config = ConfigDict(frozen=True)

    project: ProjectDraft
    settings: SettingsRead
    kilograms_per_ton: Decimal = KILOGRAMS_PER_TON
    cement_bag_kilograms: Decimal = CEMENT_BAG_KILOGRAMS
    cost_rounding: Literal["ROUND_HALF_UP"] = "ROUND_HALF_UP"


class EstimateRevision(BaseModel):
    project_id: int
    revision: int
    inputs: EstimateInputs
    result: MaterialCalculation
    created_at: AwareDatetime


class ProjectRead(ProjectDraft):
    id: int
    version: int
    status: ProjectStatus
    created_at: AwareDatetime
    updated_at: AwareDatetime
    latest_estimate_revision: int | None
    estimate: EstimateRevision | None


class CalculationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: PositiveCount
    use_current_prices: Annotated[bool, Field(strict=True)] = False
    confirm_recalculation: Annotated[bool, Field(strict=True)] = False


class EstimateSave(CalculationRequest):
    settings_version: PositiveCount


class EstimatePreview(BaseModel):
    version: int
    settings_version: int
    price_source: Literal["saved", "current"]
    inputs: EstimateInputs
    result: MaterialCalculation


def _estimate_from_row(row: sqlite3.Row) -> EstimateRevision:
    return EstimateRevision(
        project_id=row["project_id"],
        revision=row["revision"],
        inputs=EstimateInputs.model_validate_json(row["inputs_json"]),
        result=MaterialCalculation.model_validate_json(row["results_json"]),
        created_at=row["created_at"],
    )


def _latest_estimate(connection: sqlite3.Connection, project_id: int) -> EstimateRevision | None:
    row = connection.execute("""
        SELECT * FROM estimate_revisions WHERE project_id = ? ORDER BY revision DESC LIMIT 1
    """, (project_id,)).fetchone()
    return _estimate_from_row(row) if row is not None else None


def read_project(connection: sqlite3.Connection, project_id: int) -> ProjectRead:
    row = connection.execute("""
        SELECT id, name, requested_start_at, full_quantity, half_quantity, mix_id,
               status, version, created_at, updated_at FROM projects WHERE id = ?
    """, (project_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    latest = _latest_estimate(connection, project_id)
    return ProjectRead(
        **dict(row),
        latest_estimate_revision=latest.revision if latest is not None else None,
        estimate=latest if row["status"] != "draft" else None,
    )


def _check_version(project: ProjectRead, version: int) -> None:
    if project.version != version:
        raise HTTPException(status_code=409, detail={
            "message": "Project has changed. Reload it before continuing.",
            "current_version": project.version,
        })


def _record_event(connection: sqlite3.Connection, project_id: int, event_type: str, details: dict) -> None:
    connection.execute("""
        INSERT INTO audit_events (project_id, event_type, actor_id, details_json)
        VALUES (?, ?, 'local-user', ?)
    """, (project_id, event_type, json.dumps(details)))


def _preview(
    connection: sqlite3.Connection, project: ProjectRead, request: CalculationRequest,
) -> EstimatePreview:
    _check_version(project, request.version)
    latest = _latest_estimate(connection, project.id)
    if latest is not None and request.use_current_prices and not request.confirm_recalculation:
        raise HTTPException(status_code=422, detail=[{
            "loc": ["body", "confirm_recalculation"],
            "msg": "Confirm recalculation before replacing saved calculation settings",
            "type": "value_error.recalculation_confirmation",
        }])

    if latest is not None and not request.use_current_prices:
        settings = latest.inputs.settings
        price_source = "saved"
    else:
        settings = read_settings(connection)
        price_source = "current"
    draft = ProjectDraft.model_validate(project.model_dump(include=set(ProjectDraft.model_fields)))
    try:
        result = calculate_materials(draft, settings)
    except MissingCalculationInputs as error:
        raise HTTPException(status_code=422, detail=[{
            "loc": ["project" if field == "mix_id" else "settings", field],
            "msg": "Required for this calculation",
            "type": "value_error.missing_calculation_input",
        } for field in error.fields]) from error

    return EstimatePreview(
        version=project.version,
        settings_version=settings.version,
        price_source=price_source,
        inputs=EstimateInputs(project=draft, settings=settings),
        result=result,
    )


@router.post("", status_code=201, summary="Create a project draft")
def create_project(draft: ProjectDraft, path: DatabasePath) -> ProjectRead:
    with transaction(path, write=True) as connection:
        cursor = connection.execute("""
            INSERT INTO projects (name, requested_start_at, full_quantity, half_quantity, mix_id)
            VALUES (:name, :requested_start_at, :full_quantity, :half_quantity, :mix_id)
        """, draft.model_dump(mode="json"))
        project_id = cursor.lastrowid
        _record_event(connection, project_id, "project.created", draft.model_dump(mode="json"))
        return read_project(connection, project_id)


@router.get("", summary="List projects")
def list_projects(
    path: DatabasePath,
    status: ProjectStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=SQLITE_MAX_INT)] = 0,
) -> list[ProjectRead]:
    with transaction(path) as connection:
        rows = connection.execute("""
            SELECT id FROM projects WHERE (? IS NULL OR status = ?) ORDER BY id DESC LIMIT ? OFFSET ?
        """, (status, status, limit, offset)).fetchall()
        return [read_project(connection, row["id"]) for row in rows]


@router.get("/{project_id}", summary="Read a project and its current estimate")
def get_project(project_id: ProjectId, path: DatabasePath) -> ProjectRead:
    with transaction(path) as connection:
        return read_project(connection, project_id)


@router.put("/{project_id}", summary="Replace project draft fields")
def update_project(project_id: ProjectId, update: ProjectUpdate, path: DatabasePath) -> ProjectRead:
    with transaction(path, write=True) as connection:
        project = read_project(connection, project_id)
        _check_version(project, update.version)
        order_changed = (
            update.full_quantity, update.half_quantity, update.mix_id
        ) != (project.full_quantity, project.half_quantity, project.mix_id)
        started = connection.execute("""
            SELECT 1 FROM production_runs WHERE project_id = ? AND started_at IS NOT NULL LIMIT 1
        """, (project_id,)).fetchone()
        locked_statuses = {"in_production", "partially_ready", "ready", "collected", "cancelled"}
        if order_changed and (started is not None or project.status in locked_statuses):
            raise HTTPException(status_code=409, detail="Quantities and mix are locked for this project")

        status = "draft" if order_changed else project.status
        values = update.model_dump(mode="json") | {"id": project_id, "status": status}
        connection.execute("""
            UPDATE projects SET
                name = :name, requested_start_at = :requested_start_at,
                full_quantity = :full_quantity, half_quantity = :half_quantity, mix_id = :mix_id,
                status = :status, version = version + 1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = :id
        """, values)
        if order_changed or update.requested_start_at != project.requested_start_at:
            connection.execute("UPDATE projects SET production_plan_json = NULL WHERE id = ?", (project_id,))
            connection.execute("""
                UPDATE production_runs SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE project_id = ? AND started_at IS NULL AND cancelled_at IS NULL
            """, (project_id,))
        _record_event(connection, project_id, "project.updated", {
            "previous_version": project.version,
            "project": update.model_dump(mode="json"),
            "estimate_invalidated": order_changed,
        })
        return read_project(connection, project_id)


@router.post("/{project_id}/calculate", summary="Preview material costs without saving a revision")
def preview_estimate(
    project_id: ProjectId, request: CalculationRequest, path: DatabasePath,
) -> EstimatePreview:
    with transaction(path) as connection:
        return _preview(connection, read_project(connection, project_id), request)


@router.post("/{project_id}/estimates", status_code=201, summary="Save an estimate revision")
def save_estimate(project_id: ProjectId, request: EstimateSave, path: DatabasePath) -> ProjectRead:
    with transaction(path, write=True) as connection:
        project = read_project(connection, project_id)
        preview = _preview(connection, project, request)
        if preview.settings_version != request.settings_version:
            raise HTTPException(status_code=409, detail={
                "message": "Calculation settings have changed. Preview the estimate again before saving.",
                "current_settings_version": preview.settings_version,
            })

        revision = (project.latest_estimate_revision or 0) + 1
        connection.execute("""
            INSERT INTO estimate_revisions (project_id, revision, inputs_json, results_json)
            VALUES (?, ?, ?, ?)
        """, (
            project_id, revision, preview.inputs.model_dump_json(), preview.result.model_dump_json(),
        ))
        connection.execute("""
            UPDATE projects SET status = CASE WHEN status = 'draft' THEN 'planned' ELSE status END,
                version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
        """, (project_id,))
        _record_event(connection, project_id, "estimate.saved", {
            "revision": revision,
            "previous_version": project.version,
            "settings_version": preview.settings_version,
            "price_source": preview.price_source,
        })
        return read_project(connection, project_id)


@router.get("/{project_id}/estimates", summary="Read saved estimate revision history")
def list_estimates(project_id: ProjectId, path: DatabasePath) -> list[EstimateRevision]:
    with transaction(path) as connection:
        read_project(connection, project_id)
        rows = connection.execute("""
            SELECT * FROM estimate_revisions WHERE project_id = ? ORDER BY revision
        """, (project_id,)).fetchall()
        return [_estimate_from_row(row) for row in rows]


@router.get("/{project_id}/estimates/{revision}", summary="Read an original saved estimate revision")
def get_estimate(project_id: ProjectId, revision: RevisionNumber, path: DatabasePath) -> EstimateRevision:
    with transaction(path) as connection:
        row = connection.execute("""
            SELECT * FROM estimate_revisions WHERE project_id = ? AND revision = ?
        """, (project_id, revision)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Estimate revision not found")
        return _estimate_from_row(row)
