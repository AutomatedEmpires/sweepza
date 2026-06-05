# Review Checklist

Use this on every substantial Sweepza PR.

## Scope
- Does the PR match the linked issue and source of truth?
- Does it preserve the canonical `listing` object and controlled dictionaries?
- Are unrelated changes excluded?

## Validation
- Were the listed commands actually run?
- Do the results in the PR body match the real output?
- Does CI still cover lint, typecheck, and build?

## Safety
- Any secrets or credentials added?
- Any destructive schema, auth, or billing changes?
- Any approval-gated area touched without explicit sign-off?

## Maintainability
- Is the change consistent with the existing repo contract?
- Is a reusable pattern being introduced instead of a one-off shortcut?
- Were docs or templates updated when workflow behavior changed?

## Release Risk
- What could break after merge?
- Is follow-up needed because automated test coverage is still limited?
- Will future branch protection checks match the workflow names in this repo?