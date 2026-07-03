# RutAPP Morelos

RutAPP Morelos es una web app de rutas de transporte para Morelos con:

- mapa interactivo
- recomendacion de ruta por variante/sentido
- transbordos curados
- busqueda local + Nominatim
- seguimiento de viaje
- telemetria asistida para candidatos de parada

## Requisitos

- Node.js 20 para desarrollo web local
- Node.js 22 recomendado para flujo completo de Capacitor 8
- Android Studio + SDK si quieres compilar APK/AAB

## Probar local

Instalar dependencias:

```powershell
cd C:\Users\tito_\StudioProjects\workspace-rutas\motor-rutas-morelos
npm install
```

Generar catalogos:

```powershell
npm run catalogs:build
```

Levantar app en modo local:

```powershell
npm run dev
```

Abrir:

```text
http://localhost:4173
```

## Build web

Genera `dist/web` con frontend, assets y catalogos:

```powershell
npm run build:web
```

Para servir build final:

```powershell
npm run serve:dist
```

## Telemetria asistida

La API de telemetria vive en mismo servidor Node.

DB inicial:

```powershell
npm run telemetry:db:init
```

Endpoints disponibles:

- `POST /telemetry/trips/start`
- `POST /telemetry/trips/:tripId/points`
- `POST /telemetry/trips/:tripId/events`
- `GET /telemetry/stop-candidates?variantId=...`
- `POST /telemetry/stop-candidates/:id/review`

Archivo SQLite:

```text
storage/telemetry.sqlite
```

## Android con Capacitor

Primero asegúrate de usar Node 22 si `@capacitor/cli` marca incompatibilidad.

Build web + sync:

```powershell
npm run build:web
npx cap sync android
```

Abrir proyecto Android:

```powershell
npx cap open android
```

### APK debug

Desde carpeta `android`:

```powershell
cd android
.\gradlew.bat assembleDebug
```

APK esperado:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

### AAB release

Desde carpeta `android`:

```powershell
cd android
.\gradlew.bat bundleRelease
```

AAB esperado:

```text
android\app\build\outputs\bundle\release\app-release.aab
```

## Archivos clave

- `index.html`: UI actual
- `public/assets`: logo, zonas y recursos visuales
- `public/data`: catalogos generados y catalogos auxiliares
- `public/routes`: rutas GeoJSON
- `src/js/app-main.js`: bootstrap modular
- `src/js/route-engine.js`: recomendador por variantes, paradas y transbordos
- `src/js/map-renderer.js`: dibujo de ruta, marcadores y enfoque de mapa
- `src/js/search.js`: busqueda local/remota
- `src/js/trip-tracker.js`: seguimiento y telemetria
- `scripts/generate-data.js`: genera catalogos
- `scripts/extractor.js`: utilitario de extraccion/procesamiento
- `server/app-server.js`: servidor local + API
- `docs/IDEA_GENERAL_PROYECTO.md`: documento general del proyecto

## Catalogos

- `public/data/routes.catalog.json`
- `public/data/stops.catalog.json`
- `public/data/transfers.catalog.json`
- `public/data/places.catalog.json`

Estos catalogos se regeneran con:

```powershell
npm run catalogs:build
```

## Estructura recomendada

```text
motor-rutas-morelos/
├─ android/
├─ docs/
├─ public/
│  ├─ assets/
│  ├─ data/
│  └─ routes/
├─ scripts/
├─ server/
├─ src/
│  ├─ css/
│  └─ js/
├─ storage/
├─ dist/
├─ index.html
├─ package.json
└─ README.md
```
