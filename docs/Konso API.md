# Konso API

This reference describes the current Express API. The detailed route guide and Postman workflow are in [API_TESTING.md](API_TESTING.md) and [POSTMAN_GUIDE.md](POSTMAN_GUIDE.md).

## Conventions

- Bearer JWT authentication is required except registration and login.
- Platform roles: `USER`, `VERIFIER`, `ADMIN`. Organisation roles: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`.
- Organisation-scoped calls select a membership with `x-organisation-id` unless the organisation ID is in the route.
- JSON request bodies are limited to 10 KB. Errors use `{ "error": "message" }`; validation errors include `details`.
- IDs are UUIDs and timestamps are ISO 8601.

## Authentication

`POST /api/auth/register` and `POST /api/auth/login` accept `{ "email", "password" }`. Both return the user, organisation memberships, a short-lived JWT and a 30-day `refreshToken`. Login returns:

```json
{
  "user": { "id": "<uuid>", "email": "user@example.com", "platformRole": "USER" },
  "memberships": [
    { "role": "OWNER", "organisation": { "id": "<uuid>", "name": "Example Ltd", "status": "PENDING" } }
  ],
  "token": "<jwt>",
  "refreshToken": "<opaque-refresh-token>"
}
```

`POST /api/auth/refresh` accepts `{ "refreshToken": "..." }`, revokes the supplied token, and returns a new JWT and refresh token. `POST /api/auth/logout` accepts the same body and revokes that refresh token. `GET /api/auth/me` returns the current user, including `platformRole`, and their organisation memberships. Failed logins trigger a temporary 15-minute lock after five attempts for the email; auth requests are also limited per IP.

`PATCH /api/auth/me` accepts optional `firstName`, `lastName`, and HTTPS `avatarUrl`. `POST /api/auth/change-password` accepts `{ "currentPassword", "newPassword" }`; new passwords must be at least 12 characters and all refresh sessions are revoked.

## Platform administration

All endpoints require a Bearer token. Organisation oversight, stats, and platform audit require platform `ADMIN` or `VERIFIER`. User management requires `ADMIN`.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/admin/organisations` | Optional `status`, `q`, `limit` (1-100), `cursor` | `{ "organisations": [...], "nextCursor"? }` |
| `GET /api/admin/organisations/:id` | Organisation UUID | `{ "organisation": {...} }` with members, document count, and verification history |
| `GET /api/admin/stats` | None | Organisation/access-request counts by status, user total, document total |
| `GET /api/admin/audit` | Optional `organisationId`, `action`, ISO `from`/`to`, `limit`, `cursor` | `{ "events": [...], "nextCursor"? }` |
| `GET /api/admin/users` | Optional `limit`, `cursor` | `{ "users": [...], "nextCursor"? }` |
| `PATCH /api/admin/users/:id/role` | `{ "role": "USER" | "VERIFIER" | "ADMIN" }` | `{ "user": { "id", "email", "platformRole" } }` |

Role changes are audited. Administrators cannot change their own role or demote the last platform administrator.

## Organisation membership

`GET /api/organisations/:organisationId/members` lists `{ userId, email, role, joinedAt }`. `PATCH /api/organisations/:organisationId/members/:userId` accepts `{ "role": "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" }`; only an owner can assign owner/admin roles. `DELETE` on the same path removes the member. The final owner cannot be demoted or removed. Member changes write audit events.

`GET /api/organisations/verified` lists verified organisations by ID and name. `GET /api/organisations/:organisationId/documents/catalog` lists metadata for discoverable documents from a verified organisation. Owners can update organisation `name`, `registrationNumber`, and `type` with `PATCH /api/organisations/:organisationId`; types are `BUSINESS`, `SCHOOL`, `HOSPITAL`, `FINANCIAL`, and `GOVERNMENT`. Rejected organisations can be returned to `PENDING` with `POST /api/organisations/:organisationId/verification/resubmit`.

