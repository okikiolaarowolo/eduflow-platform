# EduFlow AI — 5-Phase Build Roadmap

EduFlow AI is a multi-school school-operations platform for school staff. It is not building parent or student portal experiences in this roadmap.

## Product roles
- SUPER_ADMIN — manages the EduFlow SaaS platform
- SCHOOL_ADMIN — manages a school
- PRINCIPAL — school-wide academic and operational oversight
- SECRETARY — student records, fees/payments, attendance administration and school operations
- TEACHER — assigned classes/subjects, attendance, assessment and score entry, assignments and learning materials

## Phase 1 — Foundation & Core School Administration
Goal: make the platform a secure, production-grade multi-school foundation.

- Authentication, signup, login, logout, password reset and production redirects
- Multi-tenant school isolation with RLS and tenant-integrity checks
- School onboarding and school settings
- Role-based access control for SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL, SECRETARY and TEACHER
- Users/staff management
- Student management
- Teacher management
- Class and subject management
- Teacher-to-class and teacher-to-subject assignments
- Academic sessions and terms
- Responsive application shell, dashboard and navigation
- Audit logging and secure activity history
- Remove parent/student portal routes and navigation from the product

## Phase 2 — School Operations & Finance
Goal: replace manual administrative work with a complete operations workspace.

- Secretary dashboard
- Student fee structures by session/term/class
- Payment recording: paid, partial and unpaid
- Outstanding-fee calculations and searchable debtor lists
- Payment history and receipts
- Fee/payment analytics
- Student attendance management
- Teacher clock-in/clock-out attendance
- Attendance summaries and exception tracking
- Announcements and notifications
- Operational search, filters and exports

## Phase 3 — Academic Management & Results
Goal: build the complete teacher-to-result workflow.

- Assessment setup and assessment components/weights
- Teacher assignment-based access to score entry
- Bulk score entry for assigned class/subject
- Score validation and missing-score detection
- Automatic totals, percentages and A1–F9 grading
- Result aggregation across all subjects
- Result generation, review, approval and publication workflow
- Report-card generation and printing/export
- Assignments and submissions
- Learning materials
- Timetable with conflict detection
- Teacher academic workspace
- Principal academic oversight

## Phase 4 — Analytics & EduFlow AI
Goal: turn school data into actionable intelligence.

- School performance analytics
- Class performance analytics
- Individual student performance analytics for staff use
- Teacher workload/performance analytics
- Attendance analytics
- Finance analytics
- Academic trends and comparisons
- Weak-subject and intervention detection
- AI academic insights using real school data
- AI teacher assistant
- AI question/explanation generator
- AI study-plan generation
- AI report assistant
- AI usage controls, quotas and safety controls

## Phase 5 — SaaS, Scale & Production Readiness
Goal: make EduFlow AI commercially deployable across many schools.

- Super-admin platform dashboard
- Subscription plans and school subscriptions
- Usage metering and plan limits
- School onboarding at scale
- Feature flags and school-level configuration
- Billing architecture
- Advanced audit/security controls
- Performance optimization and database indexes
- Backups/recovery readiness
- Error monitoring and operational diagnostics
- Mobile/responsive hardening
- End-to-end testing and regression coverage
- Production deployment and release workflow
- Documentation and administrator onboarding

## Build rule
GitHub `main` is the source of truth. Each phase is implemented as real code and database migrations, tested, and verified before moving to the next phase. Do not treat a phase as complete until its acceptance criteria work in the application.
