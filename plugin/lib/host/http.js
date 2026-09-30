/** JSON helpers and same-origin checks for host routes. */
export function sendJson(response, status, payload) {
    response.writeHead(status, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
    });
    response.end(`${JSON.stringify(payload)}\n`);
}
export function sameOrigin(request) {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin === undefined || host === undefined)
        return false;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}
/** Electron strips Origin and attaches its host cookie. Defer both trust and
 * authentication to DSH; missing/disposed connection services fail closed. */
export function authorizeDesktopRequest(ctx, request) {
    try {
        const connection = ctx.get("connection");
        const admission = connection?.admit(request);
        return typeof admission === "object" && admission !== null && "peer" in admission && !("rejection" in admission);
    }
    catch {
        return false;
    }
}
export async function readJsonBody(request, maxBytes = 4096) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes)
            throw new Error("request body too large");
        chunks.push(buffer);
    }
    if (chunks.length === 0)
        return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function queryOf(request) {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    return url.searchParams;
}
