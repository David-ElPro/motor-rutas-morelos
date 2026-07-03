const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ROUTES_DIR = path.join(PUBLIC_DIR, 'routes');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const ZONES_DIR = path.join(PUBLIC_DIR, 'assets', 'zones');
const INDEX_PATH = path.join(ROOT, 'index.html');

const ZONE_BOUNDS = {
  CENTRO: { minLat: 18.721, maxLat: 19.1233, minLng: -99.3257, maxLng: -99.0281 },
  SUR: { minLat: 18.3815, maxLat: 18.8775, minLng: -99.4938, maxLng: -98.9512 },
  ORIENTE: { minLat: 18.441, maxLat: 19.0516, minLng: -99.1255, maxLng: -98.665 }
};

const BASE_PLACES = [
  { name: 'Mercado Adolfo Lopez Mateos (ALM)', aliases: ['alm', 'mercado alm'], lat: 18.9225, lng: -99.2312, zones: ['CENTRO'] },
  { name: 'Zocalo de Cuernavaca', aliases: ['centro cuernavaca', 'zocalo cuernavaca'], lat: 18.9218, lng: -99.2347, zones: ['CENTRO'] },
  { name: 'UAEM Chamilpa', aliases: ['uaem', 'universidad uaem', 'chamilpa'], lat: 18.9833, lng: -99.2354, zones: ['CENTRO'] },
  { name: 'IMSS Plan de Ayala', aliases: ['imss plan de ayala', 'plan de ayala'], lat: 18.9189, lng: -99.2132, zones: ['CENTRO'] },
  { name: 'Walmart Jiutepec', aliases: ['walmart jiutepec'], lat: 18.8833, lng: -99.1747, zones: ['CENTRO'] },
  { name: 'CIVAC Centro', aliases: ['civac', 'civac centro'], lat: 18.895, lng: -99.182, zones: ['CENTRO'] },
  { name: 'Bodega Aurrera Jiutepec', aliases: ['aurrera jiutepec', 'bodega jiutepec'], lat: 18.8856, lng: -99.1732, zones: ['CENTRO'] },
  { name: 'Zocalo de Cuautla', aliases: ['centro cuautla', 'zocalo cuautla'], lat: 18.81, lng: -98.935, zones: ['ORIENTE'] },
  { name: 'Hospital General de Cuautla', aliases: ['hospital cuautla'], lat: 18.8045, lng: -98.9379, zones: ['ORIENTE'] },
  { name: 'Centro de Yautepec', aliases: ['yautepec centro', 'centro yautepec'], lat: 18.8837, lng: -99.0597, zones: ['ORIENTE'] },
  { name: 'Zocalo de Jojutla', aliases: ['centro jojutla', 'zocalo jojutla'], lat: 18.6175, lng: -99.1768, zones: ['SUR'] },
  { name: 'Centro de Zacatepec', aliases: ['zacatepec centro', 'centro zacatepec'], lat: 18.6587, lng: -99.1901, zones: ['SUR'] },
  { name: 'Centro de Puente de Ixtla', aliases: ['puente de ixtla centro', 'centro de puente'], lat: 18.6129, lng: -99.3194, zones: ['SUR'] }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function toTitleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
}

function formatVariantName(baseName) {
  return toTitleCase(baseName.replace(/^r\d+_/, '').replace(/_/g, ' '));
}

function inferRouteId(fileName) {
  const match = String(fileName).match(/^(r\d+)_/i);
  return match ? match[1].toLowerCase() : slugify(fileName.replace('.geojson', ''));
}

function inferTerminals(label, fallbackName) {
  const parts = String(label || '')
    .split(/\s*-\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { origin: parts[0], destination: parts[parts.length - 1] };
  }
  return {
    origin: formatVariantName(fallbackName),
    destination: `${formatVariantName(fallbackName)} Centro`
  };
}

