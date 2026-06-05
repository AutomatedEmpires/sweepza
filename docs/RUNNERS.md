# Runners

## Decision
GitHub-hosted runners only for now.

## Default
Use `ubuntu-latest` for CI, dependency review, and CodeQL unless there is a documented reason to differ.

## Why
- clean environment per run
- less machine-state drift
- lower secret exposure risk
- safer for pull requests and automation
- easier to standardize with sibling AutomatedEmpires repos

## Self-hosted runners
Do not use self-hosted runners by default.

They are only appropriate after explicit approval and only when the runner is isolated from personal machines, untrusted PR code cannot reach sensitive infrastructure, and lifecycle/credential management is documented.

## Hard rule
Never run untrusted pull request code on a personal workstation runner.