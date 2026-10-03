import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = join(projectRoot, "web/public");
const port = Number(process.env.WEB_PORT ?? "4173");
const dataOrigin = new URL(process.env.DSH_DATA_ORIGIN ?? "https://www.evaldock.ai");
const localDataRoot = process.env.DSH_LOCAL_DATA_DIR ? resolve(process.env.DSH_LOCAL_DATA_DIR) : null;
if (localDataRoot && !existsSync(join(localDataRoot, "manifest.json"))) {
  throw new Error("DSH_LOCAL_DATA_DIR must contain a published manifest.json");
}

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".woff2", "font/woff2"],
]);

function proxyData(request, response) {
  const upstream = httpsRequest(
    {
      hostname: dataOrigin.hostname,
      port: dataOrigin.port || 443,
      method: request.method === "HEAD" ? "HEAD" : "GET",
      path: request.url,
      headers: {
        accept: request.headers.accept ?? "application/json",
        "user-agent": "dsh-top100-local-preview/1.0",
      },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, {
        "cache-control": upstreamResponse.headers["cache-control"] ?? "no-cache",
        "content-encoding": upstreamResponse.headers["content-encoding"] ?? "identity",
        "content-type": upstreamResponse.headers["content-type"] ?? "application/json",
        vary: upstreamResponse.headers.vary ?? "Accept-Encoding",
      });
      upstreamResponse.pipe(response);
    }
  );
  upstream.on("error", (error) => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Data proxy failed: ${error.message}`);
  });
  upstream.end();
}

function localFileFor(pathname, root = publicRoot) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = normalize(join(root, decodedPath));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname.startsWith("/data/") && !localDataRoot) return proxyData(request, response);
  if (requestUrl.pathname === "/api/events") {
    response.writeHead(204);
    return response.end();
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    return response.end();
  }
  if (requestUrl.pathname.startsWith("/data/") && localDataRoot) {
    const path = localFileFor(requestUrl.pathname.slice("/data".length), localDataRoot);
    if (!path) {
      response.writeHead(404);
      return response.end("Local snapshot asset not found.\n");
    }
    response.writeHead(200, { "cache-control": "no-cache", "content-type": "application/json; charset=utf-8" });
    if (request.method === "HEAD") return response.end();
    return createReadStream(path).pipe(response);
  }

  // Match the public /top100/ mount while keeping /data/ and /api/events at root.
  if (requestUrl.pathname === "/" || requestUrl.pathname === "/top100" ||
      (!requestUrl.pathname.startsWith("/top100/") && localFileFor(requestUrl.pathname))) {
    const suffix = requestUrl.pathname === "/" || requestUrl.pathname === "/top100"
      ? "/" : requestUrl.pathname;
    response.writeHead(308, { location: `/top100${suffix}${requestUrl.search}` });
    return response.end();
  }
  const relativePath = requestUrl.pathname.startsWith("/top100/")
    ? requestUrl.pathname.slice("/top100".length) : null;
  const path = relativePath && localFileFor(relativePath === "/" ? "/index.html" : relativePath);
  if (!path) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return response.end("Not found. This preview serves Top100 at /top100/.\n");
  }
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
  });
  if (request.method === "HEAD") return response.end();
  createReadStream(path).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local preview: http://127.0.0.1:${server.address().port}/top100/`);
  console.log(`Ranking data: ${localDataRoot ?? `${dataOrigin.origin}/data/`}`);
});
