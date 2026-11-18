# Documentation

| Folder | What it holds |
|---|---|
| [requirements/](requirements/) | The project study (original docx and [Markdown version](requirements/study.md)), UML diagrams and the [traceability matrix](requirements/traceability.md) |
| [api/](api/) | The HTTP contract shared by frontend and backend |
| [frontend/](frontend/) | [Architecture](frontend/architecture.md), [coding standards](frontend/coding-standards.md), [acceptance checks](frontend/acceptance-checks.md) |
| [ux/](ux/) | [Usability test plan](ux/usability-test-plan.md) for BO04, [one-page user instructions](ux/user-instructions.md), [affordance and heuristic review](ux/affordance-and-heuristics.md), [results template](ux/usability-results.md) |
| [deployment/](deployment/staging.md) | Backend staging, health checks, daily backups, restoration, and rollback |
| [process/](process/) | How we plan, branch, review and release |

When the study changes, update the docx first, regenerate `study.md`, add a revision-history row and list the affected requirements in the pull request.
