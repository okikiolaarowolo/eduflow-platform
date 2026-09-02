# EduFlow Platform

Build the actual application for EduFlow AI.

Do NOT give me a specification or documentation instead of implementation. Do NOT just explain what should be built.

Implement the features directly in the Lovable project.

EDUFLOW AI

EduFlow AI is a modern, multi-school SaaS platform for secondary schools.

Tagline:

Smarter Schools. Better Learning.

The platform combines school management with AI-powered learning.

The first reference/test school is Alliance High School, but the application MUST NOT be hard-coded for Alliance High School.

The architecture must support multiple independent schools.

PHASE 1 — FOUNDATION

For this first phase, focus on building a strong working foundation.

Implement:

Modern landing page

Authentication

Multi-school architecture

User roles and permissions

School onboarding

School settings

Database structure

Admin dashboard

Student management

Teacher management

Class management

Subject management

Do NOT build the advanced AI features yet. We will add them after the foundation works correctly.

1. TECHNOLOGY

Use a production-quality modern web stack supported by Lovable.

Prefer:

React

TypeScript

Tailwind CSS

Supabase

PostgreSQL

Secure authentication

Responsive UI

Use Supabase for authentication and database functionality where appropriate.

Create a clean, scalable architecture.

2. LANDING PAGE

Create a professional landing page for EduFlow AI.

Hero:

Smarter Schools. Better Learning.

Supporting text:

"EduFlow AI brings school management, academic analytics, and AI-powered learning into one intelligent platform."

Primary CTA:

Get Started

Secondary CTA:

Request Demo

Include sections for:

School Management

Explain that administrators can manage students, teachers, classes, subjects, attendance, and academic records.

AI-Powered Learning

Explain that students will eventually have an AI tutor that helps them understand concepts, practice questions, identify weak areas, and create study plans.

Academic Analytics

Explain how schools can monitor student and class performance.

Teacher Tools

Explain how teachers can manage classes, assignments, results, and learning materials.

How It Works

Create your school

Configure your academic system

Add teachers and students

Start managing your school

Call To Action

"Bring smarter learning to your school."

Make the landing page visually impressive and suitable for a real commercial SaaS product.

3. AUTHENTICATION

Implement real authentication.

Users should be able to:

Sign up

Log in

Log out

Reset password

Access protected dashboards

Do not use fake authentication.

Users should have roles.

Roles:

SUPER_ADMIN

SCHOOL_ADMIN

PRINCIPAL

TEACHER

STUDENT

PARENT

After login, redirect users to the correct dashboard based on their role.

4. MULTI-SCHOOL ARCHITECTURE

This is one of the most important requirements.

EduFlow AI is a multi-tenant SaaS.

Each school is an independent tenant.

Example:

School A:
Alliance High School

School B:
Example Secondary School

School A must only see School A's data.

School B must only see School B's data.

A student, teacher, class, result, attendance record, or other school data must never leak between schools.

Every school-owned record must be associated with its school.

Implement proper database relationships and security policies to enforce this.

Do NOT rely only on hiding data in the UI.

Use database-level security where supported, including Supabase Row Level Security.

5. SCHOOL ONBOARDING

Create a new-school onboarding flow.

When a school administrator registers:

Step 1

Enter:

School name

School email

Phone

Address

Website

Logo

Step 2

Create academic session.

Example:

2026/2027

Step 3

Create terms.

Example:

First Term
Second Term
Third Term

Step 4

Create classes.

Examples:

JSS1
JSS2
JSS3
SS1
SS2
SS3

The classes must be configurable.

Step 5

Create subjects.

Examples:

Mathematics
English Language
Physics
Chemistry
Biology
Computer Science

The subjects must also be configurable.

Step 6

Finish onboarding.

Take the administrator to the school dashboard.

Make onboarding visually simple with a progress indicator.

6. SCHOOL ADMIN DASHBOARD

Create a professional dashboard.

Display:

Total students

Total teachers

Total classes

Total subjects

Current academic session

Current term

Recent activity

Include a clean sidebar.

Navigation:

Dashboard
Students
Teachers
Classes
Subjects
Settings

