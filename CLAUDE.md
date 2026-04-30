# CLAUDE.md — job-tracker-backend

This file is the source of truth for how this project is structured, what
conventions to follow, and how to work in it. Read this before making any
changes.

---

## Project Overview

A NestJS REST API for a Job Application Management System. Users can track
job applications through a status pipeline, manage resumes, and view activity
history. Built as one half of a two-repo full-stack project (the other being
job-tracker-frontend in React).

---

## Tech Stack

| Layer          | Technology                                      |
|----------------|-------------------------------------------------|
| Framework      | NestJS (strict TypeScript)                      |
| ORM            | Prisma                                          |
| Database       | PostgreSQL 16                                   |
| Auth           | Passport.js — JWT + Google OAuth2               |
| File uploads   | Multer + file-type (magic-byte validation)      |
| Validation     | class-validator + class-transformer             |
| API Docs       | Swagger (@nestjs/swagger)                       |
| Rate Limiting  | @nestjs/throttler                               |
| Testing        | Jest + Supertest                                |
| Local dev DB   | Docker Compose                                  |

---

## Project Structure

```
src/
├── app.module.ts
├── main.ts
├── prisma/
│   ├── prisma.module.ts       # Global module
│   └── prisma.service.ts      # Extends PrismaClient
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── public.decorator.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts  # Applied globally via APP_GUARD
│   └── interceptors/
│       ├── logging.interceptor.ts
│       └── transform.interceptor.ts
├── auth/
│   ├── auth.module.ts
│   ├── auth.service.ts
│   ├── auth.controller.ts
│   ├── dto/
│   │   ├── register.dto.ts
│   │   ├── login.dto.ts
│   │   └── refresh.dto.ts
│   └── strategies/
│       ├── jwt.strategy.ts
│       └── google.strategy.ts
├── applications/
│   ├── applications.module.ts
│   ├── applications.service.ts
│   ├── applications.controller.ts
│   └── dto/
│       ├── create-application.dto.ts
│       └── update-application.dto.ts
├── resumes/
│   ├── resumes.module.ts
│   ├── resumes.service.ts
│   ├── resumes.controller.ts
│   └── dto/
│       └── create-resume.dto.ts
└── users/
    ├── users.module.ts
    ├── users.service.ts
    ├── users.controller.ts
    └── dto/
        ├── update-user.dto.ts
        └── change-password.dto.ts
prisma/
├── schema.prisma
├── seed.ts
└── migrations/
docker-compose.yml
.env
.env.example
```

---

## Environment Variables

All variables are defined in `.env`. Never hardcode values — always use
`ConfigService` to read them.

```
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://localhost:3000/v1/auth/google/callback
FILE_UPLOAD_PATH=./uploads
MAX_FILE_SIZE_MB=5
PORT=3000
FRONTEND_URL=http://localhost:5173
```

---

## Database

**Running locally:**
```bash
docker compose up -d          # start PostgreSQL container
npx prisma migrate dev        # apply migrations
npx prisma db seed            # seed data
npx prisma studio             # visual DB browser (optional)
```

**Credentials (local dev only):**
- User: `ruhul`
- Password: `secret123`
- Database: `job_tracker_db`
- Port: `5432`

**Prisma models:** User, Application, ActivityLog, Resume, RefreshToken

**ApplicationStatus enum:**
`WISHLIST → APPLIED → PHONE_SCREEN → INTERVIEW → OFFER → REJECTED/WITHDRAWN`

**Valid status transitions (enforced in ApplicationsService):**
```
WISHLIST     → [APPLIED, WITHDRAWN]
APPLIED      → [PHONE_SCREEN, REJECTED, WITHDRAWN]
PHONE_SCREEN → [INTERVIEW, REJECTED, WITHDRAWN]
INTERVIEW    → [OFFER, REJECTED, WITHDRAWN]
OFFER        → [WITHDRAWN]
REJECTED     → []
WITHDRAWN    → []
```

---

## API Conventions

- **Global prefix:** `/v1` — all routes are under `/v1/...`
- **Response envelope:** every response is wrapped by the transform interceptor:
  ```json
  { "data": { ... }, "meta": { ... } }
  ```
- **Error format:** the global exception filter returns:
  ```json
  { "statusCode": 400, "message": "...", "error": "Bad Request" }
  ```
- **Pagination:** list endpoints accept `?page=1&limit=20`
- **Soft deletes:** Applications are soft-deleted via `deletedAt` timestamp.
  All list queries must include `where: { deletedAt: null }`.
