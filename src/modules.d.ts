declare module 'js-beautify' {
  export function html(
    source: string,
    options?: Record<string, unknown>,
  ): string;
  export function js(
    source: string,
    options?: Record<string, unknown>,
  ): string;
}
