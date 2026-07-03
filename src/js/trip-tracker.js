async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Error ${response.status} en ${url}`);
  }
  return response.json();
}

export class TripTracker {
  constructor() {
    this.tripId = null;
    this.option = null;
    this.watchId = null;
    this.pointBuffer = [];
    this.flushTimer = null;
  }

  async start(option, wantsAlert) {
    this.stop(false);
    this.option = option;
    this.wantsAlert = wantsAlert;

    try {
      const response = await postJson('/telemetry/trips/start', {
        variantId: option.type === 'transfer' ? option.legs[0].variantId : option.variantId,
        routeOptionId: option.optionId,
        metadata: {
          type: option.type,
          routeName: option.routeName
        }
      });
      this.tripId = response.tripId;
      await this.logEvent(
        'boarding_confirmed',
        option.type === 'transfer' ? option.legs[0].boardingStop : option.boardingStop,
        {},
        option.type === 'transfer' ? option.legs[0].variantId : option.variantId
      );
    } catch (error) {
      console.warn('No se pudo iniciar telemetria', error);
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const currentPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: position.coords.speed,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
          variantId: option.type === 'transfer' ? option.legs[0].variantId : option.variantId
        };

        this.pointBuffer.push(currentPoint);
        if (!this.flushTimer) {
          this.flushTimer = window.setTimeout(() => this.flushPoints(), 3500);
        }

        const currentPos = window.L.latLng(currentPoint.lat, currentPoint.lng);
        if (window.originMarker) {
          window.originMarker.setLatLng(currentPos);
        }
        if (window.accuracyCircle) {
          window.accuracyCircle.setLatLng(currentPos);
          window.accuracyCircle.setRadius(position.coords.accuracy / 2);
        }
        window.map.setView(currentPos, 16);

        if (window.puntoDescensoGuardado && this.wantsAlert) {
          const distance = currentPos.distanceTo(window.puntoDescensoGuardado);
          if (distance < 220) {
            this.handleNearDestination();
          }
        }
      },
      (error) => console.warn('Error en seguimiento', error),
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
  }

  async logEvent(eventType, stopLike, metadata = {}, variantIdOverride = null) {
    if (!this.tripId || !stopLike) return;
    const lat = Number(stopLike.lat ?? stopLike.latitude);
    const lng = Number(stopLike.lng ?? stopLike.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    try {
      await postJson(`/telemetry/trips/${this.tripId}/events`, {
        events: [{
          eventType,
          variantId: variantIdOverride || (this.option?.type === 'transfer' ? this.option.legs[this.option.legs.length - 1].variantId : this.option?.variantId),
          lat,
          lng,
          timestamp: new Date().toISOString(),
          metadata
        }]
      });
    } catch (error) {
      console.warn('No se pudo guardar evento de telemetria', error);
    }
  }

  async flushPoints() {
    const points = this.pointBuffer.splice(0, this.pointBuffer.length);
    if (this.flushTimer) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.tripId || points.length === 0) return;
    try {
      await postJson(`/telemetry/trips/${this.tripId}/points`, { points });
    } catch (error) {
      console.warn('No se pudieron guardar puntos GPS', error);
    }
  }

  async handleNearDestination() {
    const alightingStop = this.option?.type === 'transfer'
      ? this.option.legs[this.option.legs.length - 1].alightingStop
      : this.option?.alightingStop;
    await this.logEvent('alighting_confirmed', alightingStop, { source: 'near_destination_alert' });
    if (typeof window.dispararAlerta === 'function') {
      window.dispararAlerta();
    }
    this.stop(false);
  }

  async stop(logManualStop = true) {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    await this.flushPoints();
    if (logManualStop) {
      const stopRef = this.option?.type === 'transfer'
        ? this.option.legs[this.option.legs.length - 1].alightingStop
        : this.option?.alightingStop;
      await this.logEvent('manual_stop_hint', stopRef, { source: 'manual_stop' });
    }
    this.option = null;
    this.tripId = null;
  }
}
