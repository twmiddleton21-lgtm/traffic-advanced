import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleRequest } from "../src/index.ts";
import { fileStore } from "./file-store.ts";

/**
 * Serves /api/* in `vite dev` and `vite preview` through the same Worker handler that runs in production, reading snapshots
 * published locally by `npm run api:publish` (data/published). Nothing is generated or faked here: with nothing published the API
 * answers 503, exactly as the Worker would.
 */
function toFetchRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
  return new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`), { method: req.method ?? "GET", headers });
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function localApi(): Plugin {
  const env = { SNAPSHOTS: fileStore() };
  const middleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    if (!req.url?.startsWith("/api/")) return next();
    Promise.resolve()
      .then(() => handleRequest(toFetchRequest(req), env))
      .then((response) => send(res, response))
      .catch(next);
  };
  return {
    name: "traffic-advanced-local-api",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}
