# Contributing to RAVAN

Thank you for contributing to **RAVAN — Travel Business Operating System**.

## 1. Branch & Commit Standards
- Never commit `.env` files, API keys, service role keys, or customer PII.
- Use structured commit messages:
  - `feat(trips): add trilingual pickup point validation`
  - `fix(bookings): enforce row-level lock on seat capacity`
  - `security(rbac): block self role elevation in membership patch`
  - `docs(database): document seat_reserve_mode transitions`

## 2. Mandatory Pre-PR Checks
Before opening a Pull Request, ensure all checks pass locally:
```bash
npm run lint
npm test
npm run build
```

## 3. Multi-Tenant & Financial Guardrails
- Every new tenant table must include `organization_id` with foreign key and index constraints.
- Never sum `IQD` and `USD` values together.
- Never touch or hardcode `KURDIA ADVENTURE` infrastructure or production data.
