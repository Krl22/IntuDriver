import React from "react";
import { useNavigate } from "react-router-dom";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/context/useAuth";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  getDocs,
} from "firebase/firestore";

type RideDoc = {
  destination?: { address?: string | null; lat: number; lng: number };
  origin?: { lat: number; lng: number };
  price?: number;
  completedAt?: Timestamp | null;
};

function History() {
  const { user } = useAuth();
  const [rides, setRides] = React.useState<
    Array<{ id: string; data: RideDoc }>
  >([]);
  const [labels, setLabels] = React.useState<Record<string, string>>({}); // destino
  const [originLabels, setOriginLabels] = React.useState<
    Record<string, string>
  >({}); // origen
  const [loading, setLoading] = React.useState<boolean>(true);
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!user) return;
    const q = query(
      collection(firestore, "rides"),
      where("driverId", "==", user.uid),
      orderBy("completedAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Array<{ id: string; data: RideDoc }> = snap.docs.map(
          (d) => ({ id: d.id, data: d.data() as RideDoc })
        );
        setRides(list);
      },
      async (err) => {
        // Si falta el índice compuesto, usar fallback sin orderBy y ordenar en cliente
        try {
          console.debug(
            "Fallo consulta con índice en History; usando fallback",
            err
          );
          const q2 = query(
            collection(firestore, "rides"),
            where("driverId", "==", user.uid)
          );
          const snap2 = await getDocs(q2);
          const list2: Array<{ id: string; data: RideDoc }> = snap2.docs.map(
            (d) => ({ id: d.id, data: d.data() as RideDoc })
          );
          list2.sort((a, b) => {
            const ta = a.data.completedAt ? a.data.completedAt.toMillis() : 0;
            const tb = b.data.completedAt ? b.data.completedAt.toMillis() : 0;
            return tb - ta;
          });
          setRides(list2);
        } catch (err2) {
          console.debug(
            "No se pudo cargar historial desde Firestore (fallback)",
            err2
          );
          setRides([]);
        }
      }
    );
    return () => unsub();
  }, [user]);

  const formatAddress = React.useCallback((addr: string): string => {
    const parts = addr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) return `${parts[0]}, ${parts[1]}`;
    if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
    return parts[0] ?? addr;
  }, []);

  const reverseGeocode = React.useCallback(
    async (lat: number, lng: number): Promise<string | null> => {
      try {
        if (mapboxToken) {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&language=es&limit=1&types=place,locality,address`;
          const res = await fetch(url);
          if (res.ok) {
            const data = (await res.json()) as {
              features?: Array<{ place_name?: string }>;
            };
            const place = data?.features?.[0]?.place_name;
            if (typeof place === "string") return formatAddress(place);
          }
        }
        // Fallback sin token: Nominatim (OpenStreetMap)
        const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es&zoom=12`;
        const res2 = await fetch(osmUrl);
        if (!res2.ok) return null;
        const data2 = (await res2.json()) as {
          display_name?: string;
          address?: {
            road?: string;
            suburb?: string;
            city?: string;
            town?: string;
            village?: string;
            municipality?: string;
            state?: string;
          };
        };
        const city =
          data2.address?.city ||
          data2.address?.town ||
          data2.address?.village ||
          data2.address?.municipality;
        const road = data2.address?.road || data2.address?.suburb;
        if (city && road) return `${road}, ${city}`;
        if (city) return city;
        if (typeof data2.display_name === "string")
          return formatAddress(data2.display_name);
        return null;
      } catch {
        return null;
      }
    },
    [mapboxToken, formatAddress]
  );

  React.useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      const nextDest: Record<string, string> = { ...labels };
      const nextOrigin: Record<string, string> = { ...originLabels };
      const tasks: Promise<void>[] = [];
      for (const r of rides) {
        const id = r.id;
        const dest = r.data.destination;
        const addr = dest?.address as string | undefined;
        if (addr) {
          nextDest[id] = formatAddress(addr);
        } else if (
          typeof dest?.lat === "number" &&
          typeof dest?.lng === "number" &&
          !nextDest[id]
        ) {
          tasks.push(
            reverseGeocode(dest.lat, dest.lng).then((label) => {
              if (mounted && label) nextDest[id] = label;
            })
          );
        }

        const origin = r.data.origin;
        if (
          typeof origin?.lat === "number" &&
          typeof origin?.lng === "number" &&
          !nextOrigin[id]
        ) {
          tasks.push(
            reverseGeocode(origin.lat, origin.lng).then((label) => {
              if (mounted && label) nextOrigin[id] = label;
            })
          );
        }
      }
      if (tasks.length > 0) await Promise.all(tasks);
      if (mounted) {
        setLabels(nextDest);
        setOriginLabels(nextOrigin);
        setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rides]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-green-800">Historial</h2>
      {rides.length === 0 ? (
        <p className="text-green-700 text-sm">
          Aún no tienes viajes completados.
        </p>
      ) : loading ? (
        <div className="space-y-3">
          {rides.slice(0, Math.min(rides.length, 5)).map((_, i) => (
            <div
              key={i}
              className="p-3 rounded-lg bg-white border border-green-100 animate-pulse"
            >
              <div className="h-4 bg-green-100 rounded w-2/3 mb-2" />
              <div className="h-3 bg-green-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rides.map((r) => {
            const originLabel =
              originLabels[r.id] ??
              (typeof r.data.origin?.lat === "number" &&
              typeof r.data.origin?.lng === "number"
                ? `Lat ${r.data.origin.lat.toFixed(
                    4
                  )}, Lng ${r.data.origin.lng.toFixed(4)}`
                : "(sin datos)");
            const destLabel =
              labels[r.id] ??
              (r.data.destination?.address
                ? formatAddress(r.data.destination!.address!)
                : `Lat ${r.data.destination?.lat?.toFixed(
                    4
                  )}, Lng ${r.data.destination?.lng?.toFixed(4)}`);
            const price = r.data.price ?? 0;
            const time = r.data.completedAt
              ? r.data.completedAt.toDate()
              : null;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/history/${r.id}`)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white border border-green-100 hover:bg-amber-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-green-800 font-medium truncate">
                    {originLabel}
                  </p>
                  <p className="text-green-600 text-center leading-none">|</p>
                  <p className="text-green-800 font-medium truncate">
                    {destLabel}
                  </p>
                  <p className="text-xs text-green-700">
                    {time ? time.toLocaleString() : ""}
                  </p>
                </div>
                <div className="text-green-800 font-semibold">
                  S/ {price.toFixed(2)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default History;
