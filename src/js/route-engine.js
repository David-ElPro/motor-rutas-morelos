function metersBetween(a, b) {
  return window.turf.distance(
    window.turf.point([a.lng, a.lat]),
    window.turf.point([b.lng, b.lat]),
    { units: 'kilometers' }
  ) * 1000;
}

function snapToStops(stops, point, maxDistanceMeters = 1200) {
  return stops
    .filter((entry) => entry.stop)
    .map((entry) => ({
      ...entry,
      walkDistanceMeters: Math.round(metersBetween({ lat: point.lat, lng: point.lng }, { lat: entry.stop.lat, lng: entry.stop.lng }))
    }))
    .filter((entry) => entry.walkDistanceMeters <= maxDistanceMeters)
    .sort((a, b) => a.walkDistanceMeters - b.walkDistanceMeters)
    .slice(0, 6);
}

function segmentLengthMeters(variant, fromStop, toStop) {
  return Math.max(0, (toStop.distance_along_m || 0) - (fromStop.distance_along_m || 0));
}

function normalizePoint(point) {
  return {
    lat: Number(point.lat),
    lng: Number(point.lng)
  };
}

function buildDirectOptions(variants, originPoint, destinationPoint) {
  const options = [];

  variants.forEach((variant) => {
    const originCandidates = snapToStops(variant.stops, originPoint, 1400);
    const destinationCandidates = snapToStops(variant.stops, destinationPoint, 1800);

    originCandidates.forEach((boarding) => {
      destinationCandidates.forEach((alighting) => {
        if (boarding.order >= alighting.order) return;
        const inVehicleMeters = segmentLengthMeters(variant, boarding, alighting);
        const score =
          (boarding.walkDistanceMeters * 2.4) +
          (alighting.walkDistanceMeters * 1.8) +
          (inVehicleMeters * 0.06) +
          (boarding.approx ? 80 : 0) +
          (alighting.approx ? 60 : 0);

        options.push({
          type: 'direct',
          optionId: `${variant.variant_id}__${boarding.stop_id}__${alighting.stop_id}`,
          score: Math.round(score),
          variantId: variant.variant_id,
          routeId: variant.route_id,
          routeName: variant.display_name,
          directionLabel: variant.direction_label,
          zone: variant.zone,
          color: variant.color,
          boardingStop: boarding.stop,
          alightingStop: alighting.stop,
          boardingRef: boarding,
          alightingRef: alighting,
          walkToBoardingMeters: boarding.walkDistanceMeters,
          walkFromAlightingMeters: alighting.walkDistanceMeters,
          inVehicleMeters: Math.round(inVehicleMeters),
          totalWalkMeters: boarding.walkDistanceMeters + alighting.walkDistanceMeters,
          isLoop: Boolean(variant.is_loop)
        });
      });
    });
  });

  return options
    .sort((a, b) => a.score - b.score)
    .slice(0, 8);
}

