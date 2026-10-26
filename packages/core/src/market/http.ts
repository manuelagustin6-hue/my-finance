/** Utilidades HTTP y de caché compartidas por los proveedores de datos públicos. */

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Almacenamiento clave/valor (AsyncStorage en la app, Postgres en el servidor). */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export const defaultFetch: FetchFn = (url) => (globalThis as unknown as { fetch: FetchFn }).fetch(url);

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} ${url}`);
  }
}

export async function fetchJson<T>(fetchFn: FetchFn, url: string): Promise<T> {
  const res = await fetchFn(url);
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

/**
 * Devuelve el valor guardado si no venció; si no, lo carga y lo guarda. Además evita pedidos
 * duplicados simultáneos para la misma clave (varias pantallas piden lo mismo a la vez).
 */
export class CachedLoader {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly cache: KeyValueCache | undefined,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    if (this.cache) {
      try {
        const raw = await this.cache.get(key);
        if (raw) {
          const entry = JSON.parse(raw) as { t: number; v: T };
          if (this.now() - entry.t < ttlMs) return entry.v;
        }
      } catch {
        // Caché inválida: se vuelve a consultar.
      }
    }
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const promise = load()
      .then(async (value) => {
        if (this.cache) await this.cache.set(key, JSON.stringify({ t: this.now(), v: value })).catch(() => undefined);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}