- **Ownership:** every service method that fetches a resource by ID must
  verify `userId` matches the authenticated user. Throw `ForbiddenException`
  if not.

---

## Auth Architecture

- **JwtAuthGuard** is applied globally via `APP_GUARD`. All routes are
  protected by default.
- Use `@Public()` decorator to opt a route out of auth (login, register,
  Google OAuth routes).
- Use `@CurrentUser()` param decorator to get the authenticated user in a
  controller method.
- **Access tokens:** 15m expiry, signed with `JWT_SECRET`
- **Refresh tokens:** 7d expiry, stored in DB as SHA-256 hash (never raw),
  rotated on every use.
- **Google OAuth flow:** Google redirects to the backend callback, which
  issues tokens and redirects to:
  `{FRONTEND_URL}/auth/google/callback?accessToken=...&refreshToken=...`

---

## File Uploads

- Handled by Multer.
- **Resumes:** PDF and DOCX only, max 5MB.
  Validate with both Multer `fileFilter` (mimetype) AND `file-type` library
  (magic-byte check on the buffer). Reject if either check fails.
- **Avatars:** images only (jpeg, png, webp), max 2MB.
- Storage path: `FILE_UPLOAD_PATH/{userId}/{filename}`
- The `FILE_UPLOAD_PATH` directory must exist (create it on app startup if
  it doesn't).
- Resume versioning uses a **DB transaction** — never increment version
  outside a transaction.

---

## Code Rules — follow these strictly

### TypeScript
- **No `any` types.** Ever. Use `unknown` and narrow it, or define a proper
  type/interface.
- Enable strict mode — it's already on from `nest new --strict`.
- Use Prisma-generated types for all DB model shapes.
- DTOs must use class-validator decorators — never validate manually.

### NestJS patterns
- Business logic lives in **Services**, not Controllers.
- Controllers only: parse input, call service, return result.
- Guards handle authorization — don't do auth checks inside services.
- Use `ConfigService` for all env vars — never `process.env` directly.
- Use `@ApiTags`, `@ApiOperation`, `@ApiResponse` on every controller and
  route for Swagger.
- Apply `@ApiBearerAuth()` on every protected controller.

### Prisma
- Never call `prisma.$queryRaw` unless there is no other option.
- Always select only the fields you need — avoid `findUnique` that returns
  `passwordHash` when you don't need it.
- For concurrent-safe operations (resume versioning), use `prisma.$transaction`.

### Error handling
- Use NestJS built-in exceptions: `NotFoundException`, `ForbiddenException`,
  `ConflictException`, `UnauthorizedException`, `BadRequestException`.
- Never throw raw `Error` objects from services.
- The global exception filter catches everything — don't add try/catch unless
  you're handling something specific.

### Security
- Never return `passwordHash` in any response. Ever.
- Refresh tokens are stored as SHA-256 hashes — never store raw tokens.
- SMTP passwords (future feature) must be encrypted before storing.
- CORS is configured with `FRONTEND_URL` — do not use `origin: '*'`.

---

## Running the Project

```bash
# Start DB
docker compose up -d

# Install deps
npm install

# Apply migrations
npx prisma migrate dev

# Seed
npx prisma db seed

# Dev server (watch mode)
npm run start:dev

# Production build
npm run build
npm run start:prod

# Tests
npm run test          # unit tests
npm run test:e2e      # e2e tests
npm run test:cov      # coverage report
```

---

## Swagger

Available at: `http://localhost:3000/api/docs`

All endpoints are documented. JWT bearer auth is configured — click
"Authorize" and paste an `accessToken` to test protected routes.

---

## Seeded Data

After running `npx prisma db seed`:
- 1 user: `seed@jobtracker.com` / password: `seed1234`
- 5 applications across different statuses
- 2 resumes (files are mocked — no actual files on disk)
- Activity log entries for each status change

---

## Modules at a Glance

| Module       | Prefix            | Key responsibilities                             |
|--------------|-------------------|--------------------------------------------------|
| AuthModule   | /v1/auth          | Register, login, refresh, logout, Google OAuth   |
| Applications | /v1/applications  | CRUD, status transitions, soft delete, CSV export|
| Resumes      | /v1/resumes       | Upload, versioning, download, delete             |
| Users        | /v1/users         | Profile, password change, avatar upload          |

---

## What is NOT in this project (intentional)

- **Email sending** — removed from scope. Will be added later as a separate
  async feature using BullMQ + Nodemailer.
- **Multi-tenancy** — single user per account, no team/org model.
- **Payments / subscriptions** — not in scope.
