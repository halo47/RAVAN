## Summary
Describe the changes introduced in this Pull Request and which module (`trips`, `bookings`, `finance`, `rbac`, `super-admin`, `i18n`) is affected.

## Security & Multi-Tenant Checklist
- [ ] All queries and mutations are scoped by verified `organization_id`.
- [ ] Server-side permission check (`hasPermission`) is enforced.
- [ ] `IQD` and `USD` amounts are handled as integers and never summed across currencies.
- [ ] UI strings are localized in `ku`, `ar`, and `en`.
- [ ] No secrets, credentials, or real customer data are included.
- [ ] `docs/CHANGELOG.md` and `docs/PROJECT_STATUS.md` are updated.

## Verification
- [ ] `npm run lint` passed
- [ ] `npm test` passed
- [ ] `npm run build` passed
