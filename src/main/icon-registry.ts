import { randomUUID } from 'node:crypto';

export class IconRegistry {
  private readonly tokens = new Map<string, string>();

  register(iconPath: string | null): string | null {
    if (!iconPath) {
      return null;
    }

    const token = randomUUID();
    this.tokens.set(token, iconPath);
    return token;
  }

  resolve(token: string): string | null {
    return this.tokens.get(token) ?? null;
  }
}
