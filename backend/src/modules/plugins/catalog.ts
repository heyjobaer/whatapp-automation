import { CatalogEntry, CatalogPlugin } from "../../common/interface/catalog-entry.interface";

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    String(v)
      .split('-')[0]
      .split('.')
      .map(n => Number.parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function annotateCatalog(
  entries: CatalogEntry[],
  installed: { id: string; version: string }[],
): CatalogPlugin[] {
  const byId = new Map(installed.map(p => [p.id, p.version]));
  return entries.map(entry => {
    const installedVersion = byId.get(entry.id) ?? null;
    return {
      ...entry,
      installed: installedVersion !== null,
      installedVersion,
      updateAvailable: installedVersion !== null && compareSemver(entry.version, installedVersion) > 0,
    };
  });
}
