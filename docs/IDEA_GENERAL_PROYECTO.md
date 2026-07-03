# Idea General del Proyecto: RutAPP Morelos

## 1. Resumen

RutAPP Morelos es una aplicacion pensada para ayudar a personas a consultar rutas de transporte publico dentro del estado de Morelos, visualizar recorridos en mapa y recibir una recomendacion basica de como llegar de un punto a otro.

Hoy proyecto funciona principalmente como una web app con mapa interactivo y archivos GeoJSON locales que representan recorridos de rutas. Tambien existe una herramienta auxiliar para extraer rutas desde Google My Maps y convertirlas a GeoJSON.

## 2. Objetivo del producto

Objetivo principal:

- Mostrar rutas de transporte en mapa.
- Permitir buscar origen y destino.
- Recomendar que ruta tomar.
- Indicar donde abordar.
- Indicar donde bajar.
- Estimar caminata inicial y final.
- Sugerir transbordo cuando conviene.
- Ayudar al usuario durante trayecto con seguimiento de ubicacion.

## 3. Idea general de funcionamiento

Proyecto trabaja con logica local en frontend:

1. Usuario abre aplicacion.
2. App muestra mapa y seleccion de zona.
3. Usuario indica origen y destino, o usa GPS.
4. App carga rutas disponibles para zona activa.
5. App compara origen y destino contra recorridos de rutas en GeoJSON.
6. App calcula opciones cercanas para subida y bajada.
7. App ordena alternativas y muestra recomendacion.
8. Si hace falta, app intenta sugerir un transbordo.
9. Si usuario inicia viaje, app sigue ubicacion en tiempo real.

## 4. Ejemplo de uso

Ejemplo simple:

```text
Origen: Zocalo de Cuernavaca
Destino: Walmart Jiutepec

Posible resultado:
1. Camina 140 metros hacia parada recomendada.
2. Toma Ruta 13.
3. Baja en parada cercana a tu destino.
4. Camina 110 metros finales.
```

Ejemplo con transbordo:

```text
Origen: Centro de Cuernavaca
Destino: zona lejana en Jiutepec

Posible resultado:
1. Camina 120 metros a parada inicial.
2. Toma Ruta 1.
3. Baja en punto de cruce.
4. Camina 60 metros al transbordo.
5. Toma Ruta 7.
6. Baja en parada recomendada.
7. Camina 90 metros al destino.
```

## 5. Estado actual del proyecto

### Lo que ya existe

- Mapa interactivo en frontend.
- Selector de zonas.
- Busqueda de origen y destino.
- Uso de geolocalizacion.
- Visualizacion de recorridos en mapa.
- Recomendacion basica de rutas.
- Sugerencia basica de transbordos.
- Modales de guia, permisos y terminos.
- Archivos GeoJSON de multiples rutas.
- Script para extraer y convertir rutas desde KML.

### Lo que aun no esta completo

- Pipeline de build Android consistente.
- Configuracion completa de Capacitor.
- Separacion por modulos frontend.
- Backend formal.
- Base de datos.
- Modelo transitivo avanzado tipo GTFS/OTP.

## 6. Tecnologias actuales

### Frontend

- HTML
- CSS
- JavaScript vanilla
- Leaflet
- Turf.js
- Font Awesome
- Google Fonts

### Datos y conversion

- Node.js
- axios
- @xmldom/xmldom
- @tmcw/togeojson
- GeoJSON
- Google My Maps KML

### Empaque movil planeado

- Capacitor
- Android

## 7. Arquitectura actual

Arquitectura actual es simple:

```text
Usuario
  |
  v
index.html
  |
  |-- UI
  |-- Mapa Leaflet
  |-- Logica de recomendacion
  |-- Geolocalizacion
  |
  v
Archivos .geojson locales

extractor.js
  |
  v
Google My Maps KML -> conversion a GeoJSON
```

## 8. Estructura actual del proyecto

Estructura aproximada del repo:

```text
motor-rutas-morelos/
├── index.html
├── extractor.js
├── package.json
├── package-lock.json
├── assets/
│   └── RUTAPPLOGO.png
├── android/
│   └── app/...
├── r1_acatlipa.geojson
├── r1_jerusalen.geojson
├── r1_universidad_guacamayas.geojson
├── ...
├── r20_tetecalita.geojson
└── node_modules/
```

## 9. Rol de archivos principales

### `index.html`

Archivo principal de interfaz y logica cliente. Contiene:

- estilos
- UI
- mapa
- buscadores
- recomendador de rutas
- geolocalizacion
- flujo de viaje

### `extractor.js`

Script auxiliar que:

- consulta KML remoto desde Google My Maps
- parsea XML
- convierte KML a GeoJSON
- guarda archivos `.geojson`

### `r*.geojson`

Archivos de datos de rutas. Cada uno representa un recorrido o variante de ruta.

### `android/`

Shell de proyecto Android para empaquetado con Capacitor. En estado actual parece incompleto.

## 10. Flujo de datos

### Carga de rutas

```text
Google My Maps
  |
  v
extractor.js
  |
  v
GeoJSON locales
  |
  v
Frontend carga rutas con fetch()
```

### Recomendacion de viaje

```text
Origen + destino
  |
  v
Comparacion contra rutas GeoJSON
  |
  v
Seleccion de mejor abordaje y mejor descenso
  |
  v
Lista de opciones recomendadas
```

## 11. Ejemplo de estructura futura recomendada

Si proyecto sigue creciendo, conviene separarlo asi:

```text
motor-rutas-morelos/
├── docs/
├── scripts/
│   └── extractor/
├── public/
│   ├── assets/
│   └── geojson/
├── src/
│   ├── app/
│   ├── map/
│   ├── routes/
│   ├── geolocation/
│   ├── recommendations/
│   ├── zones/
│   ├── ui/
│   └── utils/
├── android/
├── package.json
└── capacitor.config.ts
```

## 12. Vision a futuro

Proyecto puede evolucionar en dos caminos:

### Camino 1: Mejorar actual enfoque web + Capacitor

Ideal si se busca:

- avanzar rapido
- mantener un solo frontend
- sacar version Android usable
- mejorar arquitectura sin reescribir todo

### Camino 2: Migrar a arquitectura mas formal

Ideal si se busca:

- backend propio
- base de datos geoespacial
- datos tipo GTFS
- planeador de viajes mas avanzado
- motor estilo OpenTripPlanner

## 13. Recomendacion general

Mejor siguiente paso tecnico:

1. estabilizar build
2. modularizar frontend
3. ordenar catalogos y assets
4. formalizar datos de rutas, variantes y paradas
5. despues evaluar backend o motor de planeacion mas avanzado

## 14. Conclusion

RutAPP Morelos ya tiene valor funcional como visor y recomendador basico de rutas. Punto fuerte actual es conocimiento de rutas y experiencia visible al usuario. Punto debil actual es arquitectura tecnica, build movil y estructura de datos formal.

Proyecto no esta en cero. Ya existe una base valida para convertirlo en una app mas mantenible y eventualmente en un planeador de viajes mas robusto.
