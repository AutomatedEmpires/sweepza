## Summary

<!-- What does this PR implement? Link the issue. -->

Closes #

**Lane:** <!-- A-I -->

## Acceptance criteria

<!-- Copy the issue's acceptance criteria and check each one. -->

- [ ] 
- [ ] 

## Canon alignment

- [ ] Matches the relevant canonical spec (data model, states, trust, billing, etc.)
- [ ] Uses the canonical `listing` object — no parallel listing models
- [ ] Controlled values come from the dictionary registry (no free-text taxonomy)

## Security & quality

- [ ] RLS / access rules respected (server-enforced; no client-only checks)
- [ ] No secrets committed; new env vars documented in `.env.example`
- [ ] Mobile-first + accessible (labels, focus, contrast, 44px+ targets)
- [ ] SEO metadata where applicable
- [ ] `pnpm build` passes locally / in CI
