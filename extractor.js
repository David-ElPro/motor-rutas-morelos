const axios = require('axios');
const { DOMParser } = require('@xmldom/xmldom');
const toGeoJSON = require('@tmcw/togeojson');
const fs = require('fs/promises');

async function extractRouteData(mapId, routeName) {
    try {
        // Mantenemos la URL que ya nos funcionó
        const kmlUrl = `https://www.google.com/maps/d/kml?mid=${mapId}&forcekml=1`;

        console.log(`[INFO] Conectando con Google Maps para ${routeName}...`);

        const response = await axios.get(kmlUrl, { responseType: 'text' });

        console.log(`[INFO] Parseando estructura XML...`);
        const kmlDom = new DOMParser().parseFromString(response.data, 'text/xml');

        const geoJson = toGeoJSON.kml(kmlDom);

        // Normalizamos el nombre del archivo para que sea r1_nombre.geojson
        const fileName = `${routeName.toLowerCase().replace(/\s+/g, '_')}.geojson`;

        await fs.writeFile(fileName, JSON.stringify(geoJson, null, 2));

        console.log(`[SUCCESS] Listo. Trazos guardados en ${fileName}`);

    } catch (error) {
        console.error(`[ERROR] Falló la extracción para ${routeName}:`, error.message);
    }
}

