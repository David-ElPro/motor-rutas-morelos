import { loadRouteGeometry } from './route-data.js';

function ensureLayerStore() {
  if (!window.capasActivas) {
    window.capasActivas = {};
  }
  return window.capasActivas;
}

let hiddenBaseMarkers = [];

function pointDistance(a, b) {
  const dx = Number(a.lng) - Number(b.lng);
  const dy = Number(a.lat) - Number(b.lat);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function extractCoordinates(lineLike) {
  if (!lineLike) return [];
  if (lineLike.type === 'FeatureCollection') {
    const lineFeature = lineLike.features?.find((feature) => feature?.geometry?.type === 'LineString' || feature?.geometry?.type === 'MultiLineString');
    return extractCoordinates(lineFeature);
  }
  if (lineLike.type === 'Feature') {
    return extractCoordinates(lineLike.geometry);
  }
  if (lineLike.type === 'LineString') {
    return Array.isArray(lineLike.coordinates) ? lineLike.coordinates : [];
  }
  if (lineLike.type === 'MultiLineString') {
    return Array.isArray(lineLike.coordinates) ? lineLike.coordinates.flat() : [];
  }
  return [];
}

function reverseLineLike(lineLike) {
  if (!lineLike) return lineLike;
  const clone = JSON.parse(JSON.stringify(lineLike));
  if (clone.type === 'Feature') {
    clone.geometry = reverseLineLike(clone.geometry);
    return clone;
  }
  if (clone.type === 'LineString') {
    clone.coordinates = [...(clone.coordinates || [])].reverse();
    return clone;
  }
  if (clone.type === 'MultiLineString') {
    clone.coordinates = (clone.coordinates || []).map((segment) => [...segment].reverse()).reverse();
    return clone;
  }
  return clone;
}

function orientSegment(lineLike, startStop, endStop) {
  const coordinates = extractCoordinates(lineLike);
  if (coordinates.length < 2 || !startStop || !endStop) return lineLike;
  const first = { lng: coordinates[0][0], lat: coordinates[0][1] };
  const last = { lng: coordinates[coordinates.length - 1][0], lat: coordinates[coordinates.length - 1][1] };
  const forwardScore = pointDistance(first, startStop) + pointDistance(last, endStop);
  const reverseScore = pointDistance(last, startStop) + pointDistance(first, endStop);
  return reverseScore + 0.00001 < forwardScore ? reverseLineLike(lineLike) : lineLike;
}

function hideBaseSelectionMarkers() {
  hiddenBaseMarkers = [];
  ['marcadorOrigenUI', 'marcadorDestinoUI'].forEach((key) => {
    const marker = window[key];
    if (marker && typeof window.map?.hasLayer === 'function' && window.map.hasLayer(marker)) {
      window.map.removeLayer(marker);
      hiddenBaseMarkers.push(marker);
    }
  });
}

function restoreBaseSelectionMarkers() {
  hiddenBaseMarkers.forEach((marker) => {
    if (marker && typeof window.map?.hasLayer === 'function' && !window.map.hasLayer(marker)) {
      marker.addTo(window.map);
    }
  });
  hiddenBaseMarkers = [];
}

function pickMainLine(geojson) {
  if (!geojson) return null;
  if (geojson.type === 'FeatureCollection') {
    const lines = geojson.features.filter((feature) => feature?.geometry?.type === 'LineString' || feature?.geometry?.type === 'MultiLineString');
    if (lines.length === 0) return null;
    const chosen = lines
      .map((feature) => feature.geometry.type === 'MultiLineString'
        ? { type: 'LineString', coordinates: feature.geometry.coordinates.flat() }
        : feature.geometry)
      .sort((a, b) => (b.coordinates?.length || 0) - (a.coordinates?.length || 0))[0];
    return chosen;
  }
  if (geojson.type === 'Feature' && geojson.geometry?.type === 'LineString') return geojson.geometry;
  if (geojson.type === 'LineString') return geojson;
  return null;
}

function createLabeledMarker(lat, lng, color, title, subtitle, icon = 'fa-map-pin') {
  const html = `
    <div style="text-align:center; min-width: 110px;">
      <b style="color:${color}; display:block;"><i class="fa ${icon}"></i> ${title}</b>
      <span style="font-size:12px;">${subtitle}</span>
    </div>
  `;
  return window.L.marker([lat, lng]).bindPopup(html);
}

function getInputValue(id, fallback) {
  return document.getElementById(id)?.value?.trim() || fallback;
}

function fitMapToPoints(points) {
  const validPoints = points.filter(Boolean).map((point) => window.L.latLng(point.lat, point.lng));
  if (validPoints.length === 0) return;
  const bounds = window.L.latLngBounds(validPoints);
  window.map.fitBounds(bounds, { maxZoom: 15, padding: [70, 70], ...(window.getMapPadding ? window.getMapPadding() : {}) });
}

async function sliceVariantSegment(variant, fromStop, toStop) {
  const geojson = await loadRouteGeometry(variant.geojson_file);
  const line = pickMainLine(geojson);
  if (!line) return null;
  const from = window.turf.point([fromStop.lng, fromStop.lat]);
  const to = window.turf.point([toStop.lng, toStop.lat]);
  try {
    const sliced = window.turf.lineSlice(from, to, line);
    if (sliced?.geometry?.coordinates?.length >= 2) return orientSegment(sliced, fromStop, toStop);
  } catch (error) {
    return orientSegment(line, fromStop, toStop);
  }
  return orientSegment(line, fromStop, toStop);
}

function clearActiveLayers() {
  const activeLayers = ensureLayerStore();
  if (typeof window.limpiarMarcadoresRutaGuiada === 'function') {
    window.limpiarMarcadoresRutaGuiada();
  }
  if (typeof window.limpiarFlechasRuta === 'function') {
    window.limpiarFlechasRuta();
  }
  if (window.caminataLayer) {
    window.map.removeLayer(window.caminataLayer);
    window.caminataLayer = null;
  }
  Object.keys(activeLayers).forEach((key) => {
    if (activeLayers[key]) window.map.removeLayer(activeLayers[key]);
    delete activeLayers[key];
  });
}

async function renderDirectOption(option, variant) {
  clearActiveLayers();
  const activeLayers = ensureLayerStore();
  hideBaseSelectionMarkers();

  const routeSegment = await sliceVariantSegment(variant, option.boardingStop, option.alightingStop);
  const routeLayer = window.L.geoJSON(routeSegment, {
    style: { color: option.color, weight: 6, opacity: 0.96, lineJoin: 'round', lineCap: 'round' }
  }).addTo(window.map);

  activeLayers.rutaPrincipal = routeLayer;
  if (typeof window.agregarFlechasRuta === 'function') {
    window.agregarFlechasRuta(routeSegment, option.color);
  }

  const origin = window.origenCoordenadasReal;
  const destination = window.destinoCoordenadasReal;
  const originLabel = getInputValue('originInput', 'Tu punto de partida');
  const destinationLabel = getInputValue('destinationInput', 'Tu destino');
  if (origin) {
    window.caminataLayer = window.L.polyline(
      [[origin.lat, origin.lng], [option.boardingStop.lat, option.boardingStop.lng]],
      { color: '#ffffff', weight: 4, dashArray: '6, 8', opacity: 0.85 }
    ).addTo(window.map);
    activeLayers.start = createLabeledMarker(
      origin.lat,
      origin.lng,
      '#38bdf8',
      'Inicio',
      originLabel,
      'fa-location-dot'
    ).addTo(window.map);
  }

  const finalWalkLayer = destination
    ? window.L.polyline(
        [[option.alightingStop.lat, option.alightingStop.lng], [destination.lat, destination.lng]],
        { color: '#94a3b8', weight: 4, dashArray: '4, 10', opacity: 0.85 }
      ).addTo(window.map)
    : null;
  if (finalWalkLayer) {
    activeLayers.caminataFinal = finalWalkLayer;
  }
  if (destination) {
    activeLayers.destination = createLabeledMarker(
      destination.lat,
      destination.lng,
      '#f8fafc',
      'Destino final',
      destinationLabel,
      'fa-flag-checkered'
    ).addTo(window.map);
  }

  const boardingMarker = createLabeledMarker(
    option.boardingStop.lat,
    option.boardingStop.lng,
    option.color,
    'Sube aqui',
    option.boardingStop.name,
    'fa-person-walking'
  ).addTo(window.map);

  const alightingMarker = createLabeledMarker(
    option.alightingStop.lat,
    option.alightingStop.lng,
    option.color,
    'Baja aqui',
    option.alightingStop.name,
    'fa-bell'
  ).addTo(window.map);

  window.abordajeMarker = boardingMarker;
  activeLayers.bajada = alightingMarker;
  window.puntoDescensoGuardado = window.L.latLng(option.alightingStop.lat, option.alightingStop.lng);

  const banner = document.getElementById('topBanner');
  const bannerText = document.getElementById('topBannerText');
  banner.style.display = 'flex';
  banner.style.borderLeft = `5px solid ${option.color}`;
  bannerText.innerHTML = `${option.routeName} <span style="font-weight:400; opacity:0.8;">${option.directionLabel}</span>`;

  document.getElementById('btnTomarRuta').style.display = 'flex';
  document.getElementById('btnCancelarRuta').style.display = 'none';

  fitMapToPoints([
    origin,
    option.boardingStop,
    option.alightingStop,
    destination
  ]);
}

async function renderTransferOption(option, catalogs) {
  clearActiveLayers();
  const activeLayers = ensureLayerStore();
  hideBaseSelectionMarkers();
  const [firstLeg, secondLeg] = option.legs;
  const firstVariant = catalogs.variantsById.get(firstLeg.variantId);
  const secondVariant = catalogs.variantsById.get(secondLeg.variantId);
  const firstSegment = await sliceVariantSegment(firstVariant, firstLeg.boardingStop, firstLeg.alightingStop);
  const secondSegment = await sliceVariantSegment(secondVariant, secondLeg.boardingStop, secondLeg.alightingStop);

  activeLayers.ruta1 = window.L.geoJSON(firstSegment, {
    style: { color: firstLeg.color, weight: 6, opacity: 0.94 }
  }).addTo(window.map);
  activeLayers.ruta2 = window.L.geoJSON(secondSegment, {
    style: { color: secondLeg.color, weight: 6, opacity: 0.94 }
  }).addTo(window.map);

  const transferWalk = window.L.polyline(
    [
      [option.transfer.fromStop.lat, option.transfer.fromStop.lng],
      [option.transfer.toStop.lat, option.transfer.toStop.lng]
    ],
    { color: '#f59e0b', weight: 4, dashArray: '5, 7', opacity: 0.9 }
  ).addTo(window.map);
  activeLayers.transferWalk = transferWalk;

  const origin = window.origenCoordenadasReal;
  const destination = window.destinoCoordenadasReal;
  const originLabel = getInputValue('originInput', 'Tu punto de partida');
  const destinationLabel = getInputValue('destinationInput', 'Tu destino');
  if (origin) {
    window.caminataLayer = window.L.polyline(
      [[origin.lat, origin.lng], [firstLeg.boardingStop.lat, firstLeg.boardingStop.lng]],
      { color: '#ffffff', weight: 4, dashArray: '6, 8', opacity: 0.85 }
    ).addTo(window.map);
    activeLayers.start = createLabeledMarker(
      origin.lat,
      origin.lng,
      '#38bdf8',
      'Inicio',
      originLabel,
      'fa-location-dot'
    ).addTo(window.map);
  }
  if (destination) {
    activeLayers.caminataFinal = window.L.polyline(
      [[secondLeg.alightingStop.lat, secondLeg.alightingStop.lng], [destination.lat, destination.lng]],
      { color: '#94a3b8', weight: 4, dashArray: '4, 10', opacity: 0.85 }
    ).addTo(window.map);
    activeLayers.destination = createLabeledMarker(
      destination.lat,
      destination.lng,
      '#f8fafc',
      'Destino final',
      destinationLabel,
      'fa-flag-checkered'
    ).addTo(window.map);
  }

  window.abordajeMarker = createLabeledMarker(
    firstLeg.boardingStop.lat,
    firstLeg.boardingStop.lng,
    firstLeg.color,
    'Sube aqui',
    firstLeg.boardingStop.name,
    'fa-person-walking'
  ).addTo(window.map);
  activeLayers.transferDrop = createLabeledMarker(
    option.transfer.fromStop.lat,
    option.transfer.fromStop.lng,
    firstLeg.color,
    'Camina al transbordo',
    option.transfer.fromStop.name,
    'fa-shuffle'
  ).addTo(window.map);
  activeLayers.transferBoard = createLabeledMarker(
    option.transfer.toStop.lat,
    option.transfer.toStop.lng,
    secondLeg.color,
    'Toma siguiente ruta aqui',
    option.transfer.toStop.name,
    'fa-bus'
  ).addTo(window.map);
  activeLayers.finalDrop = createLabeledMarker(
    secondLeg.alightingStop.lat,
    secondLeg.alightingStop.lng,
    secondLeg.color,
    'Baja aqui',
    secondLeg.alightingStop.name,
    'fa-bell'
  ).addTo(window.map);

  window.puntoDescensoGuardado = window.L.latLng(secondLeg.alightingStop.lat, secondLeg.alightingStop.lng);

  const banner = document.getElementById('topBanner');
  const bannerText = document.getElementById('topBannerText');
  banner.style.display = 'flex';
  banner.style.borderLeft = `5px solid ${firstLeg.color}`;
  bannerText.innerHTML = `Transbordo: ${firstLeg.routeName} <span style="font-weight:400; opacity:0.8;">${firstLeg.directionLabel}</span> + ${secondLeg.routeName}`;

  document.getElementById('btnTomarRuta').style.display = 'flex';
  document.getElementById('btnCancelarRuta').style.display = 'none';

  fitMapToPoints([
    origin,
    firstLeg.boardingStop,
    option.transfer.fromStop,
    option.transfer.toStop,
    secondLeg.alightingStop,
    destination
  ]);
}

export async function renderOption(option, catalogs) {
  if (option.type === 'transfer') {
    await renderTransferOption(option, catalogs);
    return;
  }
  const variant = catalogs.variantsById.get(option.variantId);
  if (!variant) throw new Error(`Variante no encontrada: ${option.variantId}`);
  await renderDirectOption(option, variant);
}

window.ocultarMarcadoresSeleccionBase = hideBaseSelectionMarkers;
window.restaurarMarcadoresSeleccionBase = restoreBaseSelectionMarkers;
