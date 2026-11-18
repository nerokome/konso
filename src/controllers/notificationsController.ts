import type { RequestHandler } from "express";
import * as notifications from "../services/notificationService.js";

export const list: RequestHandler = async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  res.json(await notifications.listNotifications(req.auth!.userId, {
    limit: Number.isInteger(limit) && limit > 0 ? limit : 50,
    cursor: req.query.cursor as string | undefined,
    unreadOnly: req.query.unreadOnly === "true",
  }));
};

export const markRead: RequestHandler = async (req, res) => {
  const { ids } = req.body as { ids: string[] };
  res.json(await notifications.markNotificationsRead(req.auth!.userId, ids));
};
