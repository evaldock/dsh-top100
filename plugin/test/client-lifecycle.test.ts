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
