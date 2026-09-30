/** JSON helpers and same-origin checks for host routes. */

import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

export function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin === undefined || host === undefined) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Electron strips Origin and attaches its host cookie. Defer both trust and
 * authentication to DSH; missing/disposed connection services fail closed. */
export function authorizeDesktopRequest(ctx: { get(name: string): unknown }, request: IncomingMessage): boolean {
  try {
    const connection = ctx.get("connection") as { admit(request: IncomingMessage): unknown } | undefined;
    const admission = connection?.admit(request);
    return typeof admission === "object" && admission !== null && "peer" in admission && !("rejection" in admission);
  } catch { return false; }
}

export async function readJsonBody(request: IncomingMessage, maxBytes = 4096): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export function queryOf(request: IncomingMessage): URLSearchParams {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  return url.searchParams;
}
