import React from "react";
import { Button } from "@/components/ui/button";
import { Radar } from "lucide-react";
import MapView from "@/components/MapView";
import { listenSearchingRides, type RideItem, acceptRide } from "@/lib/rides";
import { useAuth } from "@/context/useAuth";
import { useNavigate } from "react-router-dom";
import { firestore } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

function Home() {
  const [searching, setSearching] = React.useState<boolean>(false);
  const [rides, setRides] = React.useState<RideItem[]>([]);
  const [destCityLabels, setDestCityLabels] = React.useState<Record<string, string>>({});
  const [hasLocation, setHasLocation] = React.useState<boolean>(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isProfileComplete, setIsProfileComplete] = React.useState<boolean>(false);

  React.useEffect(() => {
    const checkProfile = async () => {
      if (!user) {
        setIsProfileComplete(false);
        return;
      }
      try {
        const snap = await getDoc(doc(firestore, "users", user.uid));
        const data = (snap.data() || {}) as {
          firstName?: string;
          lastName?: string;
          birthdate?: string;
          profilePhotoUrl?: string;
          carPhotoUrl?: string;
        };
        const ok = !!(data.firstName && data.lastName && data.birthdate && data.profilePhotoUrl && data.carPhotoUrl);
        setIsProfileComplete(ok);
      } catch {
        setIsProfileComplete(false);
      }
    };
    checkProfile();
  }, [user]);

  React.useEffect(() => {
    if (!searching || !hasLocation) return;
    const unsub = listenSearchingRides((list) => setRides(list));
    return () => unsub();
  }, [searching, hasLocation]);

  const extractCityFromAddress = React.useCallback((addr?: string | null) => {
    if (!addr) return "(sin dirección)";
    const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts[1];
    return parts[0] ?? addr;
  }, []);

  const reverseGeocodeCity = React.useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
      if (token) {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality&limit=1&access_token=${token}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const city = data?.features?.[0]?.text as string | undefined;
          if (city) return city;
          const placeName = data?.features?.[0]?.place_name as string | undefined;
          if (placeName) return extractCityFromAddress(placeName);
        }
      }
      const nomi = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
      const r = await fetch(nomi);
      if (r.ok) {
        const j = await r.json();
        const addr = j?.address ?? {};
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.state || addr.county;
        if (city) return city as string;
        const dn = (j?.display_name as string | undefined) ?? null;
        if (dn) return extractCityFromAddress(dn);
      }
      return `(${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    } catch {
      return `(${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    }
  }, [extractCityFromAddress]);

  React.useEffect(() => {
    if (rides.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        rides.map(async (r) => {
          const dest = r.data.destination;
          const city = dest?.address ? extractCityFromAddress(dest.address) : await reverseGeocodeCity(dest.lat, dest.lng);
          return [r.id, city] as const;
        })
      );
      if (!cancelled) {
        const next: Record<string, string> = {};
        for (const [id, city] of entries) next[id] = city;
        setDestCityLabels(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rides, extractCityFromAddress, reverseGeocodeCity]);

  const handleAccept = async (id: string) => {
    if (!user) return;
    if (!isProfileComplete) {
      alert("Completa tu cuenta en Cuenta antes de aceptar viajes.");
      navigate("/account");
      return;
    }
    const ok = await acceptRide(id, {
      id: user.uid,
      phone: user.phoneNumber ?? null,
      name: user.displayName ?? null,
    });
    if (ok) {
      setSearching(false);
      navigate(`/ride/${id}`);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-green-800">Inicio</h2>
      <p className="text-green-700 text-sm">
        Pulsa el botón para comenzar a buscar viajes de clientes cerca.
      </p>
      {!isProfileComplete && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs p-2">
          Completa tu perfil (nombre, apellido, fecha, foto y foto del auto) para poder buscar clientes.
        </div>
      )}
      {!searching ? (
        <Button
          className="w-full py-4 bg-green-700 hover:bg-green-800 text-white"
          onClick={() => {
            if (!isProfileComplete) {
              navigate("/account");
              alert("Completa tu cuenta antes de iniciar la búsqueda.");
              return;
            }
            setSearching(true);
          }}
          disabled={!user || !isProfileComplete}
        >
          <Radar className="size-5" />
          Iniciar búsqueda de viajes
        </Button>
      ) : (
        <>
          <MapView
            fullScreen
            onLocationReady={() => setHasLocation(true)}
            onStop={() => {
              try {
                window.location.reload();
              } catch {
                setSearching(false);
              }
            }}
          />
          {hasLocation && (
          <div className="fixed top-2 right-2 z-60 w-[340px] max-h-[72vh] bg-white/90 backdrop-blur rounded-xl shadow-lg border border-green-100 p-3 overflow-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-green-800">Solicitudes activas</p>
              <span className="text-xs text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded">{rides.length}</span>
            </div>
            {rides.length === 0 ? (
              <p className="text-xs text-green-700 mt-2">Sin solicitudes por ahora…</p>
            ) : (
              <div className="space-y-2 mt-2">
                {rides.map((r) => (
                  <div key={r.id} className="border border-green-100 rounded-lg p-3 bg-white hover:bg-amber-50/60 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-green-800 truncate">{destCityLabels[r.id] ?? "Cargando destino…"}</p>
                      <div className="text-green-800 font-semibold">S/ {typeof r.data.priceEstimate === 'number' ? r.data.priceEstimate.toFixed(2) : r.data.priceEstimate}</div>
                    </div>
                    <div className="mt-3">
                      <button
                        className="w-full px-3 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-sm shadow"
                        onClick={() => handleAccept(r.id)}
                        disabled={!user}
                      >
                        Aceptar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}

export default Home;