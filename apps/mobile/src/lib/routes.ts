import type { AssetSearchResult } from '@my-finance/core';

/** Ruta del detalle para un activo del proveedor (lo tenga o no el usuario). */
export function searchResultHref(r: Pick<AssetSearchResult, 'type' | 'providerId'>): `/asset/${string}` {
  return `/asset/${encodeURIComponent(`p:${r.type}:${r.providerId}`)}`;
}

/** Interpreta el parámetro de la ruta de detalle: id de activo propio o referencia al proveedor. */
export function parseAssetParam(param: string): { assetId: string } | { type: string; providerId: string } {
  if (param.startsWith('p:')) {
    const [, type, ...rest] = param.split(':');
    return { type: type ?? 'other', providerId: rest.join(':') };
  }
  return { assetId: param };
}
