const jsdomWindow = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom?.window;

if (jsdomWindow) {
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: jsdomWindow.localStorage },
    sessionStorage: { configurable: true, value: jsdomWindow.sessionStorage },
  });
}
