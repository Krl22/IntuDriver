import { NavLink } from "react-router-dom";
import { Home, ScrollText, User } from "lucide-react";

function BottomNavbar() {
  const baseItem =
    "flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium";

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-green-100 shadow-lg">
      <div className="grid grid-cols-3">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${baseItem} ${isActive ? "text-green-700" : "text-gray-600"}`
          }
        >
          {({ isActive }) => (
            <>
              <Home className="size-5" />
              <span>Inicio</span>
              {isActive && (
                <span className="mt-1 h-0.5 w-6 rounded bg-green-600" />
              )}
            </>
          )}
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `${baseItem} ${isActive ? "text-green-700" : "text-gray-600"}`
          }
        >
          {({ isActive }) => (
            <>
              <ScrollText className="size-5" />
              <span>Historial</span>
              {isActive && (
                <span className="mt-1 h-0.5 w-6 rounded bg-green-600" />
              )}
            </>
          )}
        </NavLink>
        <NavLink
          to="/account"
          className={({ isActive }) =>
            `${baseItem} ${isActive ? "text-green-700" : "text-gray-600"}`
          }
        >
          {({ isActive }) => (
            <>
              <User className="size-5" />
              <span>Cuenta</span>
              {isActive && (
                <span className="mt-1 h-0.5 w-6 rounded bg-green-600" />
              )}
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
}

export default BottomNavbar;