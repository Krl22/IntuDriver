import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  subscribeRide,
  updateDriverLocation,
  completeRide,
  startRide,
  type RideRequest,
} from "@/lib/rides";
import { getDrivingRoute, lineBounds } from "@/lib/directions";

const makeMarker = (emoji: string) => {
  const el = document.createElement("div");
  el.style.fontSize = "20px";
  el.style.lineHeight = "20px";
  el.style.transform = "translate(-50%, -50%)";
  el.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.35))";
  el.textContent = emoji;
  return el;
};

const RideView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [ride, setRide] = React.useState<RideRequest | null>(null);
  const [loadingRoute, setLoadingRoute] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const origin = ride?.origin;
  const originLat = origin?.lat;
  const originLng = origin?.lng;
  const destinationLat = ride?.destination?.lat;
  const destinationLng = ride?.destination?.lng;
  const modeRef = React.useRef<boolean>(false);
  const hasFitBoundsRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (!id) return;
    const unsub = subscribeRide(id, setRide);
    return () => unsub();
  }, [id]);

  // Sincroniza el modo: antes de recoger (ruta a origen) vs en progreso (ruta a destino)
  React.useEffect(() => {
    modeRef.current = ride?.status === "in_progress";
  }, [ride?.status]);

  // Al cambiar a "in_progress" permitimos un nuevo fitBounds para la ruta a destino
  React.useEffect(() => {
    if (ride?.status === "in_progress") {
      hasFitBoundsRef.current = false;
    }
  }, [ride?.status]);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    mapboxgl.accessToken = token ?? "";
    if (!token) {
      setError("Falta configurar Mapbox (VITE_MAPBOX_TOKEN)");
      return;
    }

    let map: mapboxgl.Map | null = null;
    let driverMarker: mapboxgl.Marker | null = null;

    const initMap = async () => {
      map = new mapboxgl.Map({
        container: containerRef.current!,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [originLng ?? -74.08175, originLat ?? 4.60971],
        zoom: 12,
        attributionControl: true,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");

      // Client marker (no ref needed)
      if (originLat !== undefined && originLng !== undefined) {
        new mapboxgl.Marker({ element: makeMarker("👤") })
          .setLngLat([originLng, originLat])
          .addTo(map!);
      }

      const geolocate = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: false,
        fitBoundsOptions: { maxZoom: 16 },
      });
      map.addControl(geolocate, "bottom-right");

      geolocate.on("geolocate", async (e: GeolocationPosition) => {
        const lon = e.coords.longitude;
        const lat = e.coords.latitude;
        try {
          if (!driverMarker) {
            driverMarker = new mapboxgl.Marker({ element: makeMarker("🚗") })
              .setLngLat([lon, lat])
              .addTo(map!);
          } else {
            driverMarker.setLngLat([lon, lat]);
          }
          await updateDriverLocation(id!, {
            lat,
            lng: lon,
            heading: e.coords.heading ?? null,
          });

          // Seleccionar destino de la ruta según fase
          const goingToDestination = modeRef.current;
          const targetLat = goingToDestination ? destinationLat : originLat;
          const targetLng = goingToDestination ? destinationLng : originLng;

          // Actualizar ruta desde el conductor hasta el objetivo
          if (targetLat !== undefined && targetLng !== undefined) {
            try {
              const route = await getDrivingRoute(
                { lat, lng: lon },
                { lat: targetLat, lng: targetLng },
                token!
              );
              const source = map!.getSource("ride-route") as mapboxgl.GeoJSONSource | undefined;
              if (source) {
                source.setData({
                  type: "Feature",
                  properties: {},
                  geometry: route.geometry,
                });
                if (!hasFitBoundsRef.current) {
                  const b = lineBounds(route.geometry);
                  map!.fitBounds(
                    [
                      [b.minLng, b.minLat],
                      [b.maxLng, b.maxLat],
                    ],
                    { padding: 60, duration: 600 }
                  );
                  hasFitBoundsRef.current = true;
                }
              }
            } catch (err) {
              console.debug("No se pudo actualizar la ruta del viaje", err);
            }
          }
        } catch (err) {
          console.error(err);
        }
      });

      map.on("load", async () => {
        try {
          // Prepare empty route source/layer, geolocate will fill it
          if (!map!.getSource("ride-route")) {
            map!.addSource("ride-route", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: [] },
              },
            });
          }
          if (!map!.getLayer("ride-route-line")) {
            map!.addLayer({
              id: "ride-route-line",
              type: "line",
              source: "ride-route",
              paint: {
                "line-color": "#0f9d58",
                "line-width": 4,
              },
            });
          }
          setLoadingRoute(false);
          try {
            geolocate.trigger();
          } catch (err) {
            console.debug("geolocate.trigger falló", err);
          }
        } catch {
          setError("No se pudo preparar el mapa");
          setLoadingRoute(false);
        }
      });
    };

    initMap();

    return () => {
      map?.remove();
    };
  }, [id, originLat, originLng, destinationLat, destinationLng]);

  const endRide = async () => {
    if (!id) return;
    try {
      await completeRide(id);
      navigate(`/rate/${id}`);
    } catch {
      setError("No se pudo completar el viaje");
    }
  };

  const startRideNow = async () => {
    if (!id) return;
    const input = window.prompt("Ingrese el código de seguridad del pasajero");
    if (!input) return;
    try {
      const ok = await startRide(id, input.trim());
      if (!ok) {
        setError("Código incorrecto. Inténtalo nuevamente.");
      }
    } catch (err) {
      console.debug("No se pudo marcar viaje como en progreso", err);
      setError("No se pudo iniciar el viaje");
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <div ref={containerRef} className="h-dvh w-dvw fixed inset-0 z-40" />
        {loadingRoute && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-green-800 text-sm z-50">
            Preparando mapa del viaje…
          </div>
        )}
        {error && (
          <div className="absolute top-2 left-2 bg-white/90 text-red-700 text-xs px-2 py-1 rounded shadow z-50">
            {error}
          </div>
        )}
        <div className="fixed bottom-3 left-3 z-60 flex gap-2">
          {ride?.status !== "in_progress" ? (
            <button
              onClick={startRideNow}
              className="px-4 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-sm shadow"
            >
              Llegué al cliente
            </button>
          ) : (
            <button
              onClick={endRide}
              className="px-4 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-sm shadow"
            >
              Finalizar viaje
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RideView;
