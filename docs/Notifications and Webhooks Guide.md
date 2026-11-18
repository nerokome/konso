# Notifications and Webhooks Guide

This guide explains how to deploy and use Konso's user notifications and organisation webhooks.

## 1. Deploy the schema

These features require the Notification and OrganisationWebhook database tables. Apply the checked-in migrations to the same PostgreSQL database used by the API:

    npm run db:deploy

For Render, use this build command:

    npm install && npm run build && npm run db:deploy

Use npm start as the start command. Confirm that Render's DATABASE_URL points to the intended database before deploying. The API does not create tables automatically at startup.

## 2. Authentication and organisation selection

Every endpoint below requires a JWT:

    Authorization: Bearer <access-token>

Notification endpoints operate on the authenticated user's notifications and do not take an organisation ID. Webhook endpoints include the organisation UUID in the path and require the caller to be an OWNER or ADMIN member of that organisation. The webhook routes do not need the x-organisation-id header.

## 3. Notifications

### List notifications

    GET /api/notifications?limit=50&unreadOnly=true
    Authorization: Bearer <access-token>

The limit is optional, between 1 and 100. The cursor is an optional UUID copied from the previous response's nextCursor. Set unreadOnly=true to return unread notifications only.

Example response:

    {
      "notifications": [
        {
          "id": "<notification-uuid>",
          "userId": "<user-uuid>",
          "organisationId": "<organisation-uuid>",
          "eventKey": "access-request:<request-uuid>:<user-uuid>",
          "type": "ACCESS_REQUEST_CREATED",
          "title": "New document access request",
          "message": "An organisation requested access to a document.",
          "data": { "requestId": "<request-uuid>", "documentId": "<document-uuid>" },
          "readAt": null,
          "createdAt": "<ISO-8601 timestamp>"
        }
      ],
      "nextCursor": "<notification-uuid>"
    }

nextCursor is omitted when there is no next page. Users can only list their own notifications.

### Mark notifications as read

    PATCH /api/notifications/read
    Authorization: Bearer <access-token>
    Content-Type: application/json

    {
      "ids": ["<notification-uuid>"]
    }

Supply 1-100 notification UUIDs. IDs belonging to another user are ignored. The response contains the number changed:

    { "updated": 1 }

Common errors: 401 for missing/invalid JWT; 400 for invalid query parameters or IDs.

### Notification event types

| Type | Recipients | Trigger |
| --- | --- | --- |
| ACCESS_REQUEST_CREATED | Members of the document owner's organisation | A new access request is submitted |
| ACCESS_REQUEST_DECIDED | The user who submitted the request | The owner approves or rejects it |
| ORGANISATION_VERIFICATION_UPDATED | Members of the organisation | A verifier verifies or rejects it |
| GRANT_EXPIRING | Owner/admin members and the requesting user | A grant is about seven days from expiry |

The grant worker runs at startup and every hour. It marks due grants with expiredAt and creates a reminder for grants in its seven-day reminder window. Notifications are stored in PostgreSQL and remain available after an API restart.

## 4. Webhook management

Supported webhook event names:

- ACCESS_REQUEST_CREATED
- ACCESS_REQUEST_DECIDED
- ORGANISATION_VERIFICATION_UPDATED

### Create a webhook

    POST /api/organisations/<organisation-uuid>/webhooks
    Authorization: Bearer <access-token>
    Content-Type: application/json

    {
      "url": "https://example.com/konso-events",
      "events": ["ACCESS_REQUEST_CREATED", "ACCESS_REQUEST_DECIDED"]
    }

Use a public HTTPS hostname. URLs with embedded credentials, IP-literal hosts, localhost/local names, nonstandard ports, or DNS resolving to non-public addresses are rejected.

The response contains the webhook and a generated secret:

    {
      "webhook": {
        "id": "<webhook-uuid>",
        "organisationId": "<organisation-uuid>",
        "url": "https://example.com/konso-events",
        "events": ["ACCESS_REQUEST_CREATED", "ACCESS_REQUEST_DECIDED"],
        "active": true,
        "createdAt": "<ISO-8601 timestamp>"
      },
      "secret": "<generated-secret>"
    }

Save the secret when you create the webhook. The API encrypts it in the database and never returns it again. Store it in your receiver's secret manager.

### List webhooks

    GET /api/organisations/<organisation-uuid>/webhooks
    Authorization: Bearer <access-token>

Returns an object containing a webhooks array. The secret is omitted.

### Delete a webhook

    DELETE /api/organisations/<organisation-uuid>/webhooks/<webhook-uuid>
    Authorization: Bearer <access-token>

Returns:

    { "status": "deleted" }

Creation and deletion are written to the organisation audit log. Common errors: 400 for invalid URL, event, or UUID; 401 for missing/invalid JWT; 403 when the caller is not an organisation owner/admin; 404 when the webhook is not in that organisation.

## 5. Verify webhook signatures

Webhook deliveries are JSON POST requests with these headers:

    Content-Type: application/json
    X-Konso-Event: ACCESS_REQUEST_CREATED
    X-Konso-Signature: sha256=<hex HMAC>

Payload envelope:

    {
      "id": "<delivery-id>",
      "type": "ACCESS_REQUEST_CREATED",
      "createdAt": "<ISO-8601 timestamp>",
      "data": {
        "requestId": "<request-uuid>",
        "documentId": "<document-uuid>",
        "requesterOrganisationId": "<organisation-uuid>"
      }
    }

Compute HMAC-SHA256 using the webhook secret and the exact raw request-body bytes. Compare the resulting lowercase hexadecimal digest with the value after sha256= using a constant-time comparison. Do not parse and re-serialize JSON before computing the digest.

Event-specific data:

- ACCESS_REQUEST_DECIDED: requestId, decision, requesterOrganisationId.
- ORGANISATION_VERIFICATION_UPDATED: organisationId, status, reasonCode.

The API sends webhook requests asynchronously with a five-second timeout. Failed attempts are logged but are not retried automatically. Receivers should return a 2xx response promptly and queue longer processing.

Example Node.js verification code:

    import { createHmac, timingSafeEqual } from "node:crypto";

    function verifyKonsoSignature(rawBody, signatureHeader, secret) {
      if (!signatureHeader?.startsWith("sha256=")) return false;
      const received = Buffer.from(signatureHeader.slice(7), "hex");
      const expected = createHmac("sha256", secret).update(rawBody).digest();
      return received.length === expected.length && timingSafeEqual(received, expected);
    }

Configure your HTTP framework to expose the raw body bytes. Do not log the secret or sensitive event payloads.

## 6. Postman

Import Konso API.postman_collection.json and use the 5. Notifications and Webhooks folder. Set baseUrl, ownerToken, and ownerOrganisationId. The create request returns the secret in its response; the collection intentionally does not save it.

## 7. Troubleshooting

- 401: obtain a fresh token and send it as a Bearer token.
- 403 on webhook routes: confirm the caller is an OWNER or ADMIN member of the organisation in the URL.
- 400 when creating a webhook: use public HTTPS and supported event names.
- Missing-table errors: apply migrations using npm run db:deploy against the API's database, then restart/redeploy.
- No webhook delivery: confirm the subscription includes the event, DNS resolves publicly, the receiver returns 2xx, and inspect Render logs. The sender does not retry failures.
- Signature failures after changing JWT_SECRET: webhook encryption derives from JWT_SECRET. Recreate webhooks after rotating that setting.

The API does not send SMTP email or email verification codes. Password reset by email is not included; password changes use the authenticated POST /api/auth/change-password endpoint.
