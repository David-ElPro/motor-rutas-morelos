const queryCache = new Map();

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeResults(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${normalizeText(item.name)}:${Number(item.lat).toFixed(3)}:${Number(item.lng).toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createStopResults(catalogs, zone, normalizedQuery) {
  return catalogs.stops
    .filter((stop) => !zone || stop.zone === zone)
    .map((stop) => ({
      type: 'stop',
      name: stop.name,
      detail: `${stop.source === 'generated' ? 'Parada estimada' : 'Parada oficial'} - ${stop.zone}`,
      lat: stop.lat,
      lng: stop.lng,
      searchBlob: normalizeText([stop.name, ...(stop.aliases || [])].join(' '))
    }))
    .filter((stop) => stop.searchBlob.includes(normalizedQuery))
    .slice(0, 8);
}

function createPlaceResults(catalogs, zone, normalizedQuery) {
  return catalogs.places
    .filter((place) => !zone || !place.zones || place.zones.includes(zone))
    .map((place) => ({
      type: 'place',
      name: place.name,
      detail: `Lugar frecuente - ${(place.zones || []).join(', ')}`,
      lat: place.lat,
      lng: place.lng,
      searchBlob: normalizeText([place.name, ...(place.aliases || [])].join(' '))
    }))
    .filter((place) => place.searchBlob.includes(normalizedQuery))
    .slice(0, 8);
}

async function remoteSearch(query, zone) {
  const viewbox = typeof window.obtenerViewboxZona === 'function'
    ? window.obtenerViewboxZona()
    : '-99.62,19.16,-98.54,18.32';
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&viewbox=${viewbox}&bounded=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Busqueda remota no disponible.');
  const data = await response.json();
  return data.map((item) => ({
    type: 'remote',
    name: item.display_name.split(',')[0],
    detail: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    zone
  }));
}

export async function searchLocations(catalogs, query, zone) {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) return [];

  const cacheKey = `${zone || 'ALL'}:${normalizedQuery}`;
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey);
  }

  const localResults = dedupeResults([
    ...createPlaceResults(catalogs, zone, normalizedQuery),
    ...createStopResults(catalogs, zone, normalizedQuery)
  ]).slice(0, 8);

  if (normalizedQuery.length < 3) {
    queryCache.set(cacheKey, localResults);
    return localResults;
  }

  try {
    const remoteResults = await remoteSearch(query, zone);
    const merged = dedupeResults([...localResults, ...remoteResults]).slice(0, 10);
    queryCache.set(cacheKey, merged);
    return merged;
  } catch (error) {
    queryCache.set(cacheKey, localResults);
    return localResults;
  }
}
