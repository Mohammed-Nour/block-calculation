import json
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from .calculation import (
    MaterialCalculation,
    MaterialOrder,
    MissingCalculationInputs,
    calculate_materials,
)
from .db import transaction
from .projects import (
    ProjectId,
    ProjectStatus,
    _check_version,
    _latest_estimate,
    read_project,
)
from .settings import (
    Count,
    DatabasePath,
    Mix,
    PositiveCount,
    SettingsValues,
    read_settings,
)

router = APIRouter(tags=["Production"])
BlockSize = Literal["full", "half"]
SIZES: tuple[BlockSize, ...] = ("full", "half")
CYCLE_HOURS = 48


def utc_now() -> datetime:
    return datetime.now(UTC)


def add_hours(start: datetime, hours: int) -> datetime:
    try:
        return (start.astimezone(UTC) + timedelta(hours=hours)).astimezone(start.tzinfo)
    except (OverflowError, ValueError) as error:
        raise HTTPException(
            422, detail="Forecast exceeds the supported calendar range"
        ) from error


class SizeForecast(BaseModel):
    quantity: int
    molds: int
    cycles: int
    expected_ready_at: AwareDatetime | None


class Forecast(BaseModel):
    full: SizeForecast
    half: SizeForecast
    duration_hours: float | None
    expected_ready_at: AwareDatetime | None
    untimed_sizes: list[BlockSize]


class ProductionRun(BaseModel):
    id: int
    estimate_revision: int
    block_size: BlockSize
    quantity: int
    mold_capacity: int
    planned_start_at: AwareDatetime
    started_at: AwareDatetime | None
    ready_at: AwareDatetime | None
    cancelled_at: AwareDatetime | None
    expected_ready_at: AwareDatetime


class Collection(BaseModel):
    id: int
    full_quantity: int
    half_quantity: int
    collected_at: AwareDatetime


class SizeBalance(BaseModel):
    requested: int
    ready: int
    collected: int


class HistoryEvent(BaseModel):
    id: int
    event_type: str
    actor_id: str
    occurred_at: AwareDatetime
    summary: str


class ProjectInfo(MaterialOrder):
    id: int
    name: str
    requested_start_at: AwareDatetime
    status: ProjectStatus
    version: int
    cancel_reason: str | None
    created_at: AwareDatetime
    updated_at: AwareDatetime


class EstimateViewInputs(BaseModel):
    order: MaterialOrder
    mix: Mix
    settings: SettingsValues
    settings_version: int


class EstimateView(BaseModel):
    revision: int
    created_at: AwareDatetime
    inputs: EstimateViewInputs
    results: MaterialCalculation


class ProjectDetail(BaseModel):
    project: ProjectInfo
    currency: str
    estimates: list[EstimateView]
    runs: list[ProductionRun]
    collections: list[Collection]
    balance: dict[BlockSize, SizeBalance]
    forecast: Forecast | None
    history: list[HistoryEvent]


class ProjectSummary(ProjectInfo):
    currency: str
    latest_total_cost: str | None
    expected_ready_at: AwareDatetime | None


class PlanProduction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_version: PositiveCount


class EventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_key: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)
    ]


class RunStart(EventRequest):
    started_at: AwareDatetime


class RunReady(EventRequest):
    ready_at: AwareDatetime
    physically_checked: Annotated[bool, Field(strict=True)]


class CollectionInput(EventRequest):
    full_quantity: Count
    half_quantity: Count
    collected_at: AwareDatetime

    @model_validator(mode="after")
    def require_blocks(self):
        if self.full_quantity == 0 and self.half_quantity == 0:
            raise ValueError("Collect at least one block")
        return self


class CancelProject(PlanProduction):
    reason: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)
    ]


class CalculationInput(MaterialOrder):
    project_id: PositiveCount | None = None


class MaterialPreview(MaterialCalculation):
    settings_version: int


def forecast_order(start: datetime, quantities: dict, molds: dict) -> Forecast:
    sizes = {}
    for size in SIZES:
        quantity, capacity = quantities[size], molds[size]
        cycles = (quantity + capacity - 1) // capacity if quantity and capacity else 0
        sizes[size] = SizeForecast(
            quantity=quantity,
            molds=capacity,
            cycles=cycles,
            expected_ready_at=None
            if quantity and not capacity
            else add_hours(start, cycles * CYCLE_HOURS),
        )
    return _combine_forecast(start, sizes)


