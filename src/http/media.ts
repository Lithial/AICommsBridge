import { Router } from "express";
import { join } from "node:path";
import { existsSync } from "node:fs";

export function mediaRouter(mediaDir: string): Router {
  const r = Router();
  r.get("/:id", (req, res) => {
    const id = req.params.id;
    if (id.includes("/") || id.includes("\\") || id.includes("..")) { res.status(400).end(); return; }
    const file = join(mediaDir, id);
    if (!existsSync(file)) { res.status(404).end(); return; }
    res.sendFile(file);
  });
  return r;
}
