import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import BottomNavbar from "@/components/BottomNavbar";
import Home from "@/pages/Home";
import RideView from "@/pages/RideView";
import RateRider from "@/pages/RateRider";
import History from "@/pages/History";
import HistoryDetail from "@/pages/HistoryDetail";
import Account from "@/pages/Account";
import Login from "@/pages/Login";
import { useAuth } from "@/context/useAuth";

function Layout() {
  const { pathname } = useLocation();
  const isRideView = pathname.startsWith("/ride/");
  return (
    <div className={`min-h-screen bg-amber-50 flex flex-col ${isRideView ? "pb-0" : "pb-20"}`}>
      {!isRideView && (
        <div className="p-4 border-b border-amber-100 bg-amber-50">
          <h1 className="text-2xl font-bold text-green-800">Intu Driver</h1>
          <p className="text-green-700 text-sm">Modo conductor</p>
        </div>
      )}
      <main className={`flex-1 ${isRideView ? "p-0" : "p-4"}`}>
        <Outlet />
      </main>
      {!isRideView && <BottomNavbar />}
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex items-center justify-center h-screen text-green-800">
        Cargando…
      </div>
    );
  return (
    <Routes>
      {!user ? (
        <>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Login />} />
        </>
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="/ride/:id" element={<RideView />} />
          <Route path="/rate/:id" element={<RateRider />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<HistoryDetail />} />
          <Route path="/account" element={<Account />} />
          <Route path="/login" element={<Home />} />
        </Route>
      )}
    </Routes>
  );
}

export default App;
