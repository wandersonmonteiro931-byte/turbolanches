import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
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
import AdminManualOrder from "./pages/admin/AdminManualOrder";
import Kitchen from "./pages/Kitchen";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/produto/:id" element={<ProductDetail />} />
              <Route path="/carrinho" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/busca" element={<Search />} />
              <Route path="/pedidos" element={<Orders />} />
              <Route path="/pedido/:id" element={<OrderTracking />} />
              <Route path="/perfil" element={<Profile />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/completar-perfil" element={<CompleteProfile />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="pedidos" element={<AdminOrders />} />
                <Route path="produtos" element={<AdminProducts />} />
                <Route path="categorias" element={<AdminCategories />} />
              </Route>
              <Route path="/admin/novo-pedido" element={<AdminManualOrder />} />
              <Route path="/admin/imprimir/:id" element={<AdminPrint />} />
              <Route path="/cozinha" element={<Kitchen />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
