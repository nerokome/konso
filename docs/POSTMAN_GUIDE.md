# Konso API — Postman documentation

This document describes the running API as implemented in `src/`. It includes setup, auth, access rules, every route, example requests and response shapes, and the end-to-end document sharing flow.

Import [`Konso API.postman_collection.json`](Konso%20API.postman_collection.json) into Postman for ready-made requests. It currently automates token and ID capture for the principal workflow. Set `baseUrl` to your API host; the default is `http://localhost:5000`.

## 1. Start the API

Requirements: Node.js 20+ and PostgreSQL 15+.

Configure `.env` (do not commit real secrets):

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/konso?schema=public"
JWT_SECRET="replace-with-a-random-secret-at-least-32-characters-long"
JWT_EXPIRES_IN="15m"
PORT=5000
CORS_ORIGIN="http://localhost:3000"
UPLOAD_DIR="./src/resources/static/assets/uploads"
```

`JWT_EXPIRES_IN` accepts `5m`, `15m`, `30m`, `1h`, or `2h`. `DATABASE_URL`, a 32-character minimum `JWT_SECRET`, and a valid CORS origin are required at startup. Then run:

```sh
npm install
npm run db:generate
npm run db:migrate
npm run db:seed   # optional local platform admin for verification
npm run dev
```

The local seed account is `superadmina@example.com` / `12345678`. The seed upserts it as platform `ADMIN`; use it only for local development and change/remove it before exposing an environment. The API connects to PostgreSQL and prepares `UPLOAD_DIR` before listening.

Check `GET {{baseUrl}}/health` for process health and `GET {{baseUrl}}/ready` for database readiness. The former returns `200 {"status":"ok"}`; readiness returns `200 {"status":"ready"}` or `503 {"status":"unavailable"}`.

## 2. Postman setup and request conventions

Create a Postman environment or collection variables:

| Variable | Example | Purpose |
| --- | --- | --- |
| `baseUrl` | `http://localhost:5000` | API origin, no trailing slash |
| `ownerEmail`, `ownerPassword` | `owner@example.com`, `OwnerPass123` | Document owner test account |
| `requesterEmail`, `requesterPassword` | `requester@example.com`, `RequesterPass123` | Requesting organisation test account |
| `ownerToken`, `requesterToken`, `adminToken` | *(empty)* | JWTs from login/register |
| `ownerOrganisationId`, `requesterOrganisationId` | *(empty)* | Organisation UUIDs |
| `documentId`, `accessRequestId` | *(empty)* | IDs captured during workflow |

For JSON send `Content-Type: application/json`. Protected endpoints use `Authorization: Bearer {{token}}`. In Postman select **Authorization → Bearer Token** and set the token value. Organisation-scoped endpoints need `x-organisation-id` unless the organisation ID is already in the route path. That ID selects which membership is checked; a user can belong to multiple organisations.

IDs are UUIDs. JSON request bodies are limited to 10 KB. File upload uses a raw binary body and is limited to 10 MB. Successful JSON responses use the shapes below; timestamps are ISO 8601 and UUIDs are illustrative.

## 3. Roles and workflow

Platform roles: `USER`, `VERIFIER`, `ADMIN`. New registrations always get `USER`; public API routes cannot grant platform privileges. Only `VERIFIER` and `ADMIN` can list pending organisations or update verification.

