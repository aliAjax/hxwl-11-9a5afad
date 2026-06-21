import "fake-indexeddb/auto";

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis as unknown as Window & typeof globalThis;
}
