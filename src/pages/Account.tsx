import { useEffect, useState } from "react";
import { useAuth } from "@/context/useAuth";
import { firestore, storage } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

function Account() {
  const { user, signOutFn } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [carFile, setCarFile] = useState<File | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [carUrl, setCarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const d = await getDoc(doc(firestore, "users", user.uid));
        const data = d.data() || {};
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setBirthdate(data.birthdate || "");
        setProfileUrl(data.profilePhotoUrl || null);
        setCarUrl(data.carPhotoUrl || null);
      } catch (e) {
        console.debug("No se pudo cargar perfil (driver)", e);
      }
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let uploadedProfile: string | null = profileUrl;
      let uploadedCar: string | null = carUrl;
      if (profileFile) {
        const r = ref(storage, `users/${user.uid}/profile.jpg`);
        const contentType = profileFile.type || "image/jpeg";
        await uploadBytes(r, profileFile, { contentType });
        uploadedProfile = await getDownloadURL(r);
      }
      if (carFile) {
        const r = ref(storage, `users/${user.uid}/car.jpg`);
        const contentType = carFile.type || "image/jpeg";
        await uploadBytes(r, carFile, { contentType });
        uploadedCar = await getDownloadURL(r);
      }
      await setDoc(
        doc(firestore, "users", user.uid),
        {
          firstName: firstName || null,
          lastName: lastName || null,
          birthdate: birthdate || null,
          profilePhotoUrl: uploadedProfile || null,
          carPhotoUrl: uploadedCar || null,
          role: "driver",
        },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 pb-20">
      {/* Header */}
      <div className="p-4 border-b border-amber-100 bg-amber-50">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-green-800">Mi cuenta</h2>
          <span className="text-xs text-green-700">Conductor</span>
        </div>
        <p className="text-green-700 text-sm">Configura tu perfil</p>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white border border-green-100 rounded-lg p-4 space-y-4 shadow-sm">
          {/* Fotos al inicio: vertical y centradas para móvil */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-amber-100 overflow-hidden border border-amber-200">
              {profileUrl ? (
                <img
                  src={profileUrl}
                  alt="perfil"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-amber-500">
                  📷
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setProfileFile(f);
                if (f) setProfileUrl(URL.createObjectURL(f));
              }}
              className="w-full bg-white border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-36 h-24 rounded-md bg-amber-100 overflow-hidden border border-amber-200">
              {carUrl ? (
                <img
                  src={carUrl}
                  alt="auto"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-amber-500">
                  🚗
                </div>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setCarFile(f);
                if (f) setCarUrl(URL.createObjectURL(f));
              }}
              className="w-full bg-white border rounded-md px-3 py-2 text-sm"
            />
          </div>

          {/* Info de teléfono */}
          <div className="text-green-700 text-sm">
            <p>Teléfono: {user?.phoneNumber || "—"}</p>
          </div>

          {/* Campos del perfil */}
          <div className="grid grid-cols-1 gap-2">
            <label className="text-sm text-green-700">Nombre</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Tu nombre"
              className="bg-white border rounded-md px-3 py-2"
            />
            <label className="text-sm text-green-700">Apellido</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Tu apellido"
              className="bg-white border rounded-md px-3 py-2"
            />
            <label className="text-sm text-green-700">
              Fecha de nacimiento
            </label>
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              className="bg-white border rounded-md px-3 py-2"
            />
          </div>

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full px-4 py-3 rounded-md bg-green-700 hover:bg-green-800 text-white font-semibold"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOutFn();
              }}
              className="w-full px-4 py-3 rounded-md bg-red-600 text-white font-semibold"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Account;
