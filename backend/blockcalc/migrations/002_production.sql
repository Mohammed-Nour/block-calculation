ALTER TABLE projects ADD COLUMN cancel_reason TEXT;
ALTER TABLE projects ADD COLUMN production_plan_json TEXT
    CHECK (production_plan_json IS NULL OR (
        json_valid(production_plan_json) AND json_type(production_plan_json) = 'object'
    ));

CREATE INDEX production_runs_active ON production_runs(project_id, block_size, started_at, ready_at)
    WHERE cancelled_at IS NULL;
