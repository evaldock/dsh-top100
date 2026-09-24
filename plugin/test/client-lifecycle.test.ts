import { expect, it } from "vitest";
import { apply } from "../src/client/index.js";

it("unregisters dictionaries on disable so the same client can be enabled again", () => {
  const namespaces = new Set<string>();
  const mount = () => {
    const disposers: Array<() => void> = [];
    apply({
      effect(callback) { const dispose = callback(); if (dispose) disposers.push(dispose); },
      locale: {
        register(namespace) {
          if (namespaces.has(namespace)) throw new Error("duplicate namespace");
          namespaces.add(namespace);
          return () => { namespaces.delete(namespace); };
        },
        bind: () => (key) => key,
      },
      slots: { inject() {}, register() {} },
    });
    return () => { for (const dispose of disposers.reverse()) dispose(); };
  };
  const disable = mount();
  expect(namespaces.has("dsh-top100")).toBe(true);
  disable();
  expect(namespaces.size).toBe(0);
  const disableAgain = mount();
  expect(namespaces.has("dsh-top100")).toBe(true);
  disableAgain();
  expect(namespaces.size).toBe(0);
});

it("binds the entry form through configForms on DSH 0.1.7", () => {
  const registrations: Array<Record<string, unknown>> = [];
  const requests: string[] = [];
  const slots = { inject(_slot: string, register: () => unknown) { register(); }, register(meta: Record<string, unknown>) { registrations.push(meta); } };
  apply({
    effect(callback) { callback(); },
    locale: { register: () => () => {}, bind: () => (key) => key }, slots,
    inject(services, callback) {
      if (!services.includes("configForms")) return;
      callback({ slots, configForms: { get(id) { requests.push(id); return { getSnapshot: () => ({ status: "ready", writable: true, value: { dataUrl: "https://example.com" } }), subscribe: () => () => {}, set: async () => false }; } } } as Parameters<typeof callback>[0]);
    },
  });
  expect(requests).toEqual(["dsh-top100"]);
  expect(registrations.filter((meta) => meta.name === "plugins.bundle.config")).toEqual([
    expect.objectContaining({ key: "@evaldock/dsh-top100-plugin" }),
  ]);
});
