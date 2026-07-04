import { getActiveVariants, loadCatalogs } from './route-data.js';
import { renderOption } from './map-renderer.js';
import { recommendTrips } from './route-engine.js';
import { searchLocations } from './search.js';
import { TripTracker } from './trip-tracker.js';

const PANEL_CLASSES = ['sheet-planner', 'sheet-results', 'sheet-detail', 'sheet-catalog'];

const state = {
  catalogs: null,
  tracker: new TripTracker(),
  results: new Map(),
  selectedOptionId: null,
  panel: 'planner',
  sheetExpanded: false
};

function activeZone() {
  return String(window.zonaSeleccionada || '').trim().toUpperCase();
}

function getOriginPoint() {
  return window.origenCoordenadasReal
    ? { lat: Number(window.origenCoordenadasReal.lat), lng: Number(window.origenCoordenadasReal.lng) }
    : null;
}

function getDestinationPoint() {
  return window.destinoCoordenadasReal
    ? { lat: Number(window.destinoCoordenadasReal.lat), lng: Number(window.destinoCoordenadasReal.lng) }
    : null;
}

function sidebarElement() {
  return document.getElementById('mobileSidebar');
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function syncMapAfterSheetResize() {
  if (window.map && typeof window.map.invalidateSize === 'function') {
    window.setTimeout(() => window.map.invalidateSize(), 320);
  }
}

function setSheetExpanded(expanded) {
  const nextValue = isMobileViewport() ? expanded : false;
  if (state.sheetExpanded === nextValue) return;
  state.sheetExpanded = nextValue;
  const sidebar = sidebarElement();
  document.body.classList.toggle('sheet-expanded', nextValue);
  if (sidebar) {
    sidebar.classList.toggle('is-expanded', nextValue);
  }
  syncMapAfterSheetResize();
}

window.setSheetExpanded = setSheetExpanded;

function setPanel(panel) {
  state.panel = panel;
  if (panel !== 'catalog') {
    document.body.classList.remove('catalog-collapsed');
  }
  if (panel === 'planner' || panel === 'catalog') {
    window.restaurarMarcadoresSeleccionBase?.();
  }
  const sidebar = sidebarElement();
  if (sidebar) {
    sidebar.dataset.panel = panel;
  }
  PANEL_CLASSES.forEach((className) => document.body.classList.remove(className));
  document.body.classList.add(`sheet-${panel}`);

  const catalogSection = document.getElementById('manualCatalogSection');
  if (catalogSection) {
    catalogSection.classList.toggle('hidden', panel !== 'catalog');
  }

  const reopenBtn = document.getElementById('btnReabrirPlanner');
  if (reopenBtn) {
    reopenBtn.classList.toggle('hidden', panel === 'planner' || panel === 'catalog');
  }

  syncMapAfterSheetResize();
}

function updatePlannerSummary() {
  const originLabel = document.getElementById('plannerSummaryOrigin');
  const destinationLabel = document.getElementById('plannerSummaryDestination');
  const originInput = document.getElementById('originInput');
  const destinationInput = document.getElementById('destinationInput');
  if (originLabel) {
    originLabel.textContent = originInput?.value?.trim() || 'Aun sin origen';
  }
  if (destinationLabel) {
    destinationLabel.textContent = destinationInput?.value?.trim() || 'Aun sin destino';
  }
}

function focusInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  window.setTimeout(() => {
    input.focus();
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 80);
}

function initMobileSheetBehavior() {
  const sidebar = sidebarElement();
  const mapElement = document.getElementById('map');
  if (!sidebar) return;

  let lastScrollTop = 0;
  let touchY = null;
  let pointerStartY = null;
  let pointerTracking = false;

  const handleScroll = () => {
    if (!isMobileViewport()) {
      lastScrollTop = 0;
      setSheetExpanded(false);
      return;
    }

    const currentScrollTop = Math.max(sidebar.scrollTop, 0);
    const scrollingDown = currentScrollTop > lastScrollTop;
    const scrollingUp = currentScrollTop < lastScrollTop;

    if (scrollingDown && currentScrollTop > 18) {
      setSheetExpanded(true);
    } else if (scrollingUp) {
      setSheetExpanded(false);
    }

    lastScrollTop = currentScrollTop;
  };

  const handleGesture = (deltaY) => {
    if (!isMobileViewport() || Math.abs(deltaY) < 10) return;
    if (deltaY > 0) {
      setSheetExpanded(true);
      return;
    }
    setSheetExpanded(false);
  };

  sidebar.addEventListener('scroll', handleScroll, { passive: true });
  sidebar.addEventListener('wheel', (event) => {
    handleGesture(event.deltaY);
  }, { passive: true });
  sidebar.addEventListener('touchstart', (event) => {
    touchY = event.touches?.[0]?.clientY ?? null;
  }, { passive: true });
  sidebar.addEventListener('touchmove', (event) => {
    const currentY = event.touches?.[0]?.clientY;
    if (touchY == null || currentY == null) return;
    handleGesture(touchY - currentY);
    touchY = currentY;
  }, { passive: true });
  sidebar.addEventListener('touchend', () => {
    touchY = null;
  }, { passive: true });
  sidebar.addEventListener('pointerdown', (event) => {
    if (isMobileViewport()) {
      setSheetExpanded(true);
    }
    pointerStartY = event.clientY;
    pointerTracking = event.clientY <= (sidebar.getBoundingClientRect().top + 120);
  });
  sidebar.addEventListener('pointermove', (event) => {
    if (!pointerTracking || pointerStartY == null) return;
    const deltaY = pointerStartY - event.clientY;
    if (Math.abs(deltaY) < 18) return;
    handleGesture(deltaY);
    pointerStartY = event.clientY;
  });
  sidebar.addEventListener('pointerup', () => {
    pointerStartY = null;
    pointerTracking = false;
  });
  sidebar.addEventListener('pointercancel', () => {
    pointerStartY = null;
    pointerTracking = false;
  });
  mapElement?.addEventListener('pointerdown', () => {
    if (isMobileViewport()) {
      setSheetExpanded(false);
    }
  });
  window.addEventListener('resize', () => {
    if (!isMobileViewport()) {
      sidebar.scrollTop = 0;
      lastScrollTop = 0;
      touchY = null;
      pointerStartY = null;
      pointerTracking = false;
      setSheetExpanded(false);
    }
  });
}

function setSelectedOption(optionId) {
  state.selectedOptionId = optionId;
  document.querySelectorAll('#lista-recomendados .ramal-item').forEach((node) => {
    node.classList.toggle('selected-route', node.dataset.optionId === optionId);
  });
}

function optionBadge(option) {
  if (option.type === 'transfer') {
    return '<span style="float:right; font-size:0.65rem; background:#f59e0b; color:#0f172a; padding:3px 6px; border-radius:10px; font-weight:bold;">TRANSBORDO</span>';
  }
  return '<span style="float:right; font-size:0.65rem; background:#2ecc71; color:#000; padding:3px 6px; border-radius:10px; font-weight:bold;">DIRECTA</span>';
}

function optionSummary(option) {
  if (option.type === 'transfer') {
    const [firstLeg, secondLeg] = option.legs;
    return `
      <span><i class="fa fa-person-walking"></i> Camina <b>${option.walkToBoardingMeters} m</b> a ${firstLeg.boardingStop.name}.</span>
      <span><i class="fa fa-bus"></i> ${firstLeg.routeName} <b>${firstLeg.directionLabel}</b>.</span>
      <span><i class="fa fa-shuffle"></i> Transborda en <b>${option.transfer.fromStop.name}</b> y camina <b>${option.transfer.walkDistanceMeters} m</b>${option.requiresCrossing ? ' (cruce de calle)' : ''}.</span>
      <span><i class="fa fa-bus"></i> ${secondLeg.routeName} <b>${secondLeg.directionLabel}</b>.</span>
      <span><i class="fa fa-map-pin"></i> Baja en <b>${secondLeg.alightingStop.name}</b> y camina <b>${option.walkFromAlightingMeters} m</b>.</span>
    `;
  }

  return `
    <span><i class="fa fa-person-walking"></i> Camina <b>${option.walkToBoardingMeters} m</b> a ${option.boardingStop.name}.</span>
    <span><i class="fa fa-bus"></i> Toma <b>${option.routeName}</b> en sentido <b>${option.directionLabel}</b>.</span>
    <span><i class="fa fa-map-pin"></i> Baja en <b>${option.alightingStop.name}</b>.</span>
    <span><i class="fa fa-clock"></i> Caminata final: <b>${option.walkFromAlightingMeters} m</b>.</span>
  `;
}

function buildSteps(option) {
  if (option.type === 'transfer') {
    const [firstLeg, secondLeg] = option.legs;
    return [
      {
        title: `Camina a ${firstLeg.boardingStop.name}`,
        detail: `${option.walkToBoardingMeters} metros desde tu origen.`
      },
      {
        title: `Sube a ${firstLeg.routeName}`,
        detail: `Sentido ${firstLeg.directionLabel}.`
      },
      {
        title: `Baja para transbordar en ${option.transfer.fromStop.name}`,
        detail: `Camina ${option.transfer.walkDistanceMeters} metros hasta ${option.transfer.toStop.name}${option.requiresCrossing ? ' y cruza con cuidado.' : '.'}`
      },
      {
        title: `Toma ${secondLeg.routeName}`,
        detail: `Sentido ${secondLeg.directionLabel}.`
      },
      {
        title: `Baja en ${secondLeg.alightingStop.name}`,
        detail: `Despues camina ${option.walkFromAlightingMeters} metros hasta tu destino.`
      }
    ];
  }

  return [
    {
      title: `Camina a ${option.boardingStop.name}`,
      detail: `${option.walkToBoardingMeters} metros desde tu origen.`
    },
    {
      title: `Sube a ${option.routeName}`,
      detail: `Sentido ${option.directionLabel}.`
    },
    {
      title: `Baja en ${option.alightingStop.name}`,
      detail: `Quedaras a ${option.walkFromAlightingMeters} metros del destino.`
    },
    {
      title: 'Camina al destino',
      detail: `Recorre los ultimos ${option.walkFromAlightingMeters} metros.`
    }
  ];
}

function renderDetail(option) {
  const stepsContainer = document.getElementById('detailRouteSteps');
  const meta = document.getElementById('detailRouteMeta');
  if (!stepsContainer || !meta) return;

  meta.textContent = option.type === 'transfer'
    ? `${option.routeName} - ${option.directionLabel}`
    : `${option.routeName} - ${option.directionLabel}`;

  stepsContainer.innerHTML = buildSteps(option)
    .map((step, index) => `
      <div class="step-item">
        <div class="step-number">${index + 1}</div>
        <div>
          <strong>${step.title}</strong>
          <span>${step.detail}</span>
        </div>
      </div>
    `)
    .join('');
}

function renderRecommendations(tripResults) {
  const panel = document.getElementById('recomendaciones-panel');
  const list = document.getElementById('lista-recomendados');
  const destinationName = document.getElementById('destinationInput').value || 'tu destino';
  state.results.clear();

  if (!tripResults.combined.length) {
    list.innerHTML = `
      <div class="ramal-item" style="padding:15px; border-left:4px solid #f59e0b; flex-direction:column; align-items:flex-start;">
        <div style="font-weight:700; margin-bottom:6px;"><i class="fa fa-triangle-exclamation"></i> Sin ruta confiable</div>
        <div style="font-size:0.82rem; line-height:1.35; opacity:0.92;">No encontre una combinacion suficientemente confiable con las variantes y paradas cargadas en esta zona.</div>
      </div>
    `;
    panel.style.display = 'block';
    window.recomendacionesRealesVisibles = false;
    if (typeof window.setGhostRecomendacionesVisible === 'function') {
      window.setGhostRecomendacionesVisible(false);
    }
    setPanel('results');
    return;
  }

  list.innerHTML = `
    <div style="margin-bottom: 15px; padding: 12px; background: rgba(255,255,255,0.05); border-left: 3px solid #3498db; border-radius: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.9);">
      <i class="fa fa-map-location-dot" style="color: #3498db; margin-right: 5px;"></i><b>Opciones hacia ${destinationName}</b>
    </div>
  `;

  tripResults.combined.forEach((option) => {
    state.results.set(option.optionId, option);
    const color = option.type === 'transfer' ? option.legs[0].color : option.color;
    list.insertAdjacentHTML('beforeend', `
      <div class="ramal-item" data-option-id="${option.optionId}" style="margin-bottom:10px; border-left:4px solid ${color}; flex-direction:column; align-items:flex-start; padding:12px;"
           onclick="window.__rutappShowOption('${option.optionId}')">
        <div style="width:100%; margin-bottom:8px;">
          <i class="fa fa-bus" style="color:${color};"></i>
          <b style="font-size:0.95rem;">${option.routeName}</b>
          ${optionBadge(option)}
        </div>
        <div style="font-size:0.75rem; display:flex; flex-direction:column; gap:4px;">
          ${optionSummary(option)}
        </div>
      </div>
    `);
  });

  panel.style.display = 'block';
  window.recomendacionesRealesVisibles = true;
  if (typeof window.setGhostRecomendacionesVisible === 'function') {
    window.setGhostRecomendacionesVisible(false);
  }
  if (typeof window.actualizarVisibilidadRecomendacionesUI === 'function') {
    window.actualizarVisibilidadRecomendacionesUI();
  }
  setPanel('results');
}

async function runRecommendation() {
  if (!state.catalogs) return;
  updatePlannerSummary();

  const originPoint = getOriginPoint();
  const destinationPoint = getDestinationPoint();
  if (!originPoint) {
    window.alert('Selecciona un origen valido.');
    return;
  }
  if (!destinationPoint) {
    window.alert('Selecciona un destino valido.');
    return;
  }

  const zone = activeZone();
  const list = document.getElementById('lista-recomendados');
  document.getElementById('recomendaciones-panel').style.display = 'block';
  list.innerHTML = '<div class="ramal-item" style="padding:15px;"><i class="fa fa-spinner fa-spin"></i> Analizando variantes, paradas y transbordos...</div>';
  document.getElementById('btnTomarRuta').style.display = 'none';
  setPanel('results');

  const variants = getActiveVariants(state.catalogs, zone);
  const results = recommendTrips(state.catalogs, variants, originPoint, destinationPoint);
  renderRecommendations(results);
}

async function showOption(optionId) {
  const option = state.results.get(optionId);
  if (!option || !state.catalogs) return;
  setSelectedOption(optionId);
  renderDetail(option);
  await renderOption(option, state.catalogs);
  setPanel('detail');
}

function buildSuggestionHtml(result) {
  const icon = result.type === 'stop' ? 'fa-bus-simple' : result.type === 'place' ? 'fa-location-dot' : 'fa-map-marker-alt';
  return `<i class="fa ${icon}" style="margin-right:8px;"></i> <b>${result.name}</b> <br><span style="opacity:0.55; font-size:0.72rem; margin-left:20px;">${result.detail}</span>`;
}

function bindSuggestionSelection(row, box, input, result, onSelect) {
  let consumed = false;

  const commitSelection = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (consumed) return;
    consumed = true;
    onSelect(result);
    box.style.display = 'none';
    input.blur();
  };

  row.addEventListener('pointerdown', commitSelection);
  row.addEventListener('touchend', commitSelection, { passive: false });
  row.addEventListener('click', commitSelection);
}

