import type { RequestHandler } from "express";
import { acceptInvitation } from "../services/invitationService.js";

export const accept: RequestHandler = async (req, res) => {
  const membership = await acceptInvitation(req.params.token!, req.auth!.userId);
  res.json({ membership });
};