Use cards, tables, icons, and responsive layouts.

Use real database data.

Do not use fake statistics once the database is connected.

7. STUDENT MANAGEMENT

Create a complete student management page.

Admin should be able to:

Add student

Edit student

View student

Archive student

Search students

Filter students

Assign student to class

Student information:

First name

Last name

Student ID

Email where applicable

Phone where applicable

Date of birth

Gender

Class

Admission date

Guardian information

Profile photo

Create a student profile page.

The architecture should allow future features such as:

Results

Attendance

Assignments

AI learning progress

to be attached to the student.

8. TEACHER MANAGEMENT

Create teacher management.

Admin can:

Add teacher

Edit teacher

View teacher

Activate/deactivate teacher

Assign subjects

Assign classes

Teacher information should include:

Name

Email

Phone

Staff ID

Subjects

Classes

Create a teacher profile page.

9. CLASS MANAGEMENT

Create a class management page.

Admin can:

Create class

Edit class

Archive class

View students in class

Assign teachers

Assign subjects

Classes must belong to a school.

Do not hard-code Alliance High School classes.

10. SUBJECT MANAGEMENT

Create subject management.

Admin can:

Create subject

Edit subject

Archive subject

Assign subject to classes

Assign teachers to subjects

Example subjects:

Mathematics
English Language
Physics
Chemistry
Biology
Economics
Government
Geography
Computer Science
Further Mathematics

These are examples only.

Every school should be able to create its own subjects.

11. DATABASE

Create the actual database structure needed for Phase 1.

At minimum include concepts for:

Schools

Users

Students

Teachers

Classes

Subjects

Academic Sessions

Terms

User roles

Class/student relationships

Teacher/class relationships

Teacher/subject relationships

Make proper relationships between tables.

Use timestamps.

Use appropriate indexes and unique constraints.

12. SECURITY

Implement proper security.

Important:

A user must not be able to simply change a school ID in a request and access another school's data.

Use:

Authentication

Authorization

Role checks

School/tenant checks

Supabase Row Level Security

Server-side validation

Protect all school data.

13. UI/UX

Make the interface look like a premium modern SaaS product.

Style:

Clean

Professional

Modern

Minimal

Responsive

Mobile-friendly

Use consistent:

Typography

Spacing

Cards

Buttons

Forms

Tables

Navigation

Icons

Include:

Loading states

Empty states

Error states

Success notifications

Do not make it look like a generic template.

14. RESPONSIVE DESIGN

The application must work on:

Desktop

Laptop

Tablet

Mobile

The sidebar should become mobile-friendly.

Tables should remain usable on small screens.

Forms should work properly on phones.

15. DEMO/TESTING

After implementing Phase 1:

Create a way to test the application.

Use Alliance High School as DEMO DATA only.

Create example:

School:
Alliance High School

Classes:
SS1A
SS1B
SS2A
SS2B
SS3A

Subjects:
Mathematics
English Language
Physics
Chemistry
Biology

Create a few example students and teachers.

Clearly treat this as seed/demo data rather than hard-coded production data.

16. IMPORTANT IMPLEMENTATION RULES

Actually build the features.

Do not respond with:

"Here is how you could build it."

Instead, implement it in the project.

Do not create fake buttons that do nothing.

Do not create fake dashboards with statistics that are not connected to the database.

Do not use mock authentication.

Do not expose secrets.

Do not hard-code school-specific logic.

Do not skip tenant isolation.

Do not build the AI Tutor yet.

17. WHEN PHASE 1 IS COMPLETE

Before moving to another phase, verify:

Landing page works

Registration works

Login works

Logout works

School onboarding works

Database works

School data is isolated

Role permissions work

Student CRUD works

Teacher CRUD works

Class CRUD works

Subject CRUD works

Admin dashboard displays real data

Mobile UI works

No obvious TypeScript/runtime errors

If something is incomplete, fix it before moving forward.

FINAL INSTRUCTION

BUILD PHASE 1 NOW.

Do not merely describe it.

Implement the actual working EduFlow AI application inside this project.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4dfa5a06-09e5-44de-a2bf-c4ed76ad3669).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