def _combine_forecast(
    start: datetime, sizes: dict[BlockSize, SizeForecast]
) -> Forecast:
    untimed = [
        size
        for size in SIZES
        if sizes[size].quantity and sizes[size].expected_ready_at is None
    ]
    times = [
        item.expected_ready_at
        for item in sizes.values()
        if item.expected_ready_at is not None
    ]
    end = max(times) if times and not untimed else None
    duration = (
        (end.astimezone(UTC) - start.astimezone(UTC)).total_seconds() / 3600
        if end
        else None
    )
    return Forecast(
        **sizes, expected_ready_at=end, duration_hours=duration, untimed_sizes=untimed
    )


def project_detail(connection: sqlite3.Connection, project_id: int) -> ProjectDetail:
    project = read_project(connection, project_id)
    row = connection.execute(
        "SELECT cancel_reason, production_plan_json FROM projects WHERE id = ?",
        (project_id,),
    ).fetchone()
    settings = read_settings(connection)
    estimates = []
    for estimate in connection.execute(
        """
        SELECT * FROM estimate_revisions WHERE project_id = ? ORDER BY revision
    """,
        (project_id,),
    ):
        inputs = json.loads(estimate["inputs_json"])
        snapshot = inputs["settings"]
        order = inputs["project"]
        mix = next(mix for mix in snapshot["mixes"] if mix["id"] == order["mix_id"])
        estimates.append(
            EstimateView(
                revision=estimate["revision"],
                created_at=estimate["created_at"],
                inputs={
                    "order": {
                        key: order[key]
                        for key in ("full_quantity", "half_quantity", "mix_id")
                    },
                    "mix": mix,
                    "settings": {
                        key: snapshot[key]
                        for key in type(settings).model_fields
                        if key not in {"version", "updated_at", "mixes"}
                    },
                    "settings_version": snapshot["version"],
                },
                results=MaterialCalculation.model_validate_json(
                    estimate["results_json"]
                ),
            )
        )
    runs = []
    previous_end = {}
    now = utc_now()
    for run in connection.execute(
        "SELECT * FROM production_runs WHERE project_id = ? ORDER BY id", (project_id,)
    ):
        start = datetime.fromisoformat(run["started_at"] or run["planned_start_at"])
        end = add_hours(start, CYCLE_HOURS)
        size = run["block_size"]
        if run["cancelled_at"] is None:
            if run["ready_at"]:
                end = datetime.fromisoformat(run["ready_at"])
            elif run["started_at"]:
                end = max(end, now)
            else:
                start = max(start, previous_end.get(size, start))
                end = add_hours(start, CYCLE_HOURS)
            previous_end[size] = end
        runs.append(
            ProductionRun(
                **{
                    key: run[key]
                    for key in ProductionRun.model_fields
                    if key != "expected_ready_at"
                },
                expected_ready_at=end,
            )
        )
    collections = [
        Collection(**{key: item[key] for key in Collection.model_fields})
        for item in connection.execute(
            "SELECT * FROM collections WHERE project_id = ? ORDER BY id", (project_id,)
        )
    ]
    balance = {
        size: SizeBalance(
            requested=getattr(project, f"{size}_quantity"),
            ready=sum(
                run.quantity
                for run in runs
                if run.block_size == size and run.ready_at is not None
            ),
            collected=sum(getattr(item, f"{size}_quantity") for item in collections),
        )
        for size in SIZES
    }
    molds = {"full": settings.full_molds, "half": settings.half_molds}
    active = [run for run in runs if run.cancelled_at is None]
    if row["production_plan_json"]:
        molds = json.loads(row["production_plan_json"])
    elif active:
        # Databases from the initial schema retain the capacity already saved on their runs.
        for size in SIZES:
            capacities = [run.mold_capacity for run in active if run.block_size == size]
            if capacities:
                molds[size] = max(capacities)
    quantities = {size: balance[size].requested for size in SIZES}
    try:
        forecast = forecast_order(project.requested_start_at, quantities, molds)
    except HTTPException:
        # Drafts and their saved costs remain readable when the calendar cannot hold a forecast.
        forecast = None
    if active:
        sizes = {}
        for size in SIZES:
            matching = [run for run in active if run.block_size == size]
            end = matching[-1].expected_ready_at if matching else None
            if not quantities[size]:
                end = project.requested_start_at
            sizes[size] = SizeForecast(
                quantity=quantities[size],
                molds=molds[size],
                cycles=len(matching),
                expected_ready_at=end,
            )
        forecast = _combine_forecast(project.requested_start_at, sizes)
    if project.status == "cancelled":
        forecast = None
    history = []
    for event in connection.execute(
        "SELECT * FROM audit_events WHERE project_id = ? ORDER BY id DESC",
        (project_id,),
    ):
        details = json.loads(event["details_json"])
        history.append(
            HistoryEvent(
                **{
                    key: event[key]
                    for key in ("id", "event_type", "actor_id", "occurred_at")
                },
                summary=details.get("summary", event["event_type"].replace(".", " ")),
            )
        )
    return ProjectDetail(
        project=ProjectInfo(
            **project.model_dump(exclude={"estimate", "latest_estimate_revision"}),
            cancel_reason=row["cancel_reason"],
        ),
        currency=estimates[-1].results.currency if estimates else settings.currency,
        estimates=estimates,
        runs=runs,
        collections=collections,
        balance=balance,
        forecast=forecast,
        history=history,
    )