async function attachSearch(inputId, boxId, onSelect) {
  if (!state.catalogs) return;
  const input = document.getElementById(inputId);
  const box = document.getElementById(boxId);
  const query = input.value;
  if (query.trim().length < 2) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  box.innerHTML = '';
  if (!box.dataset.bindShield) {
    const stopBoxEvent = (event) => {
      event.stopPropagation();
    };
    box.addEventListener('pointerdown', stopBoxEvent);
    box.addEventListener('click', stopBoxEvent);
    box.dataset.bindShield = '1';
  }
  if (typeof window.ajustarCajaSugerencias === 'function') {
    window.ajustarCajaSugerencias(box, input);
  }

  const results = await searchLocations(state.catalogs, query, activeZone());
  results.forEach((result) => {
    const row = document.createElement('div');
    row.className = 'suggestion-item';
    row.innerHTML = buildSuggestionHtml(result);
    bindSuggestionSelection(row, box, input, result, onSelect);
    box.appendChild(row);
  });
}

function patchBaseHooks() {
  const originalSetOriginMarker = window.setOriginMarker;
  window.setOriginMarker = (...args) => {
    const result = originalSetOriginMarker.apply(window, args);
    updatePlannerSummary();
    return result;
  };

  const originalSelectOrigin = window.seleccionarLugarOrigen;
  window.seleccionarLugarOrigen = (...args) => {
    const result = originalSelectOrigin.apply(window, args);
    updatePlannerSummary();
    return result;
  };

  const originalSelectDestination = window.seleccionarLugarDestino;
  window.seleccionarLugarDestino = (...args) => {
    const result = originalSelectDestination.apply(window, args);
    updatePlannerSummary();
    return result;
  };

  const originalVolverInicio = window.volverInicio;
  window.volverInicio = (...args) => {
    state.results.clear();
    state.selectedOptionId = null;
    setPanel('planner');
    updatePlannerSummary();
    return originalVolverInicio.apply(window, args);
  };

  document.getElementById('originInput')?.addEventListener('input', updatePlannerSummary);
  document.getElementById('destinationInput')?.addEventListener('input', updatePlannerSummary);
}