Owners/admins can create a seven-day invitation with `POST /api/organisations/:organisationId/invitations` and `{ "email", "role" }`. The response contains a bearer invitation token; after registering with that email, the invited user accepts with `POST /api/invitations/:token/accept` and a Bearer JWT. The API does not send invitation email; deliver the returned token through a trusted email provider.

## Document access additions

`GET /api/documents/shared` lists active shared documents for the selected organisation, including `expiresAt`. `DELETE /api/documents/access-requests/:requestId` cancels a pending request for that selected organisation and writes an audit event. `GET /api/documents/access-requests` includes `grant`, which is `null` or contains `status` (`ACTIVE`, `REVOKED`, `EXPIRED`), `revokedAt`, and `expiresAt`. Document list and access-request list accept `limit`, `cursor`, `q`, and `sort=asc|desc`. `DELETE /api/documents/:documentId` soft-deletes a document and revokes its grants.

Uploads can set `x-document-title`, `x-document-category` (`HR`, `EDUCATION`, `BUSINESS`, `HEALTHCARE`, `FINANCE`, `OTHER`), `x-document-department`, `x-document-description`, comma-separated `x-document-tags`, and `x-document-discoverable: true|false`. `GET /api/documents/:documentId/content?disposition=inline` supports previews; the default is attachment and non-ASCII names use RFC 5987 `filename*` encoding. Percent-encoded upload filenames are decoded before storage.

`GET /api/dashboard/summary` requires `x-organisation-id` and returns document totals, incoming/outgoing request counts, active grants, and the ten newest audit events. `GET /api/audit` accepts `limit`, `cursor`, `action`, `from`, `to`, and `sort` filters.

## Verification

`PATCH /api/organisations/:organisationId/verification` accepts `status` (`VERIFIED` or `REJECTED`), optional `note`, and optional `reasonCode`. The audit record captures the note, reason code, and previous status.

## Notifications

`GET /api/notifications?limit=50&cursor=<uuid>&unreadOnly=true` returns the authenticated user's notifications and optional `nextCursor`. `PATCH /api/notifications/read` accepts `{ "ids": ["<notification UUID>"] }` and marks only that user's notifications as read. Notifications are created for new access requests, decisions, verification results, and grants expiring in seven days.

Both routes require a Bearer JWT. Mark-read validates 1-100 UUIDs and returns `{ "updated": 1 }`. Errors include `401` for missing/invalid auth and `400` for invalid notification IDs.

## Webhooks

Organisation owners/admins can manage hooks at `/api/organisations/:organisationId/webhooks`. `POST` accepts `{ "url": "https://example.com/hook", "events": ["ACCESS_REQUEST_CREATED"] }` and returns `{ "webhook", "secret" }`; the secret is shown only once. `GET` returns `{ "webhooks": [...] }` without secrets. `DELETE /api/organisations/:organisationId/webhooks/:webhookId` removes a hook. Supported event values are `ACCESS_REQUEST_CREATED`, `ACCESS_REQUEST_DECIDED`, and `ORGANISATION_VERIFICATION_UPDATED`.

All webhook-management routes require a Bearer JWT; `organisationId` is a UUID in the path, so `x-organisation-id` is not needed. Create accepts an HTTPS URL and one or more supported event names. Example response:

```json
{
  "webhook": { "id": "<uuid>", "organisationId": "<uuid>", "url": "https://example.com/hook", "events": ["ACCESS_REQUEST_CREATED"], "active": true, "createdAt": "<ISO-8601>" },
  "secret": "<shown once>"
}
```

Errors include `400` for invalid URLs/events, `401` for missing/invalid auth, `403` when the caller is not an organisation owner/admin, and `404` when deleting an unknown webhook.

Webhook requests include `X-Konso-Event` and `X-Konso-Signature: sha256=<hex>`. Verify the HMAC-SHA256 signature against the exact raw request body using the secret. Delivery uses HTTPS and a five-second timeout; failed deliveries are not currently retried.

## Password reset and email

Authentication does not send SMTP mail or email verification codes. Password changes require the authenticated current password through `POST /api/auth/change-password`. Forgot/reset-password endpoints are not available because a secure reset flow requires a trusted token delivery channel.