def _validate_time(field: str, value: datetime) -> None:
    if value > utc_now():
        raise HTTPException(
            422,
            detail=[
                {
                    "loc": ["body", field],
                    "msg": "Record an event that has already occurred",
                    "type": "value_error",
                }
            ],
        )


def _replayed(connection, project_id, event_type, event_key, payload) -> bool:
    event = connection.execute(
        """
        SELECT event_type, details_json FROM audit_events WHERE project_id = ? AND event_key = ?
    """,
        (project_id, event_key),
    ).fetchone()
    if event is None:
        return False
    if (
        event["event_type"] != event_type
        or json.loads(event["details_json"]).get("payload") != payload
    ):
        raise HTTPException(
            409, detail="This event key was used for a different operation"
        )
    return True


def _finish(
    connection, project_id, event_type, summary, *, event_key=None, payload=None
):
    detail = project_detail(connection, project_id)
    status = detail.project.status
    sizes = list(detail.balance.values())
    if status != "cancelled":
        if all(item.collected == item.requested for item in sizes):
            status = "collected"
        elif all(item.ready == item.requested for item in sizes):
            status = "ready"
        elif any(item.ready for item in sizes):
            status = "partially_ready"
        elif any(run.started_at for run in detail.runs):
            status = "in_production"
        else:
            status = "planned"
    connection.execute(
        """
        UPDATE projects SET status = ?, version = version + 1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?
    """,
        (status, project_id),
    )
    connection.execute(
        """
        INSERT INTO audit_events (project_id, event_type, actor_id, event_key, details_json)
        VALUES (?, ?, 'local-user', ?, ?)
    """,
        (
            project_id,
            event_type,
            event_key,
            json.dumps({"summary": summary, "payload": payload}),
        ),
    )
    return project_detail(connection, project_id)


@router.post("/api/calculations")
def preview_materials(order: CalculationInput, path: DatabasePath) -> MaterialPreview:
    with transaction(path) as connection:
        settings = read_settings(connection)
        if order.project_id is not None:
            read_project(connection, order.project_id)
            previous = _latest_estimate(connection, order.project_id)
            if previous is not None:
                settings = previous.inputs.settings
        try:
            result = calculate_materials(order, settings)
            return MaterialPreview(
                **result.model_dump(), settings_version=settings.version
            )
        except MissingCalculationInputs as error:
            raise HTTPException(
                422,
                detail={
                    "message": "Complete the required calculation inputs",
                    "missing_fields": error.fields,
                },
            ) from error


@router.get("/api/projects/summaries")
def project_summaries(
    path: DatabasePath,
    status: ProjectStatus | None = None,
) -> list[ProjectSummary]:
    with transaction(path) as connection:
        projects = connection.execute(
            """
            SELECT id FROM projects WHERE (? IS NULL OR status = ?) ORDER BY id DESC
        """,
            (status, status),
        )
        summaries = []
        for project in projects:
            detail = project_detail(connection, project["id"])
            summaries.append(
                ProjectSummary(
                    **detail.project.model_dump(),
                    currency=detail.currency,
                    latest_total_cost=str(detail.estimates[-1].results.total_cost)
                    if detail.estimates
                    else None,
                    expected_ready_at=detail.forecast.expected_ready_at
                    if detail.forecast
                    else None,
                )
            )
        return summaries