function patchSearchFunctions() {
  const searchOrigin = () => attachSearch('originInput', 'originSuggestionsBox', (result) => {
    if (typeof window.seleccionarLugarOrigen === 'function') {
      window.seleccionarLugarOrigen(result.lat, result.lng, result.name);
    }
  });
  window.__rutappSearchOrigin = searchOrigin;
  window.buscarLugarOrigenAPI = searchOrigin;

  const searchDestination = () => attachSearch('destinationInput', 'suggestionsBox', (result) => {
    if (typeof window.seleccionarLugarDestino === 'function') {
      window.seleccionarLugarDestino(result.lat, result.lng, result.name);
    }
  });
  window.__rutappSearchDestination = searchDestination;
  window.buscarLugarAPI = searchDestination;
}

function patchRecommendationFunctions() {
  window.__rutappRunRecommendation = runRecommendation;
  window.__rutappShowOption = showOption;
  window.recomendarRutas = runRecommendation;
  window.mostrarItinerarioRecomendado = showOption;
  window.volverAEdicionViaje = () => {
    setPanel('planner');
    updatePlannerSummary();
  };
  window.editarInicioViaje = () => {
    setPanel('planner');
    focusInput('originInput');
  };
  window.editarDestinoViaje = () => {
    setPanel('planner');
    focusInput('destinationInput');
  };
  window.volverARutasSugeridas = () => {
    setPanel('results');
  };
  window.abrirCatalogoManual = () => {
    document.body.classList.remove('catalog-collapsed');
    setPanel('catalog');
    window.setSheetExpanded?.(true);
  };
  window.cerrarCatalogoManual = () => {
    document.body.classList.remove('catalog-collapsed');
    setPanel(state.selectedOptionId ? 'detail' : (state.results.size ? 'results' : 'planner'));
  };
}

