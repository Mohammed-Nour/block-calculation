# Workflow

## Planning

- Milestones follow the study's delivery order: **M1 Foundation**, **M2 Estimates**, **M3 Production Tracking**, **M4 Test and Release**.
- Every piece of work is a GitHub issue with an owner label (`owner-mohamad`, `owner-ali`), an area label (`frontend`, `backend`, `deployment`, `documentation`) and a milestone.
- An issue names the requirements (FR, NFR, AT) it delivers. New requirements go into the study first.

## Branches and commits

- Branch from the latest base: `<type>/<issue>-<short-name>`, for example `feat/2-settings`. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
- Commit messages use [Conventional Commits](https://www.conventionalcommits.org/): `feat(settings): validate mix yields`.
- Keep each commit focused; never commit secrets or `.env` files.

## Pull requests

- One pull request per issue, with `Closes #<issue>` in the description.
- The description lists the requirements covered and how the change was verified.
- The other team member reviews; CI must pass before merging.
- Squash-merge into `main` and delete the branch.

## Definition of done

1. The behaviour matches the study, including its alternative scenarios.
2. Tests cover the rules and acceptance checks the issue names.
3. `pnpm check` and `pnpm build` pass in `frontend/`.
4. The screen works by keyboard and at 360 px and 1280 px wide.
5. Docs are updated (traceability, API contract, architecture) when the change affects them.
