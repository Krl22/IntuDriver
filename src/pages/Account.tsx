import { useAuth } from "@/context/useAuth";

function Account() {
  const { user, signOutFn } = useAuth();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-green-800">Cuenta</h2>
      <div className="text-green-700 text-sm space-y-2">
        <p>
          UID: <span className="font-mono">{user?.uid}</span>
        </p>
        <p>Teléfono: {user?.phoneNumber || "—"}</p>
        <p>Correo: {user?.email || "—"}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          await signOutFn();
        }}
        className="px-4 py-2 rounded-md bg-red-600 text-white"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

export default Account;