// 1. CAPAS BASE: OSCURO Y SATÉLITE
    const mapaOscuro = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' });
    const mapaClaro = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' });
    const mapaSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{y}/{x}/{z}', { attribution: 'Tiles &copy; Esri' });

    const MAPA_INICIAL = { center: [18.9218, -99.2347], zoom: 13 };
    const MORELOS_BOUNDS = L.latLngBounds([[18.32, -99.62], [19.16, -98.54]]);
    const MORELOS_VIEWBOX = '-99.62,19.16,-98.54,18.32';
    const ZONE_FOCUS = {
        CENTRO: {
            center: [18.8800, -99.1988],
            zoom: 12.9,
            bounds: L.latLngBounds([[18.7210, -99.3257], [19.1233, -99.0281]]),
            viewbox: '-99.3257,19.1233,-99.0281,18.7210'
        },
        SUR: {
            center: [18.6550, -99.2419],
            zoom: 12.0,
            bounds: L.latLngBounds([[18.3815, -99.4938], [18.8775, -98.9512]]),
            viewbox: '-99.4938,18.8775,-98.9512,18.3815'
        },
        ORIENTE: {
            center: [18.8099, -98.9062],
            zoom: 11.9,
            bounds: L.latLngBounds([[18.4410, -99.1255], [19.0516, -98.6650]]),
            viewbox: '-99.1255,19.0516,-98.6650,18.4410'
        }
    };
    let zonaOverlay = null;
    let zoneBoundaryLayer = null;
    let zoneBoundaryDataPromise = null;
    let previewGuiadoRecomendaciones = false;
    let recomendacionesRealesVisibles = false;
    const map = L.map('map', {
        center: MAPA_INICIAL.center,
        zoom: MAPA_INICIAL.zoom,
        layers: [mapaOscuro],
        zoomControl: false,
        maxBounds: MORELOS_BOUNDS,
        maxBoundsViscosity: 1.0,
        minZoom: 9
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    let capaBaseActual = mapaOscuro;
    map.on('dragstart zoomstart movestart touchstart', () => {
        mapFueMovidoManual = true;
    });

    function establecerBaseMapa(capaBase) {
        if (capaBaseActual === capaBase && map.hasLayer(capaBaseActual)) return;
        [mapaOscuro, mapaClaro, mapaSatelite].forEach((capa) => {
            if (map.hasLayer(capa)) map.removeLayer(capa);
        });
        capaBaseActual = capaBase;
        if (!map.hasLayer(capaBaseActual)) map.addLayer(capaBaseActual);
    }

    let capasActivas = {};
    let caminataLayer = null;
    let abordajeMarker = null;
    let flechasRutaLayer = null;
    let locationPromptShown = false;
    let privacyAccepted = false;
    let routeCatalogManifest = null;
    let routeCatalogZoneCache = {};
    let requestedInitialLocation = false;
    let currentTheme = localStorage.getItem('rutapp.theme') || 'dark';
    let mapFueMovidoManual = false;
    const RUTAPP_PATHS = {
        route: (archivo) => {
            const limpio = String(archivo || '').replace(/^\.?\//, '').replace(/^public\//, '').replace(/^routes\//, '');
            return [`public/routes/${limpio}`, `routes/${limpio}`, limpio];
        },
        data: (archivo) => {
            const limpio = String(archivo || '').replace(/^\.?\//, '').replace(/^public\//, '').replace(/^data\//, '');
            return [`public/data/${limpio}`, `data/${limpio}`, limpio];
        },
        asset: (archivo) => {
            const limpio = String(archivo || '').replace(/^\.?\//, '').replace(/^public\//, '').replace(/^assets\//, '');
            return [`public/assets/${limpio}`, `assets/${limpio}`, limpio];
        }
    };
    window.__rutappPaths = RUTAPP_PATHS;

    async function fetchWithFallback(paths) {
        let lastError = null;
        for (const path of paths) {
            try {
                const res = await fetch(path);
                if (res.ok) return res;
                lastError = new Error(`HTTP ${res.status} en ${path}`);
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('No se pudo cargar recurso.');
    }

    async function cargarGeojsonRuta(archivo) {
        const res = await fetchWithFallback(RUTAPP_PATHS.route(archivo));
        return res.json();
    }

    async function cargarJsonDatos(archivo) {
        const res = await fetchWithFallback(RUTAPP_PATHS.data(archivo));
        return res.json();
    }

    // VARIABLES DE ORIGEN Y DESTINO
    let originMarker = null; // Marcador para la ubicación del usuario (geolocalización o clic)
    let accuracyCircle = null; // Círculo de precisión para la geolocalización
    let origenCoordenadasReal = null; // Coordenadas del origen seleccionado
    let marcadorOrigenUI = null; // Marcador para el origen cuando se selecciona manualmente por búsqueda
    let modoAjusteOrigen = false;
    let origenAnteriorAjuste = null;

    let destinoCoordenadasReal = null; // Coordenadas del destino seleccionado
    let marcadorDestinoUI = null; // Marcador para el destino
    let modoAjusteDestino = false;
    let destinoAnteriorAjuste = null;

    let timeoutBusqueda = null;

    // VARIABLES MODO VIAJE
    let puntoDescensoGuardado = null;
    let modoViajeTracker = null;
    let quiereAlertaBajada = false;

    // 2. CAPAS Y MENUS
    function toggleMenu(id) {
        const menu = document.getElementById(id);
        const arrow = menu.previousElementSibling.querySelector('.fa-chevron-down');
        const grupo = menu.closest('.grupo-ruta');
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
        arrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        if (grupo) grupo.classList.toggle('active', !isVisible);
    }

    function inicializarColoresCatalogo(scope = document) {
        const grupos = scope.querySelectorAll ? scope.querySelectorAll('.grupo-ruta') : [];
        grupos.forEach((grupo) => {
            const boton = grupo.querySelector('.ruta-master');
            if (!boton) return;
            const colorBase = boton.style.background || boton.style.backgroundColor || grupo.style.getPropertyValue('--route-color');
            if (colorBase) {
                grupo.style.setProperty('--route-color', colorBase.trim());
            }
        });
    }

    function actualizarEstadoGrupoRuta(item) {
        const grupo = item?.closest('.grupo-ruta');
        if (!grupo) return;
        const tieneActivas = !!grupo.querySelector('.ramal-item.active');
        grupo.classList.toggle('active', tieneActivas);
        const menu = grupo.querySelector('.ramales-container');
        const arrow = grupo.querySelector('.ruta-master .fa-chevron-down');
        if (tieneActivas && menu) {
            menu.style.display = 'block';
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        } else if (menu) {
            menu.style.display = 'none';
            if (arrow) arrow.style.transform = 'rotate(0deg)';
        }
    }

    function obtenerNombreCatalogoSeleccionado(item, archivo) {
        const texto = item?.textContent?.replace(/\s+/g, ' ').trim();
        if (texto) return texto;
        return archivo.replace('.geojson', '').replace(/_/g, ' ').toUpperCase();
    }

    function actualizarResumenCatalogoManual(nombre, color) {
        const resumen = document.getElementById('catalogSelectionSummary');
        const titulo = document.getElementById('catalogSelectionSummaryTitle');
        const icono = document.getElementById('catalogSelectionSummaryIcon');
        if (!resumen || !titulo || !icono) return;
        titulo.textContent = nombre || 'Ruta seleccionada';
        icono.style.color = color || 'var(--accent)';
        resumen.style.setProperty('--route-color', color || '#22c55e');
        resumen.classList.remove('hidden');
    }

    function resetearResumenCatalogoManual() {
        const resumen = document.getElementById('catalogSelectionSummary');
        const titulo = document.getElementById('catalogSelectionSummaryTitle');
        const icono = document.getElementById('catalogSelectionSummaryIcon');
        if (titulo) titulo.textContent = 'Ruta seleccionada';
        if (icono) icono.style.color = '';
        if (resumen) {
            resumen.classList.add('hidden');
            resumen.style.removeProperty('--route-color');
        }
        document.body.classList.remove('catalog-collapsed');
    }

    function colapsarCatalogoManual() {
        if (!window.matchMedia('(max-width: 768px)').matches) return;
        document.body.classList.add('catalog-collapsed');
        if (typeof window.setSheetExpanded === 'function') {
            window.setSheetExpanded(false);
        } else if (window.map && typeof window.map.invalidateSize === 'function') {
            window.setTimeout(() => window.map.invalidateSize(), 320);
        }
    }

    function expandirCatalogoManual() {
        document.body.classList.remove('catalog-collapsed');
        if (typeof window.setSheetExpanded === 'function') {
            window.setSheetExpanded(true);
        } else if (window.map && typeof window.map.invalidateSize === 'function') {
            window.setTimeout(() => window.map.invalidateSize(), 320);
        }
    }

    function limpiarSeleccionCatalogoManual(exceptKey = null) {
        const itemsActivos = document.querySelectorAll('#routes-list .ramal-item.active, #routes-list .ramal-item.selected-route');
        itemsActivos.forEach((activo) => {
            const keyActivo = activo.id?.startsWith('item-') ? activo.id.slice(5) : null;
            if (!keyActivo || keyActivo === exceptKey) return;
            if (capasActivas[keyActivo]) {
                map.removeLayer(capasActivas[keyActivo]);
                delete capasActivas[keyActivo];
            }
            quitarEstadoSeleccionadoRamal(activo);
            const iconoActivo = document.getElementById(`icon-${keyActivo}`);
            if (iconoActivo) {
                iconoActivo.className = 'far fa-circle';
                iconoActivo.style.color = 'inherit';
            }
            actualizarEstadoGrupoRuta(activo);
        });
    }

    function aplicarEstadoSeleccionadoRamal(item, color) {
        if (!item) return;
        item.style.setProperty('--route-color', color);
        item.classList.add('active');
        item.classList.add('selected-route');
        item.style.position = 'relative';
        item.style.zIndex = '2';
        item.style.border = '1px solid rgba(255,255,255,0.18)';
        item.style.background = '';
        item.style.boxShadow = `0 12px 28px rgba(0,0,0,0.26)`;
    }

    function quitarEstadoSeleccionadoRamal(item) {
        if (!item) return;
        item.classList.remove('active');
        item.classList.remove('selected-route');
        item.style.removeProperty('--route-color');
        item.style.removeProperty('position');
        item.style.removeProperty('z-index');
        item.style.removeProperty('border');
        item.style.removeProperty('background');
        item.style.removeProperty('box-shadow');
    }

    function limpiarMarcadoresRutaGuiada() {
        if (caminataLayer) {
            map.removeLayer(caminataLayer);
            caminataLayer = null;
        }
        if (abordajeMarker) {
            map.removeLayer(abordajeMarker);
            abordajeMarker = null;
        }
        puntoDescensoGuardado = null;
        document.getElementById('btnTomarRuta').style.display = 'none';
        document.getElementById('btnCancelarRuta').style.display = 'none';
    }

    function filterRoutes() {
        const searchInput = document.getElementById('routeSearch');
        const input = (searchInput?.value || '').toLowerCase();
        syncRouteSearchClearButton();
        const groups = document.querySelectorAll('.grupo-ruta');
        groups.forEach(group => {
            const text = (group.getAttribute('data-name') || group.innerText).toLowerCase();
            const groupZone = obtenerZonaGrupo(group);
            const matchesText = text.includes(input);
            const matchesZone = rutaVisibleEnZona(groupZone);
            if (matchesText && matchesZone) { group.classList.remove('hidden'); } else { group.classList.add('hidden'); }
        });
    }

    function syncRouteSearchClearButton() {
        const input = document.getElementById('routeSearch');
        const button = document.getElementById('clearRouteSearchBtn');
        if (!input || !button) return;
        button.classList.toggle('hidden', !(input.value || '').trim());
    }

    function clearRouteSearch() {
        const input = document.getElementById('routeSearch');
        if (!input) return;
        input.value = '';
        syncRouteSearchClearButton();
        filterRoutes();
        input.focus();
    }

    function clearAllLayers() {
        limpiarMarcadoresRutaGuiada();
        for (let key in capasActivas) {
            map.removeLayer(capasActivas[key]);
            const item = document.getElementById(`item-${key}`);
            const icon = document.getElementById(`icon-${key}`);
            if (item) { quitarEstadoSeleccionadoRamal(item); }
            if (icon) { icon.className = 'far fa-circle'; icon.style.color = 'inherit'; }
        }
        for (let prop in capasActivas) delete capasActivas[prop];

        // Limpiar estilos de recomendaciones
        const recItems = document.querySelectorAll('#lista-recomendados .ramal-item');
        recItems.forEach(el => el.classList.remove('selected-route'));

        limpiarFlechasRuta();
        document.getElementById('recomendaciones-panel').style.display = 'none';
        recomendacionesRealesVisibles = false;
        previewGuiadoRecomendaciones = false;
        setGhostRecomendacionesVisible(false);
        resetearResumenCatalogoManual();

        // Limpiar marcadores de origen y destino
        if (marcadorDestinoUI) map.removeLayer(marcadorDestinoUI);
        marcadorDestinoUI = null;
        destinoCoordenadasReal = null;
        destinoAnteriorAjuste = null;
        modoAjusteDestino = false;
        const destinationInput = document.getElementById('destinationInput');
        if (destinationInput) destinationInput.value = '';
        const destControls = document.getElementById('adjustDestinationControls');
        if (destControls) destControls.classList.remove('active');

        if (marcadorOrigenUI) map.removeLayer(marcadorOrigenUI);
        marcadorOrigenUI = null;
        origenCoordenadasReal = null;
        origenAnteriorAjuste = null;
        modoAjusteOrigen = false;
        const originInput = document.getElementById('originInput');
        if (originInput) originInput.value = '';
        const originControls = document.getElementById('adjustOriginControls');
        if (originControls) originControls.classList.remove('active');

        if (originMarker) map.removeLayer(originMarker);
        if (accuracyCircle) map.removeLayer(accuracyCircle);
        originMarker = null;
        accuracyCircle = null;

        puntoDescensoGuardado = null;
        clearTimeout(timeoutBusqueda);
        const suggestionsBox = document.getElementById('suggestionsBox');
        if (suggestionsBox) {
            suggestionsBox.innerHTML = '';
            suggestionsBox.style.display = 'none';
        }
        const originSuggestionsBox = document.getElementById('originSuggestionsBox');
        if (originSuggestionsBox) {
            originSuggestionsBox.innerHTML = '';
            originSuggestionsBox.style.display = 'none';
        }
        const lista = document.getElementById('lista-recomendados');
        if (lista) lista.innerHTML = '';

        // Resetear UI de Viaje
        document.getElementById('btnTomarRuta').style.display = 'none';
        document.getElementById('btnCancelarRuta').style.display = 'none';
        document.getElementById('topBanner').style.display = 'none';
        cerrarModales();
        document.getElementById('pantallaAlerta').style.display = 'none';

        if (modoViajeTracker) {
            navigator.geolocation.clearWatch(modoViajeTracker);
            modoViajeTracker = null;
        }
    }

    function resetearMapaInicial() {
        clearAllLayers();
        map.setView(MAPA_INICIAL.center, MAPA_INICIAL.zoom);
    }

    // Calcular padding dinámico para móviles
    function getMapPadding() {
        const isMobile = window.innerWidth <= 768;
        return {
            paddingTopLeft: [50, 50],
            paddingBottomRight: [50, isMobile ? (window.innerHeight * 0.55) : 50]
        };
    }

    function aplicarTema(nombreTema) {
        currentTheme = nombreTema === 'light' ? 'light' : 'dark';
        document.body.classList.toggle('theme-light', currentTheme === 'light');
        localStorage.setItem('rutapp.theme', currentTheme);
        establecerBaseMapa(currentTheme === 'light' ? mapaClaro : mapaOscuro);

        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) {
            themeBtn.innerHTML = currentTheme === 'light'
                ? '<i class="fa fa-moon"></i> <span>Modo oscuro</span>'
                : '<i class="fa fa-sun"></i> <span>Modo claro</span>';
            themeBtn.title = currentTheme === 'light' ? 'Modo Oscuro' : 'Modo Claro';
            themeBtn.setAttribute('aria-label', themeBtn.title);
            themeBtn.classList.toggle('theme-toggle-active', currentTheme === 'light');
        }

        const themeColor = currentTheme === 'light' ? '#f8fafc' : '#0f172a';
        let themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) themeMeta.setAttribute('content', themeColor);
    }

    function toggleTheme() {
        aplicarTema(currentTheme === 'light' ? 'dark' : 'light');
    }

    function toggleHeaderMenu() {
        const menu = document.getElementById('headerMenuAcciones');
        const isOpen = menu && menu.classList.contains('open');
        cerrarHeaderMenu();
        if (!isOpen && menu) {
            menu.classList.add('open');
            menu.setAttribute('aria-hidden', 'false');
        }
    }

    function cerrarHeaderMenu() {
        const menu = document.getElementById('headerMenuAcciones');
        if (!menu) return;
        menu.classList.remove('open');
        menu.setAttribute('aria-hidden', 'true');
    }

    function cerrarModalPorId(id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    }

    document.addEventListener('click', (event) => {
        const menu = document.getElementById('headerMenuAcciones');
        const dropdown = document.querySelector('.header-dropdown');
        if (!menu || !dropdown) return;
        if (!menu.classList.contains('open')) return;
        if (!dropdown.contains(event.target)) {
            cerrarHeaderMenu();
        }
    });

    function setGhostRecomendacionesVisible(visible) {
        const ghost = document.getElementById('recomendacionesGhost');
        if (!ghost) return;
        ghost.classList.toggle('visible', !!visible);
        ghost.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function actualizarVisibilidadRecomendacionesUI() {
        const panel = document.getElementById('recomendaciones-panel');
        if (!panel) return;
        const debeMostrar = previewGuiadoRecomendaciones || recomendacionesRealesVisibles;
        panel.style.display = debeMostrar ? 'block' : 'none';
        setGhostRecomendacionesVisible(previewGuiadoRecomendaciones || (!recomendacionesRealesVisibles && debeMostrar));
    }

    const GUIA_VERSION = '2026-06-11';
    const GUIA_TUTORIAL = [
        {
            title: 'Bienvenido a RutAPP Morelos',
            focus: null,
            icon: 'fa-map-location-dot',
            color: '#38bdf8',
            text: 'Primero elige una zona para que la app cargue solo sus rutas y catálogos. Después podrás buscar tu destino con una navegación más precisa.',
            bullets: [
                'Zona Centro, Oriente o Sur.',
                'La recomendación se ajusta a la zona seleccionada.',
                'Puedes regresar al inicio cuando quieras.'
            ]
        },
        {
            title: 'Define tu origen',
            focus: '#originInput',
            icon: 'fa-location-dot',
            color: '#22c55e',
            text: 'Aquí introduces el lugar desde donde quieres salir. Puedes escribir una dirección, un punto conocido, usar tu ubicación actual o fijarlo manualmente en el mapa.',
            bullets: [
                'Empieza a escribir y verás sugerencias.',
                'Usa el botón de ubicación actual para fijar tu posición.',
                'Usa el pin para fijar el origen manualmente en el mapa.'
            ]
        },
        {
            title: 'Escribe tu destino',
            focus: '#destinationInput',
            icon: 'fa-location-arrow',
            color: '#38bdf8',
            text: 'Aquí introduces el lugar al que quieres llegar. Puedes escribir una colonia, un punto conocido o usar una sugerencia para llenar el campo más rápido.',
            bullets: [
                'Empieza a escribir y verás sugerencias.',
                'La app filtra resultados por zona.',
                'Si ya conoces tu destino, selecciónalo de la lista.'
            ]
        },
        {
            title: 'Calcula la ruta',
            focus: '#btnCalcularRuta',
            icon: 'fa-route',
            color: '#22c55e',
            text: 'Cuando ya tengas el origen y el destino, presiona Calcular Ruta para que la app analice el sentido, la subida, la bajada y la caminata final.',
            bullets: [
                'La app busca la opción más conveniente.',
                'También evita rutas que se alejan de tu destino.',
                'El resultado te muestra la mejor parada para subir y bajar.'
            ]
        },
        {
            title: 'Revisa las recomendaciones',
            focus: '#recomendaciones-panel',
            icon: 'fa-list-check',
            color: '#f59e0b',
            text: 'Aquí aparecen las rutas recomendadas. La primera suele ser la mejor opción y te muestra cuánto caminar, dónde subir y dónde bajar.',
            bullets: [
                'La mejor opción se marca como recomendación principal.',
                'Cada tarjeta incluye la caminata y la bajada sugerida.',
                'Toca una opción para verla trazada en el mapa.'
            ]
        },
        {
            title: 'Ajusta origen o destino manualmente',
            focus: '#btnAjustarOrigen', // Usaremos el botón de origen como ejemplo para el ajuste manual
            icon: 'fa-map-pin',
            color: '#a855f7',
            text: 'Si no sabes la dirección exacta, usa los botones de pin para ajustar el origen o el destino manualmente en el mapa. Confirma solo cuando el punto esté bien colocado.',
            bullets: [
                'Arrastra el pin hasta el lugar correcto.',
                'Confirma para recalcular la ruta.',
                'Cancela si quieres volver al punto anterior.'
            ]
        },
        {
            title: 'Explora el menú',
            focus: '#btnLimpiar',
            icon: 'fa-screwdriver-wrench',
            color: '#ef4444',
            text: 'Usa Inicio para cambiar de zona, Términos para consultar el aviso, Guía para volver a este tutorial y Limpiar para reiniciar todo el mapa.',
            bullets: [
                'Inicio regresa al selector de zonas.',
                'Términos muestra el aviso completo.',
                'Limpiar borra origen, destino y resultados.'
            ]
        }
    ];
    const GUIA_RESUMIDA = [
        { focus: '#originInput', text: 'Empieza escribiendo tu origen o usa tu ubicación actual.' },
        { focus: '#originInput', text: 'Escribe un lugar y toca una sugerencia si aparece.' },
        { focus: '#destinationInput', text: 'Ahora escribe tu destino.' },
        { focus: '#btnCalcularRuta', text: 'Pulsa calcular para buscar la ruta conveniente.' },
        { focus: '#recomendaciones-panel', text: 'Aquí aparecerá la mejor opción para subir y bajar.' },
        { focus: '#btnAjustarOrigen', text: 'Si no sabes la dirección, mueve el pin manualmente.' },
        { focus: '#btnLimpiar', text: 'Inicio cambia zona, Términos consulta el aviso, Guía repite esto y Limpiar reinicia.' }
    ];
    GUIA_TUTORIAL.forEach((paso, index) => {
        if (!GUIA_RESUMIDA[index]) return;
        paso.focus = GUIA_RESUMIDA[index].focus;
        paso.text = GUIA_RESUMIDA[index].text;
        paso.bullets = [];
    });
    let pasoGuiaActual = 0;
    let guiaObjetivoAnterior = null;

    function limpiarResaltadoGuia() {
        if (guiaObjetivoAnterior) {
            const anterior = document.querySelector(guiaObjetivoAnterior);
            if (anterior) anterior.classList.remove('guide-highlight', 'guide-spotlight');
            guiaObjetivoAnterior = null;
        }
        const guideBackdrop = document.getElementById('guideBackdrop');
        if (guideBackdrop) guideBackdrop.classList.add('visible');
    }

    function actualizarSpotlightGuia(paso) {
        const guideBackdrop = document.getElementById('guideBackdrop');
        if (!guideBackdrop || !paso) return;

        const objetivo = paso.focus ? document.querySelector(paso.focus) : null;
        if (!objetivo) {
            guideBackdrop.classList.add('visible');
            return;
        }

        const rect = objetivo.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) / 2 + 44;
        guideBackdrop.style.setProperty('--guide-hole-x', `${Math.round(rect.left + rect.width / 2)}px`);
        guideBackdrop.style.setProperty('--guide-hole-y', `${Math.round(rect.top + rect.height / 2)}px`);
        guideBackdrop.style.setProperty('--guide-hole-size', `${Math.round(size)}px`);
        guideBackdrop.classList.add('visible');
    }

    function renderizarGuiaPaso() {
        const paso = GUIA_TUTORIAL[pasoGuiaActual];
        const titulo = document.getElementById('guideTitle');
        const texto = document.getElementById('guideText');
        const lista = document.getElementById('guideList');
        const stepper = document.getElementById('guideStepper');
        const btnBack = document.getElementById('guideBackBtn');
        const btnNext = document.getElementById('guideNextBtn');

        if (!paso || !titulo || !texto || !lista || !stepper) return;

        titulo.textContent = paso.title;
        texto.textContent = paso.text;
        lista.innerHTML = (paso.bullets || []).map((bullet) => `<li>${bullet}</li>`).join('');
        previewGuiadoRecomendaciones = paso.focus === '#recomendaciones-panel';
        if (previewGuiadoRecomendaciones) {
            const panel = document.getElementById('recomendaciones-panel');
            if (panel) {
                panel.style.display = 'block';
                if (!recomendacionesRealesVisibles) {
                    const listaRecomendados = document.getElementById('lista-recomendados');
                    if (listaRecomendados && !listaRecomendados.dataset.simulado) {
                        listaRecomendados.innerHTML = '';
                        listaRecomendados.dataset.simulado = '1';
                    }
                }
            }
        } else if (!recomendacionesRealesVisibles) {
            const panel = document.getElementById('recomendaciones-panel');
            if (panel) panel.style.display = 'none';
        }
        actualizarVisibilidadRecomendacionesUI();

        stepper.innerHTML = GUIA_TUTORIAL.map((_, index) => `<span class="guide-dot ${index === pasoGuiaActual ? 'active' : ''}"></span>`).join('');

        if (btnBack) btnBack.disabled = pasoGuiaActual === 0;
        if (btnBack) btnBack.style.opacity = pasoGuiaActual === 0 ? '0.45' : '1';
        if (btnNext) {
            const ultimoPaso = pasoGuiaActual >= GUIA_TUTORIAL.length - 1;
            btnNext.innerHTML = ultimoPaso ? '<i class="fa fa-flag-checkered"></i> Terminar' : '<i class="fa fa-arrow-right"></i> Siguiente';
            btnNext.onclick = ultimoPaso ? cerrarGuiaUsuario : () => irPasoGuia(1);
        }

        limpiarResaltadoGuia();
        if (paso.focus) {
            const objetivo = document.querySelector(paso.focus);
            if (objetivo) {
                objetivo.classList.add('guide-highlight', 'guide-spotlight');
                guiaObjetivoAnterior = paso.focus;
                if (typeof objetivo.scrollIntoView === 'function') {
                    objetivo.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
                }
                if (typeof objetivo.focus === 'function' && objetivo.tagName === 'INPUT') {
                    setTimeout(() => objetivo.focus({ preventScroll: true }), 120);
                }
                setTimeout(() => actualizarSpotlightGuia(paso), 100);
                return;
            }
        }
        actualizarSpotlightGuia(paso);
    }

    function irPasoGuia(delta) {
        pasoGuiaActual = Math.min(GUIA_TUTORIAL.length - 1, Math.max(0, pasoGuiaActual + delta));
        renderizarGuiaPaso();
    }

    function abrirGuiaUsuario() {
        pasoGuiaActual = 0;
        const guideBackdrop = document.getElementById('guideBackdrop');
        if (guideBackdrop) guideBackdrop.classList.add('visible');
        document.getElementById('modalGuiaUsuario').style.display = 'flex';
        renderizarGuiaPaso();
    }

    function cerrarGuiaUsuario() {
        limpiarResaltadoGuia();
        previewGuiadoRecomendaciones = false;
        actualizarVisibilidadRecomendacionesUI();
        localStorage.setItem('rutapp.guide.version', GUIA_VERSION);
        cerrarModalPorId('modalGuiaUsuario');
        const guideBackdrop = document.getElementById('guideBackdrop');
        if (guideBackdrop) guideBackdrop.classList.remove('visible');
        if (window._resolveGuidePromise) {
            window._resolveGuidePromise();
            delete window._resolveGuidePromise;
        }
    }

    function mostrarGuiaInicialSiHaceFalta() {
        const guideVersion = localStorage.getItem('rutapp.guide.version');
        if (guideVersion === GUIA_VERSION) return Promise.resolve();
        return new Promise(resolve => {
            window._resolveGuidePromise = resolve;
            setTimeout(() => abrirGuiaUsuario(), 800);
        });
    }

    function mostrarTerminosSiHaceFalta() {
        const termsVersion = localStorage.getItem('rutapp.terms.version');
        if (termsVersion === GUIA_VERSION) return Promise.resolve();
        return new Promise(resolve => {
            window._resolveTermsPromise = resolve;
            abrirAvisoPrivacidad();
        });
    }

    function montarGuiaUsuario() {
        const modal = document.getElementById('modalGuiaUsuario');
        if (!modal || modal.dataset.montada === '1') return;
        modal.innerHTML = `
            <div class="modal-content data-modal">
                <i class="fa fa-map-location-dot modal-icon" style="color: #22c55e; font-size: 2rem;"></i>
                <h3 id="guideTitle">Guía de uso</h3>
                <div id="guideStepper" class="guide-stepper"></div>
                <div class="data-modal-body">
                    <p id="guideText"></p>
                    <ul id="guideList"></ul>
                </div>
                <div class="guide-modal-actions">
                    <button id="guideBackBtn" class="modal-btn btn-secondary" onclick="irPasoGuia(-1)"><i class="fa fa-arrow-left"></i> Atrás</button>
                    <button id="guideNextBtn" class="modal-btn btn-primary" onclick="irPasoGuia(1)"><i class="fa fa-arrow-right"></i> Siguiente</button>
                    <button class="modal-btn btn-secondary" onclick="cerrarGuiaUsuario()"><i class="fa fa-check"></i> Entendido</button>
                </div>
            </div>`;
        modal.dataset.montada = '1';
    }

    function limpiarFlechasRuta() {
        if (flechasRutaLayer) {
            map.removeLayer(flechasRutaLayer);
            flechasRutaLayer = null;
        }
    }

    function obtenerCoordenadasLinea(data) {
        if (!data) return [];
        if (data.type === 'FeatureCollection') {
            const feature = data.features.find((item) => item.geometry && (item.geometry.type === 'LineString' || item.geometry.type === 'MultiLineString'));
            return obtenerCoordenadasLinea(feature);
        }
        if (data.type === 'Feature') {
            return obtenerCoordenadasLinea(data.geometry);
        }
        if (data.type === 'LineString') {
            return data.coordinates || [];
        }
        if (data.type === 'MultiLineString') {
            return (data.coordinates || []).flat();
        }
        return [];
    }

    function calcularRumbo(origen, destino) {
        const lat1 = origen[1] * Math.PI / 180;
        const lat2 = destino[1] * Math.PI / 180;
        const deltaLon = (destino[0] - origen[0]) * Math.PI / 180;
        const y = Math.sin(deltaLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function diferenciaAngular(a, b) {
        const diff = Math.abs(a - b) % 360;
        return diff > 180 ? 360 - diff : diff;
    }

    function agregarFlechasRuta(data, color) {
        const coordinates = obtenerCoordenadasLinea(data);
        if (coordinates.length < 2) return;

        limpiarFlechasRuta();
        flechasRutaLayer = L.layerGroup().addTo(map);

        const paso = Math.max(2, Math.floor(coordinates.length / 5));
        for (let index = 0; index < coordinates.length - 1; index += paso) {
            const origen = coordinates[index];
            const targetIndex = Math.min(index + paso, coordinates.length - 1);
            const destino = coordinates[targetIndex];
            if (!origen || !destino) continue;

            const rumbo = calcularRumbo(origen, destino);
            const arrowIcon = L.divIcon({
                className: 'ruta-arrow-icon',
                html: `
                    <div style="transform: rotate(${rumbo}deg); width: 28px; height: 28px; display:flex; align-items:center; justify-content:center; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.45));">
                        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
                            <path d="M5 16 H21" stroke="rgba(255,255,255,0.9)" stroke-width="4.6" stroke-linecap="round"></path>
                            <path d="M17 9 L26 16 L17 23" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"></path>
                            <path d="M5 16 H21" stroke="${color}" stroke-width="3" stroke-linecap="round"></path>
                            <path d="M17 9 L26 16 L17 23" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            const markerIndex = Math.min(
                coordinates.length - 1,
                index + Math.max(1, Math.floor((targetIndex - index) / 2))
            );
            const puntoSobreRuta = coordinates[markerIndex] || origen;

            L.marker([puntoSobreRuta[1], puntoSobreRuta[0]], {
                icon: arrowIcon,
                interactive: false
            }).addTo(flechasRutaLayer);
        }
    }

    function resolverUrlRuta(archivo) {
        return RUTAPP_PATHS.route(archivo)[0];
    }

    async function toggleLayer(key, archivo, color) {
        const item = document.getElementById(`item-${key}`);
        const icon = document.getElementById(`icon-${key}`);
        const zonaRuta = obtenerZonaRutaPorArchivo(archivo);

        if (!rutaVisibleEnZona(zonaRuta)) {
            alert('Esa ruta no pertenece a la zona seleccionada.');
            return;
        }

        if (capasActivas[key] && item?.classList.contains('active')) {
            actualizarResumenCatalogoManual(obtenerNombreCatalogoSeleccionado(item, archivo), color);
            colapsarCatalogoManual();
            const bounds = capasActivas[key].getBounds?.();
            if (bounds && bounds.isValid && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [24, 24], animate: true, duration: 0.45 });
            }
            return;
        }

        try {
            const data = await cargarGeojsonRuta(archivo);
            const nombreRutaLimpio = archivo.replace('.geojson', '').replace(/_/g, ' ').toUpperCase();
            limpiarSeleccionCatalogoManual(key);

            if (capasActivas[key]) {
                map.removeLayer(capasActivas[key]);
                delete capasActivas[key];
            }

            const layer = L.geoJSON(data, {
                style: { color: color, weight: 6, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }
            }).bindTooltip(`<div style="font-size:14px;"><i class="fa fa-bus" style="color:${color}"></i> ${nombreRutaLimpio}</div>`, { className: 'custom-tooltip', sticky: true, direction: "auto" }).addTo(map);

            capasActivas[key] = layer;
            if(item) {
                aplicarEstadoSeleccionadoRamal(item, color);
                const grupo = item.closest('.grupo-ruta');
                if (grupo) {
                    grupo.style.setProperty('--route-color', color);
                }
                actualizarEstadoGrupoRuta(item);
                actualizarResumenCatalogoManual(obtenerNombreCatalogoSeleccionado(item, archivo), color);
            }
            if(icon) { icon.className = 'fas fa-check-circle'; icon.style.color = color; }

            colapsarCatalogoManual();
            const bounds = layer.getBounds?.();
            if (bounds && bounds.isValid && bounds.isValid()) {
                map.fitBounds(bounds, { padding: [24, 24], animate: true, duration: 0.45 });
            }
        } catch (e) { alert("Asegúrate de que el archivo " + archivo + " esté descargado."); }
    }

    inicializarColoresCatalogo();
    syncRouteSearchClearButton();

    // 3. GEOLOCALIZACION Y ORIGEN MANUAL
    const userIcon = L.divIcon({
        className: 'custom-user-icon',
        html: '<div style="background:#007aff; width:20px; height:20px; border-radius:50%; border:3px solid white; box-shadow: 0 0 15px rgba(0,122,255,0.8);"></div>',
        iconSize: [26, 26], iconAnchor: [13, 13]
    });

    function setOriginMarker(latlng, nombre = "Mi ubicación") {
        origenCoordenadasReal = { lat: latlng.lat, lng: latlng.lng };

        if (marcadorOrigenUI) { // Si hay un marcador de origen por búsqueda, lo removemos
            map.removeLayer(marcadorOrigenUI);
            marcadorOrigenUI = null;
        }

        if (originMarker) {
            originMarker.setLatLng(latlng);
            if (accuracyCircle) accuracyCircle.setLatLng(latlng);
        } else {
            originMarker = L.marker(latlng, { icon: userIcon, draggable: true, zIndexOffset: 1000 }).addTo(map);
            originMarker.bindPopup("<div style='text-align:center;'><b>Tu Origen</b><br><span style='font-size:0.8rem; opacity:0.8;'>Arrastra este pin para ajustar tu ubicación</span></div>").openPopup();
            originMarker.on('dragend', function() {
                const newPos = originMarker.getLatLng();
                if (accuracyCircle) accuracyCircle.setLatLng(newPos);
                origenCoordenadasReal = { lat: newPos.lat, lng: newPos.lng };
                if (destinoCoordenadasReal && document.getElementById('recomendaciones-panel').style.display === 'block') {
                    recomendarRutas();
                }
            });
        }
        document.getElementById('originInput').value = nombre;
        document.getElementById('originSuggestionsBox').style.display = 'none';

        if (destinoCoordenadasReal && document.getElementById('recomendaciones-panel').style.display === 'block') {
            recomendarRutas();
        }
    }

    function getUserLocation() {
        if (!navigator.geolocation) {
            alert('Tu navegador no soporta geolocalización. Podrás marcar tu origen manualmente.');
            return;
        }
        map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    }

    function ajustarCajaSugerencias(box, input) {
        if (!box || !input) return;
        const viewport = window.visualViewport;
        const viewportHeight = viewport ? viewport.height : window.innerHeight;
        const viewportTop = viewport ? viewport.offsetTop : 0;
        const rect = input.getBoundingClientRect();
        const espacioAbajo = (viewportTop + viewportHeight) - rect.bottom;
        const espacioArriba = rect.top - viewportTop;
        const tecladoVisible = viewport ? viewportHeight < (window.innerHeight - 60) : false;
        const abrirArriba = tecladoVisible && espacioAbajo < 230 && espacioArriba > espacioAbajo;
        box.classList.toggle('suggestions-open-up', abrirArriba);
        box.style.maxHeight = abrirArriba
            ? `${Math.max(140, Math.min(220, Math.floor(espacioArriba - 20)))}px`
            : `${Math.max(140, Math.min(220, Math.floor(espacioAbajo - 20)))}px`;
    }

    function actualizarPosicionSugerenciasActivas() {
        const originBox = document.getElementById('originSuggestionsBox');
        const destinationBox = document.getElementById('suggestionsBox');
        if (originBox && originBox.style.display === 'block') {
            ajustarCajaSugerencias(originBox, document.getElementById('originInput'));
        }
        if (destinationBox && destinationBox.style.display === 'block') {
            ajustarCajaSugerencias(destinationBox, document.getElementById('destinationInput'));
        }
    }

    map.on('locationfound', function(e) {
        const radius = e.accuracy / 2;
        setOriginMarker(e.latlng, "Mi ubicación actual");
        localStorage.setItem('rutapp.location.preference', 'granted');
        cerrarModalPorId('modalPermisoUbicacion');
        resolverPromesaUbicacionInicial();
        if (!accuracyCircle) {
            accuracyCircle = L.circle(e.latlng, radius, { color: "#007aff", fillColor: "#007aff", fillOpacity: 0.15, weight: 1 }).addTo(map);
        } else { accuracyCircle.setRadius(radius); }
        map.setView(e.latlng, Math.max(map.getZoom(), 16));
    });

    map.on('locationerror', function(e) {
        console.warn('Error de ubicación:', e && e.message ? e.message : e);
        localStorage.setItem('rutapp.location.preference', 'manual');
        cerrarModalPorId('modalPermisoUbicacion');
        resolverPromesaUbicacionInicial();
        alert('No pudimos obtener tu ubicación. Puedes colocar tu origen manualmente tocando el mapa.');
    });

    map.on('contextmenu', function(e) {
        if (!modoAjusteDestino) { // Solo si no estamos ajustando el destino
            setOriginMarker(e.latlng, "Origen manual");
            if (destinoCoordenadasReal && document.getElementById('recomendaciones-panel').style.display === 'block') { recomendarRutas(); }
        }
    });

    map.on('click', function(e) {
        const preferenciaUbicacion = localStorage.getItem('rutapp.location.preference');
        if ((preferenciaUbicacion === 'manual' || !origenCoordenadasReal) && !modoAjusteDestino) {
            setOriginMarker(e.latlng, "Origen manual");
            if (destinoCoordenadasReal && document.getElementById('recomendaciones-panel').style.display === 'block') {
                recomendarRutas();
            }
        }
    });

    // 4. AUTOCOMPLETADO
    const baseLocal = [
        { nombre: "Mercado Adolfo López Mateos (ALM)", tipo: "lugar", lat: 18.9225, lon: -99.2312, zonas: ['CENTRO'] },
        { nombre: "Zócalo de Cuernavaca", tipo: "lugar", lat: 18.9218, lon: -99.2347, zonas: ['CENTRO'] },
        { nombre: "UAEM Chamilpa", tipo: "lugar", lat: 18.9833, lon: -99.2354, zonas: ['CENTRO'] },
        { nombre: "IMSS Plan de Ayala", tipo: "lugar", lat: 18.9189, lon: -99.2132, zonas: ['CENTRO'] },
        { nombre: "Walmart Jiutepec", tipo: "lugar", lat: 18.8833, lon: -99.1747, zonas: ['CENTRO'] },
        { nombre: "CIVAC (Centro)", tipo: "lugar", lat: 18.8950, lon: -99.1820, zonas: ['CENTRO'] },
        { nombre: "Bodega Aurrera Jiutepec", tipo: "lugar", lat: 18.8856, lon: -99.1732, zonas: ['CENTRO'] },
        { nombre: "Zócalo de Cuautla", tipo: "lugar", lat: 18.8100, lon: -98.9350, zonas: ['ORIENTE'] },
        { nombre: "Hospital General de Cuautla", tipo: "lugar", lat: 18.8045, lon: -98.9379, zonas: ['ORIENTE'] },
        { nombre: "Centro de Yautepec", tipo: "lugar", lat: 18.8837, lon: -99.0597, zonas: ['ORIENTE'] },
        { nombre: "Zócalo de Jojutla", tipo: "lugar", lat: 18.6175, lon: -99.1768, zonas: ['SUR'] },
        { nombre: "Centro de Zacatepec", tipo: "lugar", lat: 18.6587, lon: -99.1901, zonas: ['SUR'] },
        { nombre: "Centro de Puente de Ixtla", tipo: "lugar", lat: 18.6129, lon: -99.3194, zonas: ['SUR'] }
    ];

    const ZONAS_APP = ['CENTRO', 'ORIENTE', 'SUR'];
    let zonaSeleccionada = sessionStorage.getItem('rutapp.zona') || '';

    Object.defineProperties(window, {
        map: {
            configurable: true,
            get: () => map
        },
        zonaSeleccionada: {
            configurable: true,
            get: () => zonaSeleccionada,
            set: (value) => { zonaSeleccionada = value; }
        },
        origenCoordenadasReal: {
            configurable: true,
            get: () => origenCoordenadasReal,
            set: (value) => { origenCoordenadasReal = value; }
        },
        destinoCoordenadasReal: {
            configurable: true,
            get: () => destinoCoordenadasReal,
            set: (value) => { destinoCoordenadasReal = value; }
        },
        capasActivas: {
            configurable: true,
            get: () => capasActivas,
            set: (value) => { capasActivas = value || {}; }
        },
        caminataLayer: {
            configurable: true,
            get: () => caminataLayer,
            set: (value) => { caminataLayer = value; }
        },
        abordajeMarker: {
            configurable: true,
            get: () => abordajeMarker,
            set: (value) => { abordajeMarker = value; }
        },
        marcadorOrigenUI: {
            configurable: true,
            get: () => marcadorOrigenUI,
            set: (value) => { marcadorOrigenUI = value; }
        },
        marcadorDestinoUI: {
            configurable: true,
            get: () => marcadorDestinoUI,
            set: (value) => { marcadorDestinoUI = value; }
        },
        puntoDescensoGuardado: {
            configurable: true,
            get: () => puntoDescensoGuardado,
            set: (value) => { puntoDescensoGuardado = value; }
        },
        previewGuiadoRecomendaciones: {
            configurable: true,
            get: () => previewGuiadoRecomendaciones,
            set: (value) => { previewGuiadoRecomendaciones = !!value; }
        },
        recomendacionesRealesVisibles: {
            configurable: true,
            get: () => recomendacionesRealesVisibles,
            set: (value) => { recomendacionesRealesVisibles = !!value; }
        }
    });

    function normalizarZona(valor) {
        return String(valor || '').trim().toUpperCase();
    }

    function obtenerZonaGrupo(elemento) {
        const zonaDirecta = normalizarZona(elemento?.dataset?.zone || '');
        if (zonaDirecta) return zonaDirecta;
        const texto = normalizarZona(elemento?.dataset?.name || elemento?.innerText || '');
        const match = texto.match(/RUTA\s+(\d+)/i);
        if (match) {
            const numero = parseInt(match[1], 10);
            if (numero >= 1 && numero <= 20) return 'CENTRO';
        }
        return 'ALL';
    }

    function rutaVisibleEnZona(rutaZona) {
        if (!zonaSeleccionada) return true;
        const zonaNormalizada = normalizarZona(rutaZona);
        return !zonaNormalizada || zonaNormalizada === 'ALL' || zonaNormalizada === zonaSeleccionada;
    }

    function latLngEnMorelos(latlng) {
        if (!latlng) return false;
        const punto = L.latLng(latlng.lat ?? latlng[0], latlng.lng ?? latlng.lon ?? latlng[1]);
        return MORELOS_BOUNDS.contains(punto);
    }

    function avisarFueraDeMorelos() {
        alert('RutAPP Morelos solo funciona dentro del estado de Morelos.');
    }

    function obtenerViewboxZona() {
        if (!zonaSeleccionada) return MORELOS_VIEWBOX;
        return ZONE_FOCUS[zonaSeleccionada]?.viewbox || MORELOS_VIEWBOX;
    }

    function obtenerBoundsZona() {
        if (zoneBoundaryLayer && zoneBoundaryLayer.getBounds && zoneBoundaryLayer.getBounds().isValid()) {
            return zoneBoundaryLayer.getBounds();
        }
        return ZONE_FOCUS[zonaSeleccionada]?.bounds || MORELOS_BOUNDS;
    }

    function centrarMapaPorZona() {
        mapFueMovidoManual = false;
        const focus = ZONE_FOCUS[zonaSeleccionada];
        if (focus) {
            map.flyTo(focus.center, focus.zoom, { duration: 0.85 });
            return;
        }
        const bounds = obtenerBoundsZona();
        if (bounds && bounds.isValid()) {
            map.flyToBounds(bounds, { ...getMapPadding(), maxZoom: 13, duration: 0.85 });
        }
    }

    async function cargarLimitesZona() {
        if (zoneBoundaryDataPromise) return zoneBoundaryDataPromise;
        zoneBoundaryDataPromise = fetchWithFallback(RUTAPP_PATHS.asset('zones/zone-boundaries.geojson'))
            .then((res) => {
                if (!res.ok) throw new Error('No se pudieron cargar los límites de zona');
                return res.json();
            })
            .catch((error) => {
                console.warn(error);
                return null;
            });
        return zoneBoundaryDataPromise;
    }

    async function aplicarFocoZona() {
        if (!zonaOverlay) {
            zonaOverlay = document.getElementById('zoneFocusOverlay');
        }
        if (!zonaOverlay) return;

        if (zoneBoundaryLayer) {
            map.removeLayer(zoneBoundaryLayer);
            zoneBoundaryLayer = null;
        }

        if (!zonaSeleccionada) {
            zonaOverlay.classList.remove('visible');
            delete zonaOverlay.dataset.zone;
            return;
        }

        zonaOverlay.dataset.zone = zonaSeleccionada;
        const boundaryData = await cargarLimitesZona();
        const feature = boundaryData?.features?.find((item) => normalizarZona(item?.properties?.zone) === zonaSeleccionada);

        if (feature) {
            zoneBoundaryLayer = L.geoJSON(feature, {
                style: () => ({
                    color: zonaSeleccionada === 'ORIENTE' ? '#f59e0b' : zonaSeleccionada === 'SUR' ? '#22c55e' : '#38bdf8',
                    weight: 5,
                    opacity: 0.95,
                    fillColor: zonaSeleccionada === 'ORIENTE' ? '#f59e0b' : zonaSeleccionada === 'SUR' ? '#22c55e' : '#38bdf8',
                    fillOpacity: 0.10,
                    lineJoin: 'round',
                    lineCap: 'round',
                    className: `zone-boundary-path zone-boundary-${zonaSeleccionada.toLowerCase()}`
                })
            }).addTo(map);
            zoneBoundaryLayer.bringToFront();
            zonaOverlay.classList.add('visible');
            return;
        }

        zonaOverlay.classList.add('visible');
    }

    function actualizarBadgeZona() {
        const badge = document.getElementById('zonaActualBadge');
        if (!badge) return;
        if (!zonaSeleccionada) {
            badge.classList.add('hidden');
            badge.innerHTML = '';
            return;
        }

        badge.classList.remove('hidden');
        badge.innerHTML = `<i class="fa fa-location-dot"></i> Zona activa: ${zonaSeleccionada}`;
    }

    function aplicarFiltroZonaUI() {
        document.querySelectorAll('.grupo-ruta').forEach((grupo) => {
            const visible = rutaVisibleEnZona(obtenerZonaGrupo(grupo));
            grupo.classList.toggle('hidden', !visible);
        });

        actualizarBadgeZona();

        const panel = document.getElementById('recomendaciones-panel');
        if (panel && panel.style.display === 'block' && origenCoordenadasReal && destinoCoordenadasReal) {
            recomendarRutas();
        }
    }

    function cerrarStartupOverlay() {
        const overlay = document.getElementById('startupOverlay');
        if (!overlay) return;
        overlay.classList.add('hidden');
    }

    function mostrarSelectorZona() {
        const overlay = document.getElementById('startupOverlay');
        const splashStage = document.getElementById('splashStage');
        const zoneStage = document.getElementById('zoneStage');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        if (splashStage) splashStage.classList.add('hidden');
        if (zoneStage) zoneStage.classList.remove('hidden');
    }

    async function cargarZonaActiva(zona) {
        zonaSeleccionada = normalizarZona(zona);
        sessionStorage.setItem('rutapp.zona', zonaSeleccionada);
        await asegurarCatalogosZona(zonaSeleccionada);
        aplicarFiltroZonaUI();
        await aplicarFocoZona();
        centrarMapaPorZona();
        cerrarStartupOverlay();
        // The guide will be shown by continuePostZoneSelectionFlow after location permission
        continuePostZoneSelectionFlow();
    }

    function seleccionarZona(zona) {
        cargarZonaActiva(zona);
    }

    function volverInicio() {
        zoneSessionReset();
        mostrarSelectorZona();
        resetearMapaInicial();
    }

    function zoneSessionReset() {
        zonaSeleccionada = '';
        sessionStorage.removeItem('rutapp.zona');
        mapFueMovidoManual = false;
        aplicarFiltroZonaUI();
        aplicarFocoZona();
        clearAllLayers();
    }

    function abrirAvisoPrivacidad() {
        document.getElementById('modalAvisoPrivacidad').style.display = 'flex';
    }

    function cerrarAvisoPrivacidad() {
        cerrarModalPorId('modalAvisoPrivacidad');
    }

    function abrirAvisoPrivacidadCompleto() {
        cerrarAvisoPrivacidad();
        document.getElementById('modalAvisoPrivacidadCompleto').style.display = 'flex';
    }

    function cerrarAvisoPrivacidadCompleto() {
        cerrarModalPorId('modalAvisoPrivacidadCompleto');
        document.getElementById('modalAvisoPrivacidad').style.display = 'flex';
    }

    function aceptarAvisoPrivacidad() {
        privacyAccepted = true;
        localStorage.setItem('rutapp.terms.version', GUIA_VERSION);
        localStorage.setItem('rutapp.privacy.version', GUIA_VERSION);
        cerrarAvisoPrivacidad();
        if (window._resolveTermsPromise) {
            window._resolveTermsPromise();
            delete window._resolveTermsPromise;
        }
    }

    function resolverPromesaUbicacionInicial() {
        if (window._resolveLocationPromise) {
            window._resolveLocationPromise();
            delete window._resolveLocationPromise;
        }
    }

    function rechazarUbicacionInicial() {
        localStorage.setItem('rutapp.location.preference', 'manual');
        cerrarModalPorId('modalPermisoUbicacion');
        if (!originMarker) {
            alert('Perfecto. Podrás colocar tu ubicación manualmente tocando el mapa o moviendo el marcador cuando se habilite.');
        }
        if (window._resolveLocationPromise) {
            window._resolveLocationPromise();
            delete window._resolveLocationPromise;
        }
    }

    function aceptarUbicacionInicial() {
        localStorage.setItem('rutapp.location.preference', 'granted');
        cerrarModalPorId('modalPermisoUbicacion');
        requestedInitialLocation = true;
        getUserLocation();
    }

    function buscarLugarOrigenAPI() {
        if (typeof window.__rutappSearchOrigin === 'function') {
            return window.__rutappSearchOrigin();
        }
        const input = document.getElementById('originInput').value.toLowerCase();
        const box = document.getElementById('originSuggestionsBox');
        if (input.length < 2) { box.style.display = 'none'; return; }
        box.style.display = 'block'; box.innerHTML = '';
        ajustarCajaSugerencias(box, document.getElementById('originInput'));
        const resultadosLocales = baseLocal.filter(item => {
            const coincideTexto = item.nombre.toLowerCase().includes(input);
            const coincideZona = !zonaSeleccionada || !item.zonas || item.zonas.includes(zonaSeleccionada);
            return coincideTexto && coincideZona;
        });

        resultadosLocales.forEach(item => {
            const div = document.createElement('div'); div.className = 'suggestion-item';
            div.innerHTML = `<i class="fa fa-location-dot" style="color: #ff4757; margin-right: 8px;"></i> <b>${item.nombre}</b> <span style="opacity:0.5; font-size:0.7rem;">(Frecuente)</span>`;
            div.onclick = () => seleccionarLugarOrigen(item.lat, item.lon, item.nombre);
            box.appendChild(div);
        });

        if (input.length >= 3) {
            clearTimeout(timeoutBusqueda);
            timeoutBusqueda = setTimeout(async () => {
                try {
                    const loadingDiv = document.createElement('div'); loadingDiv.className = 'suggestion-item';
                    loadingDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Buscando más...'; box.appendChild(loadingDiv);
                    const query = encodeURIComponent(input); const viewbox = obtenerViewboxZona();
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5&viewbox=${viewbox}&bounded=1`);
                    const data = await res.json(); box.removeChild(loadingDiv);
                    data.forEach(lugar => {
                        const nombreCorto = lugar.display_name.split(',')[0];
                        if (!resultadosLocales.some(local => local.nombre.includes(nombreCorto))) {
                            const div = document.createElement('div'); div.className = 'suggestion-item';
                            div.innerHTML = `<i class="fa fa-map-marker-alt" style="margin-right: 8px;"></i> ${nombreCorto} <br><span style="opacity:0.5; font-size:0.7rem; margin-left: 20px;">${lugar.display_name}</span>`;
                            div.onclick = () => seleccionarLugarOrigen(lugar.lat, lugar.lon, nombreCorto);
                            box.appendChild(div);
                        }
                    });
                } catch (e) {}
            }, 500);
        }
    }

    function seleccionarLugarOrigen(lat, lon, nombre) {
        origenCoordenadasReal = { lat: parseFloat(lat), lng: parseFloat(lon) };
        document.getElementById('originInput').value = nombre;
        document.getElementById('originSuggestionsBox').style.display = 'none';

        if (originMarker) { // Si hay un marcador de geolocalización, lo removemos
            map.removeLayer(originMarker);
            originMarker = null;
        }
        if (accuracyCircle) {
            map.removeLayer(accuracyCircle);
            accuracyCircle = null;
        }

        if (marcadorOrigenUI) map.removeLayer(marcadorOrigenUI);
        marcadorOrigenUI = L.marker([lat, lon], { draggable: false }).addTo(map).bindPopup(`<b><i class="fa fa-location-dot"></i> Origen:</b><br>${nombre}`).openPopup();
        if (modoAjusteOrigen && marcadorOrigenUI.dragging) {
            marcadorOrigenUI.dragging.enable();
        }

        const targetBounds = L.latLngBounds([lat, lon], [lat, lon]);
        map.fitBounds(targetBounds, { maxZoom: 15, ...getMapPadding() });

        if (destinoCoordenadasReal) { recomendarRutas(); }
    }

    function activarAjusteOrigenManual() {
        if (!origenCoordenadasReal) {
            alert('Primero selecciona un origen.');
            return;
        }

        // Si el origen es el marcador de geolocalización, lo convertimos a marcador UI para que sea arrastrable
        if (originMarker) {
            const currentLatLng = originMarker.getLatLng();
            map.removeLayer(originMarker);
            originMarker = null;
            if (accuracyCircle) {
                map.removeLayer(accuracyCircle);
                accuracyCircle = null;
            }
            marcadorOrigenUI = L.marker(currentLatLng, { draggable: true }).addTo(map).bindPopup(`<b><i class="fa fa-location-dot"></i> Origen:</b><br>Ajusta tu origen manualmente`).openPopup();
            marcadorOrigenUI.on('dragend', function() {
                const newPos = marcadorOrigenUI.getLatLng();
                origenCoordenadasReal = { lat: newPos.lat, lng: newPos.lng };
                if (destinoCoordenadasReal && document.getElementById('recomendaciones-panel').style.display === 'block') {
                    recomendarRutas();
                }
            });
        } else if (!marcadorOrigenUI) {
            // Si no hay ningún marcador de origen, no se puede ajustar
            alert('Primero selecciona un origen.');
            return;
        }

        origenAnteriorAjuste = { ...origenCoordenadasReal };
        modoAjusteOrigen = true;
        document.getElementById('adjustOriginControls').classList.add('active');

        if (marcadorOrigenUI.dragging) {
            marcadorOrigenUI.dragging.enable();
        }

        marcadorOrigenUI.bindTooltip('Ajusta tu origen manualmente', {
            permanent: true,
            direction: 'top',
            offset: [0, -12],
            className: 'custom-tooltip'
        }).openTooltip();
    }

    function finalizarAjusteOrigen(aplicarCambio) {
        document.getElementById('adjustOriginControls').classList.remove('active');
        modoAjusteOrigen = false;

        if (!marcadorOrigenUI) return;

        marcadorOrigenUI.closeTooltip();
        marcadorOrigenUI.unbindTooltip();

        if (marcadorOrigenUI.dragging) {
            marcadorOrigenUI.dragging.disable();
        }

        if (!aplicarCambio && origenAnteriorAjuste) {
            marcadorOrigenUI.setLatLng([origenAnteriorAjuste.lat, origenAnteriorAjuste.lng]);
            origenCoordenadasReal = { ...origenAnteriorAjuste };
        } else {
            const origenNuevo = marcadorOrigenUI.getLatLng();
            origenCoordenadasReal = { lat: origenNuevo.lat, lng: origenNuevo.lng };
        }

        origenAnteriorAjuste = null;

        if (destinoCoordenadasReal) {
            recomendarRutas();
        }
    }

    function confirmarAjusteOrigen() {
        finalizarAjusteOrigen(true);
    }

    function cancelarAjusteOrigen() {
        finalizarAjusteOrigen(false);
    }

    function activarAjusteDestinoManual() {
        if (!marcadorDestinoUI) {
            alert('Primero selecciona un destino.');
            return;
        }

        destinoAnteriorAjuste = { ...destinoCoordenadasReal };
        modoAjusteDestino = true;
        document.getElementById('adjustDestinationControls').classList.add('active');

        if (marcadorDestinoUI.dragging) {
            marcadorDestinoUI.dragging.enable();
        }

        marcadorDestinoUI.bindTooltip('Ajusta tu destino manualmente', {
            permanent: true,
            direction: 'top',
            offset: [0, -12],
            className: 'custom-tooltip'
        }).openTooltip();
    }

    function finalizarAjusteDestino(aplicarCambio) {
        document.getElementById('adjustDestinationControls').classList.remove('active');
        modoAjusteDestino = false;

        if (!marcadorDestinoUI) return;

        marcadorDestinoUI.closeTooltip();
        marcadorDestinoUI.unbindTooltip();

        if (marcadorDestinoUI.dragging) {
            marcadorDestinoUI.dragging.disable();
        }

        if (!aplicarCambio && destinoAnteriorAjuste) {
            marcadorDestinoUI.setLatLng([destinoAnteriorAjuste.lat, destinoAnteriorAjuste.lng]);
            destinoCoordenadasReal = { ...destinoAnteriorAjuste };
        } else {
            const destinoNuevo = marcadorDestinoUI.getLatLng();
            destinoCoordenadasReal = { lat: destinoNuevo.lat, lng: destinoNuevo.lng };
        }

        destinoAnteriorAjuste = null;

        if (origenCoordenadasReal) {
            recomendarRutas();
        }
    }

    function confirmarAjusteDestino() {
        finalizarAjusteDestino(true);
    }

    function cancelarAjusteDestino() {
        finalizarAjusteDestino(false);
    }

    const originInputEl = document.getElementById('originInput');
    const destinationInputEl = document.getElementById('destinationInput');
    if (originInputEl) {
        originInputEl.addEventListener('focus', () => {
            setTimeout(() => originInputEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
            actualizarPosicionSugerenciasActivas();
        });
        originInputEl.addEventListener('input', actualizarPosicionSugerenciasActivas);
    }
    if (destinationInputEl) {
        destinationInputEl.addEventListener('focus', () => {
            setTimeout(() => destinationInputEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
            actualizarPosicionSugerenciasActivas();
        });
        destinationInputEl.addEventListener('input', actualizarPosicionSugerenciasActivas);
    }
    window.addEventListener('resize', actualizarPosicionSugerenciasActivas);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', actualizarPosicionSugerenciasActivas);
        window.visualViewport.addEventListener('scroll', actualizarPosicionSugerenciasActivas);
    }

    async function buscarLugarAPI() {
        if (typeof window.__rutappSearchDestination === 'function') {
            return window.__rutappSearchDestination();
        }
        const input = document.getElementById('destinationInput').value.toLowerCase();
        const box = document.getElementById('suggestionsBox');
        if (input.length < 2) { box.style.display = 'none'; return; }
        box.style.display = 'block'; box.innerHTML = '';
        ajustarCajaSugerencias(box, document.getElementById('destinationInput'));
        const resultadosLocales = baseLocal.filter(item => {
            const coincideTexto = item.nombre.toLowerCase().includes(input);
            const coincideZona = !zonaSeleccionada || !item.zonas || item.zonas.includes(zonaSeleccionada);
            return coincideTexto && coincideZona;
        });

        resultadosLocales.forEach(item => {
            const div = document.createElement('div'); div.className = 'suggestion-item';
            div.innerHTML = `<i class="fa fa-location-dot" style="color: #ff4757; margin-right: 8px;"></i> <b>${item.nombre}</b> <span style="opacity:0.5; font-size:0.7rem;">(Frecuente)</span>`;
            div.onclick = () => seleccionarLugarDestino(item.lat, item.lon, item.nombre);
            box.appendChild(div);
        });

        if (input.length >= 3) {
            clearTimeout(timeoutBusqueda);
            timeoutBusqueda = setTimeout(async () => {
                try {
                    const loadingDiv = document.createElement('div'); loadingDiv.className = 'suggestion-item';
                    loadingDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Buscando más...'; box.appendChild(loadingDiv);
                    const query = encodeURIComponent(input); const viewbox = obtenerViewboxZona();
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5&viewbox=${viewbox}&bounded=1`);
                    const data = await res.json(); box.removeChild(loadingDiv);
                    data.forEach(lugar => {
                        const nombreCorto = lugar.display_name.split(',')[0];
                        if (!resultadosLocales.some(local => local.nombre.includes(nombreCorto))) {
                            const div = document.createElement('div'); div.className = 'suggestion-item';
                            div.innerHTML = `<i class="fa fa-map-marker-alt" style="margin-right: 8px;"></i> ${nombreCorto} <br><span style="opacity:0.5; font-size:0.7rem; margin-left: 20px;">${lugar.display_name}</span>`;
                            div.onclick = () => seleccionarLugarDestino(lugar.lat, lugar.lon, nombreCorto);
                            box.appendChild(div);
                        }
                    });
                } catch (e) {}
            }, 500);
        }
    }

    function seleccionarLugarDestino(lat, lon, nombre) {
        destinoCoordenadasReal = { lat: parseFloat(lat), lng: parseFloat(lon) };
        document.getElementById('destinationInput').value = nombre; document.getElementById('suggestionsBox').style.display = 'none';
        if (marcadorDestinoUI) map.removeLayer(marcadorDestinoUI);
        marcadorDestinoUI = L.marker([lat, lon], { draggable: false }).addTo(map).bindPopup(`<b><i class="fa fa-flag-checkered"></i> Destino:</b><br>${nombre}`).openPopup();
        if (modoAjusteDestino && marcadorDestinoUI.dragging) {
            marcadorDestinoUI.dragging.enable();
        }

        const targetBounds = L.latLngBounds([lat, lon], [lat, lon]);
        map.fitBounds(targetBounds, { maxZoom: 15, ...getMapPadding() });

        if (origenCoordenadasReal) { recomendarRutas(); }
    }

    function invertirRuta() {
        if (!origenCoordenadasReal && !destinoCoordenadasReal) return;

        const tempOrigenCoords = origenCoordenadasReal;
        const tempDestinoCoords = destinoCoordenadasReal;

        const tempOriginInputVal = document.getElementById('originInput').value;
        const tempDestinationInputVal = document.getElementById('destinationInput').value;

        // Limpiar marcadores existentes
        if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
        if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
        if (marcadorOrigenUI) { map.removeLayer(marcadorOrigenUI); marcadorOrigenUI = null; }
        if (marcadorDestinoUI) { map.removeLayer(marcadorDestinoUI); marcadorDestinoUI = null; }

        // Intercambiar y establecer nuevo origen
        if (tempDestinoCoords) {
            seleccionarLugarOrigen(tempDestinoCoords.lat, tempDestinoCoords.lng, tempDestinationInputVal);
        } else {
            origenCoordenadasReal = null;
            document.getElementById('originInput').value = '';
        }

        // Intercambiar y establecer nuevo destino
        if (tempOrigenCoords) {
            seleccionarLugarDestino(tempOrigenCoords.lat, tempOrigenCoords.lng, tempOriginInputVal);
        } else {
            destinoCoordenadasReal = null;
            document.getElementById('destinationInput').value = '';
        }

        if (origenCoordenadasReal && destinoCoordenadasReal) {
            recomendarRutas();
        } else {
            clearAllLayers(); // Si uno de los dos queda vacío, limpiar todo
        }
    }

    // 5. EL ASISTENTE INTELIGENTE
    const todosLosRamalesBase = [
        { archivo: "r1_universidad_guacamayas.geojson", color: "#f1c40f" },
        { archivo: "r1_acatlipa.geojson", color: "#e67e22" },
        { archivo: "r1_jerusalen.geojson", color: "#27ae60" },
        { archivo: "r2_domingo_diez.geojson", color: "#00f2ff" },
        { archivo: "r2_emiliano_zapata.geojson", color: "#00d4ff" },
        { archivo: "r2_chipitlan.geojson", color: "#00a8ff" },
        { archivo: "r3_alpuyeca.geojson", color: "#32ff7e" },
        { archivo: "r3_mina5.geojson", color: "#3ae374" },
        { archivo: "r3_tetela.geojson", color: "#2ecc71" },
        { archivo: "r3_calera.geojson", color: "#26ae60" },
        { archivo: "r3_villa.geojson", color: "#1abc9c" },
        { archivo: "r4_chulavista.geojson", color: "#ff006e" },
        { archivo: "r4_cuauchiles.geojson", color: "#ff4d94" },
        { archivo: "r4_palmas.geojson", color: "#ff85b3" },
        { archivo: "r4_elsalto.geojson", color: "#ffb3d1" },
        { archivo: "r5_lomas_oriente.geojson", color: "#ff7f50" },
        { archivo: "r5_lomas_pedregal.geojson", color: "#ff9a76" },
        { archivo: "r5_tecomulco.geojson", color: "#ffb49c" },
        { archivo: "r6_tunel.geojson", color: "#bf00ff" },
        { archivo: "r6_jardines.geojson", color: "#d44dff" },
        { archivo: "r6_victoria.geojson", color: "#e680ff" },
        { archivo: "r6_tranca.geojson", color: "#f2b3ff" },
        { archivo: "r6_atlacomulco.geojson", color: "#f9e6ff" },
        { archivo: "r7_tejalpa.geojson", color: "#ef5777" },
        { archivo: "r7_joya_independencia.geojson", color: "#ff7979" },
        { archivo: "r7_progreso.geojson", color: "#ff9f9f" },
        { archivo: "r8_jacarandas.geojson", color: "#3867d6" },
        { archivo: "r8_rivera_altavista.geojson", color: "#4b7bec" },
        { archivo: "r8_rivera_chulavista.geojson", color: "#778ca3" },
        { archivo: "r9_cuauhtemoc.geojson", color: "#f7b731" },
        { archivo: "r9_selva.geojson", color: "#fa983a" },
        { archivo: "r10_barona_aguilas.geojson", color: "#1dd1a1" },
        { archivo: "r10_plan_aguilas.geojson", color: "#10ac84" },
        { archivo: "r10_barona_palmas.geojson", color: "#54a0ff" },
        { archivo: "r10_amate_redondo.geojson", color: "#00d2d3" },
        { archivo: "r11_diez_abril.geojson", color: "#45aaf2" },
        { archivo: "r11_acatlipa_loop.geojson", color: "#2d98da" },
        { archivo: "r11_lazaro_cardenas.geojson", color: "#4b7bec" },
        { archivo: "r11_santa_ursula.geojson", color: "#3867d6" },
        { archivo: "r12_tepuente_independencia.geojson", color: "#8854d0" },
        { archivo: "r12_aeropuerto_morelos.geojson", color: "#a55eea" },
        { archivo: "r12_cruz_mision.geojson", color: "#be2edd" },
        { archivo: "r12_alta_palmira.geojson", color: "#d1d8e0" },
        { archivo: "r13_naranjos.geojson", color: "#ff3f34" },
        { archivo: "r13_fuentes.geojson", color: "#ff5e57" },
        { archivo: "r13_pochotal.geojson", color: "#ff7675" },
        { archivo: "r13_rosa_jiutepec.geojson", color: "#fab1a0" },
        { archivo: "r13_villa_jiutepec.geojson", color: "#e17055" },
        { archivo: "r14_granjas.geojson", color: "#0984e3" },
        { archivo: "r14_bugambilias.geojson", color: "#74b9ff" },
        { archivo: "r15_chapultepec.geojson", color: "#20bf6b" },
        { archivo: "r15_morelos_martha.geojson", color: "#26de81" },
        { archivo: "r15_morelos_maria_alm.geojson", color: "#7bed9f" },
        { archivo: "r16_robles_carril.geojson", color: "#574b90" },
        { archivo: "r16_robles_pueblo.geojson", color: "#786fa6" },
        { archivo: "r16_josefa_carril.geojson", color: "#546de5" },
        { archivo: "r16_josefa_pueblo.geojson", color: "#63cdda" },
        { archivo: "r16_robles_mirador.geojson", color: "#778ca3" },
        { archivo: "r17_otilio_centro.geojson", color: "#f9ca24" },
        { archivo: "r17_rosa_campestre.geojson", color: "#f0932b" },
        { archivo: "r17_calera_chica.geojson", color: "#ffbe76" },
        { archivo: "r17_modesto_flores.geojson", color: "#ffdd59" },
        { archivo: "r17_temixco_zapata.geojson", color: "#e056fd" },
        { archivo: "r18_francisco_villa.geojson", color: "#0097e6" },
        { archivo: "r18_pochotal.geojson", color: "#00a8ff" },
        { archivo: "r18_parres.geojson", color: "#40739e" },
        { archivo: "r18_joyas_agua.geojson", color: "#487eb0" },
        { archivo: "r19_jardin_juarez.geojson", color: "#3867d6" },
        { archivo: "r19_colosio.geojson", color: "#4b7bec" },
        { archivo: "r19_alvaro_leonel_puerto.geojson", color: "#2d98da" },
        { archivo: "r19_tetillas_amador.geojson", color: "#34e7e4" },
        { archivo: "r19_tetillas_luna.geojson", color: "#00d2d3" },
        { archivo: "r19_amador_salazar.geojson", color: "#0fbcf9" },
        { archivo: "r19_yautepec.geojson", color: "#5f27cd" },
        { archivo: "r19_alvaro_leonel_circuito.geojson", color: "#54a0ff" },
        { archivo: "r20_tezoyuca_loop.geojson", color: "#ff7f50" },
        { archivo: "r20_palo_escrito.geojson", color: "#ff6b81" },
        { archivo: "r20_tetecalita.geojson", color: "#ffa502" }
    ];

    function inferirZonaBase(archivo) {
        const match = String(archivo || '').match(/^r(\d+)_/i);
        const numero = match ? parseInt(match[1], 10) : NaN;
        if (numero >= 1 && numero <= 20) return 'CENTRO';
        return 'ALL';
    }

    const todosLosRamales = todosLosRamalesBase.map((ruta) => ({
        ...ruta,
        zona: ruta.zona || inferirZonaBase(ruta.archivo),
        nombre: ruta.nombre || ruta.archivo.replace('.geojson', '').replace(/_/g, ' ').toUpperCase()
    }));

    function obtenerRutasActivas() {
        return todosLosRamales.filter((ruta) => rutaVisibleEnZona(ruta.zona));
    }

    function obtenerZonaRutaPorArchivo(archivo) {
        const ruta = todosLosRamales.find((item) => item.archivo === archivo);
        if (ruta && ruta.zona) return ruta.zona;
        return inferirZonaBase(archivo);
    }

    function registrarRutasZona(zona, rutas) {
        const registros = rutas.map((ruta) => ({
            ...ruta,
            zona: normalizarZona(zona)
        }));

        const existentes = new Set(todosLosRamales.map((ruta) => `${ruta.archivo}:${ruta.zona}`));
        registros.forEach((ruta) => {
            const firma = `${ruta.archivo}:${ruta.zona}`;
            if (!existentes.has(firma)) {
                todosLosRamales.push(ruta);
                existentes.add(firma);
            }
        });
    }

    const catalogosAdicionalesPromise = cargarCatalogosAdicionales();

    function tonoPorIndice(indice, offset = 0) {
        return `hsl(${(offset + (indice * 37)) % 360}, 82%, 58%)`;
    }

    function slugSimple(valor) {
        return valor
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .replace(/_+/g, '_');
    }

    function crearGrupoCatalogoHTML(zona, grupo, indiceZona, indiceGrupo) {
        const menuId = `menu-${slugSimple(zona)}-${indiceGrupo}`;
        const colorBase = tonoPorIndice(indiceGrupo, indiceZona * 53);
        const rutas = grupo.routes.map((ruta, indiceRuta) => {
            const colorRuta = tonoPorIndice(indiceRuta, indiceGrupo * 17 + indiceZona * 53);
            const routeKey = `${slugSimple(zona)}-${indiceGrupo}-${indiceRuta}`;
            const itemId = `item-${routeKey}`;
            const iconId = `icon-${routeKey}`;
            return `<div class="ramal-item" id="${itemId}" onclick="toggleLayer('${routeKey}', '${ruta.archivo}', '${colorRuta}')"><i class="far fa-circle" id="${iconId}"></i> ${ruta.label}</div>`;
        }).join('');

        return `
        <div class="grupo-ruta" data-zone="${normalizarZona(zona)}" data-name="zona ${zona.toLowerCase()} ${grupo.group.toLowerCase()} ${grupo.routes.map(r => r.label.toLowerCase()).join(' ')}">
            <button class="ruta-master" style="background: ${colorBase}; color: #000; margin-top: 15px;" onclick="toggleMenu('${menuId}')">
                <span><i class="fa fa-bus"></i> ${zona} - ${grupo.group}</span><i class="fa fa-chevron-down" id="arrow-${slugSimple(zona)}-${indiceGrupo}"></i>
            </button>
            <div id="${menuId}" class="ramales-container">
                ${rutas}
            </div>
        </div>`;
    }

    async function cargarCatalogosAdicionales() {
        try {
            if (routeCatalogManifest) return routeCatalogManifest;
            routeCatalogManifest = await cargarJsonDatos('catalogos-zonas-adicionales.json');
            return routeCatalogManifest;
        } catch (e) {
            console.warn('No se pudieron cargar los catálogos adicionales', e);
            return null;
        }
    }

    async function asegurarCatalogosZona(zona) {
        const zonaNormalizada = normalizarZona(zona);
        if (!zonaNormalizada) return [];
        await cargarCatalogosAdicionales();
        if (!routeCatalogManifest || routeCatalogZoneCache[zonaNormalizada]) {
            return routeCatalogZoneCache[zonaNormalizada] || [];
        }

        const contenedor = document.getElementById('routes-list');
        const zonas = routeCatalogManifest.zones.filter((item) => normalizarZona(item.zone) === zonaNormalizada);
        const extras = [];
        const html = [];

        zonas.forEach((zonaItem, indiceZona) => {
            zonaItem.groups.forEach((grupo, indiceGrupo) => {
                html.push(crearGrupoCatalogoHTML(zonaItem.zone, grupo, indiceZona, indiceGrupo));
                grupo.routes.forEach((ruta, indiceRuta) => {
                    extras.push({
                        archivo: ruta.archivo,
                        color: tonoPorIndice(indiceRuta, indiceGrupo * 17 + indiceZona * 53),
                        nombre: ruta.label,
                        grupo: grupo.group,
                        zona: zonaNormalizada
                    });
                });
            });
        });

        if (html.length > 0) {
            contenedor.insertAdjacentHTML('beforeend', html.join(''));
            inicializarColoresCatalogo(contenedor);
        }
        registrarRutasZona(zonaNormalizada, extras);
        routeCatalogZoneCache[zonaNormalizada] = extras;
        aplicarFiltroZonaUI();
        return extras;
    }

    function obtenerLineaPrincipal(data) {
        if (!data) return null;
        return data.features ? data.features.find(f => f.geometry && f.geometry.type && f.geometry.type.includes('LineString')) : data;
    }

    function invertirLinea(lineaGeo) {
        const copia = JSON.parse(JSON.stringify(lineaGeo));
        if (!copia || !copia.geometry) return copia;
        if (copia.geometry.type === 'LineString') {
            copia.geometry.coordinates = [...copia.geometry.coordinates].reverse();
        } else if (copia.geometry.type === 'MultiLineString') {
            copia.geometry.coordinates = copia.geometry.coordinates.map(tramo => [...tramo].reverse()).reverse();
        }
        return copia;
    }

    function calcularPenalizacionTrayectoria(coords, indiceAbordaje, puntoDestino) {
        if (!Array.isArray(coords) || coords.length < 3) return 0;

        const inicio = Math.max(0, Math.min(coords.length - 1, indiceAbordaje || 0));
        const ventana = coords.slice(inicio, Math.min(coords.length, inicio + 8));
        if (ventana.length < 3) return 0;

        const distanciaInicial = turf.distance(turf.point(ventana[0]), puntoDestino, { units: 'kilometers' }) * 1000;
        let distanciaAnterior = distanciaInicial;
        let peorAlejamiento = 0;

        for (let i = 1; i < ventana.length; i++) {
            const distanciaActual = turf.distance(turf.point(ventana[i]), puntoDestino, { units: 'kilometers' }) * 1000;
            if (distanciaActual > distanciaAnterior) {
                peorAlejamiento = Math.max(peorAlejamiento, distanciaActual - distanciaInicial);
            }
            distanciaAnterior = distanciaActual;
        }

        return Math.max(0, Math.round(peorAlejamiento - 150));
    }

    function calcularPenalizacionVueltota(coords, indiceAbordaje, indiceDescenso) {
        if (!Array.isArray(coords) || coords.length < 2) return 0;

        const inicio = Math.max(0, Math.min(coords.length - 1, indiceAbordaje || 0));
        const fin = Math.max(0, Math.min(coords.length - 1, indiceDescenso || 0));
        if (fin <= inicio + 1) return 0;

        const tramo = coords.slice(inicio, fin + 1);
        if (tramo.length < 2) return 0;

        const longitudRutaMetros = turf.length(turf.lineString(tramo), { units: 'kilometers' }) * 1000;
        const distanciaRectaMetros = turf.distance(turf.point(coords[inicio]), turf.point(coords[fin]), { units: 'kilometers' }) * 1000;
        const exceso = longitudRutaMetros - (distanciaRectaMetros * 1.25);

        return Math.max(0, Math.round(exceso));
    }

    function evaluarRuta(data, puntoOrigen, puntoDestino) {
        const lineaOriginal = obtenerLineaPrincipal(data);
        if (!lineaOriginal) return null;

        const candidatos = [lineaOriginal, invertirLinea(lineaOriginal)];
        let mejor = null;

        for (const lineaGeo of candidatos) {
            const nearestDescenso = turf.nearestPointOnLine(lineaGeo, puntoDestino);
            const nearestAbordaje = turf.nearestPointOnLine(lineaGeo, puntoOrigen);
            const direccionCorrecta = nearestAbordaje.properties.index <= nearestDescenso.properties.index;

            if (!direccionCorrecta) continue;

            const distanciaOrigenMetros = Math.round(nearestAbordaje.properties.dist * 1000);
            const distanciaDestinoMetros = Math.round(nearestDescenso.properties.dist * 1000);
            const coords = lineaGeo.geometry.coordinates || [];
            const indiceAbordaje = Math.max(0, Math.min(coords.length - 1, nearestAbordaje.properties.index || 0));
            const indiceDescenso = Math.max(0, Math.min(coords.length - 1, nearestDescenso.properties.index || 0));
            const siguienteIndice = Math.min(coords.length - 1, indiceAbordaje + 1);
            const puntoActual = turf.point(coords[indiceAbordaje]);
            const puntoSiguiente = turf.point(coords[siguienteIndice] || coords[indiceAbordaje]);
            const distanciaActualDestino = turf.distance(puntoActual, puntoDestino, { units: 'kilometers' }) * 1000;
            const distanciaSiguienteDestino = turf.distance(puntoSiguiente, puntoDestino, { units: 'kilometers' }) * 1000;
            const penalizacionSalida = Math.max(0, Math.round(distanciaSiguienteDestino - distanciaActualDestino));
            const rumboRuta = calcularRumbo(coords[indiceAbordaje], coords[siguienteIndice] || coords[indiceAbordaje]);
            const rumboDestino = calcularRumbo(coords[indiceAbordaje], [puntoDestino.geometry.coordinates[0], puntoDestino.geometry.coordinates[1]]);
            const diferenciaRumbo = diferenciaAngular(rumboRuta, rumboDestino);
            const penalizacionDireccion = diferenciaRumbo > 90 ? Math.round((diferenciaRumbo - 90) * 12) : 0;
            const penalizacionTrayectoria = calcularPenalizacionTrayectoria(coords, indiceAbordaje, puntoDestino);
            const penalizacionVueltota = calcularPenalizacionVueltota(coords, indiceAbordaje, indiceDescenso);
            const penalizacionAbordaje = distanciaOrigenMetros > 1200 ? Math.round((distanciaOrigenMetros - 1200) * 3.4) : 0;
            const distanciaTotal = distanciaOrigenMetros + distanciaDestinoMetros + penalizacionSalida + penalizacionDireccion + penalizacionTrayectoria + penalizacionVueltota + penalizacionAbordaje;
            const score = (distanciaOrigenMetros * 4.25) + (distanciaDestinoMetros * 0.95) + (penalizacionSalida * 1.35) + (penalizacionDireccion * 1.65) + (penalizacionTrayectoria * 1.55) + (penalizacionVueltota * 1.7) + penalizacionAbordaje;

            const resultado = {
                lineaGeo,
                nearestAbordaje,
                nearestDescenso,
                direccionCorrecta,
                distanciaOrigenMetros,
                distanciaDestinoMetros,
                distanciaTotal,
                penalizacionSalida,
                penalizacionDireccion,
                penalizacionTrayectoria,
                penalizacionVueltota,
                penalizacionAbordaje,
                score
            };

            if (!mejor || resultado.score < mejor.score) {
                mejor = resultado;
            }
        }

        if (mejor) return mejor;

        const lineaGeo = lineaOriginal;
        const nearestDescenso = turf.nearestPointOnLine(lineaGeo, puntoDestino);
        const nearestAbordaje = turf.nearestPointOnLine(lineaGeo, puntoOrigen);

        return {
            lineaGeo,
            nearestAbordaje,
            nearestDescenso,
            direccionCorrecta: nearestAbordaje.properties.index <= nearestDescenso.properties.index,
            distanciaOrigenMetros: Math.round(nearestAbordaje.properties.dist * 1000),
            distanciaDestinoMetros: Math.round(nearestDescenso.properties.dist * 1000),
            distanciaTotal: Math.round((nearestAbordaje.properties.dist + nearestDescenso.properties.dist) * 1000),
            penalizacionSalida: 0,
            penalizacionDireccion: 0,
            penalizacionTrayectoria: 0,
            penalizacionVueltota: 0,
            penalizacionAbordaje: 0,
            score: Math.round((nearestAbordaje.properties.dist + nearestDescenso.properties.dist) * 1000)
        };
    }

    async function recomendarRutas() {
        if (typeof window.__rutappRunRecommendation === 'function') {
            return window.__rutappRunRecommendation();
        }
        await catalogosAdicionalesPromise;
        if (!origenCoordenadasReal) { alert("Selecciona un origen válido."); return; }
        if (!destinoCoordenadasReal) { alert("Selecciona un destino válido."); return; }
        if (!zonaSeleccionada) { alert("Primero elige una zona para calcular rutas."); return; }

        const panel = document.getElementById('recomendaciones-panel');
        const lista = document.getElementById('lista-recomendados');
        const nombreDestino = document.getElementById('destinationInput').value;

        recomendacionesRealesVisibles = false;
        setGhostRecomendacionesVisible(true);
        lista.innerHTML = '<div class="ramal-item" style="padding: 15px;"><i class="fa fa-spinner fa-spin"></i> Analizando sentidos de calle y rutas...</div>';
        panel.style.display = 'block';
        document.getElementById('btnTomarRuta').style.display = 'none';

        const puntoOrigen = turf.point([origenCoordenadasReal.lng, origenCoordenadasReal.lat]);
        const puntoDestino = turf.point([destinoCoordenadasReal.lng, destinoCoordenadasReal.lat]);
        const resultados = [];
        const rutasEvaluables = obtenerRutasActivas();

        for (let ruta of rutasEvaluables) {
            try {
                const data = await cargarGeojsonRuta(ruta.archivo);
                const evaluada = evaluarRuta(data, puntoOrigen, puntoDestino);
                if (!evaluada) continue;

                resultados.push({
                    archivo: ruta.archivo, color: ruta.color, fullData: data,
                    nombre: ruta.nombre || ruta.archivo.replace('.geojson', '').replace(/_/g, ' ').toUpperCase(),
                    distanciaOrigenMetros: evaluada.distanciaOrigenMetros,
                    distanciaDestinoMetros: evaluada.distanciaDestinoMetros,
                    distanciaTotal: evaluada.distanciaTotal,
                    score: evaluada.score,
                    penalizacionSalida: evaluada.penalizacionSalida,
                    penalizacionDireccion: evaluada.penalizacionDireccion,
                    penalizacionTrayectoria: evaluada.penalizacionTrayectoria,
                    penalizacionAbordaje: evaluada.penalizacionAbordaje,
                    direccionCorrecta: evaluada.direccionCorrecta,
                    coordAbordaje: [evaluada.nearestAbordaje.geometry.coordinates[1], evaluada.nearestAbordaje.geometry.coordinates[0]],
                    coordDescenso: [evaluada.nearestDescenso.geometry.coordinates[1], evaluada.nearestDescenso.geometry.coordinates[0]]
                });
            } catch (e) { console.error("Error procesando ruta", e); }
        }

        lista.innerHTML = "";
        if (resultados.length > 0) {
            resultados.sort((a, b) => {
                if (a.direccionCorrecta !== b.direccionCorrecta) return a.direccionCorrecta ? -1 : 1;
                if (a.penalizacionTrayectoria !== b.penalizacionTrayectoria) return a.penalizacionTrayectoria - b.penalizacionTrayectoria;
                if (a.penalizacionAbordaje !== b.penalizacionAbordaje) return a.penalizacionAbordaje - b.penalizacionAbordaje;
                if (a.penalizacionDireccion !== b.penalizacionDireccion) return a.penalizacionDireccion - b.penalizacionDireccion;
                if (a.distanciaDestinoMetros !== b.distanciaDestinoMetros) return a.distanciaDestinoMetros - b.distanciaDestinoMetros;
                if (a.distanciaOrigenMetros !== b.distanciaOrigenMetros) return a.distanciaOrigenMetros - b.distanciaOrigenMetros;
                return a.score - b.score;
            });
            const opcionesCorrectas = resultados.filter((r) => r.direccionCorrecta);
            const mejoresOpciones = (opcionesCorrectas.length > 0 ? opcionesCorrectas : resultados).slice(0, 4);

            lista.innerHTML += `<div style="margin-bottom: 15px; padding: 12px; background: rgba(255,255,255,0.05); border-left: 3px solid #3498db; border-radius: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.9);"><i class="fa fa-map-location-dot" style="color: #3498db; margin-right: 5px;"></i><b>Rutas hacia ${nombreDestino}</b></div>`;
            if (opcionesCorrectas.length === 0) {
                lista.innerHTML += `<div style="margin-bottom: 12px; padding: 10px 12px; background: rgba(245, 158, 11, 0.12); border-left: 3px solid #f59e0b; border-radius: 8px; font-size: 0.82rem; color: rgba(255,255,255,0.95);"><i class="fa fa-triangle-exclamation" style="margin-right: 5px;"></i>No encontré una ruta claramente en el sentido correcto; mostrando las menos desfavorables.</div>`;
            }

            mejoresOpciones.forEach((r, index) => {
                const tiempoCaminandoMin = Math.max(1, Math.round(r.distanciaDestinoMetros / 80));
                let nivelEsfuerzo = index === 0 ? `<span style="float: right; font-size: 0.65rem; background: #2ecc71; color: #000; padding: 3px 6px; border-radius: 10px; font-weight: bold;"><i class="fa fa-star"></i> MEJOR OPCIÓN</span>` : "";
                lista.innerHTML += `
                    <div class="ramal-item" style="margin-bottom:10px; border-left: 4px solid ${r.color}; flex-direction: column; align-items: flex-start; padding: 12px;"
                         onclick="mostrarRutaGuiada('${r.archivo}', '${r.color}', ${r.coordAbordaje[0]}, ${r.coordAbordaje[1]}, ${r.distanciaOrigenMetros}, ${r.coordDescenso[0]}, ${r.coordDescenso[1]}, this, '${r.nombre}')">
                        <div style="width: 100%; margin-bottom: 8px;"><i class="fa fa-bus" style="color: ${r.color};"></i> <b style="font-size: 0.95rem;">${r.nombre}</b>${nivelEsfuerzo}</div>
                        <div style="font-size: 0.75rem; display: flex; flex-direction: column; gap: 4px;">
                            <span><i class="fa fa-person-walking"></i> Camina <b>${r.distanciaOrigenMetros} metros</b> a la parada.</span>
                            <span><i class="fa fa-map-pin"></i> Baja en la parada recomendada para quedar a <b>${r.distanciaDestinoMetros} metros</b> de la meta.</span>
                            <span><i class="fa fa-clock"></i> Caminata estimada: <b>${tiempoCaminandoMin} min</b>.</span>
                            <span style="opacity:0.9;"><i class="fa fa-circle-info"></i> Se recomienda descender en esta parada para quedar más cerca de tu destino.</span>
                        </div>
                    </div>`;
            });

            buscarTransbordos(puntoOrigen, mejoresOpciones);
            recomendacionesRealesVisibles = true;
            setGhostRecomendacionesVisible(false);
        } else {
            recomendacionesRealesVisibles = false;
            lista.innerHTML = '<div class="ramal-item" style="padding: 15px; margin-bottom: 10px; border-left: 4px solid #38bdf8; flex-direction: column; align-items: flex-start;"><div style="font-weight:700; margin-bottom:6px;"><i class="fa fa-sparkles"></i> Vista previa</div><div style="font-size:0.82rem; line-height:1.35; opacity:0.9;">Todavía no hay una recomendación real cargada. Esta simulación muestra cómo se verán las opciones cuando la app encuentre una ruta conveniente.</div></div>';
            setGhostRecomendacionesVisible(true);
        }
        actualizarVisibilidadRecomendacionesUI();
    }
    async function mostrarRutaGuiada(archivo, color, latAbordaje, lngAbordaje, metros, latDescenso, lngDescenso, elementDOM, nombreRuta) {
        if (!rutaVisibleEnZona(obtenerZonaRutaPorArchivo(archivo))) {
            alert('Esa recomendación no pertenece a la zona seleccionada.');
            return;
        }

        // Limpiar el estado visual "Seleccionado" de las otras rutas
        const todosLosItems = document.querySelectorAll('#lista-recomendados .ramal-item');
        todosLosItems.forEach(el => el.classList.remove('selected-route'));

        // Agregar estado activo a la seleccionada e inyectar el color por CSS Variable
        aplicarEstadoSeleccionadoRamal(elementDOM, color);

        // Mostrar el Banner Superior
        const topBanner = document.getElementById('topBanner');
        document.getElementById('topBannerText').innerText = nombreRuta;
        topBanner.style.display = 'flex';
        topBanner.style.borderLeft = `5px solid ${color}`;

        // Limpiar capas previas
        if (!document.getElementById('recomendaciones-panel').style.display || document.getElementById('recomendaciones-panel').style.display !== 'block') {
            limpiarMarcadoresRutaGuiada();
        }
        for (let key in capasActivas) map.removeLayer(capasActivas[key]);
        for (let prop in capasActivas) delete capasActivas[prop];

        try {
            const data = await cargarGeojsonRuta(archivo);
            const nombreLimpio = archivo.replace('.geojson', '').replace(/_/g, ' ').toUpperCase();
            const puntoAbordaje = turf.point([lngAbordaje, latAbordaje]);
            const puntoDescenso = turf.point([lngDescenso, latDescenso]);
            const lineaBase = obtenerLineaPrincipal(data);
            let tramoVisible = lineaBase || data;

            try {
                if (lineaBase) {
                    const tramoCalculado = turf.lineSlice(puntoAbordaje, puntoDescenso, lineaBase);
                    if (tramoCalculado && tramoCalculado.geometry && tramoCalculado.geometry.coordinates && tramoCalculado.geometry.coordinates.length >= 2) {
                        tramoVisible = tramoCalculado;
                    }
                }
            } catch (e) { }

            const layer = L.geoJSON(tramoVisible, { style: { color: color, weight: 6, opacity: 0.95, lineJoin: 'round', lineCap: 'round' } })
                .bindTooltip(`<div style="font-size:14px;"><i class="fa fa-bus" style="color:${color}"></i> ${nombreLimpio}</div>`, { className: 'custom-tooltip', sticky: true }).addTo(map);
            capasActivas['rutaOptima'] = layer;
            agregarFlechasRuta(tramoVisible, color);

            const userLat = origenCoordenadasReal.lat; // Usar origenCoordenadasReal
            const userLng = origenCoordenadasReal.lng; // Usar origenCoordenadasReal
            caminataLayer = L.polyline([[userLat, userLng], [latAbordaje, lngAbordaje]], { color: '#fff', weight: 4, dashArray: '5, 10', opacity: 0.8 }).addTo(map);

            let pinHTML = `<div style="text-align:center;"><b style="color: ${color};"><i class="fa fa-street-view"></i> Parada</b><br><span style="font-size: 12px;">Camina ${metros}m aquí</span></div>`;
            abordajeMarker = L.marker([latAbordaje, lngAbordaje]).addTo(map).bindPopup(pinHTML).openPopup();

            puntoDescensoGuardado = L.latLng(latDescenso, lngDescenso);

            // Mostrar Botón "Tomar Ruta"
            document.getElementById('btnTomarRuta').style.display = 'flex';
            document.getElementById('btnCancelarRuta').style.display = 'none';

            // ZOOM INTELIGENTE
            const userLatLng = L.latLng(userLat, userLng);
            const abordajeLatLng = L.latLng(latAbordaje, lngAbordaje);
            const zoomBounds = L.latLngBounds(userLatLng, abordajeLatLng);

            map.fitBounds(zoomBounds, { maxZoom: 16, padding: [60, 60], ...getMapPadding() });

        } catch (e) { }
    }

    // ==========================================
    // 6. FLUJO DE VIAJE Y MODALES
    // ==========================================
    function abrirModalAvatar() {
        document.getElementById('modalAvatar').style.display = 'flex';
    }

    function abrirModalCancelar() {
        document.getElementById('modalCancelar').style.display = 'flex';
    }

    function cerrarModales() {
        document.getElementById('modalAvatar').style.display = 'none';
        document.getElementById('modalCancelar').style.display = 'none';
        cerrarModalPorId('modalAvisoPrivacidad');
        cerrarModalPorId('modalAvisoPrivacidadCompleto');
        cerrarModalPorId('modalGuiaUsuario');
        cerrarModalPorId('modalPermisoUbicacion');
    }

    function iniciarViaje(conAlerta) {
        cerrarModales();
        quiereAlertaBajada = conAlerta;

        if (!navigator.geolocation) {
            alert("Tu navegador no soporta rastreo GPS para el modo viaje."); return;
        }

        // Cambiar botones UI
        document.getElementById('btnTomarRuta').style.display = 'none';
        document.getElementById('btnCancelarRuta').style.display = 'flex';

        // Actualizar Banner
        const textoBanner = document.getElementById('topBannerText');
        textoBanner.innerHTML = `${textoBanner.innerText} <span style="font-weight:400; opacity:0.8;">- Viaje Activo <i class="fa fa-circle-notch fa-spin"></i></span>`;

        modoViajeTracker = navigator.geolocation.watchPosition(
            (pos) => {
                const currentPos = L.latLng(pos.coords.latitude, pos.coords.longitude);

                originMarker.setLatLng(currentPos);
                if (accuracyCircle) {
                    accuracyCircle.setLatLng(currentPos);
                    accuracyCircle.setRadius(pos.coords.accuracy / 2);
                }

                // Centrar la cámara
                map.setView(currentPos, 16);

                if (puntoDescensoGuardado && quiereAlertaBajada) {
                    const distanciaFaltante = currentPos.distanceTo(puntoDescensoGuardado);
                    if (distanciaFaltante < 250) {
                        dispararAlerta();
                    }
                }
            },
            (err) => { console.warn("Error en seguimiento: ", err); },
            { enableHighAccuracy: true, maximumAge: 5000 }
        );
    }

    function confirmarCancelacion() {
        clearAllLayers();
    }

    function dispararAlerta() {
        document.getElementById('pantallaAlerta').style.display = 'flex';
        if (navigator.vibrate) { navigator.vibrate([500, 250, 500, 250, 1000]); }
        if (modoViajeTracker) {
            navigator.geolocation.clearWatch(modoViajeTracker);
            modoViajeTracker = null;
        }
    }

    function terminarAlerta() {
        document.getElementById('pantallaAlerta').style.display = 'none';
        clearAllLayers();
    }

    montarGuiaUsuario();
    aplicarTema(currentTheme);

    // New function to handle the sequential display of modals
    async function handleStartupModals() {
        // 1. Wait for splash screen to finish
        await new Promise(resolve => setTimeout(resolve, 2400));
        document.getElementById('splashStage').classList.add('hidden');

        // 2. If no zone selected, show zone selector and wait for selection
        if (!zonaSeleccionada) {
            document.getElementById('zoneStage').classList.remove('hidden');
            // The flow will continue from seleccionarZona -> cargarZonaActiva -> continuePostZoneSelectionFlow
            return;
        } else {
            // If zone is already selected, close startup overlay
            cerrarStartupOverlay();
            aplicarFiltroZonaUI();
            await aplicarFocoZona();
            centrarMapaPorZona();
            // Continue to the first-run sequence
            await continuePostZoneSelectionFlow();
        }
    }

    // New function to continue the flow after zone selection (or if already selected)
    async function continuePostZoneSelectionFlow() {
        // 3. Show terms and conditions first on the first run
        const termsVersion = localStorage.getItem('rutapp.terms.version');
        const termsNotAccepted = termsVersion !== GUIA_VERSION;
        if (termsNotAccepted) {
            await mostrarTerminosSiHaceFalta();
        }

        // 4. Show the guide the first time it has not been seen, even after an update
        const guideVersion = localStorage.getItem('rutapp.guide.version');
        if (guideVersion !== GUIA_VERSION) {
            await new Promise(resolve => {
                window._resolveGuidePromise = resolve;
                abrirGuiaUsuario();
            });
        }

        // 5. Try to detect the current location automatically on startup.
        if (!origenCoordenadasReal) {
            requestedInitialLocation = true;
            setTimeout(() => getUserLocation(), 250);
        }
    }

    // Initial call to start the orchestrated flow
    handleStartupModals();

    // ==========================================
    // NUEVA LÓGICA: BUSCADOR DE TRANSBORDOS
    // ==========================================

    async function buscarTransbordos(puntoOrigen, mejoresDirectas) {
        const lista = document.getElementById('lista-recomendados');
        const rutasEvaluables = obtenerRutasActivas();

        // Solo buscamos transbordo si la mejor ruta directa te hace caminar mucho (> 600m)
        if (mejoresDirectas.length > 0 && mejoresDirectas[0].distanciaOrigenMetros < 600) return;

        lista.innerHTML += `<div style="margin: 20px 0 10px 0; font-size: 0.8rem; opacity: 0.6; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">¿No quieres caminar? Intenta transbordar</div>`;

        // 1. Buscamos rutas "Alimentadoras" (que pasen a menos de 150m de donde estás)
        const alimentadoras = [];
        for (let r of rutasEvaluables) {
            const data = await cargarGeojsonRuta(r.archivo);
            const nearest = turf.nearestPointOnLine(data, puntoOrigen);
            if (nearest.properties.dist * 1000 < 150) {
                alimentadoras.push({ ...r, data: data, coordAbordaje: nearest.geometry.coordinates });
            }
            if (alimentadoras.length > 5) break;
        }

        // 2. Comparamos alimentadoras con las mejores rutas directas para hallar cruces
        for (let alim of alimentadoras) {
            for (let dir of mejoresDirectas) {
                // Validación para evitar errores si no existe fullData
                if (!alim.data || !dir.fullData) continue;

                const cruce = turf.lineIntersect(alim.data, dir.fullData);

                if (cruce.features.length > 0) {
                    // Hallamos un punto de transbordo
                    const puntoCruce = cruce.features[0].geometry.coordinates;

                    lista.innerHTML += `
                    <div class="ramal-item" style="border-left: 4px solid #9b59b6; background: rgba(155, 89, 182, 0.1); flex-direction: column; align-items: flex-start;"
                         onclick="mostrarViajeTransbordo('${alim.archivo}', '${dir.archivo}', [${puntoCruce[1]}, ${puntoCruce[0]}], '${alim.nombre}', '${dir.nombre}')">
                        <div style="width:100%">
                            <span style="background: #9b59b6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: bold; margin-bottom: 5px; display: inline-block;">COMBO EVITA-CAMINATA</span>
                            <div style="font-size: 0.9rem; font-weight: bold;">${alim.nombre} <i class="fa fa-arrow-right" style="font-size: 0.7rem; opacity: 0.5;"></i> ${dir.nombre}</div>
                        </div>
                        <div style="font-size: 0.75rem; margin-top: 5px; opacity: 0.8;">
                            <i class="fa fa-shuffle"></i> Transborda en la intersección de ambas rutas.
                        </div>
                    </div>
                `;
                    return;
                }
            }
        }
    }

    // Función para visualizar el doble viaje
    function mostrarViajeTransbordo(archivo1, archivo2, coordCruce, nom1, nom2) {
        clearAllLayers();

        // Dibujamos ambas rutas con opacidades distintas
        cargarGeojsonRuta(archivo1).then(data => {
            L.geoJSON(data, { style: { color: '#9b59b6', weight: 4, opacity: 0.5 } }).addTo(map);
        });

        cargarGeojsonRuta(archivo2).then(data => {
            L.geoJSON(data, { style: { color: '#3498db', weight: 6, opacity: 0.9 } }).addTo(map);
        });

        // Ponemos el pin del transbordo
        L.marker(coordCruce, {
            icon: L.divIcon({
                className: 'btn-clear',
                html: '<i class="fa fa-shuffle" style="color:white"></i>',
                iconSize: [30, 30]
            })
        }).addTo(map).bindPopup(`<b>Punto de Transbordo</b><br>Bájate de la ${nom1} y sube a la ${nom2}`).openPopup();

        document.getElementById('topBanner').style.display = 'flex';
        document.getElementById('topBannerText').innerHTML = `Transbordo: ${nom1} + ${nom2}`;

        map.setView(coordCruce, 15);
    }