// =========================================================
// MOTOR DE PROCESAMIENTO POR LOTES
// =========================================================
const ramalesRuta1 = [
    { id: '1ESMT23sgrurRqYRoIOM4zNyq5SfB7Nve', nombre: 'r1_universidad_guacamayas' },
    { id: '1aikJgkBesxmf4u1S215KwhNaK3b4zjxL', nombre: 'r1_acatlipa' },
    { id: '111ApNvwiosIsd-zGNWg3gATpQCyHOSqL', nombre: 'r1_jerusalen' },
    // Ruta 2 - NUEVAS
    { id: '15_MriG_dmzx4LCT-VKjEw7x_aPsVOEWx', nombre: 'r2_domingo_diez' },
    { id: '1uOImcFhtZIeusAEtVc4DqBSdBBFWvbiM', nombre: 'r2_emiliano_zapata' },
    { id: '1VTe-gZmnqTkEDY05XDeiGgxbqPdcg2BT', nombre: 'r2_chipitlan' },
    // Ruta 3 - NUEVAS
    { id: '1ffPVeYas7VrFoAQqY82GW-5V8AXdiDGN', nombre: 'r3_alpuyeca' },
    { id: '1UqGXch36byQiPW8rvmQgUHUzneNoJ_T7', nombre: 'r3_mina5' },
    { id: '1AuVZUW6QeaWTr3Q5M8W_N5D8w3oI9p6O', nombre: 'r3_tetela' },
    { id: '1MzeHBxdkB0k-wd3F5UE4ABvSjQGF_YQC', nombre: 'r3_calera' },
    { id: '1ky3E0Cz9YqMRWsfho8KGnySng8tt3sqk', nombre: 'r3_villa' },
    // Ruta 4 - NUEVAS
    { id: '1zDZqg1exft9xwcF7IRuu49E3neGJacsU', nombre: 'r4_chulavista' },
    { id: '1-ZjwP8RZs9D--_qdRrQVpc5RBKLjKn4A', nombre: 'r4_cuauchiles' },
    { id: '1bJ7xTd9IvngCanipWf3J29qhoy2dVuQr', nombre: 'r4_palmas' },
    { id: '1eVyB1CNDuF8LW2f7FbZqV6xSMxsyMrO1', nombre: 'r4_elsalto' },
    // Ruta 5 - NUEVAS
    { id: '1I-wyoEFS0h0pe21zENqS_MiJtwby0ZM3', nombre: 'r5_lomas_oriente' },
    { id: '14IPFcVPllwm3j2js0EPDz-S7Gzt42lFB', nombre: 'r5_lomas_pedregal' },
    { id: '1MVpnW0iygX6nLlvlkhjoBkaXQbNdpId6', nombre: 'r5_tecomulco' },
    // Ruta 6 - NUEVAS
    { id: '1q8XyobgWXFhmq8XUYLV7IUViQz3sqQVW', nombre: 'r6_tunel' },
    { id: '1x2fzWjbYLpD6f4TT1hnMCzd17b2O5SHe', nombre: 'r6_jardines' },
    { id: '1c3Kqcg0SG1rggnpWM30R5csT8zbvrlq8', nombre: 'r6_victoria' },
    { id: '1Wd0uK8uqwMOOyRpj7pVTqrF0VvAlQLIN', nombre: 'r6_tranca' },
    { id: '1ujiz2XgbtlLlAjiGwZx5LIzASQMEPqRn', nombre: 'r6_atlacomulco' },
    // Ruta 7 - NUEVAS
    { id: '1C1l0aGBv5pjk3rdPbXlPOre9E4fRBtdj', nombre: 'r7_tejalpa' },
    { id: '12uNPem8Tq5k9Jh_06dZWb13b-GRfRNUI', nombre: 'r7_joya_independencia' },
    { id: '1tP_pxr3-Z9Zzok7bzjHeZ547qUqOS5hL', nombre: 'r7_progreso' },
    // Ruta 8 - NUEVAS
    { id: '12H15f16Qit0Tl9prX5HS-RYjYy3f12w8', nombre: 'r8_jacarandas' },
    { id: '1VmvWORwb4oCSq48UNBJNVNLv39qhSuap', nombre: 'r8_rivera_altavista' },
    { id: '1eU8vwhneH1toojh9_DUJh4eh9qsRTZVF', nombre: 'r8_rivera_chulavista' },
    // Ruta 9 - NUEVAS
    { id: '1qnxjr5qHaKcWXexGigfNe3b489SY_PZ4', nombre: 'r9_cuauhtemoc' },
    { id: '1cx3dIspXw7m3QeRk967NckqwSjDXVmNQ', nombre: 'r9_selva' },
    // Ruta 10 - NUEVAS
    { id: '1ujNEWlRh3aDSH4BH84Ux_HX9w83KaRIc', nombre: 'r10_barona_aguilas' },
    { id: '18DwNmg_hT4MgCPu6bI4QGgL9kVt7NNnV', nombre: 'r10_plan_aguilas' },
    { id: '17YTcdfGq9LRKDkaHzUY2SLzMDNNerw-H', nombre: 'r10_barona_palmas' },
    { id: '1kkyykelKSk83UU33_KO-T4ZZuMOUVYVd', nombre: 'r10_amate_redondo' },
    // Ruta 11 - NUEVAS
    { id: '1uP4SGpTQ8LK2WyL3TvELh6gEFvZe7Dcp', nombre: 'r11_diez_abril' },
    { id: '1sm2gqNfE_r2dRB53TXnQtS4nvkI0813r', nombre: 'r11_acatlipa_loop' },
    { id: '1cSQBSAfRjF1ihUi9duc2NdWJXEbd5m6G', nombre: 'r11_lazaro_cardenas' },
    { id: '1wEysc13TI-EaKe4ua5txHrW2uVQAi__E', nombre: 'r11_santa_ursula' },
    // Ruta 12 - NUEVAS
    { id: '1alShFmDLPA7YHJiZeBuVWN_BRicV9qwJ', nombre: 'r12_tepuente_independencia' },
    { id: '1bbOmb1ht36qC-66_BTZMo4t0_ShCxIQs', nombre: 'r12_aeropuerto_morelos' },
    { id: '1GUFENnrQQCV6I3AvAXFuXZoJjg935Zkr', nombre: 'r12_cruz_mision' },
    { id: '1HgfNMWrHxqkEaA3qmqZHMQe95j8WQkjA', nombre: 'r12_alta_palmira' },
    // Ruta 13 - TU FAVORITA
    { id: '1Vfhrpge5wygV871GSAHzJVZ8ptUdrHxr', nombre: 'r13_naranjos' },
    { id: '12Ptf-KtQEugrwSSHIrx0BulPLNOs0I05', nombre: 'r13_fuentes' },
    { id: '1egKNhe4W4dnH3tE2cqCEEtla952tRxZ5', nombre: 'r13_pochotal' },
    { id: '1AOiKKxKDo42K34IyjWFeq2q9WAXaff2F', nombre: 'r13_rosa_jiutepec' },
    { id: '1rqJ6t70fgvq3a_iKwQMJpIKO17inRlIS', nombre: 'r13_villa_jiutepec' },
    // Ruta 14 - NUEVAS
    { id: '191ofmhiOIukckIZmpQOX0bkjwz5emLvu', nombre: 'r14_granjas' },
    { id: '189vg0HGG_ZvDspxJk6hzZx7Y3b8GZTni', nombre: 'r14_bugambilias' },
    // Ruta 15 - NUEVAS
    { id: '1mPyj-xoswm0n7OhtFuaKqdi53wPpnNYl', nombre: 'r15_chapultepec' },
    { id: '1pPR-tKvblMdprYPjNYmtZmMeqdXN_P9M', nombre: 'r15_morelos_martha' },
    { id: '1FwcskMEWhp5ppvP_tA-H9vrvJOaGEYzF', nombre: 'r15_morelos_maria_alm' },
    // Ruta 16 - NUEVAS
    { id: '1HkRWNUKINIWT8OWvu0wij5btPlWQ9sw1', nombre: 'r16_robles_carril' },
    { id: '1dDp_iu1Y5XseIPnV_OQYWi-hovzYA4y_', nombre: 'r16_robles_pueblo' },
    { id: '171_MC0reljj2Tl2446_v_KyNUsk4Pj84', nombre: 'r16_josefa_carril' },
    { id: '1ydPNFMR_vEEo3GHRc3mGFT9quT3r_ftZ', nombre: 'r16_josefa_pueblo' },
    { id: '1Xu9WkBujO46jdo3J-HwVmARsL1xCNoL7', nombre: 'r16_robles_mirador' },
    // Ruta 17 - NUEVAS
    { id: '1NVTvkx1K2D8YB2NMWw5iEC_fwukKT_cF', nombre: 'r17_otilio_centro' },
    { id: '1m4K9PQR7W9W_fVCrD7bfkDF6LtV414Py', nombre: 'r17_rosa_campestre' },
    { id: '177zJ2g_Zkq0ESxUNkHfN6B6LRf7WnvT0', nombre: 'r17_calera_chica' },
    { id: '193dbC6UcaA_TJazFTkYQ4riv95kRPBxH', nombre: 'r17_modesto_flores' },
    { id: '1GSoEcgR9O6cQYHyhlMExDRBjT-jNquo9', nombre: 'r17_temixco_zapata' },
    // Ruta 18 - NUEVAS
    { id: '1vnavHPRMAxEEfiolRhYryLGTd3Hh5uwK', nombre: 'r18_francisco_villa' },
    { id: '1hOhngwwrEA9Ne1pV0-mVKoQp7Uo_JJvH', nombre: 'r18_pochotal' },
    { id: '1s7oNvbmz_0dFo8m44LUq_kg1cPeKVDeO', nombre: 'r18_parres' },
    { id: '1ShLmIR4CAPuDBmGtHm5O-82vD8OfD0Ca', nombre: 'r18_joyas_agua' },
    // Ruta 19 - LAS NUEVAS 8
    { id: '1hDOTp_-gq6Ft1py17O_9wvFzsMl7qZHd', nombre: 'r19_jardin_juarez' },
    { id: '1k09b6ji32PpMXjpghUljrGY--0ATlOIQ', nombre: 'r19_colosio' },
    { id: '1pTYGm-KBtislCcx5_9aHIs4cljXe9Jz6', nombre: 'r19_alvaro_leonel_puerto' },
    { id: '1-8MfM-XSkHw12l3DAibeHHh8oLhoo9rT', nombre: 'r19_tetillas_amador' },
    { id: '193ckoFdWwoLGhX5_nm77F9Yz7ZQ8UjQR', nombre: 'r19_tetillas_luna' },
    { id: '1-QukQtPXLNWnZokIVsR7cRJLEAzTRuZA', nombre: 'r19_amador_salazar' },
    { id: '1GL3aRVz7UEruxTqpK2WHdfxyXpDwBWgR', nombre: 'r19_yautepec' },
    { id: '1MNjZ9onG0-7FDK7Q8wis8qpEaVf82VkO', nombre: 'r19_alvaro_leonel_circuito' },
    // Ruta 20 - CIERRE BETA
    { id: '1-xs61YhyjC6jJZ93YLoODiQy1yD9zHmo', nombre: 'r20_tezoyuca_loop' },
    { id: '1vy0u-1IXvVFMk_FhY-O0f7vpjXtACkgn', nombre: 'r20_palo_escrito' },
    { id: '1zkFPLmaOT2HWwpr0sOFeKBgjkcOLOeDR', nombre: 'r20_tetecalita' }


];

async function iniciarDescarga() {
    console.log('--- Iniciando descarga de Ramales Ruta 1 ---');
    for (const ruta of ramalesRuta1) {
        await extractRouteData(ruta.id, ruta.nombre);
    }
    console.log('--- Proceso finalizado con éxito ---');
}

iniciarDescarga();