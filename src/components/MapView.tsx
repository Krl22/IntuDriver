import React from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type MapViewProps = {
  center?: [number, number];
  zoom?: number;
  onStop?: () => void;
  fullScreen?: boolean;
  useGeolocation?: boolean;
  onLocationReady?: (coords: { lat: number; lng: number }) => void;
};

function MapView({ center = [-74.08175, 4.60971], zoom = 12, onStop, fullScreen = false, useGeolocation = true, onLocationReady }: MapViewProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [tokenMissing, setTokenMissing] = React.useState(false);
  const [geoError, setGeoError] = React.useState<string | null>(null);
  const [locating, setLocating] = React.useState<boolean>(false);
  const watchIdRef = React.useRef<number | null>(null);
  const readyNotifiedRef = React.useRef<boolean>(false);
  const centerLng = center[0];
  const centerLat = center[1];

  React.useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    mapboxgl.accessToken = token ?? "";
    if (!token) {
      setTokenMissing(true);
      return;
    }
    setTokenMissing(false);

    if (!containerRef.current) return;

    let map: mapboxgl.Map | null = null;

    const init = async () => {
      let initCenter: [number, number] = [centerLng, centerLat];

      if (useGeolocation) {
        if (!("geolocation" in navigator)) {
          setGeoError("Geolocalización no soportada por el navegador");
        } else {
          setLocating(true);
          try {
            // Intento robusto: obtener la PRIMERA ubicación disponible usando una carrera
            // entre getCurrentPosition y watchPosition, con timeout de seguridad.
            const firstPosition = await new Promise<GeolocationPosition>((resolve, reject) => {
              let settled = false;
              let safetyTimerId: number | null = null;

              const cleanupWatch = () => {
                if (watchIdRef.current !== null) {
                  try {
                    navigator.geolocation.clearWatch(watchIdRef.current);
                  } catch (err) {
                    console.debug("clearWatch falló", err);
                  }
                  watchIdRef.current = null;
                }
              };

              const clearSafetyTimer = () => {
                if (safetyTimerId !== null) {
                  clearTimeout(safetyTimerId);
                  safetyTimerId = null;
                }
              };

              const onSuccess = (pos: GeolocationPosition) => {
                if (settled) return;
                settled = true;
                cleanupWatch();
                clearSafetyTimer();
                resolve(pos);
                if (onLocationReady && !readyNotifiedRef.current) {
                  try {
                    onLocationReady({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                  } catch { void 0; }
                  readyNotifiedRef.current = true;
                }
              };

              const onError = () => {
                // No rechazamos de inmediato; esperamos por watch o timeout
              };

              // Disparo getCurrentPosition (puede resolver rápido si hay caché o señal buena)
              navigator.geolocation.getCurrentPosition(onSuccess, onError, {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
              });

              // Disparo watchPosition para capturar la primera lectura disponible
              try {
                watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
                  enableHighAccuracy: true,
                  maximumAge: 0,
                });
              } catch (err) {
                console.debug("watchPosition lanzó excepción", err);
              }

              // Timeout de seguridad para no bloquear indefinidamente
              safetyTimerId = window.setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanupWatch();
                reject(new Error("timeout"));
              }, 15000);
            });

            initCenter = [firstPosition.coords.longitude, firstPosition.coords.latitude];
            setGeoError(null);
          } catch (err) {
            console.debug("No se pudo obtener ubicación inicial", err);
            setGeoError("No se pudo obtener tu ubicación inicial");
          } finally {
            setLocating(false);
          }
        }
      }

      map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/streets-v12",
        center: initCenter,
        zoom,
        attributionControl: true,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      if (useGeolocation) {
        const geolocate = new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showAccuracyCircle: false,
          fitBoundsOptions: { maxZoom: 16 },
        });

        // Mostramos solo el icono/botón de geolocalización; sin marcador personalizado
        map.addControl(geolocate, "bottom-right");

        geolocate.on("geolocate", (e: GeolocationPosition) => {
          const lon = e.coords.longitude;
          const lat = e.coords.latitude;
          try {
            const currentZoom = map!.getZoom();
            map!.flyTo({ center: [lon, lat], zoom: Math.max(currentZoom, 15) });
            setGeoError(null);
            if (onLocationReady && !readyNotifiedRef.current) {
              try {
                onLocationReady({ lat, lng: lon });
              } catch { void 0; }
              readyNotifiedRef.current = true;
            }
          } catch (err) {
            console.debug("flyTo falló", err);
            setGeoError("Error actualizando la ubicación del conductor");
          }
        });

        map.on("load", () => {
          try {
            geolocate.trigger();
          } catch (err) {
            console.debug("geolocate.trigger falló", err);
          }
        });
      }
    };

    init();

    return () => {
      // Limpia cualquier watch activo
      if (watchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch (err) {
          console.debug("clearWatch falló en cleanup", err);
        }
        watchIdRef.current = null;
      }
      map?.remove();
    };
  }, [centerLng, centerLat, zoom, useGeolocation, onLocationReady]);

  return (
    <div className={fullScreen ? "fixed inset-0 z-50" : "relative"}>
      <div
        ref={containerRef}
        className={
          fullScreen
            ? "h-dvh w-dvw overflow-hidden"
            : "h-[60vh] w-full rounded-lg overflow-hidden border border-green-100"
        }
      />

      {tokenMissing && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-center p-4">
          <div>
            <p className="text-green-800 font-semibold">Falta configurar Mapbox</p>
            <p className="text-green-700 text-sm mt-1">
              Añade tu token en <code>.env</code> como <code>VITE_MAPBOX_TOKEN</code>.
            </p>
          </div>
        </div>
      )}

      {useGeolocation && locating && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-green-800 text-sm">
          Solicitando ubicación...
        </div>
      )}

      {geoError && (
        <div className="absolute top-2 left-2 bg-white/90 text-red-700 text-xs px-2 py-1 rounded shadow">
          {geoError}
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-70 flex gap-2">
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            className="px-3 py-2 rounded-md bg-red-600 text-white text-sm shadow"
          >
            Detener búsqueda
          </button>
        )}
      </div>
    </div>
  );
}

export default MapView;