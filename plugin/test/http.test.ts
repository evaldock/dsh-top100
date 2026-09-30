import { describe, expect, it } from "vitest";
import { authorizeDesktopRequest, sameOrigin } from "../src/host/http.js";

describe("sameOrigin", () => {
  it("accepts a matching Origin and Host", () => {
    expect(
      sameOrigin({
        headers: { origin: "http://127.0.0.1:3080", host: "127.0.0.1:3080" },
      } as never),
    ).toBe(true);
  });

  it("rejects a missing or cross-origin request", () => {
    expect(sameOrigin({ headers: { host: "127.0.0.1:3080" } } as never)).toBe(false);
    expect(
      sameOrigin({
        headers: { origin: "https://evil.example", host: "127.0.0.1:3080" },
      } as never),
    ).toBe(false);
  });
});

describe("Desktop forwarding authentication", () => {
  const request = { headers: { host: "127.0.0.1:19387" } } as never;
  it("delegates originless requests to the running connection service", () => {
    expect(authorizeDesktopRequest({ get: () => ({ admit: (received: unknown) => {
      expect(received).toBe(request); return { peer: {} };
    } }) }, request)).toBe(true);
  });
  it.each([undefined, { admit: () => ({ rejection: 401 }) }, { admit: () => ({ rejection: 403 }) },
    { admit: () => undefined }, { admit: () => { throw new Error("disposed"); } },
  ])("rejects missing, malformed and denied host admission", (service) => {
    expect(authorizeDesktopRequest({ get: () => service }, request)).toBe(false);
  });
});
