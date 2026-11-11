# Konso API: testing guide

This guide documents the current Express routes, their parameters, and a local end-to-end test for organisation registration, verification, document sharing, and audit history.

For Postman-specific header/body setup and an importable request collection, see [POSTMAN_GUIDE.md](POSTMAN_GUIDE.md) and [Konso API.postman_collection.json](Konso%20API.postman_collection.json).

## Start the API

Requirements: Node.js 20+, PostgreSQL, and the project dependencies.

Set `.env` with your local PostgreSQL connection and API settings:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/konso?schema=public"
JWT_SECRET="a-random-secret-at-least-32-characters-long"
JWT_EXPIRES_IN="15m"
PORT=5000
CORS_ORIGIN="http://localhost:3000"
UPLOAD_DIR="./src/resources/static/assets/uploads"
```

Then install dependencies, generate Prisma Client, apply migrations, optionally seed the local administrator, and start the API:

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The seed account is `superadmina@example.com` with password `12345678`. The seed upserts this account, assigns platform role `ADMIN`, and stores a bcrypt hash. Use it for local development only and replace its password before exposing an environment.

The API defaults to `http://localhost:5000`. `GET /health` checks process health; `GET /ready` checks PostgreSQL readiness. Startup connects Prisma before opening the HTTP port. Winston writes startup and request logs.

## Request conventions

- JSON routes use `Content-Type: application/json`.
- Protected routes require `Authorization: Bearer <JWT>`, returned by register or login.
- Organisation-scoped routes take `x-organisation-id: <organisation UUID>` unless the path includes `:organisationId`. The user must belong to the selected organisation with a role permitted by that route.
- IDs are UUIDs. Invalid request values return HTTP 400 with an `error` message and `details` array.
- Use PowerShell examples below from the project folder. Substitute returned IDs and tokens where indicated.

## Endpoint reference

### Health

| Method and path | Authentication | Parameters |
| --- | --- | --- |
| `GET /health` | None | None |
| `GET /ready` | None | None |

Success responses: `{ "status": "ok" }` and `{ "status": "ready" }`. Readiness returns HTTP 503 when the database cannot be reached.

### Authentication

| Method and path | Authentication | Body |
| --- | --- | --- |
| `POST /api/auth/register` | None | `email`: valid email; `password`: 8-72 characters |
| `POST /api/auth/login` | None | `email`, `password` |
| `GET /api/auth/me` | Bearer token | None |

Registration creates a normal platform `USER`; it does not grant verifier or admin permissions. Register/login return a user and JWT. `/me` returns user details and organisation memberships.

### Organisations and verification

| Method and path | Required role | Parameters |
| --- | --- | --- |
| `POST /api/organisations` | Authenticated user | JSON: `name` (2-160 characters), optional `registrationNumber` (max 100 characters) |
| `GET /api/organisations` | Authenticated user | None |
| `GET /api/organisations/:organisationId` | Any member | Path `organisationId` UUID |
| `POST /api/organisations/:organisationId/members` | Organisation `OWNER` or `ADMIN` | Path UUID; JSON: registered user's `email`, `role` (`ADMIN`, `MEMBER`, or `VIEWER`) |
| `GET /api/organisations/verification/pending` | Platform `ADMIN` or `VERIFIER` | None |
| `PATCH /api/organisations/:organisationId/verification` | Platform `ADMIN` or `VERIFIER` | Path UUID; JSON: `status` (`VERIFIED` or `REJECTED`), optional `note` (max 1000 characters) |

The creator becomes organisation `OWNER`; new organisations start `PENDING`. Only verified organisations can perform document upload, access requests, or downloads. Only an owner can appoint an organisation admin. Platform roles are assigned outside public registration.

### Documents and controlled access

| Method and path | Required role | Parameters |
| --- | --- | --- |
| `POST /api/documents` | `OWNER`, `ADMIN`, or `MEMBER`; organisation must be verified | Header `x-organisation-id`; raw bytes; headers `x-file-name` and `x-file-content-type` |
| `GET /api/documents` | Any organisation member | Header `x-organisation-id` |
| `GET /api/documents/:documentId/content` | Any organisation member | Header `x-organisation-id`; path `documentId` UUID |
| `POST /api/documents/:documentId/access-requests` | `OWNER`, `ADMIN`, or `MEMBER`; requester organisation verified | Header `x-organisation-id`; path UUID; JSON: `reason` (5-1000 chars), `expiresAt` (ISO 8601 date, future and within 365 days) |
| `GET /api/documents/access-requests` | Any organisation member | Header `x-organisation-id` |
| `PATCH /api/documents/access-requests/:requestId/decision` | `OWNER` or `ADMIN` of document owner organisation | Path `requestId` UUID; JSON: `decision` (`APPROVED` or `REJECTED`), optional `note` (max 1000 chars) |
| `DELETE /api/documents/:documentId/access/:organisationId` | `OWNER` or `ADMIN` of document owner organisation | Path UUIDs: document and recipient organisation |

