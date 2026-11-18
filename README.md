# Konso API

Node.js + TypeScript REST API with Express, PostgreSQL, Prisma, and JWT authentication.

## Requirements

- Node.js 20 or newer
- PostgreSQL 15 or newer, installed locally or hosted by a managed database provider

## Run locally

1. Install packages: `npm install`
2. Create a PostgreSQL database and set `DATABASE_URL` in `.env` to its connection URL.
3. Copy `.env.example` to `.env` and set a random `JWT_SECRET` of at least 32 characters. Keep `.env` private and never use example credentials in production.
4. Generate the Prisma client and apply checked-in migrations: `npm run db:generate` then `npm run db:migrate`
5. Start the API: `npm run dev`

`prisma/schema.prisma` is the canonical database schema. To change it during development, edit the schema and run `npm run db:migrate -- --name describe_the_change`; Prisma creates a migration and applies it to the configured PostgreSQL database. For production, apply checked-in migrations with `npm run db:deploy`.

For Render, use a build command that runs `npm install && npm run build && npm run db:deploy` and start with `npm start`. Keep the Render `DATABASE_URL` set to the intended PostgreSQL database; the deploy step applies checked-in migrations, including notification and webhook tables.

See [Notifications and Webhooks Guide](docs/Notifications%20and%20Webhooks%20Guide.md) for endpoint examples, Postman steps, and HMAC signature verification.

## Code structure

- `src/services` contains database and business operations.
- `src/controllers` validates HTTP input and builds responses.
- `src/routes` maps HTTP paths to controllers and permission middleware.
- `prisma/schema.prisma` defines the data model; `prisma/migrations` contains the SQL applied by Prisma Migrate.

Run `npm run dev` to start the TypeScript entry point under Nodemon. Winston logs the database connection, upload storage path, server port, and server errors. Set `LOG_LEVEL` in `.env` to adjust log verbosity.

The API listens on `http://localhost:5000` by default. `GET /health` checks that the process is up; `GET /ready` also checks the database connection.

For endpoint parameters, required roles and headers, and an end-to-end PowerShell test workflow, see [docs/API_TESTING.md](docs/API_TESTING.md).

For Postman headers, body fields, parameters, and an importable request collection, see [docs/POSTMAN_GUIDE.md](docs/POSTMAN_GUIDE.md) and [docs/Konso API.postman_collection.json](docs/Konso%20API.postman_collection.json).

## Routes

- `POST /api/auth/register` with `{ "email": "person@example.com", "password": "at-least-8-chars" }`
- `POST /api/auth/login` with the same body
- `GET /api/auth/me` with `Authorization: Bearer <token>`

All routes below require `Authorization: Bearer <token>`. Organisation-scoped routes also use an `x-organisation-id` header to select the user's organisation membership.

### Organisations and verification

- `POST /api/organisations` — register `{ "name": "Example Ltd", "registrationNumber": "RC123456" }`. The authenticated user becomes `OWNER`; the organisation starts `PENDING`.
- `GET /api/organisations` — list the user's organisations and roles.
- `GET /api/organisations/:organisationId` — view an organisation if you are a member.
- `POST /api/organisations/:organisationId/members` — add a registered user by email with role `ADMIN`, `MEMBER`, or `VIEWER`. Owners can appoint admins; owners and admins can add members/viewers.
- `GET /api/organisations/verification/pending` — list pending applications for platform verifiers/admins.
- `PATCH /api/organisations/:organisationId/verification` — platform verifier/admin sets `{ "status": "VERIFIED" }` or `{ "status": "REJECTED", "note": "..." }`.
- `/api/admin/organisations`, `/api/admin/stats`, and `/api/admin/audit` — platform overview endpoints for administrators and verifiers; `GET /api/admin/users` and `PATCH /api/admin/users/:id/role` are administrator-only.

Platform verifier accounts are provisioned by an operator after registering a user, for example with `UPDATE "User" SET "platformRole" = 'VERIFIER' WHERE email = 'verifier@example.com';`. There is intentionally no public endpoint for granting platform privileges.

The development seed refuses to run in production. To provision or rotate the platform administrator with a trusted database connection, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters) and run `npm run db:admin:provision`. Keep these values out of source control and logs.

`npm run db:production:maintenance` performs a read-only inventory of the specific frontend test accounts and organisations listed in `prisma/productionMaintenance.ts`. Adding `-- --apply` deletes only those exact accounts and organisations (plus linked access data) and rotates `superadmina@example.com` to a generated password printed once in the command output. Run it only with the intended production database URL and store the generated password securely.

Admin, notification, and webhook API integration tests are in `tests/`. Run them only against a disposable migrated database by setting `TEST_DATABASE_URL`, then run `npm test`.

### Documents and access requests

- `POST /api/documents` — upload raw file bytes with `Content-Type: application/octet-stream`, `x-file-name: contract.pdf`, `x-file-content-type: application/pdf`, and `x-organisation-id`. Supported types are PDF, PNG, JPEG, and plain text; uploads are limited to 10 MB. The API records a SHA-256 digest and stores file bytes under `UPLOAD_DIR`.
- `GET /api/documents` — list documents owned by the selected organisation.
- `GET /api/documents/:documentId/content` — download a document if the selected organisation owns it or has an unexpired, unrevoked grant.
- `POST /api/documents/:documentId/access-requests` — request access with `{ "reason": "...", "expiresAt": "2027-01-01T00:00:00.000Z" }`. The requesting organisation is selected by `x-organisation-id`.
- `GET /api/documents/access-requests` — list incoming and outgoing requests for the selected organisation.
- `PATCH /api/documents/access-requests/:requestId/decision` — document owner admins approve or reject with `{ "decision": "APPROVED", "note": "..." }`. Approval creates a grant expiring at the requested time.
- `DELETE /api/documents/:documentId/access/:organisationId` — document owner admins revoke a grant immediately.
- `GET /api/audit?organisationId=<uuid>&limit=100` — list the selected organisation's recent audit events (up to 200).

Organisation membership roles are `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER`. Only verified organisations can upload/request/download. Files are stored on the API host for this prototype; use private object storage and malware scanning before production deployment.

Register and login return a short-lived JWT, a 30-day rotating refresh token, and the user object. Login also returns the user's `platformRole` and `memberships`, including each organisation's `id`, `name`, `status`, and membership `role`. The seeded super admin is represented by `platformRole: "ADMIN"`; `ADMIN` is the platform role used by the API. Passwords are hashed with bcrypt before storage. Keep JWT secrets private, use HTTPS in production, and do not store access tokens in browser local storage for sensitive applications.

## Useful commands

- `npm run typecheck` checks TypeScript
- `npm run build` compiles to `dist/`
- `npm start` starts the compiled API
- `npm run db:studio` opens Prisma Studio