function buildTransferOptions(catalogs, variants, directOptions, originPoint, destinationPoint) {
  const transfersByFromVariant = new Map();
  catalogs.transfers.forEach((transfer) => {
    const key = transfer.from_variant_id;
    if (!transfersByFromVariant.has(key)) transfersByFromVariant.set(key, []);
    transfersByFromVariant.get(key).push(transfer);
  });

  const variantMap = new Map(variants.map((variant) => [variant.variant_id, variant]));
  const directByVariant = new Map(directOptions.map((option) => [option.variantId, option]));
  const transferOptions = [];

  directOptions.forEach((baseOption) => {
    const transferLinks = transfersByFromVariant.get(baseOption.variantId) || [];
    transferLinks.forEach((link) => {
      const targetVariant = variantMap.get(link.to_variant_id);
      if (!targetVariant) return;

      const fromTransferStop = baseOption.variantId === link.from_variant_id
        ? targetVariant ? null : null
        : null;

      const sourceVariant = variantMap.get(baseOption.variantId);
      const sourceTransferStop = sourceVariant?.stops.find((stop) => stop.stop_id === link.from_stop_id);
      const targetTransferStop = targetVariant.stops.find((stop) => stop.stop_id === link.to_stop_id);
      if (!sourceTransferStop || !targetTransferStop) return;
      if (baseOption.boardingRef.order >= sourceTransferStop.order) return;

      const destinationCandidates = snapToStops(targetVariant.stops.filter((stop) => stop.order > targetTransferStop.order), destinationPoint, 1700);
      destinationCandidates.forEach((alighting) => {
        if (targetTransferStop.order >= alighting.order) return;
        const firstLegMeters = segmentLengthMeters(sourceVariant, baseOption.boardingRef, sourceTransferStop);
        const secondLegMeters = segmentLengthMeters(targetVariant, targetTransferStop, alighting);
        const totalWalkMeters = baseOption.walkToBoardingMeters + link.walk_distance_m + alighting.walkDistanceMeters;
        const score =
          (baseOption.walkToBoardingMeters * 2.4) +
          (alighting.walkDistanceMeters * 1.8) +
          (link.walk_distance_m * 2.8) +
          ((firstLegMeters + secondLegMeters) * 0.07) +
          (link.requires_crossing ? 150 : 0);

        transferOptions.push({
          type: 'transfer',
          optionId: `${baseOption.variantId}__${targetVariant.variant_id}__${link.from_stop_id}__${alighting.stop_id}`,
          score: Math.round(score),
          routeId: `${baseOption.routeId}+${targetVariant.route_id}`,
          routeName: `${baseOption.routeName} + ${targetVariant.display_name}`,
          directionLabel: `${baseOption.directionLabel} / ${targetVariant.direction_label}`,
          zone: baseOption.zone,
          totalWalkMeters,
          walkToBoardingMeters: baseOption.walkToBoardingMeters,
          walkTransferMeters: link.walk_distance_m,
          walkFromAlightingMeters: alighting.walkDistanceMeters,
          requiresCrossing: Boolean(link.requires_crossing),
          legs: [
            {
              variantId: baseOption.variantId,
              routeId: baseOption.routeId,
              routeName: baseOption.routeName,
              directionLabel: baseOption.directionLabel,
              color: baseOption.color,
              boardingStop: baseOption.boardingStop,
              alightingStop: catalogs.stopMap.get(link.from_stop_id),
              boardingRef: baseOption.boardingRef,
              alightingRef: sourceTransferStop,
              inVehicleMeters: Math.round(firstLegMeters)
            },
            {
              variantId: targetVariant.variant_id,
              routeId: targetVariant.route_id,
              routeName: targetVariant.display_name,
              directionLabel: targetVariant.direction_label,
              color: targetVariant.color,
              boardingStop: catalogs.stopMap.get(link.to_stop_id),
              alightingStop: alighting.stop,
              boardingRef: targetTransferStop,
              alightingRef: alighting,
              inVehicleMeters: Math.round(secondLegMeters)
            }
          ],
          transfer: {
            fromStop: catalogs.stopMap.get(link.from_stop_id),
            toStop: catalogs.stopMap.get(link.to_stop_id),
            walkDistanceMeters: link.walk_distance_m,
            confidence: link.confidence
          }
        });
      });
    });
  });

  return transferOptions.sort((a, b) => a.score - b.score).slice(0, 5);
}

export function recommendTrips(catalogs, variants, originPoint, destinationPoint) {
  const normalizedOrigin = normalizePoint(originPoint);
  const normalizedDestination = normalizePoint(destinationPoint);
  const directOptions = buildDirectOptions(variants, normalizedOrigin, normalizedDestination);
  const transferOptions = buildTransferOptions(catalogs, variants, directOptions, normalizedOrigin, normalizedDestination);

  const combined = [];
  if (directOptions[0]) combined.push(directOptions[0]);
  if (transferOptions[0]) combined.push(transferOptions[0]);
  directOptions.slice(1).forEach((option) => {
    if (combined.length < 3) combined.push(option);
  });

  return {
    directOptions,
    transferOptions,
    combined: combined.slice(0, 3)
  };
}
