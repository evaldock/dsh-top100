/** JSON helpers and same-origin checks for host routes. */
import type { IncomingMessage, ServerResponse } from "node:http";
export declare function sendJson(response: ServerResponse, status: number, payload: unknown): void;
export declare function sameOrigin(request: IncomingMessage): boolean;
/** Electron strips Origin and attaches its host cookie. Defer both trust and
 * authentication to DSH; missing/disposed connection services fail closed. */
export declare function authorizeDesktopRequest(ctx: {
    get(name: string): unknown;
}, request: IncomingMessage): boolean;
export declare function readJsonBody(request: IncomingMessage, maxBytes?: number): Promise<unknown>;
export declare function queryOf(request: IncomingMessage): URLSearchParams;
