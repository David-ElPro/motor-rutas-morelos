const axios = require('axios');
const { DOMParser } = require('@xmldom/xmldom');
const toGeoJSON = require('@tmcw/togeojson');
const fs = require('fs/promises');

async function extractRouteData(mapId, routeName) {
    try {
        // URL directa para forzar la descarga del KML desde Google My Maps
        const kmlUrl = `https://www.google.com/maps/d/kml?mid=${mapId}&forcekml=1`;

        console.log(`[INFO] Conectando con Google Maps para ${routeName}...`);

        const response = await axios.get(kmlUrl, { responseType: 'text' });

        console.log(`[INFO] Parseando estructura XML...`);
        const kmlDom = new DOMParser().parseFromString(response.data, 'text/xml');

        const geoJson = toGeoJSON.kml(kmlDom);
        const fileName = `${routeName.toLowerCase().replace(/\s+/g, '_')}.geojson`;

        await fs.writeFile(fileName, JSON.stringify(geoJson, null, 2));

        console.log(`[SUCCESS] Listo. Trazos guardados en ${fileName}`);

    } catch (error) {
        console.error(`[ERROR] Falló la extracción para ${routeName}:`, error.message);
    }
}

// Ejecutamos la función con el ID de la Ruta 1 Centro que encontramos
extractRouteData('1ESMT23sgrurRqYRoIOM4zNyq5SfB7Nve', 'Ruta 1 Centro');