function pickMainLine(geojson) {
  if (!geojson) return null;
  if (geojson.type === 'FeatureCollection') {
    const lines = geojson.features.filter((feature) => feature?.geometry?.type === 'LineString' || feature?.geometry?.type === 'MultiLineString');
    if (lines.length === 0) return null;
    return lines
      .map((feature) => {
        const geometry = feature.geometry.type === 'MultiLineString'
          ? { type: 'LineString', coordinates: feature.geometry.coordinates.flat() }
          : feature.geometry;
        return geometry;
      })
      .sort((a, b) => (b.coordinates?.length || 0) - (a.coordinates?.length || 0))[0];
  }
  if (geojson.type === 'Feature' && (geojson.geometry?.type === 'LineString' || geojson.geometry?.type === 'MultiLineString')) {
    return geojson.geometry.type === 'MultiLineString'
      ? { type: 'LineString', coordinates: geojson.geometry.coordinates.flat() }
      : geojson.geometry;
  }
  if (geojson.type === 'LineString') return geojson;
  return null;
}

function haversineMeters(a, b) {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const latRad1 = toRad(lat1);
  const latRad2 = toRad(lat2);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value = (sinLat * sinLat) + (Math.cos(latRad1) * Math.cos(latRad2) * sinLng * sinLng);
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function interpolateCoord(a, b, ratio) {
  return [
    a[0] + ((b[0] - a[0]) * ratio),
    a[1] + ((b[1] - a[1]) * ratio)
  ];
}

function totalLengthMeters(coords) {
  let total = 0;
  for (let index = 1; index < coords.length; index += 1) {
    total += haversineMeters(coords[index - 1], coords[index]);
  }
  return total;
}

function sampleStops(coords, spacingMeters = 420) {
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const samples = [{ coord: coords[0], distanceAlongMeters: 0 }];
  let sinceLast = 0;
  let distanceAlongMeters = 0;

  for (let index = 1; index < coords.length; index += 1) {
    const previous = coords[index - 1];
    const current = coords[index];
    const segmentLength = haversineMeters(previous, current);
    if (segmentLength <= 0) continue;

    let consumed = 0;
    while ((sinceLast + (segmentLength - consumed)) >= spacingMeters) {
      const remaining = spacingMeters - sinceLast;
      const ratio = (consumed + remaining) / segmentLength;
      const coord = interpolateCoord(previous, current, ratio);
      distanceAlongMeters += remaining;
      samples.push({
        coord,
        distanceAlongMeters: Math.round(distanceAlongMeters)
      });
      consumed += remaining;
      sinceLast = 0;
    }

    const leftover = segmentLength - consumed;
    sinceLast += leftover;
    distanceAlongMeters += leftover;
  }

  const lastCoord = coords[coords.length - 1];
  const lastSample = samples[samples.length - 1];
  if (!lastSample || haversineMeters(lastSample.coord, lastCoord) > 80) {
    samples.push({
      coord: lastCoord,
      distanceAlongMeters: Math.round(totalLengthMeters(coords))
    });
  }

  return samples;
}

function inferZone(coord) {
  const [lng, lat] = coord;
  for (const [zone, bounds] of Object.entries(ZONE_BOUNDS)) {
    if (lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng) {
      return zone;
    }
  }
  return 'CENTRO';
}

function clusterStops(candidates, places) {
  const clusters = [];

  candidates.forEach((candidate) => {
    const zone = candidate.zone || inferZone(candidate.coord);
    let match = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      if (cluster.zone !== zone) continue;
      const distance = haversineMeters(cluster.coord, candidate.coord);
      if (distance <= 55 && distance < bestDistance) {
        bestDistance = distance;
        match = cluster;
      }
    }

    if (!match) {
      match = {
        id: `stop_${String(clusters.length + 1).padStart(4, '0')}`,
        zone,
        coord: candidate.coord.slice(),
        hits: 0,
        candidates: []
      };
      clusters.push(match);
    }

    match.hits += 1;
    match.candidates.push(candidate);
    match.coord = [
      Number((((match.coord[0] * (match.hits - 1)) + candidate.coord[0]) / match.hits).toFixed(6)),
      Number((((match.coord[1] * (match.hits - 1)) + candidate.coord[1]) / match.hits).toFixed(6))
    ];
  });

  let generatedCounter = 1;
  clusters.forEach((cluster) => {
    let nearestPlace = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    places.forEach((place) => {
      const distance = haversineMeters(cluster.coord, [place.lng, place.lat]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPlace = place;
      }
    });

    const derivedName = nearestPlace && nearestDistance <= 240
      ? nearestPlace.name
      : `Parada estimada ${cluster.zone} ${generatedCounter++}`;

    cluster.name = derivedName;
    cluster.aliases = nearestPlace && nearestDistance <= 240 ? nearestPlace.aliases : [];
    cluster.source = nearestPlace && nearestDistance <= 240 ? 'seed_place' : 'generated';
    cluster.lat = cluster.coord[1];
    cluster.lng = cluster.coord[0];
  });

  return clusters;
}