function patchTripTracking() {
  const originalClearAllLayers = window.clearAllLayers;
  const originalConfirmCancelacion = window.confirmarCancelacion;
  const originalTerminarAlerta = window.terminarAlerta;

  window.iniciarViaje = async (wantsAlert) => {
    if (typeof window.cerrarModales === 'function') {
      window.cerrarModales();
    }
    const option = state.results.get(state.selectedOptionId);
    if (!option) {
      window.alert('Primero selecciona una recomendacion.');
      return;
    }

    const bannerText = document.getElementById('topBannerText');
    bannerText.innerHTML = `${bannerText.innerText} <span style="font-weight:400; opacity:0.8;">- Viaje Activo <i class="fa fa-circle-notch fa-spin"></i></span>`;
    document.getElementById('btnTomarRuta').style.display = 'none';
    document.getElementById('btnCancelarRuta').style.display = 'flex';

    await state.tracker.start(option, wantsAlert);
  };

  window.clearAllLayers = async (...args) => {
    await state.tracker.stop(false);
    state.selectedOptionId = null;
    state.results.clear();
    document.getElementById('detailRouteSteps').innerHTML = '';
    document.getElementById('detailRouteMeta').textContent = 'Elige una ruta sugerida para ver la guia paso a paso.';
    setPanel('planner');
    const result = originalClearAllLayers.apply(window, args);
    updatePlannerSummary();
    return result;
  };

  window.confirmarCancelacion = async (...args) => {
    await state.tracker.stop(true);
    setPanel('planner');
    return originalConfirmCancelacion.apply(window, args);
  };

  window.terminarAlerta = async (...args) => {
    await state.tracker.stop(false);
    setPanel('planner');
    return originalTerminarAlerta.apply(window, args);
  };
}

function tryAutoLocate() {
  if (window.origenCoordenadasReal || !navigator.geolocation) return;
  window.setTimeout(() => {
    if (!window.origenCoordenadasReal && typeof window.getUserLocation === 'function') {
      window.getUserLocation();
    }
  }, 600);
}

async function init() {
  state.catalogs = await loadCatalogs();
  window.__rutappCatalogs = state.catalogs;
  patchBaseHooks();
  patchSearchFunctions();
  patchRecommendationFunctions();
  patchTripTracking();
  initMobileSheetBehavior();
  updatePlannerSummary();
  setPanel('planner');
  tryAutoLocate();
}

init().catch((error) => {
  console.error('RutAPP bootstrap error', error);
});