Upload content type must be `application/octet-stream`; maximum size is 10 MB. `x-file-content-type` must be one of `application/pdf`, `image/png`, `image/jpeg`, or `text/plain`. Files are stored under `UPLOAD_DIR`; document metadata records uploader, owner organisation, byte count, and SHA-256 digest.

An approved request grants access until its requested expiry. Expired and revoked grants do not permit downloads. The document owner's owner/admin can revoke an active grant. An organisation cannot request access to its own document or submit a second pending request for the same document.

### Audit activity

`GET /api/audit?limit=100` requires a Bearer token and organisation membership. Select the organisation using `x-organisation-id` or the supported `organisationId` query parameter. `limit` is optional, integer 1-200; default 100. Events are newest first.

## End-to-end PowerShell test

This workflow creates two users and organisations. Approve both organisations with the seeded admin (or a separately provisioned platform verifier) before testing files.

```powershell
$base = "http://localhost:5000"

$ownerAuth = Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -ContentType "application/json" -Body (@{ email = "owner@example.com"; password = "OwnerPass123" } | ConvertTo-Json)
$requesterAuth = Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -ContentType "application/json" -Body (@{ email = "requester@example.com"; password = "RequesterPass123" } | ConvertTo-Json)
$ownerToken = $ownerAuth.token
$requesterToken = $requesterAuth.token

$ownerOrg = Invoke-RestMethod -Method Post -Uri "$base/api/organisations" -Headers @{ Authorization = "Bearer $ownerToken" } -ContentType "application/json" -Body (@{ name = "Owner Org" } | ConvertTo-Json)
$requesterOrg = Invoke-RestMethod -Method Post -Uri "$base/api/organisations" -Headers @{ Authorization = "Bearer $requesterToken" } -ContentType "application/json" -Body (@{ name = "Requester Org" } | ConvertTo-Json)
$ownerOrgId = $ownerOrg.organisation.id
$requesterOrgId = $requesterOrg.organisation.id

$adminAuth = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{ email = "superadmina@example.com"; password = "12345678" } | ConvertTo-Json)
$adminHeaders = @{ Authorization = "Bearer $($adminAuth.token)" }
Invoke-RestMethod -Method Patch -Uri "$base/api/organisations/$ownerOrgId/verification" -Headers $adminHeaders -ContentType "application/json" -Body (@{ status = "VERIFIED" } | ConvertTo-Json)
Invoke-RestMethod -Method Patch -Uri "$base/api/organisations/$requesterOrgId/verification" -Headers $adminHeaders -ContentType "application/json" -Body (@{ status = "VERIFIED" } | ConvertTo-Json)
```

Put a small `sample.pdf` in the current directory, then upload it and capture its document ID:

```powershell
$ownerHeaders = @{ Authorization = "Bearer $ownerToken"; "x-organisation-id" = $ownerOrgId; "x-file-name" = "sample.pdf"; "x-file-content-type" = "application/pdf" }
Invoke-RestMethod -Method Post -Uri "$base/api/documents" -Headers $ownerHeaders -ContentType "application/octet-stream" -InFile ".\sample.pdf"
$documents = Invoke-RestMethod -Method Get -Uri "$base/api/documents" -Headers $ownerHeaders
$documentId = $documents.documents[0].id
```

Request access from the other organisation, approve it as the owner, download the file, and inspect activity:

```powershell
$requesterHeaders = @{ Authorization = "Bearer $requesterToken"; "x-organisation-id" = $requesterOrgId }
$accessRequest = Invoke-RestMethod -Method Post -Uri "$base/api/documents/$documentId/access-requests" -Headers $requesterHeaders -ContentType "application/json" -Body (@{ reason = "Review the supplier agreement"; expiresAt = (Get-Date).ToUniversalTime().AddDays(7).ToString("o") } | ConvertTo-Json)
$requestId = $accessRequest.request.id

Invoke-RestMethod -Method Patch -Uri "$base/api/documents/access-requests/$requestId/decision" -Headers $ownerHeaders -ContentType "application/json" -Body (@{ decision = "APPROVED"; note = "Approved for review" } | ConvertTo-Json)
Invoke-WebRequest -Method Get -Uri "$base/api/documents/$documentId/content" -Headers $requesterHeaders -OutFile ".\downloaded-sample.pdf"
Invoke-RestMethod -Method Get -Uri "$base/api/audit?limit=50" -Headers $ownerHeaders

# Revocation should make the requester's next download return HTTP 403.
Invoke-RestMethod -Method Delete -Uri "$base/api/documents/$documentId/access/$requesterOrgId" -Headers $ownerHeaders
```

## Common responses

| Status | Typical cause |
| --- | --- |
| `400` | Missing organisation ID, invalid UUID/body/date, or unsupported upload metadata |
| `401` | Missing, expired, or invalid JWT |
| `403` | Role denied, organisation is not verified, or no active document grant |
| `404` | Record or active access grant not found |
| `409` | Duplicate email/registration number/membership, duplicate pending request, or already decided request |
| `413` | Request body exceeds 10 MB |
| `503` | PostgreSQL readiness check failed |

Run `npm run typecheck` to check TypeScript and `npm run db:studio` to inspect local records.
