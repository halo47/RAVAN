# RAVAN — Trip Operations & Execution Guide (`TRIP_OPERATIONS_GUIDE.md`)

## 1. Trip Lifecycle States
Every trip in `trips` progresses through controlled states:
- `draft`: Trip is being prepared internally; not visible on public links.
- `published`: Live and accepting customer registrations via its exclusive link (`/?trip=CODE`) and company storefront (`/?org=SLUG`).
- `full`: Automatically set when `available_seats` reaches `0`; blocks further bookings until seats are freed or capacity is increased.
- `completed`: Trip has returned; ready for final expense reconciliation and profit reporting.
- `cancelled` / `archived`: Closed to new bookings.

## 2. Exclusive Single-Trip Registration Link (`/?trip=CODE`)
- Every trip has a unique `code` (e.g., `RVN-CHM-01`, `RVN-IST-02`) within its organization.
- Sharing `/?trip=RVN-CHM-01` opens a dedicated standalone page showing **only**:
  - The organizing travel company's logo, name, and phone number.
  - That single trip's cover image, destination, dates, price (`IQD` or `USD`), remaining seats, included services, requirements, and pickup points.
  - An interactive participant registration form that dynamically collects the full name and age group (`adult`, `child`, `infant`) of every participant and issues an instant booking receipt (`RVN-...`).

## 3. Pre-Trip Preparation Checklist (`preparation_checklist` JSONB)
Inside **گەشتەکان → ئامادەکاری و ئامادەبوون**, operations managers track 8 readiness checkpoints:
1. Bus / Vehicle Assigned (`bus_assigned`)
2. Tour Guide Assigned (`guide_assigned`)
3. Hotel / Accommodation Confirmed (`hotel_confirmed`)
4. Meals & Refreshments Arranged (`meals_arranged`)
5. Checkpoint Permits Ready (`permits_ready`)
6. Passenger Manifest Verified (`manifest_printed`)
7. Emergency Contacts Checked (`emergency_contacts`)
8. Departure Time Confirmed with Passengers (`departure_confirmed`)

## 4. Live Passenger Manifest & Attendance Check-In
- During departure and checkpoints, tour guides or staff open the **Trip Operations & Manifest** modal.
- Each passenger row displays their full name, age group, booking code, pickup point, and phone number.
- Staff mark each passenger as **ئامادەیە (`present`)** or **نەهاتوو (`no_show`)** via `PATCH /api/passengers/:id/attendance`, which records `checked_in_at` in PostgreSQL.
- The manifest can be exported to UTF-8 CSV (`manifest-CODE.csv`) with one click.
