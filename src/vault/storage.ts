export interface SecureKV {
  get(key: string, opts?: { requireAuth?: boolean; prompt?: string }): Promise<string | null>;
  set(key: string, value: string, opts?: { requireAuth?: boolean }): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In-memory store for tests / web fallback (NOT secure). */
export class MemoryKV implements SecureKV {
  private m = new Map<string, string>();
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.m.set(k, v);
  }
  async remove(k: string) {
    this.m.delete(k);
  }
}
