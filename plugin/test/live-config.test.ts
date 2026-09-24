import { afterEach, expect, it, vi } from "vitest";
import { configValue, editableSchema, resolvedConfig } from "../src/host/live-config.js";
afterEach(() => vi.unstubAllEnvs());

it("reads changed DSH 0.1.7 volatile values without a plugin restart", () => {
  vi.stubEnv("DSH_TOP100_DATA_URL", "");
  let url = "https://first.example/data";
  const config = resolvedConfig({ get: () => url }, "web");
  expect(config.dataUrl).toBe(url);
  url = "https://second.example/data///";
  expect(config.dataUrl).toBe("https://second.example/data");
  expect(configValue({ get: () => false })).toBe(false);
  // A newer schema package can also be installed under an older settings host.
  config.dataUrl = "https://legacy-provider.example/data";
  expect(config.dataUrl).toBe("https://legacy-provider.example/data");
});

it("retains legacy settings writes and an operator-owned environment override", () => {
  vi.stubEnv("DSH_TOP100_DATA_URL", "");
  const config = resolvedConfig("https://first.example/data", "web");
  config.dataUrl = "https://changed.example/data";
  expect(config.dataUrl).toBe("https://changed.example/data");
  vi.stubEnv("DSH_TOP100_DATA_URL", "https://operator.example/data");
  expect(config.dataUrl).toBe("https://operator.example/data");
  expect(configValue("plain")).toBe("plain");
});

it("uses live schemas only when the host schema library supports them", () => {
  const plain = { name: "legacy" };
  expect(editableSchema(plain)).toBe(plain);
  const volatile = { name: "live" };
  expect(editableSchema({ volatile: () => volatile })).toBe(volatile);
});
