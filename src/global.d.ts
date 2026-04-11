import type { WxapkgDesktopApi } from './shared/types';

declare global {
  interface Window {
    wxapkg: WxapkgDesktopApi;
  }
}

export {};
