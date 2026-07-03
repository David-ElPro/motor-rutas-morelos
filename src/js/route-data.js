const jsonCache = new Map();
const geojsonCache = new Map();

function candidatePaths(kind, fileName) {
  const fromWindow = globalThis.__rutappPaths?.[kind];
  if (typeof fromWindow === 'function') {
    return fromWindow(fileName);
  }

  const cleaned = String(fileName || '')
    .replace(/^\.?\//, '')
    .replace(/^public\//, '')
    .replace(new RegExp(`^${kind}s?/`), '');

  if (kind === 'route') return [`public/routes/${cleaned}`, `routes/${cleaned}`, cleaned];
  if (kind === 'data') return [`public/data/${cleaned}`, `data/${cleaned}`, cleaned];
  if (kind === 'asset') return [`public/assets/${cleaned}`, `assets/${cleaned}`, cleaned];
  return [cleaned];
}

async function fetchJsonWithFallback(paths, label) {
  let lastError = null;
  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (response.ok) return response.json();
      lastError = new Error(`No se pudo cargar ${label} desde ${path}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`No se pudo cargar ${label}`);
}

async function fetchJson(url) {
  const paths = candidatePaths('data', url);
  const cacheKey = paths.join('|');
  if (!jsonCache.has(cacheKey)) {
    jsonCache.set(cacheKey, fetchJsonWithFallback(paths, url));
  }
  return jsonCache.get(cacheKey);
}

export async function loadCatalogs() {
  const [routes, stops, transfers, places] = await Promise.all([
    fetchJson('routes.catalog.json'),
    fetchJson('stops.catalog.json'),
    fetchJson('transfers.catalog.json'),
    fetchJson('places.catalog.json')
  ]);

  const stopMap = new Map((stops.stops || []).map((stop) => [stop.stop_id, stop]));
  const variants = (routes.variants || []).map((variant) => ({
    ...variant,
    stops: (variant.stops || []).map((stopRef) => ({
      ...stopRef,
      stop: stopMap.get(stopRef.stop_id) || null
    }))
  }));

  const variantsById = new Map(variants.map((variant) => [variant.variant_id, variant]));

  return {
    variants,
    variantsById,
    stops: stops.stops || [],
    stopMap,
    transfers: transfers.transfers || [],
    places: places.places || []
  };
}

export async function loadRouteGeometry(fileName) {
  const paths = candidatePaths('route', fileName);
  const cacheKey = paths.join('|');
  if (!geojsonCache.has(cacheKey)) {
    geojsonCache.set(cacheKey, fetchJsonWithFallback(paths, fileName));
  }
  return geojsonCache.get(cacheKey);
}

export function getActiveVariants(catalogs, zone) {
  const normalizedZone = String(zone || '').trim().toUpperCase();
  if (!normalizedZone) return catalogs.variants;
  return catalogs.variants.filter((variant) => !variant.zone || variant.zone === normalizedZone);
}
