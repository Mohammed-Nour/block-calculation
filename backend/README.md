# Backend

Owner: Ali Hamdan.

The backend implements the HTTP API described in [`docs/api/openapi.yaml`](../docs/api/openapi.yaml) and the business rules in section 8 of the [project study](../docs/requirements/study.md).

Tracked in issues #3 (data model), #4 (settings API), #5 (CI), #8 (calculation service), #9 (projects and estimates API), #12 (production and collection API), #14 (integration tests) and #15 (staging).

Until this service exists the frontend runs against an in-browser mock of the same contract (`VITE_API_MODE=mock`).
