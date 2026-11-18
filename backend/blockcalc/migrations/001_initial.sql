CREATE TABLE settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    currency TEXT NOT NULL DEFAULT 'RUB' CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
    sand_price_per_ton TEXT,
    stone_price_per_ton TEXT,
    cement_price_per_ton TEXT,
    full_molds INTEGER NOT NULL DEFAULT 0 CHECK (full_molds >= 0),
    half_molds INTEGER NOT NULL DEFAULT 0 CHECK (half_molds >= 0),
    sand_kg_per_wheelbarrow TEXT,
    stone_kg_per_wheelbarrow TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE mixes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sand_wheelbarrows TEXT NOT NULL,
    stone_wheelbarrows TEXT NOT NULL,
    cement_bags TEXT NOT NULL,
    full_yield INTEGER CHECK (full_yield > 0),
    half_yield INTEGER CHECK (half_yield > 0)
) STRICT;

CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    requested_start_at TEXT NOT NULL,
    full_quantity INTEGER NOT NULL CHECK (full_quantity >= 0),
    half_quantity INTEGER NOT NULL CHECK (half_quantity >= 0),
    mix_id INTEGER REFERENCES mixes(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'planned', 'in_production', 'partially_ready', 'ready', 'collected', 'cancelled'
    )),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (full_quantity > 0 OR half_quantity > 0)
) STRICT;

CREATE INDEX projects_by_status ON projects(status, id);

CREATE TABLE estimate_revisions (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    -- One self-contained record of the order, recipe, prices, yields, conversions, and results.
    inputs_json TEXT NOT NULL CHECK (json_valid(inputs_json) AND json_type(inputs_json) = 'object'),
    results_json TEXT NOT NULL CHECK (json_valid(results_json) AND json_type(results_json) = 'object'),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (project_id, revision)
) STRICT;

CREATE TRIGGER estimate_revisions_no_update BEFORE UPDATE ON estimate_revisions
BEGIN
    SELECT RAISE(ABORT, 'estimate revisions are immutable');
END;

CREATE TRIGGER estimate_revisions_no_delete BEFORE DELETE ON estimate_revisions
BEGIN
    SELECT RAISE(ABORT, 'estimate revisions are immutable');
END;

CREATE TABLE production_runs (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    estimate_revision INTEGER NOT NULL,
    block_size TEXT NOT NULL CHECK (block_size IN ('full', 'half')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    mold_capacity INTEGER NOT NULL CHECK (mold_capacity >= quantity),
    planned_start_at TEXT NOT NULL,
    started_at TEXT,
    ready_at TEXT,
    cancelled_at TEXT,
    CHECK (ready_at IS NULL OR started_at IS NOT NULL),
    CHECK (cancelled_at IS NULL OR started_at IS NULL),
    FOREIGN KEY (project_id, estimate_revision) REFERENCES estimate_revisions(project_id, revision)
) STRICT;

CREATE INDEX production_runs_by_project ON production_runs(project_id, block_size);

CREATE TABLE collections (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    full_quantity INTEGER NOT NULL CHECK (full_quantity >= 0),
    half_quantity INTEGER NOT NULL CHECK (half_quantity >= 0),
    collected_at TEXT NOT NULL,
    CHECK (full_quantity > 0 OR half_quantity > 0)
) STRICT;

CREATE INDEX collections_by_project ON collections(project_id, id);

CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id),
    event_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    event_key TEXT CHECK (event_key IS NULL OR project_id IS NOT NULL),
    occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    details_json TEXT NOT NULL CHECK (json_valid(details_json) AND json_type(details_json) = 'object'),
    UNIQUE (project_id, event_key)
) STRICT;

CREATE INDEX audit_events_by_project ON audit_events(project_id, id);

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are immutable');
END;

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are immutable');
END;

INSERT INTO settings (id) VALUES (1);

INSERT INTO mixes (id, name, sand_wheelbarrows, stone_wheelbarrows, cement_bags)
VALUES
    (1, 'Mix 1', '3', '0', '1'),
    (2, 'Mix 2', '3', '2', '1'),
    (3, 'Mix 3', '2.5', '2.5', '1'),
    (4, 'Mix 4', '2', '2', '1');
