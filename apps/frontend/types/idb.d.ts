declare module "idb" {
  export function openDB(
    name: string,
    version?: number,
    opts?: unknown,
  ): Promise<unknown>;
}
