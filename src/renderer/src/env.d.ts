// This file tells TypeScript what properties we've added to the global `window` object.

export {};

declare global {
  interface Window {
    // For communication from Renderer to Main
    api: {
      openLoginWindow: () => void;
      sendRequest: (url: string, options: any) => Promise<any>;
      clearCookies: () => Promise<void>;
    };
    // For communication from Main to Renderer and bi-directional calls
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        once: (channel: string, listener: (...args: any[]) => void) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        removeListener: (channel: string, listener: (...args: any[]) => void) => void;
      };
    };
  }
}
