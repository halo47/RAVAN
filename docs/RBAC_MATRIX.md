# ROLE-BASED & PERMISSION-BASED ACCESS CONTROL (RBAC) MATRIX — RAVAN

RAVAN enforces **Permission-Based Access Control** on the server and in database policies, rather than simple frontend role hiding.

## 1. Roles Overview

| Role Identifier | Scope | Summary |
| :--- | :--- | :--- |
| `platform_super_admin` | Platform-wide | Manages tenant organizations, subscription plans, and platform audit logs. Separated from standard tenant operations. |
| `company_owner` | Tenant (`organization_id`) | Full control over the travel company, billing, settings, members, trips, bookings, and finances. |
| `company_manager` | Tenant (`organization_id`) | Operational lead with broad permissions across trips, bookings, CRM, staff, and reports. |
| `booking_agent` | Tenant (`organization_id`) | Frontline reservation staff managing bookings, passengers, and customer records. |
| `accountant` | Tenant (`organization_id`) | Financial controller managing payments, refunds, expenses, and financial reports. |
| `tour_guide` | Tenant (`organization_id`) | Field staff viewing assigned trips, pickup points, and passenger manifests. |
| `customer` | Public / Own Bookings | End traveler browsing public trips and checking their own booking status. |

---

## 2. Permission Matrix by Role

| Permission Key | `company_owner` | `company_manager` | `booking_agent` | `accountant` | `tour_guide` | `customer` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `organization.read` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `organization.update` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `members.read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `members.invite` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `members.manage_roles` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `trips.read` | ✅ | ✅ | ✅ | ✅ | ✅ | Public Only |
| `trips.create` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `trips.update` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `trips.publish` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `bookings.read` | ✅ | ✅ | ✅ | ✅ | Assigned Only | Own Only |
| `bookings.create` | ✅ | ✅ | ✅ | ❌ | ❌ | Public Request |
| `bookings.approve` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `bookings.cancel` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `customers.read` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `customers.manage` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `finance.read` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `finance.manage` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `reports.read` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `settings.manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

> **Platform Super Admin (`platform_super_admin`)** holds platform-scoped permissions: `platform.organizations.read`, `platform.organizations.manage`, `platform.plans.manage`, `platform.subscriptions.manage`, and `platform.audit.read`.

---

## 3. Enforcement Rules

1. **No Self-Elevation:** A member cannot modify their own role or grant a permission they do not possess.
2. **Custom Permission Overrides:** `memberships.custom_permissions` allows a `company_owner` to grant specific additional permissions (e.g., granting `trips.update` to a senior `booking_agent`) without making them full owner.
3. **Deactivated Members:** Setting `memberships.status = 'deactivated'` immediately revokes all permissions for that organization on the very next API request.
