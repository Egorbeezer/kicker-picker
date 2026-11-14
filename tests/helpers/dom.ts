import { JSDOM } from 'jsdom';

export function installTestDom(url = 'https://app9226493501.tgcloud.ai/') {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url,
    pretendToBeVisual: true,
  });

  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: dom.window.sessionStorage, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: dom.window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, 'HTMLCanvasElement', { value: dom.window.HTMLCanvasElement, configurable: true });
  Object.defineProperty(globalThis, 'File', { value: dom.window.File, configurable: true });
  Object.defineProperty(globalThis, 'Blob', { value: dom.window.Blob, configurable: true });
  Object.defineProperty(globalThis, 'Event', { value: dom.window.Event, configurable: true });
  Object.defineProperty(globalThis, 'MouseEvent', { value: dom.window.MouseEvent, configurable: true });

  return {
    dom,
    cleanup: () => {
      dom.window.close();
    },
  };
}
