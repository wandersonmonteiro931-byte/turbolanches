import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotificationBanner from "@/components/NotificationBanner";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useOrderStatusNotifier } from "@/hooks/useOrderStatusNotifier";
import { useAdminAlarm } from "@/hooks/useAdminAlarm";
import Index from "./pages/Index";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Search from "./pages/Search";
import Orders from "./pages/Orders";
import OrderTracking from "./pages/OrderTracking";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import CompleteProfile from "./pages/CompleteProfile";
import NotFound from "./pages/NotFound";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminPrint from "./pages/admin/AdminPrint";
import AdminDeliveryZones from "./pages/admin/AdminDeliveryZones";
import AdminManualOrder from "./pages/admin/AdminManualOrder";
import AdminSchedule from "./pages/admin/AdminSchedule";
import AdminCustomers from "./pages/admin/AdminCustomers";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminBanners from "./pages/admin/AdminBanners";
import AdminSiteContent from "./pages/admin/AdminSiteContent";
import AdminAddons from "./pages/admin/AdminAddons";
import AdminReceipts from "./pages/admin/AdminReceipts";
import Kitchen from "./pages/Kitchen";

const queryClient = new QueryClient();

// Protected route - requires authentication
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

// Inner component to use hooks inside AuthProvider
const AppInner = () => {
  const { user } = useAuth();
  usePushNotifications(user?.id);
  useOrderStatusNotifier();
  useAdminAlarm();

  return (
    <CartProvider>
      <Toaster />
      <Sonner />
      <NotificationBanner />
      <BrowserRouter>
        <Routes>
          {/* Public routes - accessible without login */}
          <Route path="/" element={<Index />} />
          <Route path="/produto/:id" element={<ProductDetail />} />
          <Route path="/auth" element={<Auth />} />

          {/* Protected routes - require authentication */}
          <Route path="/carrinho" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/busca" element={<ProtectedRoute><Search /></ProtectedRoute>} />
          <Route path="/pedidos" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/pedido/:id" element={<ProtectedRoute><OrderTracking /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/completar-perfil" element={<ProtectedRoute><CompleteProfile /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="produtos" element={<AdminProducts />} />
            <Route path="categorias" element={<AdminCategories />} />
            <Route path="entregas" element={<AdminDeliveryZones />} />
            <Route path="adicionais" element={<AdminAddons />} />
            <Route path="horarios" element={<AdminSchedule />} />
            <Route path="clientes" element={<AdminCustomers />} />
            <Route path="notificacoes" element={<AdminNotifications />} />
            <Route path="banners" element={<AdminBanners />} />
            <Route path="conteudo" element={<AdminSiteContent />} />
            <Route path="comandas" element={<AdminReceipts />} />
          </Route>
          <Route path="/admin/novo-pedido" element={<AdminManualOrder />} />
          <Route path="/admin/imprimir/:id" element={<AdminPrint />} />
          <Route path="/cozinha" element={<Kitchen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </CartProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
