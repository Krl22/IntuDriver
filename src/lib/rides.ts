import { db, firestore } from "@/lib/firebase";
import {
  ref,
  query,
  orderByChild,
  equalTo,
  onValue,
  runTransaction,
  serverTimestamp,
  update,
  get,
} from "firebase/database";
import { doc, setDoc, serverTimestamp as fsServerTimestamp } from "firebase/firestore";

export type RideRequest = {
  riderId: string;
  riderPhone: string | null;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number; address: string | null };
  service: string;
  priceEstimate: number;
  status: "searching" | "accepted" | "in_progress" | "cancelled" | "completed";
  pickupCode?: string | null;
  createdAt: number | unknown;
  acceptedAt?: number | unknown;
  startedAt?: number | unknown;
  driver?: { id: string; name?: string | null; phone?: string | null } | null;
};

export type RideItem = { id: string; data: RideRequest };

export function listenSearchingRides(
  cb: (rides: RideItem[]) => void
): () => void {
  const q = query(ref(db, "rides/requests"), orderByChild("status"), equalTo("searching"));
  return onValue(q, (snap) => {
    const list: RideItem[] = [];
    snap.forEach((child) => {
      const val = child.val() as RideRequest | null;
      if (val) list.push({ id: child.key!, data: val });
    });
    // Opcional: ordenar por fecha si está disponible
    list.sort((a, b) => {
      const ta = typeof a.data.createdAt === "number" ? a.data.createdAt : 0;
      const tb = typeof b.data.createdAt === "number" ? b.data.createdAt : 0;
      return tb - ta;
    });
    cb(list);
  });
}

export async function acceptRide(
  requestId: string,
  driver: { id: string; name?: string | null; phone?: string | null }
): Promise<boolean> {
  const r = ref(db, `rides/requests/${requestId}`);
  const result = await runTransaction(r, (current) => {
    if (!current) return current;
    if (current.status !== "searching") return current;
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
    return {
      ...current,
      status: "accepted",
      acceptedAt: serverTimestamp(),
      pickupCode: code,
      driver: driver,
    };
  });
  return result.committed === true && !!result.snapshot.val() && result.snapshot.val().status === "accepted";
}

export function subscribeRide(
  requestId: string,
  cb: (ride: RideRequest | null) => void
): () => void {
  const r = ref(db, `rides/requests/${requestId}`);
  return onValue(r, (snap) => cb((snap.val() as RideRequest) ?? null));
}

export async function updateDriverLocation(
  requestId: string,
  loc: { lat: number; lng: number; heading?: number | null }
) {
  const r = ref(db, `rides/requests/${requestId}`);
  await update(r, {
    driverLoc: { lat: loc.lat, lng: loc.lng, heading: loc.heading ?? null },
    driverLocUpdatedAt: serverTimestamp(),
  });
}

export async function startRide(requestId: string, code: string): Promise<boolean> {
  const r = ref(db, `rides/requests/${requestId}`);
  const result = await runTransaction(r, (current) => {
    if (!current) return current;
    if (current.status !== "accepted") return current;
    const pickupCode = String(current.pickupCode ?? "");
    if (pickupCode && pickupCode === String(code).trim()) {
      return { ...current, status: "in_progress", startedAt: serverTimestamp() };
    }
    return current;
  });
  return result.committed === true && !!result.snapshot.val() && result.snapshot.val().status === "in_progress";
}

export async function completeRide(requestId: string) {
  const r = ref(db, `rides/requests/${requestId}`);
  await update(r, { status: "completed", completedAt: serverTimestamp() });
  try {
    const snap = await get(r);
    const data = snap.val() as RideRequest | null;
    if (data) {
      const rideDoc = doc(firestore, "rides", requestId);
      const createdAt = typeof data.createdAt === "number" ? new Date(data.createdAt) : fsServerTimestamp();
      const acceptedAt = typeof data.acceptedAt === "number" ? new Date(data.acceptedAt) : null;
      const startedAt = typeof data.startedAt === "number" ? new Date(data.startedAt) : null;
      await setDoc(
        rideDoc,
        {
          riderId: data.riderId,
          riderPhone: data.riderPhone ?? null,
          driverId: data.driver?.id ?? null,
          driverName: data.driver?.name ?? null,
          driverPhone: data.driver?.phone ?? null,
          origin: data.origin,
          destination: data.destination,
          service: data.service,
          price: data.priceEstimate,
          status: "completed",
          createdAt,
          acceptedAt,
          startedAt,
          completedAt: fsServerTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    // No bloquear la finalización si falla el historial
    console.debug("No se pudo guardar historial en Firestore", err);
  }
}