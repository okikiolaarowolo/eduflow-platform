# Phase 1 — Acceptance Criteria

## Identity and roles
- Users can sign up, confirm email, sign in and sign out.
- Production auth redirects never send users to localhost.
- Roles supported by the product are SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL, SECRETARY and TEACHER.
- Role permissions are enforced in the UI and database policies.

## Multi-tenancy
- Every school-owned record is associated with a school.
- Cross-school reads and writes are blocked by RLS and integrity guards.
- A school user cannot select or mutate another school's data by changing client parameters.

## School setup
- A new school can be onboarded with academic session, terms, classes and subjects.
- School settings can be viewed and updated by authorized school managers.

## Core records
- Authorized staff can create, edit, archive and search students.
- Authorized staff can create, edit and assign teachers.
- Authorized staff can create, edit and archive classes and subjects.
- Teacher/class/subject assignments are persisted and used for downstream authorization.

## Staff workspace
- Dashboard metrics are backed by real database data.
- Navigation is role-aware.
- Parent and student portal routes are not exposed as product destinations.
- Audit/activity events are recorded for important administrative actions.

## Quality
- TypeScript/build passes in CI.
- Loading, empty, error and success states exist for core data views.
- No page crashes when profile/school data is missing.