Organisation roles: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`. The organisation creator is `OWNER`. All members can read organisation/document/access-request/audit data. `OWNER`, `ADMIN`, and `MEMBER` can upload and request access. Only `OWNER`/`ADMIN` can decide requests or revoke access. Only an `OWNER` can appoint an organisation `ADMIN`; `OWNER` and `ADMIN` may add `MEMBER` or `VIEWER`.

Organisations start `PENDING`. Upload, access request, and download operations require the selected organisation to be `VERIFIED`. A requester organisation must differ from the document owner. An approved grant allows download until the requested expiry or revocation.

Typical Postman run:

1. Health → readiness.
2. Register owner and requester users, or log in if already registered.
3. Create an organisation for each user.
4. Log in as seeded platform admin and verify both organisations.
5. Upload as owner, then list documents to get `documentId`.
6. Request access as requester; list access requests; approve as owner.
7. Download as requester, review audit events, then revoke as owner.

## 4. Endpoints

### Health

#### `GET /health`

No auth, headers, or body.

```json
{ "status": "ok" }
```

#### `GET /ready`

No auth, headers, or body. Checks PostgreSQL connectivity.

```json
{ "status": "ready" }
```

Unavailable response: HTTP `503` with `{ "status": "unavailable" }`.

### Authentication

#### `POST /api/auth/register`

No auth. JSON body; email must be valid and password 8–72 characters.

```json
{ "email": "owner@example.com", "password": "OwnerPass123" }
```

Success `201`:

```json
{
  "user": { "id": "<user-uuid>", "email": "owner@example.com" },
  "token": "<jwt>"
}
```

The password is bcrypt hashed. Duplicate email returns `409`.

#### `POST /api/auth/login`

No auth. Same JSON fields. Success `200` returns the same `{ "user", "token" }` shape as registration. Invalid credentials return `401 { "error": "Invalid email or password" }`.

#### `GET /api/auth/me`

Bearer JWT required; no body. Success `200`:

```json
{
  "user": { "id": "<user-uuid>", "email": "owner@example.com", "createdAt": "2026-11-11T10:00:00.000Z" },
  "memberships": [
    { "role": "OWNER", "organisation": { "id": "<organisation-uuid>", "name": "Example Ltd", "status": "PENDING" } }
  ]
}
```

### Organisations

All organisation endpoints require a Bearer JWT.

#### `POST /api/organisations`

Create an organisation for the authenticated user. JSON fields: `name` (2–160 chars, required), `registrationNumber` (string up to 100 chars, optional and unique).

```json
{ "name": "Example Ltd", "registrationNumber": "RC123456" }
```

Success `201`:

```json
{
  "organisation": {
    "id": "<organisation-uuid>", "name": "Example Ltd", "registrationNumber": "RC123456",
    "status": "PENDING", "verificationNote": null, "verifiedAt": null, "verifiedById": null,
    "createdAt": "2026-11-11T10:00:00.000Z", "updatedAt": "2026-11-11T10:00:00.000Z"
  }
}
```

The creator is assigned `OWNER`. Duplicate registration number returns `409`.

#### `GET /api/organisations`

Lists organisations the user belongs to. No body or organisation header. Success `200`:

```json
{ "organisations": [{ "id": "<organisation-uuid>", "name": "Example Ltd", "status": "PENDING", "role": "OWNER" }] }
```

Each item contains organisation fields plus the caller's `role`.

#### `GET /api/organisations/:organisationId`

Any organisation member. Replace `:organisationId` with UUID; no body. Success `200`:

```json
{ "organisation": { "id": "<organisation-uuid>", "name": "Example Ltd", "status": "VERIFIED" }, "role": "OWNER" }
```

The organisation object includes its full persisted fields. Non-member: `403`; unknown ID: `404`.

#### `POST /api/organisations/:organisationId/members`

Requires `OWNER` or `ADMIN` membership for the path organisation. The target user must already have registered. `role` accepts `ADMIN`, `MEMBER`, or `VIEWER`.

```json
{ "email": "colleague@example.com", "role": "MEMBER" }
```

Success `201`:

```json
{ "membership": { "id": "<membership-uuid>", "userId": "<user-uuid>", "organisationId": "<organisation-uuid>", "role": "MEMBER", "createdAt": "2026-11-11T10:00:00.000Z" } }
```

An `ADMIN` can add `MEMBER` or `VIEWER`, but only an `OWNER` can appoint an `ADMIN`. Unknown user: `404`; duplicate membership: `409`.

#### `GET /api/organisations/verification/pending`

Requires platform `ADMIN` or `VERIFIER`; no body or organisation header. Returns pending applications, oldest first:

```json
{ "organisations": [{ "id": "<organisation-uuid>", "name": "Example Ltd", "status": "PENDING" }] }
```

Each object includes persisted organisation fields.

#### `PATCH /api/organisations/:organisationId/verification`

Requires platform `ADMIN` or `VERIFIER`; path organisation UUID. Status is `VERIFIED` or `REJECTED`; optional `note` up to 1000 chars.

```json
{ "status": "REJECTED", "note": "Please provide current registration documents" }
```

Or to verify:

```json
{ "status": "VERIFIED" }
```

Success `200`: `{ "organisation": { ...organisationFields } }`. Verification records the verifier and timestamp; rejecting clears `verifiedAt`. Platform role denial returns `403`.

### Documents and sharing

All document endpoints require a Bearer JWT. The caller must be a member of the organisation selected by `x-organisation-id`, except decision/revocation routes, which infer the owning organisation from the request/document record.

#### `POST /api/documents`

Requires selected organisation `OWNER`, `ADMIN`, or `MEMBER`, and that organisation must be verified. In Postman choose **Body → binary → Select File**.

Headers:

| Header | Value |
| --- | --- |
| `Authorization` | `Bearer {{ownerToken}}` |
| `x-organisation-id` | `{{ownerOrganisationId}}` |
| `Content-Type` | `application/octet-stream` |
| `x-file-name` | `contract.pdf` |
| `x-file-content-type` | `application/pdf` |

Allowed `x-file-content-type` values: `application/pdf`, `image/png`, `image/jpeg`, `text/plain`. The raw body must contain non-empty bytes; max size 10 MB. Success `201`:

```json
{
  "document": {
    "id": "<document-uuid>", "organisationId": "<organisation-uuid>",
    "originalName": "contract.pdf", "mimeType": "application/pdf", "sizeBytes": 52341,
    "sha256": "<64-character-hex-digest>", "createdAt": "2026-11-11T10:00:00.000Z"
  }
}
```

The file is stored under `UPLOAD_DIR`; only metadata and a SHA-256 digest are returned.

#### `GET /api/documents`

Requires any membership in selected `x-organisation-id`; no body. Returns that organisation's documents newest first:

```json
{ "documents": [{ "id": "<document-uuid>", "originalName": "contract.pdf", "mimeType": "application/pdf", "sizeBytes": 52341, "createdAt": "2026-11-11T10:00:00.000Z" }] }
```

#### `GET /api/documents/:documentId/content`

Requires membership in selected `x-organisation-id`; the selected organisation must be verified. Owner organisation can download directly. Other organisations need an active unexpired, unrevoked grant. No body. Success returns the file bytes (not JSON), with the stored MIME type and `Content-Disposition: attachment` filename. In Postman use **Save Response → Save to a file** to persist it. Missing document: `404`; no active grant: `403`.

#### `POST /api/documents/:documentId/access-requests`

Requires selected requester organisation `OWNER`, `ADMIN`, or `MEMBER`; requester and document owner organisations must be verified. Body fields: `reason` (5–1000 chars), `expiresAt` (ISO 8601 future timestamp within 365 days).

```json
{ "reason": "Review the supplier agreement", "expiresAt": "2027-01-01T12:00:00.000Z" }
```

Success `201`:

```json
{
  "request": {
    "id": "<request-uuid>", "documentId": "<document-uuid>",
    "requesterOrganisationId": "<requester-organisation-uuid>", "requesterUserId": "<user-uuid>",
    "status": "PENDING", "reason": "Review the supplier agreement",
    "requestedExpiresAt": "2027-01-01T12:00:00.000Z", "decidedAt": null,
    "decidedById": null, "decisionNote": null,
    "createdAt": "2026-11-11T10:00:00.000Z", "updatedAt": "2026-11-11T10:00:00.000Z"
  }
}
```

Cannot request access to your own organisation's document. Existing active access or a pending request returns `409`.

#### `GET /api/documents/access-requests`

Requires any membership in selected `x-organisation-id`; no body. Returns both requests made by that organisation and requests on its owned documents, newest first:

```json
{
  "requests": [{
    "id": "<request-uuid>", "status": "PENDING", "reason": "Review the supplier agreement",
    "requestedExpiresAt": "2027-01-01T12:00:00.000Z",
    "document": { "id": "<document-uuid>", "originalName": "contract.pdf", "organisationId": "<owner-organisation-uuid>" },
    "requesterOrganisation": { "id": "<requester-organisation-uuid>", "name": "Requester Ltd" }
  }]
}
```

Each request includes its persisted fields, plus the selected document and requester organisation fields shown.

#### `PATCH /api/documents/access-requests/:requestId/decision`

Requires `OWNER` or `ADMIN` membership in the document owner organisation. No organisation header required. Body:

```json
{ "decision": "APPROVED", "note": "Approved for review" }
```

`decision` is `APPROVED` or `REJECTED`; optional `note` up to 1000 chars. Success `200`:

```json
{ "request": { "id": "<request-uuid>", "status": "APPROVED", "decidedAt": "2026-11-11T10:00:00.000Z", "decidedById": "<user-uuid>", "decisionNote": "Approved for review" } }
```

Response includes all persisted request fields. Approval creates or reactivates a grant until `requestedExpiresAt`. Already decided request: `409`; non-owner admin: `403`.

#### `DELETE /api/documents/:documentId/access/:organisationId`

Requires `OWNER` or `ADMIN` membership in the document's owning organisation. `:organisationId` is the recipient organisation UUID. No body or organisation header.

Success `200`:

```json
{ "status": "revoked" }
```

Subsequent recipient downloads return `403`. Missing/expired/already revoked grant: `404`.

### Audit

#### `GET /api/audit?limit=100`

Requires Bearer JWT and membership in selected organisation. Set `x-organisation-id: {{ownerOrganisationId}}`; alternatively `organisationId` query parameter may select the organisation. `limit` is optional integer 1–200, default 100. No body. Returns newest first:

```json
{
  "events": [{
    "id": "<audit-uuid>", "organisationId": "<organisation-uuid>",
    "documentId": "<document-uuid>", "action": "DOCUMENT_UPLOADED",
    "details": null, "createdAt": "2026-11-11T10:00:00.000Z",
    "actor": { "id": "<user-uuid>", "email": "owner@example.com" },
    "document": { "id": "<document-uuid>", "originalName": "contract.pdf" }
  }]
}
```

Recorded actions include `ORGANISATION_REGISTERED`, `ORGANISATION_VERIFIED`, `ORGANISATION_REJECTED`, `MEMBER_ADDED`, `DOCUMENT_UPLOADED`, `DOCUMENT_DOWNLOADED`, `ACCESS_REQUESTED`, `ACCESS_REQUEST_APPROVED`, `ACCESS_REQUEST_REJECTED`, and `DOCUMENT_ACCESS_REVOKED`.

## 5. Error responses

Application errors return JSON `{ "error": "message" }`. Validation errors include details:

```json
{
  "error": "Request validation failed",
  "details": [{ "type": "field", "msg": "A valid email is required", "path": "email", "location": "body" }]
}
```

| HTTP | Meaning / common cause |
| --- | --- |
| `400` | Invalid JSON, field validation, missing organisation ID, unsupported/empty file metadata or invalid expiry |
| `401` | Missing, invalid, or expired Bearer token; invalid login credentials |
| `403` | Missing role/membership, unverified organisation, or no active download grant |
| `404` | Unknown user/organisation/document/request or active grant not found |
| `409` | Duplicate email/registration number/membership, active grant or pending request exists, or request already decided |
| `413` | Request body exceeds configured 10 MB upload limit (JSON parsing has a 10 KB limit) |
| `500` | Unexpected server failure; details are logged server-side |
| `503` | Database is unavailable on `/ready` |

## 6. Data and runtime behavior

PostgreSQL is accessed through Prisma. Core records are `User`, `Organisation`, `Membership`, `Document`, `AccessRequest`, `DocumentAccess`, and `AuditLog`. User passwords are bcrypt hashes; JWTs carry the user ID as their subject and expire according to `JWT_EXPIRES_IN`. Upload files are stored on the API host using generated storage keys; the API stores filename, MIME type, size, SHA-256 and organisation/uploader references.

Express applies Helmet, configured CORS, request logging, and JSON parsing before mounting health, auth, organisation, document, and audit routes. Unknown routes return `404`. Errors are normalized to JSON. Prisma unique/foreign-key conflicts map to `409`, missing records to `404`, and invalid IDs to `400`.

## 7. Troubleshooting

- `401`: send the right Bearer token and log in again when it expires.
- `403`: check `x-organisation-id`, membership role, organisation verification, and the document grant.
- `400`: check JSON spelling/case, UUIDs, required upload headers, raw binary body, and ISO 8601 expiry.
- `409`: change a duplicate email/registration number or reuse the existing request/membership.
- `/ready` is `503` or startup fails: confirm PostgreSQL is running and `DATABASE_URL` points to the intended database; check server logs.
- Seed login fails: run `npm run db:seed` against the same database used by the API.
- If registering again returns conflict, use the corresponding Login request in the collection.

The collection's prepared upload request needs a local file selected in **Body → binary**. Its captured IDs and tokens live in collection variables; reset or update them when changing test accounts or databases.
