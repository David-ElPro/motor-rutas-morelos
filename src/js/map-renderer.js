import { loadRouteGeometry } from './route-data.js';

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

function fitMapToPoints(points) {
  const validPoints = points.filter(Boolean).map((point) => window.L.latLng(point.lat, point.lng));
  if (validPoints.length === 0) return;
  const bounds = window.L.latLngBounds(validPoints);
  window.map.fitBounds(bounds, { maxZoom: 16, padding: [70, 70], ...(window.getMapPadding ? window.getMapPadding() : {}) });
}

async function sliceVariantSegment(variant, fromStop, toStop) {
  const geojson = await loadRouteGeometry(variant.geojson_file);
  const line = pickMainLine(geojson);
  if (!line) return null;
  const from = window.turf.point([fromStop.lng, fromStop.lat]);
  const to = window.turf.point([toStop.lng, toStop.lat]);
  try {
    const sliced = window.turf.lineSlice(from, to, line);
    if (sliced?.geometry?.coordinates?.length >= 2) return sliced;
  } catch (error) {
    return line;
  }
  return line;
}

function clearActiveLayers() {
  if (typeof window.limpiarMarcadoresRutaGuiada === 'function') {
    window.limpiarMarcadoresRutaGuiada();
  }
  if (window.caminataLayer) {
    window.map.removeLayer(window.caminataLayer);
    window.caminataLayer = null;
  }
  if (window.capasActivas) {
    Object.keys(window.capasActivas).forEach((key) => {
      if (window.capasActivas[key]) window.map.removeLayer(window.capasActivas[key]);
      delete window.capasActivas[key];
    });
  }
}

async function renderDirectOption(option, variant) {
  clearActiveLayers();

  const routeSegment = await sliceVariantSegment(variant, option.boardingStop, option.alightingStop);
  const routeLayer = window.L.geoJSON(routeSegment, {
    style: { color: option.color, weight: 6, opacity: 0.96, lineJoin: 'round', lineCap: 'round' }
  }).addTo(window.map);

  window.capasActivas.rutaPrincipal = routeLayer;
  if (typeof window.agregarFlechasRuta === 'function') {
    window.agregarFlechasRuta(routeSegment, option.color);
  }

  const origin = window.origenCoordenadasReal;
  const destination = window.destinoCoordenadasReal;
  if (origin) {
    window.caminataLayer = window.L.polyline(
      [[origin.lat, origin.lng], [option.boardingStop.lat, option.boardingStop.lng]],
      { color: '#ffffff', weight: 4, dashArray: '6, 8', opacity: 0.85 }
    ).addTo(window.map);
  }

  const finalWalkLayer = destination
    ? window.L.polyline(
        [[option.alightingStop.lat, option.alightingStop.lng], [destination.lat, destination.lng]],
        { color: '#94a3b8', weight: 4, dashArray: '4, 10', opacity: 0.85 }
      ).addTo(window.map)
    : null;
  if (finalWalkLayer) {
    window.capasActivas.caminataFinal = finalWalkLayer;
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
  window.capasActivas.bajada = alightingMarker;
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
  const [firstLeg, secondLeg] = option.legs;
  const firstVariant = catalogs.variantsById.get(firstLeg.variantId);
  const secondVariant = catalogs.variantsById.get(secondLeg.variantId);
  const firstSegment = await sliceVariantSegment(firstVariant, firstLeg.boardingStop, firstLeg.alightingStop);
  const secondSegment = await sliceVariantSegment(secondVariant, secondLeg.boardingStop, secondLeg.alightingStop);

  window.capasActivas.ruta1 = window.L.geoJSON(firstSegment, {
    style: { color: firstLeg.color, weight: 6, opacity: 0.94 }
  }).addTo(window.map);
  window.capasActivas.ruta2 = window.L.geoJSON(secondSegment, {
    style: { color: secondLeg.color, weight: 6, opacity: 0.94 }
  }).addTo(window.map);

  const transferWalk = window.L.polyline(
    [
      [option.transfer.fromStop.lat, option.transfer.fromStop.lng],
      [option.transfer.toStop.lat, option.transfer.toStop.lng]
    ],
    { color: '#f59e0b', weight: 4, dashArray: '5, 7', opacity: 0.9 }
  ).addTo(window.map);
  window.capasActivas.transferWalk = transferWalk;

  const origin = window.origenCoordenadasReal;
  const destination = window.destinoCoordenadasReal;
  if (origin) {
    window.caminataLayer = window.L.polyline(
      [[origin.lat, origin.lng], [firstLeg.boardingStop.lat, firstLeg.boardingStop.lng]],
      { color: '#ffffff', weight: 4, dashArray: '6, 8', opacity: 0.85 }
    ).addTo(window.map);
  }
  if (destination) {
    window.capasActivas.caminataFinal = window.L.polyline(
      [[secondLeg.alightingStop.lat, secondLeg.alightingStop.lng], [destination.lat, destination.lng]],
      { color: '#94a3b8', weight: 4, dashArray: '4, 10', opacity: 0.85 }
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
  window.capasActivas.transferDrop = createLabeledMarker(
    option.transfer.fromStop.lat,
    option.transfer.fromStop.lng,
    firstLeg.color,
    'Camina al transbordo',
    option.transfer.fromStop.name,
    'fa-shuffle'
  ).addTo(window.map);
  window.capasActivas.transferBoard = createLabeledMarker(
    option.transfer.toStop.lat,
    option.transfer.toStop.lng,
    secondLeg.color,
    'Toma siguiente ruta aqui',
    option.transfer.toStop.name,
    'fa-bus'
  ).addTo(window.map);
  window.capasActivas.finalDrop = createLabeledMarker(
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