@router.get("/api/projects/{project_id}/production")
def get_production(project_id: ProjectId, path: DatabasePath) -> ProjectDetail:
    with transaction(path) as connection:
        return project_detail(connection, project_id)


@router.post("/api/projects/{project_id}/plan")
def plan_production(
    project_id: ProjectId, request: PlanProduction, path: DatabasePath
) -> ProjectDetail:
    with transaction(path, write=True) as connection:
        project = read_project(connection, project_id)
        _check_version(project, request.project_version)
        if project.status not in {"draft", "planned"}:
            raise HTTPException(
                409, detail="Production has started or the project is closed"
            )
        if project.estimate is None:
            raise HTTPException(
                422, detail="Save an estimate for the current order before planning"
            )
        if connection.execute(
            """
            SELECT 1 FROM production_runs WHERE project_id = ? AND cancelled_at IS NULL LIMIT 1
        """,
            (project_id,),
        ).fetchone():
            raise HTTPException(
                409, detail="This project already has a production plan"
            )
        settings = read_settings(connection)
        molds = {"full": settings.full_molds, "half": settings.half_molds}
        quantities = {size: getattr(project, f"{size}_quantity") for size in SIZES}
        forecast = forecast_order(project.requested_start_at, quantities, molds)
        if forecast.untimed_sizes:
            raise HTTPException(
                422,
                detail={
                    "message": "Add molds for each ordered block size",
                    "untimed_sizes": forecast.untimed_sizes,
                },
            )
        for size in SIZES:
            capacity = molds[size]
            remaining = quantities[size]
            cycle = 0
            while remaining:
                quantity = min(remaining, capacity)
                start = add_hours(project.requested_start_at, cycle * CYCLE_HOURS)
                connection.execute(
                    """
                    INSERT INTO production_runs (
                        project_id, estimate_revision, block_size, quantity, mold_capacity, planned_start_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                    (
                        project_id,
                        project.latest_estimate_revision,
                        size,
                        quantity,
                        capacity,
                        start.isoformat(),
                    ),
                )
                remaining -= quantity
                cycle += 1
        connection.execute(
            "UPDATE projects SET production_plan_json = ? WHERE id = ?",
            (json.dumps(molds), project_id),
        )
        return _finish(
            connection, project_id, "plan.created", "Production runs planned"
        )


@router.post("/api/projects/{project_id}/runs/{run_id}/start")
def start_run(
    project_id: ProjectId, run_id: ProjectId, request: RunStart, path: DatabasePath
) -> ProjectDetail:
    with transaction(path, write=True) as connection:
        project = read_project(connection, project_id)
        payload = request.model_dump(mode="json") | {"run_id": run_id}
        if _replayed(connection, project_id, "run.started", request.event_key, payload):
            return project_detail(connection, project_id)
        _validate_time("started_at", request.started_at)
        run = connection.execute(
            "SELECT * FROM production_runs WHERE project_id = ? AND id = ?",
            (project_id, run_id),
        ).fetchone()
        if run is None:
            raise HTTPException(404, detail="Production run not found")
        if (
            project.status in {"cancelled", "collected"}
            or run["cancelled_at"]
            or run["started_at"]
        ):
            raise HTTPException(409, detail="This run cannot be started")
        busy = connection.execute(
            """
            SELECT 1 FROM production_runs WHERE project_id = ? AND block_size = ?
                AND started_at IS NOT NULL AND ready_at IS NULL AND cancelled_at IS NULL LIMIT 1
        """,
            (project_id, run["block_size"]),
        ).fetchone()
        if busy:
            raise HTTPException(
                409, detail="The matching molds are still occupied by an active run"
            )
        previous = connection.execute(
            """
            SELECT * FROM production_runs WHERE project_id = ? AND block_size = ?
                AND cancelled_at IS NULL AND id < ? ORDER BY id DESC LIMIT 1
        """,
            (project_id, run["block_size"], run_id),
        ).fetchone()
        if previous and (
            previous["ready_at"] is None
            or datetime.fromisoformat(previous["ready_at"]) > request.started_at
        ):
            raise HTTPException(
                409,
                detail="The previous matching run must be ready before this start time",
            )
        connection.execute(
            "UPDATE production_runs SET started_at = ? WHERE id = ?",
            (request.started_at.isoformat(), run_id),
        )
        return _finish(
            connection,
            project_id,
            "run.started",
            f"Started {run['quantity']} {run['block_size']} blocks",
            event_key=request.event_key,
            payload=payload,
        )


@router.post("/api/projects/{project_id}/runs/{run_id}/ready")
def ready_run(
    project_id: ProjectId, run_id: ProjectId, request: RunReady, path: DatabasePath
) -> ProjectDetail:
    with transaction(path, write=True) as connection:
        read_project(connection, project_id)
        payload = request.model_dump(mode="json") | {"run_id": run_id}
        if _replayed(connection, project_id, "run.ready", request.event_key, payload):
            return project_detail(connection, project_id)
        _validate_time("ready_at", request.ready_at)
        run = connection.execute(
            "SELECT * FROM production_runs WHERE project_id = ? AND id = ?",
            (project_id, run_id),
        ).fetchone()
        if run is None:
            raise HTTPException(404, detail="Production run not found")
        if not run["started_at"] or run["ready_at"]:
            raise HTTPException(
                409, detail="The run must be active before confirming readiness"
            )
        if not request.physically_checked:
            raise HTTPException(
                422,
                detail=[
                    {
                        "loc": ["body", "physically_checked"],
                        "msg": "Check the blocks on site",
                        "type": "value_error",
                    }
                ],
            )
        if request.ready_at < add_hours(
            datetime.fromisoformat(run["started_at"]), CYCLE_HOURS
        ):
            raise HTTPException(
                422,
                detail=[
                    {
                        "loc": ["body", "ready_at"],
                        "msg": "Allow at least 48 elapsed hours",
                        "type": "value_error",
                    }
                ],
            )
        connection.execute(
            "UPDATE production_runs SET ready_at = ? WHERE id = ?",
            (request.ready_at.isoformat(), run_id),
        )
        return _finish(
            connection,
            project_id,
            "run.ready",
            f"Ready: {run['quantity']} {run['block_size']} blocks",
            event_key=request.event_key,
            payload=payload,
        )


@router.post("/api/projects/{project_id}/collections")
def record_collection(
    project_id: ProjectId, request: CollectionInput, path: DatabasePath
) -> ProjectDetail:
    with transaction(path, write=True) as connection:
        read_project(connection, project_id)
        payload = request.model_dump(mode="json")
        if _replayed(
            connection, project_id, "collection.recorded", request.event_key, payload
        ):
            return project_detail(connection, project_id)
        _validate_time("collected_at", request.collected_at)
        detail = project_detail(connection, project_id)
        errors = []
        for size in SIZES:
            requested = getattr(request, f"{size}_quantity")
            # A backdated collection can only consume blocks ready by that timestamp.
            ready = sum(
                run.quantity
                for run in detail.runs
                if run.block_size == size
                and run.ready_at is not None
                and run.ready_at <= request.collected_at
            )
            collected = detail.balance[size].collected
            if requested > ready - collected:
                errors.append(
                    {
                        "loc": ["body", f"{size}_quantity"],
                        "msg": "Exceeds the ready, uncollected balance",
                        "type": "value_error",
                    }
                )
        if errors:
            raise HTTPException(422, detail=errors)
        connection.execute(
            """
            INSERT INTO collections (project_id, full_quantity, half_quantity, collected_at) VALUES (?, ?, ?, ?)
        """,
            (
                project_id,
                request.full_quantity,
                request.half_quantity,
                request.collected_at.isoformat(),
            ),
        )
        return _finish(
            connection,
            project_id,
            "collection.recorded",
            f"Collected {request.full_quantity} full and {request.half_quantity} half blocks",
            event_key=request.event_key,
            payload=payload,
        )


@router.post("/api/projects/{project_id}/cancel")
def cancel_project(
    project_id: ProjectId, request: CancelProject, path: DatabasePath
) -> ProjectDetail:
    with transaction(path, write=True) as connection:
        project = read_project(connection, project_id)
        _check_version(project, request.project_version)
        if project.status in {"cancelled", "collected"}:
            raise HTTPException(409, detail="This project is already closed")
        connection.execute(
            """
            UPDATE projects SET status = 'cancelled', cancel_reason = ? WHERE id = ?
        """,
            (request.reason, project_id),
        )
        connection.execute(
            """
            UPDATE production_runs SET cancelled_at = ?
            WHERE project_id = ? AND started_at IS NULL AND cancelled_at IS NULL
        """,
            (utc_now().isoformat(), project_id),
        )
        return _finish(
            connection, project_id, "project.cancelled", f"Cancelled: {request.reason}"
        )
