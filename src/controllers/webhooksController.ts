import type { RequestHandler } from "express";
import { assertWebhookManager, createWebhook, deleteWebhook, listWebhooks } from "../services/webhookService.js";

export const list: RequestHandler = async (req, res) => {
  await assertWebhookManager(req.params.organisationId!, req.auth!.userId);
  res.json({ webhooks: await listWebhooks(req.params.organisationId!) });
};

export const create: RequestHandler = async (req, res) => {
  await assertWebhookManager(req.params.organisationId!, req.auth!.userId);
  const { url, events } = req.body as { url: string; events: string[] };
  res.status(201).json(await createWebhook({ organisationId: req.params.organisationId!, actorId: req.auth!.userId, url, events }));
};

export const remove: RequestHandler = async (req, res) => {
  await assertWebhookManager(req.params.organisationId!, req.auth!.userId);
  await deleteWebhook({ organisationId: req.params.organisationId!, webhookId: req.params.webhookId!, actorId: req.auth!.userId });
  res.json({ status: "deleted" });
};
