import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { firestore } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, Timestamp } from "firebase/firestore";
import { getDrivingRoute, lineBounds } from "@/lib/directions";

type RideDoc = {
  destination?: { address?: string | null; lat: number; lng: number };
  origin?: { lat: number; lng: number };
  price?: number;
  service?: string | null;
  driverName?: string | null;
  riderId?: string | null;
  riderPhone?: string | null;
  completedAt?: Timestamp | null;
  route?: {
    geometry?: GeoJSON.LineString;
    summary?: { distanceMeters: number; durationSeconds: number } | null;
    provider?: string | null;
  } | null;
};

interface RouteResult {
  geometry: GeoJSON.LineString;
  summary: { distanceMeters: number; durationSeconds: number };
}

async function getDrivingRouteOSRM(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<RouteResult> {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("OSRM request failed");
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route || !route.geometry) throw new Error("No OSRM route found");
  return {
    geometry: route.geometry as GeoJSON.LineString,
    summary: { distanceMeters: route.distance, durationSeconds: route.duration },
  };
}

const makeMarker = (emoji: string) => {
  const el = document.createElement("div");
  el.className = "text-xl drop-shadow";
  el.textContent = emoji;
  return el;
};

const HistoryDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [ride, setRide] = React.useState<RideDoc | null>(null);
  const [summary, setSummary] = React.useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const [loadingMap, setLoadingMap] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [originLabel, setOriginLabel] = React.useState<string>("");
  const [destLabel, setDestLabel] = React.useState<string>("");

  React.useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    mapboxgl.accessToken = token ?? "";
  }, []);

  React.useEffect(() => {
    if (!id) return;
    const d = doc(firestore, "rides", id);
    const unsub = onSnapshot(d, async (snap) => {
      const data = snap.data() as RideDoc | undefined;
      if (!data) return;
      setRide(data);
      const origin = data.origin;
      const dest = data.destination;
      if (!origin || !dest) return;

      if (!containerRef.current) return;
      let map: mapboxgl.Map | null = null;
      let routeDrawn = false;
      try {
        map = new mapboxgl.Map({
          container: containerRef.current!,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [dest.lng, dest.lat],
          zoom: 13,
          attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        new mapboxgl.Marker({ element: makeMarker("👤") })
          .setLngLat([origin.lng, origin.lat])
          .addTo(map);
        new mapboxgl.Marker({ element: makeMarker("📍") })
          .setLngLat([dest.lng, dest.lat])
          .addTo(map);

        map.on("load", async () => {
          try {
            if (!map!.getSource("ride-route")) {
              map!.addSource("ride-route", {
                type: "geojson",
                data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
              });
            }
            if (!map!.getLayer("ride-route-line")) {
              map!.addLayer({
                id: "ride-route-line",
                type: "line",
                source: "ride-route",
                paint: { "line-color": "#0f9d58", "line-width": 4 },
              });
            }

            const applyRoute = (geo: GeoJSON.LineString, sum?: { distanceMeters: number; durationSeconds: number }) => {
              const src = map!.getSource("ride-route") as mapboxgl.GeoJSONSource;
              src.setData({ type: "Feature", properties: {}, geometry: geo });
              const b = lineBounds(geo);
              map!.fitBounds([[b.minLng, b.minLat], [b.maxLng, b.maxLat]], { padding: 60, duration: 600 });
              routeDrawn = true;
              if (sum) setSummary(sum);
            };

            if (data.route?.geometry) {
              applyRoute(data.route.geometry, data.route.summary ?? undefined);
            } else {
              try {
                const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
                const res = token ? await getDrivingRoute(origin, dest, token) : await getDrivingRouteOSRM(origin, dest);
                applyRoute(res.geometry, res.summary);
                try {
                  await updateDoc(d, { route: { geometry: res.geometry, summary: res.summary, provider: token ? "mapbox" : "osrm" } });
                } catch (err) {
                  console.debug("No se pudo cachear ruta en Firestore (conductor)", err);
                }
              } catch (err) {
                console.debug("No se pudo calcular la ruta del viaje (conductor)", err);
              }
            }
          } finally {
            setLoadingMap(false);
          }
        });
      } catch {
        setError("No se pudo preparar el mapa del viaje");
        setLoadingMap(false);
      }
      return () => {
        if (!routeDrawn) setLoadingMap(false);
        map?.remove();
      };
    });
    return () => unsub();
  }, [id]);

  const formatAddress = React.useCallback((addr?: string | null) => {
    if (!addr) return "(sin dirección)";
    const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) return `${parts[0]}, ${parts[1]}`;
    if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
    return parts[0] ?? addr;
  }, []);

  const reverseGeocode = React.useCallback(async (lat: number, lng: number): Promise<string | null> => {
    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
      if (token) {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&types=address,place&language=es`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const place = data.features?.[0]?.place_name as string | undefined;
        return place ? formatAddress(place) : null;
      } else {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14`;
        const res = await fetch(url, { headers: { "Accept": "application/json" } });
        if (!res.ok) return null;
        const data = await res.json();
        const name = (data.display_name as string | undefined) ?? null;
        return name ? formatAddress(name) : null;
      }
    } catch {
      return null;
    }
  }, [formatAddress]);

  React.useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!ride) return;
      // Origen
      if (typeof ride.origin?.lat === "number" && typeof ride.origin?.lng === "number") {
        const label = await reverseGeocode(ride.origin.lat, ride.origin.lng);
        if (mounted) setOriginLabel(label ?? `Lat ${ride.origin.lat.toFixed(4)}, Lng ${ride.origin.lng.toFixed(4)}`);
      } else {
        if (mounted) setOriginLabel("(sin datos)");
      }
      // Destino
      if (ride.destination?.address) {
        if (mounted) setDestLabel(formatAddress(ride.destination.address));
      } else if (typeof ride.destination?.lat === "number" && typeof ride.destination?.lng === "number") {
        const dlabel = await reverseGeocode(ride.destination.lat, ride.destination.lng);
        if (mounted) setDestLabel(dlabel ?? `Lat ${ride.destination.lat.toFixed(4)}, Lng ${ride.destination.lng.toFixed(4)}`);
      } else {
        if (mounted) setDestLabel("(sin datos)");
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [ride, reverseGeocode, formatAddress]);

  return (
    <div className="min-h-screen bg-amber-50">
      <div className="p-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-green-800">Detalle del viaje</h1>
        <Button variant="outline" className="bg-white" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-[60vh] w-full" />
        {loadingMap && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-green-800 text-sm">Preparando mapa…</div>
        )}
        {error && (
          <div className="absolute top-2 left-2 bg-white/90 text-red-700 text-xs px-2 py-1 rounded shadow">{error}</div>
        )}
      </div>

      <div className="p-4">
        {ride ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-white border border-green-100 p-4">
              <p className="text-sm text-green-700">Origen</p>
              <p className="text-green-800 font-medium">{originLabel}</p>
            </div>
            <div className="rounded-lg bg-white border border-green-100 p-4">
              <p className="text-sm text-green-700">Destino</p>
              <p className="text-green-800 font-medium">{destLabel}</p>
            </div>
            {summary && (
              <div className="rounded-lg bg-white border border-green-100 p-4">
                <p className="text-sm text-green-700">Resumen de ruta</p>
                <p className="text-green-800 font-medium">
                  {(summary.distanceMeters / 1000).toFixed(1)} km · {Math.round(summary.durationSeconds / 60)} min
                </p>
              </div>
            )}
            <div className="rounded-lg bg-white border border-green-100 p-4">
              <p className="text-sm text-green-700">Servicio y precio</p>
              <p className="text-green-800 font-medium">{ride.service ?? "(servicio)"} · S/ {(ride.price ?? 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-white border border-green-100 p-4">
              <p className="text-sm text-green-700">Fecha</p>
              <p className="text-green-800 font-medium">{ride.completedAt ? ride.completedAt.toDate().toLocaleString() : "(sin fecha)"}</p>
            </div>
          </div>
        ) : (
          <div className="text-green-700">Cargando viaje…</div>
        )}
      </div>
    </div>
  );
};

export default HistoryDetail;