function buildZoneBoundaries() {
  return {
    type: 'FeatureCollection',
    features: Object.entries(ZONE_BOUNDS).map(([zone, bounds]) => ({
      type: 'Feature',
      properties: { zone },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
          [bounds.minLng, bounds.maxLat],
          [bounds.minLng, bounds.minLat]
        ]]
      }
    }))
  };
}

function parseRouteCards(indexHtml) {
  const matches = [...indexHtml.matchAll(/toggleLayer\('[^']+',\s*'([^']+)',\s*'([^']+)'\)[^>]*>[\s\S]*?<\/i>\s*([^<]+)</g)];
  const lookup = new Map();

  matches.forEach((match) => {
    const fileName = match[1];
    const color = match[2];
    const label = match[3].trim();
    lookup.set(fileName, { color, label });
  });

  return lookup;
}

function isNearTerminal(stopRef, totalStops) {
  if (!stopRef || !totalStops) return true;
  const edgeWindow = totalStops >= 8 ? 2 : 1;
  return stopRef.order <= edgeWindow || stopRef.order > (totalStops - edgeWindow);
}

function generatedPenalty(stopRef, stop) {
  return (stopRef?.approx ? 20 : 0) + (stop?.source === 'generated' ? 20 : 0);
}

function stopNameAffinity(fromStop, toStop) {
  const fromName = slugify(fromStop?.name || '');
  const toName = slugify(toStop?.name || '');
  if (!fromName || !toName) return 0;
  if (fromName === toName) return -18;
  if (fromName.includes(toName) || toName.includes(fromName)) return -8;
  return 0;
}

function buildTransfers(variants, stopsById) {
  const pairCandidates = [];

  for (let sourceIndex = 0; sourceIndex < variants.length; sourceIndex += 1) {
    const source = variants[sourceIndex];
    for (let targetIndex = 0; targetIndex < variants.length; targetIndex += 1) {
      const target = variants[targetIndex];
      if (source.variant_id === target.variant_id || source.route_id === target.route_id) continue;

      let best = null;

      source.stops.forEach((fromStop) => {
        if (isNearTerminal(fromStop, source.stops.length)) return;
        target.stops.forEach((toStop) => {
          if (isNearTerminal(toStop, target.stops.length)) return;
          const fromRef = stopsById.get(fromStop.stop_id);
          const toRef = stopsById.get(toStop.stop_id);
          if (!fromRef || !toRef || fromRef.zone !== toRef.zone) return;

          const distance = haversineMeters([fromRef.lng, fromRef.lat], [toRef.lng, toRef.lat]);
          if (distance > 75) return;
          if (fromRef.source === 'generated' && toRef.source === 'generated' && distance > 35) return;

          const score = distance + generatedPenalty(fromStop, fromRef) + generatedPenalty(toStop, toRef) + stopNameAffinity(fromRef, toRef);
          if (!best || score < best.score) {
            best = {
              from_variant_id: source.variant_id,
              to_variant_id: target.variant_id,
              from_stop_id: fromStop.stop_id,
              to_stop_id: toStop.stop_id,
              walk_distance_m: Math.round(distance),
              requires_crossing: distance > 25,
              confidence: distance <= 20 && (fromRef.source !== 'generated' || toRef.source !== 'generated') ? 'high' : 'estimated',
              score
            };
          }
        });
      });

      if (!best) continue;
      pairCandidates.push(best);
    }
  }

  const outgoingCount = new Map();
  const incomingCount = new Map();
  const byRoutePair = new Set();
  const transfers = [];

  pairCandidates
    .sort((a, b) => a.score - b.score || a.walk_distance_m - b.walk_distance_m)
    .forEach((candidate) => {
      const routePairKey = `${candidate.from_variant_id}=>${candidate.to_variant_id}`;
      const outgoing = outgoingCount.get(candidate.from_variant_id) || 0;
      const incoming = incomingCount.get(candidate.to_variant_id) || 0;
      if (byRoutePair.has(routePairKey)) return;
      if (outgoing >= 4 || incoming >= 4) return;

      transfers.push({
        from_variant_id: candidate.from_variant_id,
        to_variant_id: candidate.to_variant_id,
        from_stop_id: candidate.from_stop_id,
        to_stop_id: candidate.to_stop_id,
        walk_distance_m: candidate.walk_distance_m,
        requires_crossing: candidate.requires_crossing,
        confidence: candidate.confidence
      });
      byRoutePair.add(routePairKey);
      outgoingCount.set(candidate.from_variant_id, outgoing + 1);
      incomingCount.set(candidate.to_variant_id, incoming + 1);
    });

  return transfers.sort((a, b) => a.walk_distance_m - b.walk_distance_m);
}

function main() {
  ensureDir(DATA_DIR);
  ensureDir(ZONES_DIR);

  const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
  const routeCards = parseRouteCards(indexHtml);
  const geojsonFiles = fs.readdirSync(ROUTES_DIR).filter((fileName) => /^r\d+_.+\.geojson$/i.test(fileName)).sort();

  const routeVariants = [];
  const candidateStops = [];
  const placesCatalog = BASE_PLACES.map((place, index) => ({
    place_id: `place_${String(index + 1).padStart(3, '0')}`,
    name: place.name,
    aliases: place.aliases,
    lat: place.lat,
    lng: place.lng,
    zones: place.zones
  }));

  geojsonFiles.forEach((fileName) => {
    const geojson = readJson(path.join(ROUTES_DIR, fileName));
    const geometry = pickMainLine(geojson);
    if (!geometry || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
      return;
    }

    const meta = routeCards.get(fileName) || {
      color: '#22c55e',
      label: formatVariantName(fileName.replace('.geojson', ''))
    };
    const routeId = inferRouteId(fileName);
    const routeName = formatVariantName(fileName.replace('.geojson', ''));
    const terminals = inferTerminals(meta.label, fileName.replace('.geojson', ''));
    const zone = inferZone(geometry.coordinates[Math.floor(geometry.coordinates.length / 2)]);
    const isLoop = /loop|circuito/i.test(fileName) || /loop|circuito/i.test(meta.label);
    const directionSet = isLoop
      ? [
          { key: 'ida', label: 'Circuito principal', coords: geometry.coordinates.slice() },
          { key: 'vuelta', label: 'Circuito alterno', coords: geometry.coordinates.slice().reverse() }
        ]
      : [
          { key: 'ida', label: `${terminals.origin} -> ${terminals.destination}`, coords: geometry.coordinates.slice() },
          { key: 'vuelta', label: `${terminals.destination} -> ${terminals.origin}`, coords: geometry.coordinates.slice().reverse() }
        ];

    directionSet.forEach((direction) => {
      const variantId = `${fileName.replace('.geojson', '')}__${direction.key}`;
      const samples = sampleStops(direction.coords);
      samples.forEach((sample, sampleIndex) => {
        candidateStops.push({
          variant_id: variantId,
          route_id: routeId,
          zone,
          coord: sample.coord,
          label_hint: `${meta.label} ${sampleIndex + 1}`,
          distanceAlongMeters: sample.distanceAlongMeters
        });
      });

      routeVariants.push({
        route_id: routeId,
        variant_id: variantId,
        display_name: meta.label,
        route_name: routeName,
        zone,
        direction_key: direction.key,
        direction_label: direction.label,
        geojson_file: fileName,
        terminal_origin: direction.key === 'ida' ? terminals.origin : terminals.destination,
        terminal_destination: direction.key === 'ida' ? terminals.destination : terminals.origin,
        color: meta.color,
        is_loop: isLoop,
        total_length_m: Math.round(totalLengthMeters(direction.coords)),
        sampled_stops: samples
      });
    });
  });

  const clusteredStops = clusterStops(candidateStops, placesCatalog);
  const stopsById = new Map(clusteredStops.map((stop) => [stop.id, stop]));

  routeVariants.forEach((variant) => {
    const stopRefs = [];
    variant.sampled_stops.forEach((sample, sampleIndex) => {
      let bestStop = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      clusteredStops.forEach((stop) => {
        const distance = haversineMeters(sample.coord, [stop.lng, stop.lat]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestStop = stop;
        }
      });
      if (!bestStop) return;
      const previous = stopRefs[stopRefs.length - 1];
      if (previous && previous.stop_id === bestStop.id) return;

      stopRefs.push({
        stop_id: bestStop.id,
        order: stopRefs.length + 1,
        distance_along_m: sample.distanceAlongMeters,
        approx: bestStop.source === 'generated',
        name: bestStop.name,
        lat: bestStop.lat,
        lng: bestStop.lng,
        sample_index: sampleIndex
      });
    });
    variant.stops = stopRefs;
    delete variant.sampled_stops;
  });

  const transfers = buildTransfers(routeVariants, stopsById);

  const routeCatalog = {
    generated_at: new Date().toISOString(),
    variants: routeVariants
  };

  const stopsCatalog = {
    generated_at: new Date().toISOString(),
    stops: clusteredStops
      .map((stop) => ({
        stop_id: stop.id,
        name: stop.name,
        aliases: stop.aliases,
        lat: stop.lat,
        lng: stop.lng,
        zone: stop.zone,
        source: stop.source
      }))
      .sort((a, b) => a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name))
  };

  const transferCatalog = {
    generated_at: new Date().toISOString(),
    transfers
  };

  const routeManifestByZone = new Map();
  routeVariants
    .filter((variant) => variant.direction_key === 'ida')
    .forEach((variant) => {
      const zone = variant.zone || 'CENTRO';
      if (!routeManifestByZone.has(zone)) routeManifestByZone.set(zone, new Map());
      const groupMap = routeManifestByZone.get(zone);
      const routeKey = variant.route_id.toUpperCase();
      if (!groupMap.has(routeKey)) groupMap.set(routeKey, []);
      groupMap.get(routeKey).push({
        label: `${variant.display_name} (${variant.direction_label})`,
        archivo: variant.geojson_file,
        mid: variant.variant_id
      });
    });

  const additionalCatalog = {
    generated_at: new Date().toISOString(),
    zones: [...routeManifestByZone.entries()].map(([zone, groups]) => ({
      zone,
      groups: [...groups.entries()].map(([group, routes]) => ({
        group,
        routes
      }))
    }))
  };

  writeJson(path.join(DATA_DIR, 'routes.catalog.json'), routeCatalog);
  writeJson(path.join(DATA_DIR, 'stops.catalog.json'), stopsCatalog);
  writeJson(path.join(DATA_DIR, 'transfers.catalog.json'), transferCatalog);
  writeJson(path.join(DATA_DIR, 'places.catalog.json'), {
    generated_at: new Date().toISOString(),
    places: placesCatalog
  });
  writeJson(path.join(DATA_DIR, 'catalogos-zonas-adicionales.json'), additionalCatalog);
  writeJson(path.join(ZONES_DIR, 'zone-boundaries.geojson'), buildZoneBoundaries());

  console.log(`Catalogos generados: ${routeVariants.length} variantes, ${clusteredStops.length} paradas, ${transfers.length} transbordos.`);
}

main();
