import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Minus, Trash2, Search, ShoppingBag, Edit2, Package, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import NeighborhoodAutocomplete from "@/components/NeighborhoodAutocomplete";
import CustomerSearch from "@/components/admin/CustomerSearch";
import { formatBusinessDate } from "@/lib/businessDay";
import { useStoreName } from "@/hooks/useStoreName";
import { openPreparedPrintPopup, routePreparedPrintPopup } from "@/lib/printPopup";
import { tryPrintOrderViaQz } from "@/lib/printRouter";
import { useGlobalKeyboardSearch } from "@/hooks/useGlobalKeyboardSearch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { normalizeSearch } from "@/lib/searchNormalize";

interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
  is_combo?: boolean;
  combo_item_count?: number;
  product_code?: number | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface CartItemAddon {
  addon_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  observations: string;
  customPrice: number;
  isCombo: boolean;
  addons: CartItemAddon[];
  sentToKitchen?: boolean;
}

interface AvailableAddon {
  id: string;
  name: string;
  price: number;
  apply_to_all: boolean;
  product_id: string | null;
}

interface DeliveryZone {
  neighborhood: string;
  delivery_fee: number;
  distance_km: number | null;
  temp_free_delivery: boolean;
}

interface DeliveryConfig {
  free_delivery_min_order: number;
  free_delivery_max_km: number;
  temp_free_delivery_all: boolean;
}

interface RestaurantTable {
  id: string;
  table_number: number;
  name: string;
  active: boolean;
}

interface OpenTableOrder {
  id: string;
  restaurant_table_id: string | null;
  table_code: string | null;
  table_stage: string | null;
  status: string;
}

const deliveryTypes = [
  { id: "mesa", label: "Mesa", icon: "🪑" },
  { id: "viagem", label: "Viagem", icon: "🛍️" },
  { id: "retirada", label: "Retirada", icon: "🏪" },
  { id: "delivery", label: "Delivery", icon: "🏍️" },
  { id: "consumo", label: "Consumo", icon: "🍽️" },
];

const paymentMethods = [
  { id: "dinheiro", label: "Dinheiro", icon: "💵" },
  { id: "pix_entrega", label: "PIX Entrega", icon: "📱" },
  { id: "pix_pago", label: "PIX Pago", icon: "✅" },
  { id: "cartao", label: "Cartão", icon: "💳" },
  { id: "fiado", label: "Fiado", icon: "📝" },
];

const tablePaymentMethods = [
  { id: "dinheiro", label: "Dinheiro Pago", icon: "💵" },
  { id: "cartao", label: "Cartão Pago", icon: "💳" },
  { id: "pix_pago", label: "PIX Pago", icon: "✅" },
  { id: "fiado", label: "Fiado", icon: "📝" },
];

const changeMethods = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "Pix" },
  { id: "card", label: "Cartão" },
];

const normalizeNeighborhood = (value: string) => value.trim();

const cleanManualOrderObservation = (value: string) =>
  value
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part && part !== "[PDV]" && !/^Mesa:\s*#?MESA\d+/i.test(part))
    .join(" | ");

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

const SectionCard = ({ children, title, icon, className = "" }: { children: React.ReactNode; title: string; icon?: string; className?: string }) => (
  <motion.div
    {...fadeIn}
    className={cn(
      "rounded-xl border-2 border-border bg-card p-4 shadow-sm ring-1 ring-border/40 space-y-3",
      className,
    )}
  >
    <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
      {icon && <span>{icon}</span>}
      {title}
    </h2>
    {children}
  </motion.div>
);

const SectionBlock = ({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("rounded-xl border-2 border-border bg-background/70 p-3 space-y-2", className)}>
    {title && <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>}
    {children}
  </div>
);

const DRAFT_KEY = "admin_manual_order_draft";

interface DraftState {
  cart: CartItem[];
  deliveryType: string;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  selectedCustomerId: string | null;
  selectedCustomerCode: string;
  tableNumber: string;
  addressStreet: string;
  addressNumber: string;
  addressNeighborhood: string;
  addressComplement: string;
  observations: string;
  customDeliveryFee: string;
  deliveryFeeOverridden: boolean;
  discount: string;
}

const loadDraft = (): Partial<DraftState> => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};

    const draft = JSON.parse(raw) as Partial<DraftState> & { changeFor?: string; changeMethod?: string; isPaid?: boolean };
    delete draft.changeFor;
    delete draft.changeMethod;
    delete draft.isPaid;

    if (String(draft.customDeliveryFee ?? "").replace(",", ".") === "5.99") {
      draft.customDeliveryFee = "";
      draft.deliveryFeeOverridden = false;
    }

    return draft;
  } catch { return {}; }
};

const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} };

const openPrintPopup = () => openPreparedPrintPopup("width=300,height=600");

const routePopupToPrint = (popup: Window | null, url: string) => {
  // Tenta QZ Tray primeiro; se sucesso, fecha o popup já aberto.
  const match = url.match(/\/admin\/imprimir\/([^?]+)(?:\?(.*))?/);
  if (match) {
    const orderId = match[1];
    const params = new URLSearchParams(match[2] || "");
    const tipo = params.get("tipo") || "pedido";
    const copies = Number(params.get("copies") || 1);
    if (tipo === "pedido" || tipo === "obrigado" || tipo === "mesa") {
      tryPrintOrderViaQz(orderId, { tipo, copies }).then((sent) => {
        if (sent) {
          try { popup?.close(); } catch { /* noop */ }
        } else {
          routePreparedPrintPopup(popup, url, "width=300,height=600");
        }
      }).catch(() => {
        routePreparedPrintPopup(popup, url, "width=300,height=600");
      });
      return;
    }
  }
  routePreparedPrintPopup(popup, url, "width=300,height=600");
};

const AdminManualOrder = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editOrderId = searchParams.get("edit");
  const { user } = useAuth();
  const { storeId } = useStore();
  const storeName = useStoreName();
  const draft = useRef(loadDraft()).current;
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>(editOrderId ? [] : (draft.cart ?? []));
  const [search, setSearch] = useState("");
  const productSearchInputRef = useRef<HTMLInputElement>(null);
  useGlobalKeyboardSearch(productSearchInputRef, (text) => {
    if (text === "") setSearch("");
    else if (text === "\b") setSearch((s) => s.slice(0, -1));
    else setSearch((s) => s + text);
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState(editOrderId ? "mesa" : (draft.deliveryType ?? "mesa"));
  const [paymentMethod, setPaymentMethod] = useState(editOrderId ? "dinheiro" : (draft.paymentMethod ?? "dinheiro"));
  const [customerName, setCustomerName] = useState(editOrderId ? "" : (draft.customerName ?? ""));
  const [customerPhone, setCustomerPhone] = useState(editOrderId ? "" : (draft.customerPhone ?? ""));
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(editOrderId ? null : (draft.selectedCustomerId ?? null));
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>(editOrderId ? "" : (draft.selectedCustomerCode ?? ""));
  const [tableNumber, setTableNumber] = useState(editOrderId ? "" : (draft.tableNumber ?? ""));
  const [addressStreet, setAddressStreet] = useState(editOrderId ? "" : (draft.addressStreet ?? ""));
  const [addressNumber, setAddressNumber] = useState(editOrderId ? "" : (draft.addressNumber ?? ""));
  const [addressNeighborhood, setAddressNeighborhood] = useState(editOrderId ? "" : (draft.addressNeighborhood ?? ""));
  const [addressComplement, setAddressComplement] = useState(editOrderId ? "" : (draft.addressComplement ?? ""));
  const [observations, setObservations] = useState(editOrderId ? "" : (draft.observations ?? ""));
  const [changeFor, setChangeFor] = useState("");
  const [changeMethod, setChangeMethod] = useState<string>("dinheiro");
  const [loading, setLoading] = useState(false);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>({
    free_delivery_min_order: 0,
    free_delivery_max_km: 0,
    temp_free_delivery_all: false,
  });
  const [customDeliveryFee, setCustomDeliveryFee] = useState<string>(editOrderId ? "0" : (draft.customDeliveryFee ?? ""));
  const [deliveryFeeOverridden, setDeliveryFeeOverridden] = useState(editOrderId ? true : (draft.deliveryFeeOverridden ?? false));
  const [discount, setDiscount] = useState<string>(editOrderId ? "0" : (draft.discount ?? ""));
  const [availableAddons, setAvailableAddons] = useState<AvailableAddon[]>([]);
  const [addonProductLinks, setAddonProductLinks] = useState<{ addon_id: string; product_id: string }[]>([]);
  const [restaurantTables, setRestaurantTables] = useState<RestaurantTable[]>([]);
  const [openTableOrders, setOpenTableOrders] = useState<OpenTableOrder[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [tableStage, setTableStage] = useState<string>("none");
  const [selectedCartItemIds, setSelectedCartItemIds] = useState<string[]>([]);
  const [addonModalProductId, setAddonModalProductId] = useState<string | null>(null);
  const [showProducts, setShowProducts] = useState(true);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [tableConfirmAction, setTableConfirmAction] = useState<"finalize" | "cancel" | null>(null);
  const comboSelectionInitializedRef = useRef(false);
  const editLoadedRef = useRef(false);

  // Edit mode: original order metadata preserved
  const [editOriginalOrderNumber, setEditOriginalOrderNumber] = useState<number | null>(null);
  const [editOriginalCreatedAt, setEditOriginalCreatedAt] = useState<string | null>(null);
  const [editOriginalUserId, setEditOriginalUserId] = useState<string | null>(null);
  const [nextOrderNumber, setNextOrderNumber] = useState<number | null>(null);

  // Persist draft on every relevant change
  // Persist draft on every relevant change (skip in edit mode)
  useEffect(() => {
    if (editOrderId) return;
    const d: DraftState = {
      cart, deliveryType, paymentMethod, customerName, customerPhone,
      selectedCustomerId, selectedCustomerCode, tableNumber, addressStreet,
      addressNumber, addressNeighborhood, addressComplement, observations,
      customDeliveryFee, deliveryFeeOverridden, discount,
    };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
  }, [editOrderId, cart, deliveryType, paymentMethod, customerName, customerPhone,
    selectedCustomerId, selectedCustomerCode, tableNumber, addressStreet,
    addressNumber, addressNeighborhood, addressComplement, observations,
    customDeliveryFee, deliveryFeeOverridden, discount]);

  useEffect(() => {
    const cartIds = cart.map((item) => item.product.id);
    setSelectedCartItemIds((prev) => {
      const validPrev = prev.filter((id) => cartIds.includes(id));
      if (validPrev.length === 0 && cartIds.length > 0 && !comboSelectionInitializedRef.current) {
        comboSelectionInitializedRef.current = true;
        return cartIds;
      }
      if (validPrev.length === prev.length && validPrev.every((id, idx) => id === prev[idx])) return prev;
      return validPrev;
    });
    if (cartIds.length === 0) comboSelectionInitializedRef.current = false;
  }, [cart]);

  const loadLatestData = useCallback(async () => {
    const tableQuery = storeId
      ? supabase.from("restaurant_tables" as any).select("id, table_number, name, active").eq("active", true).eq("store_id", storeId).order("sort_order").order("table_number")
      : supabase.from("restaurant_tables" as any).select("id, table_number, name, active").eq("active", true).order("sort_order").order("table_number");
    const openTablesQuery = storeId
      ? supabase.from("orders" as any).select("id, restaurant_table_id, table_code, table_stage, status").eq("delivery_type", "mesa").not("restaurant_table_id", "is", null).is("trashed_at", null).not("status", "in", "(delivered,cancelled)").eq("store_id", storeId)
      : supabase.from("orders" as any).select("id, restaurant_table_id, table_code, table_stage, status").eq("delivery_type", "mesa").not("restaurant_table_id", "is", null).is("trashed_at", null).not("status", "in", "(delivered,cancelled)");
    const [prodRes, catRes, zonesRes, addonsRes, linksRes, settingsRes, latestOrderRes, tablesRes, openTablesRes] = await Promise.all([
      supabase.from("products").select("id, name, price, category_id, image_url, is_combo, combo_item_count, product_code, store_only").eq("active", true).order("sort_order").order("name"),
      supabase.from("categories").select("id, name, sort_order").eq("active", true).order("sort_order"),
      supabase.from("delivery_zones").select("neighborhood, delivery_fee, distance_km, temp_free_delivery"),
      supabase.from("product_addons").select("id, name, price, apply_to_all, product_id").eq("active", true).order("sort_order"),
      supabase.from("addon_product_links").select("addon_id, product_id"),
      supabase.from("store_settings").select("free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all").limit(1).single(),
      supabase.from("orders").select("order_number").order("order_number", { ascending: false }).limit(1).maybeSingle(),
      tableQuery,
      openTablesQuery,
    ]);

    if (prodRes.data) setProducts(prodRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (zonesRes.data) setDeliveryZones(zonesRes.data as DeliveryZone[]);
    if (addonsRes.data) setAvailableAddons(addonsRes.data);
    if (linksRes.data) setAddonProductLinks(linksRes.data);
    if (tablesRes.data) setRestaurantTables(tablesRes.data as unknown as RestaurantTable[]);
    if (openTablesRes.data) setOpenTableOrders(openTablesRes.data as unknown as OpenTableOrder[]);
    if (settingsRes.data) {
      const config = settingsRes.data as DeliveryConfig;
      setDeliveryConfig({
        free_delivery_min_order: Number(config.free_delivery_min_order) || 0,
        free_delivery_max_km: Number(config.free_delivery_max_km) || 0,
        temp_free_delivery_all: Boolean(config.temp_free_delivery_all),
      });
    }
    setNextOrderNumber((Number(latestOrderRes.data?.order_number) || 0) + 1);
    setDataRefreshKey((k) => k + 1);
  }, [storeId]);

  useEffect(() => { void loadLatestData(); }, [loadLatestData]);

  // Load existing order for editing
  useEffect(() => {
    if (!editOrderId || editLoadedRef.current) return;
    editLoadedRef.current = true;

    const loadOrder = async () => {
      // Wait for products to be loaded
      const [orderRes, itemsRes] = await Promise.all([
        supabase.from("orders").select("*").eq("id", editOrderId).single(),
        supabase.from("order_items").select("*").eq("order_id", editOrderId),
      ]);

      if (!orderRes.data) {
        toast.error("Pedido não encontrado");
        navigate("/admin");
        return;
      }

      const order = orderRes.data;
      const orderItems = itemsRes.data || [];

      // Preserve original metadata
      setEditOriginalOrderNumber(order.order_number);
      setEditOriginalCreatedAt(order.created_at);
      setEditOriginalUserId(order.user_id);
      setSelectedTableId((order as any).restaurant_table_id || null);
      setTableStage((order as any).table_stage || "none");
      if ((order as any).table_code) setTableNumber(String((order as any).table_code).toUpperCase());

      // Set order fields
      setDeliveryType(order.delivery_type || "mesa");
      setAddressStreet(order.address_street || "");
      setAddressNumber(order.address_number || "");
      setAddressNeighborhood(order.address_neighborhood || "");

      // For orders placed by customers via the menu (have user_id) and delivery type,
      // the complement should always reflect the customer's profile quadra/lote
      // (no need to repeat it manually).
      let resolvedComplement = order.address_complement || "";
      if (order.user_id && order.delivery_type === "delivery") {
        const { data: customerProfile } = await supabase
          .from("profiles")
          .select("complement, quadra, lote")
          .eq("user_id", order.user_id)
          .maybeSingle();
        if (customerProfile) {
          resolvedComplement = [
            customerProfile.complement,
            customerProfile.quadra ? `Qd ${customerProfile.quadra}` : "",
            customerProfile.lote ? `Lt ${customerProfile.lote}` : "",
          ].filter(Boolean).join(" ");
        }
      }
      setAddressComplement(resolvedComplement);
      setObservations(cleanManualOrderObservation(order.observations || ""));
      setDiscount(String(order.discount || 0));
      setCustomDeliveryFee(String(order.delivery_fee || 0));
      setDeliveryFeeOverridden(true);
      setChangeFor(order.change_for ? String(order.change_for) : "");

      // Restore change method (troco devolvido via dinheiro/pix/cartão)
      const cgPix = Number(order.change_given_pix || 0);
      const cgCard = Number(order.change_given_card || 0);
      const cgCash = Number(order.change_given_cash || 0);
      if (cgPix > 0) setChangeMethod("pix");
      else if (cgCard > 0) setChangeMethod("card");
      else if (cgCash > 0) setChangeMethod("dinheiro");

      // Map payment method
      const pm = order.payment_method;
      if (pm === "pix") {
        setPaymentMethod(order.payment_confirmed ? "pix_pago" : "pix_entrega");
      } else {
        setPaymentMethod(pm || "dinheiro");
      }

      // IMPORTANT: do NOT auto-fill name/phone on edit — keep the order EXACTLY
      // as it was originally created. The original order does not store
      // customer name/phone fields directly, so we leave them blank.
      setCustomerName("");
      setCustomerPhone("");
      setSelectedCustomerId(null);
      setSelectedCustomerCode("");

      // Parse observations for table number only as a fallback for legacy orders
      const obsMatch = order.observations?.match(/Mesa:\s*(\S+)/);
      if (!(order as any).table_code && obsMatch) setTableNumber(obsMatch[1].toUpperCase());

      // Wait for products to load, then build cart
      const { data: allProducts } = await supabase
        .from("products")
        .select("id, name, price, category_id, image_url, is_combo, combo_item_count, product_code, store_only")
        .eq("active", true);

      const productMap = new Map((allProducts || []).map(p => [p.id, p]));

      const cartItems: CartItem[] = orderItems.map((item: any) => {
        const product = item.product_id ? productMap.get(item.product_id) : null;
        const cartProduct: Product = product || {
          id: item.product_id || `custom-${item.id}`,
          name: item.product_name,
          price: Number(item.unit_price),
          category_id: null,
          image_url: null,
        };

        const addons: CartItemAddon[] = Array.isArray(item.addons_json)
          ? item.addons_json.map((a: any) => ({
              addon_id: a.addon_id || a.id || `addon-${Math.random()}`,
              name: a.name,
              price: Number(a.price),
              quantity: Number(a.quantity || 1),
            }))
          : [];

        return {
          product: cartProduct,
          quantity: item.quantity,
          observations: item.observations || "",
          customPrice: Number(item.unit_price),
          isCombo: Boolean(product?.is_combo),
          addons,
          sentToKitchen: Boolean(item.sent_to_kitchen),
        };
      });

      setCart(cartItems);
    };

    void loadOrder();
  }, [editOrderId, navigate]);

  // Note: Removed auto-refresh on focus/visibility to prevent the page from
  // appearing to "reload by itself" after manual prints or background interactions.
  // Use the manual "Atualizar" button in the header to refetch products/zones.

  const getAddonsForProduct = (productId: string) =>
    availableAddons.filter((addon) => addon.apply_to_all || addon.product_id === productId || addonProductLinks.some((l) => l.addon_id === addon.id && l.product_id === productId));

  const getAddonsForSelectedItems = () => {
    const addonMap = new Map<string, AvailableAddon>();
    selectedCartItemIds.forEach((pid) => getAddonsForProduct(pid).forEach((a) => addonMap.set(a.id, a)));
    return Array.from(addonMap.values());
  };

  const isProductCombo = (product: Product) => {
    const category = categories.find((c) => c.id === product.category_id);
    return Boolean(product.is_combo) || normalizeSearch(category?.name).includes("combo") || normalizeSearch(product.name).includes("combo");
  };

  const filteredProducts = products.filter((p) => {
    const q = normalizeSearch(search);
    const matchesSearch =
      !q ||
      normalizeSearch(p.name).includes(q) ||
      String(p.product_code ?? "").includes(q);
    const matchesCategory = !selectedCategory || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = search.trim();
    if (!q) return;
    // Exact code match: add to cart and clear
    const codeNum = parseInt(q);
    if (!Number.isNaN(codeNum)) {
      const exact = products.find((p) => p.product_code === codeNum);
      if (exact) {
        addToCart(exact);
        setSearch("");
        return;
      }
    }
    // Single name match: add it
    if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearch("");
    }
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        return prev.map((i) => {
          if (i.product.id !== product.id) return i;
          const updatedAddons = i.isCombo ? i.addons.map((a) => ({ ...a, quantity: Math.round((a.quantity / i.quantity) * newQty) })) : i.addons;
          return { ...i, quantity: newQty, addons: updatedAddons, sentToKitchen: false };
        });
      }
      return [...prev, { product, quantity: 1, observations: "", customPrice: product.price, isCombo: isProductCombo(product), addons: [] }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const newQty = Math.max(0, i.quantity + delta);
        if (newQty === 0) return { ...i, quantity: 0 };
        const updatedAddons = i.isCombo ? i.addons.map((a) => ({ ...a, quantity: Math.round((a.quantity / i.quantity) * newQty) })) : i.addons;
        return { ...i, quantity: newQty, addons: updatedAddons, sentToKitchen: false };
      }).filter((i) => i.quantity > 0)
    );
  };

  const updateItemQuantityManual = (productId: string, value: string) => {
    const newQty = Math.max(0, Math.floor(Number(value) || 0));
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        if (newQty === 0) return { ...item, quantity: 0 };
        const updatedAddons = item.isCombo
          ? item.addons.map((addon) => ({ ...addon, quantity: Math.round((addon.quantity / Math.max(1, item.quantity)) * newQty) }))
          : item.addons;
        return { ...item, quantity: newQty, addons: updatedAddons, sentToKitchen: false };
      }).filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
    setSelectedCartItemIds((prev) => prev.filter((id) => id !== productId));
  };

  const updateItemObs = (productId: string, obs: string) => {
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, observations: obs, sentToKitchen: false } : i)));
  };

  const updateItemPrice = (productId: string, newPrice: string) => {
    const val = parseFloat(newPrice.replace(",", "."));
    if (!isNaN(val) && val >= 0) setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, customPrice: val, sentToKitchen: false } : i)));
  };

  const toggleCombo = (productId: string) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const newIsCombo = !i.isCombo;
        const updatedAddons = newIsCombo ? i.addons.map((a) => ({ ...a, quantity: a.quantity > 0 ? a.quantity * i.quantity : 0 })) : i.addons;
        return { ...i, isCombo: newIsCombo, addons: updatedAddons, sentToKitchen: false };
      })
    );
  };

  const handleSetAddon = (productIds: string[], addonId: string, addon: { id: string; name: string; price: number }, quantity: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (!productIds.includes(item.product.id)) return item;
        let newAddons = [...item.addons];
        if (quantity <= 0) {
          newAddons = newAddons.filter((a) => a.addon_id !== addonId);
        } else {
          const existingIdx = newAddons.findIndex((a) => a.addon_id === addonId);
          if (existingIdx >= 0) newAddons[existingIdx] = { ...newAddons[existingIdx], quantity };
          else newAddons.push({ addon_id: addonId, name: addon.name, price: addon.price, quantity });
        }
        return { ...item, addons: newAddons, sentToKitchen: false };
      })
    );
  };

  const toggleSelectItem = (productId: string) => {
    setSelectedCartItemIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));
  };
  const selectAllItems = () => setSelectedCartItemIds(cart.map((i) => i.product.id));
  const clearSelection = () => setSelectedCartItemIds([]);

  const addonsTotal = cart.reduce((sum, i) => sum + i.addons.reduce((s, a) => s + a.price * a.quantity, 0), 0);
  const subtotal = cart.reduce((sum, i) => sum + i.customPrice * i.quantity, 0) + addonsTotal;

  const matchedZone = deliveryZones.find((zone) => normalizeNeighborhood(zone.neighborhood) === normalizeNeighborhood(addressNeighborhood));
  const rawDeliveryFee = matchedZone ? Number(matchedZone.delivery_fee) : 0;

  const isTempFree = Boolean(matchedZone?.temp_free_delivery || deliveryConfig.temp_free_delivery_all);
  const isKmFree = Boolean(deliveryConfig.free_delivery_max_km > 0 && matchedZone?.distance_km != null && matchedZone.distance_km >= 0 && matchedZone.distance_km <= deliveryConfig.free_delivery_max_km);
  const isMinOrderFree = Boolean(deliveryConfig.free_delivery_min_order > 0 && subtotal >= deliveryConfig.free_delivery_min_order);

  const autoDeliveryFee = isTempFree || isKmFree || isMinOrderFree ? 0 : rawDeliveryFee;
  const autoDeliveryReason = isTempFree
    ? "🎉 Frete grátis (promoção)"
    : isKmFree
      ? `🎉 Frete grátis (até ${deliveryConfig.free_delivery_max_km} km)`
      : isMinOrderFree
        ? `🎉 Frete grátis (pedido ≥ R$ ${deliveryConfig.free_delivery_min_order.toFixed(2).replace(".", ",")})`
        : null;

  useEffect(() => {
    if (deliveryType !== "delivery" || deliveryFeeOverridden) return;
    setCustomDeliveryFee(autoDeliveryFee.toFixed(2));
  }, [deliveryType, deliveryFeeOverridden, autoDeliveryFee]);

  const deliveryFee = deliveryType === "delivery" ? (deliveryFeeOverridden ? parseFloat(customDeliveryFee.replace(",", ".")) || 0 : autoDeliveryFee) : 0;
  const discountValue = parseFloat(discount.replace(",", ".")) || 0;
  const total = Math.max(0, subtotal + deliveryFee - discountValue);
  const changeForValue = paymentMethod === "dinheiro" ? Number(changeFor) || 0 : 0;
  const changeReturnValue = Math.max(0, changeForValue - total);
  const isTableOrder = deliveryType === "mesa";
  const selectedTable = restaurantTables.find((table) => table.id === selectedTableId) ?? null;
  const currentTableOrder = selectedTableId ? openTableOrders.find((order) => order.restaurant_table_id === selectedTableId && order.id !== editOrderId) : null;
  const mesaCode = selectedTable ? `#MESA${String(selectedTable.table_number).padStart(2, "0")}` : (tableNumber || "#MESA--").toUpperCase();
  const isChargingTable = isTableOrder && tableStage === "charging";
  const shouldShowTablePicker = isTableOrder && !editOrderId && !selectedTable;
  const hasUnsentKitchenItems = cart.some((item) => !item.sentToKitchen);

  const handleDeliveryTypeChange = (type: string) => {
    setDeliveryType(type);
    if (type !== "mesa") return;
    if (!editOrderId) {
      setSelectedTableId(null);
      setTableStage("none");
    }
  };

  const handleSelectTable = (table: RestaurantTable, openOrder?: OpenTableOrder) => {
    if (openOrder) {
      navigate(`/admin/novo-pedido?edit=${openOrder.id}`);
      return;
    }
    setSelectedTableId(table.id);
    setTableStage("none");
  };

  const cancelTableOrder = async () => {
    if (!editOrderId || !isTableOrder) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("orders").update({ status: "cancelled", cancellation_reason: "Mesa cancelada", table_stage: "cancelled" }).eq("id", editOrderId);
      if (error) throw error;
      toast.success(`${mesaCode} cancelada!`);
      navigate("/admin");
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar mesa");
    } finally {
      setLoading(false);
      setTableConfirmAction(null);
    }
  };

  const handleSubmit = async (options: { stay?: boolean; printKitchen?: "all" | "new" } = {}) => {
    if (cart.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    if (!user) { toast.error("Você precisa estar logado"); return; }
    if (isTableOrder && !selectedTable) { toast.error("Selecione uma mesa"); return; }
    if (isTableOrder && currentTableOrder) { toast.error("Mesa já está em uso"); return; }
    if (deliveryType === "delivery") {
      if (!addressStreet) { toast.error("Preencha a rua para delivery"); return; }
      if (!addressNeighborhood) { toast.error("Preencha o bairro para delivery"); return; }
      if (!addressComplement) { toast.error("Preencha o complemento para delivery"); return; }
    }

    const shouldPrintFinalReceipt = !isTableOrder || isChargingTable;
    const printPopup = shouldPrintFinalReceipt ? openPrintPopup() : null;

    // Require open cash register for new orders
    if (!editOrderId && storeId) {
      const todayBd = formatBusinessDate(new Date());
      const { data: reg } = await supabase
        .from("cash_registers")
        .select("status")
        .eq("store_id", storeId)
        .eq("business_day", todayBd)
        .maybeSingle();
      if (!reg || reg.status !== "open") {
        try { printPopup?.close(); } catch { /* noop */ }
        toast.error("Abra o caixa antes de criar um pedido", {
          description: "Vá ao painel e clique em 'Abrir Caixa'.",
          action: { label: "Abrir caixa", onClick: () => navigate("/admin") },
        });
        return;
      }
    }

    setLoading(true);
    try {
      const isPixEntrega = paymentMethod === "pix_entrega";
      const isPixPago = paymentMethod === "pix_pago";
      const isDeferredTableOpen = isTableOrder && !isChargingTable;
      const actualPaymentMethod = isDeferredTableOpen ? "dinheiro" : (isPixEntrega || isPixPago ? "pix" : paymentMethod);
      const actualPaid = isDeferredTableOpen ? false : (isTableOrder ? paymentMethod !== "fiado" : isPixPago);
      const finalStatus = isTableOrder && isChargingTable ? "delivered" : undefined;

      // ===== Cálculo de pagamento detalhado por método =====
      // Mapeia o método principal para a "chave" do banco (cash/pix/card).
      const methodKey = (m: string): "cash" | "pix" | "card" => {
        if (m === "dinheiro") return "cash";
        if (m === "pix") return "pix";
        if (m === "cartao" || m === "card" || m === "debito" || m === "credito") return "card";
        return "cash"; // fallback (fiado/outros não impactam caixa)
      };
      const payKey = methodKey(actualPaymentMethod);
      const changeKey = methodKey(changeMethod);
      const changeForNum = actualPaymentMethod === "dinheiro" && changeFor ? Number(changeFor) : 0;
      // Valor entregue pelo cliente em cada método
      const amountPaid = { cash: 0, pix: 0, card: 0 };
      const changeGiven = { cash: 0, pix: 0, card: 0 };
      // Mesa aberta ainda não entra no caixa; só registra pagamento após Cobrar/Finalizar.
      if (!isDeferredTableOpen && actualPaid !== false || actualPaid) {
        // Sempre registra valor pago (para pagamentos confirmados)
      }
      if (!isDeferredTableOpen && actualPaymentMethod !== "fiado") {
        if (changeForNum > total && actualPaymentMethod === "dinheiro") {
          // Cliente entregou mais que o total: amount_paid_cash = changeFor, troco = diferença
          amountPaid.cash = changeForNum;
          const trocoTotal = changeForNum - total;
          changeGiven[changeKey] += trocoTotal;
        } else {
          // Pagamento exato
          amountPaid[payKey] = total;
        }
      }

      const obsText = [
        "[PDV]",
        !isTableOrder && customerName ? `Cliente: ${customerName}` : null,
        !isTableOrder && customerPhone ? `Tel: ${customerPhone}` : null,
        !isTableOrder && selectedCustomerCode ? `Código: ${selectedCustomerCode}` : null,
        isTableOrder ? `Mesa: ${mesaCode}` : tableNumber ? `Mesa: ${tableNumber}` : null,
        observations || null,
      ].filter(Boolean).join(" | ") || "[PDV]";

      if (editOrderId) {
        // UPDATE existing order - preserve original date, number, and user
        const { error: orderError } = await supabase
          .from("orders")
          .update({
            ...(finalStatus ? { status: finalStatus, delivered_at: new Date().toISOString() } : {}),
            subtotal,
            delivery_fee: deliveryFee,
            discount: discountValue,
            total,
            delivery_type: deliveryType,
            restaurant_table_id: isTableOrder ? selectedTable.id : null,
            table_code: isTableOrder ? mesaCode : null,
            table_stage: isTableOrder ? tableStage : "none",
            charged_at: isChargingTable ? new Date().toISOString() : null,
            payment_method: actualPaymentMethod,
            payment_confirmed: actualPaid,
            address_street: deliveryType === "delivery" ? addressStreet : null,
            address_number: deliveryType === "delivery" ? addressNumber : null,
            address_complement: deliveryType === "delivery" ? addressComplement : null,
            address_neighborhood: deliveryType === "delivery" ? addressNeighborhood : null,
            observations: obsText,
            change_for: actualPaymentMethod === "dinheiro" && changeFor ? Number(changeFor) : null,
            amount_paid_cash: amountPaid.cash,
            amount_paid_pix: amountPaid.pix,
            amount_paid_card: amountPaid.card,
            change_given_cash: changeGiven.cash,
            change_given_pix: changeGiven.pix,
            change_given_card: changeGiven.card,
          })
          .eq("id", editOrderId);

        if (orderError) throw orderError;

        // Delete existing items and re-insert
        await supabase.from("order_items").delete().eq("order_id", editOrderId);

        const orderItems = cart.map((item) => ({
          order_id: editOrderId,
          product_id: item.product.id,
          product_name: item.product.name,
          product_code: item.product.product_code ?? null,
          quantity: item.quantity,
          unit_price: item.customPrice,
          observations: item.observations || null,
          addons_json: item.addons.length > 0 ? JSON.parse(JSON.stringify(item.addons)) : null,
          sent_to_kitchen: options.printKitchen === "all" ? true : Boolean(item.sentToKitchen),
          sent_to_kitchen_at: options.printKitchen === "all" || item.sentToKitchen ? new Date().toISOString() : null,
        }));

        const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
        if (itemsError) throw itemsError;

        const orderNum = editOriginalOrderNumber ? String(editOriginalOrderNumber).padStart(5, "0") : "?";
        toast.success(`Pedido #${orderNum} atualizado!`);
        if (options.printKitchen) {
          routePopupToPrint(openPrintPopup(), `/admin/imprimir/${editOrderId}?tipo=pedido&kitchen=${options.printKitchen}`);
          setCart((prev) => prev.map((item) => ({ ...item, sentToKitchen: true })));
          if (options.printKitchen === "new") {
            window.setTimeout(() => {
              void supabase
                .from("order_items")
                .update({ sent_to_kitchen: true, sent_to_kitchen_at: new Date().toISOString() })
                .eq("order_id", editOrderId)
                .eq("sent_to_kitchen", false);
            }, 5000);
          }
        }
        clearDraft();
        if (shouldPrintFinalReceipt) routePopupToPrint(printPopup, `/admin/imprimir/${editOrderId}?tipo=${isChargingTable ? "mesa_cobrar" : "pedido"}`);
        if (options.stay) await loadLatestData(); else navigate("/admin");
      } else {
        // CREATE new order
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({
            user_id: user.id,
            store_id: storeId ?? null,
            subtotal,
            delivery_fee: deliveryFee,
            discount: discountValue,
            total,
            status: "preparing",
            preparing_at: new Date().toISOString(),
            delivery_type: deliveryType,
            restaurant_table_id: isTableOrder ? selectedTable.id : null,
            table_code: isTableOrder ? mesaCode : null,
            table_stage: isTableOrder ? "open" : "none",
            charged_at: null,
            payment_method: actualPaymentMethod,
            payment_confirmed: actualPaid,
            address_street: deliveryType === "delivery" ? addressStreet : null,
            address_number: deliveryType === "delivery" ? addressNumber : null,
            address_complement: deliveryType === "delivery" ? addressComplement : null,
            address_neighborhood: deliveryType === "delivery" ? addressNeighborhood : null,
            observations: obsText,
            change_for: actualPaymentMethod === "dinheiro" && changeFor ? Number(changeFor) : null,
            amount_paid_cash: amountPaid.cash,
            amount_paid_pix: amountPaid.pix,
            amount_paid_card: amountPaid.card,
            change_given_cash: changeGiven.cash,
            change_given_pix: changeGiven.pix,
            change_given_card: changeGiven.card,
          })
          .select("id, order_number")
          .single();

        if (orderError) throw orderError;

        const orderItems = cart.map((item) => ({
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          product_code: item.product.product_code ?? null,
          quantity: item.quantity,
          unit_price: item.customPrice,
          observations: item.observations || null,
          addons_json: item.addons.length > 0 ? JSON.parse(JSON.stringify(item.addons)) : null,
          sent_to_kitchen: true,
          sent_to_kitchen_at: new Date().toISOString(),
        }));

        const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
        if (itemsError) throw itemsError;

        toast.success(isTableOrder ? `${mesaCode} aberta!` : `Pedido #${String(order.order_number).padStart(5, "0")} criado!`);
        clearDraft();
        routePopupToPrint(openPrintPopup(), `/admin/imprimir/${order.id}?tipo=${isTableOrder ? "mesa" : "pedido"}`);
        if (shouldPrintFinalReceipt) routePopupToPrint(printPopup, `/admin/imprimir/${order.id}?tipo=pedido`);
        if (options.stay) navigate(`/admin/novo-pedido?edit=${order.id}`); else navigate("/admin");
      }
    } catch (error: any) {
      try { printPopup?.close(); } catch { /* noop */ }
      toast.error(error.message || "Erro ao criar pedido");
    } finally {
      setLoading(false);
    }
  };

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  const hasCart = cart.length > 0;
  const addonModalItem = cart.find((item) => item.product.id === addonModalProductId) ?? null;
  const addonModalOptions = addonModalItem ? getAddonsForProduct(addonModalItem.product.id) : [];
  const headerTitle = editOrderId
    ? isTableOrder
      ? `EDITAR ${mesaCode}`
      : `EDITAR PEDIDO #${editOriginalOrderNumber ? String(editOriginalOrderNumber).padStart(5, "0") : "XXXXX"}`
    : isTableOrder && selectedTable
      ? `CRIAR ${mesaCode}`
      : "CRIAR NOVO PEDIDO";
  const displayedOrderNumber = editOriginalOrderNumber ?? nextOrderNumber;

  return (
    <div className="min-h-full bg-[hsl(205_86%_28%)] text-[hsl(0_0%_98%)]">
      <header className="border-b border-[hsl(199_78%_18%)] bg-[hsl(203_88%_22%)] px-2 py-1 shadow-sm">
        <div className="flex h-9 items-center gap-2">
          <button onClick={() => navigate("/admin")} className="grid h-7 w-7 place-items-center rounded-sm bg-[hsl(199_78%_18%)] text-[hsl(0_0%_100%)]">
            <ArrowLeft size={16} />
          </button>
          <div className="leading-none">
            <p className="max-w-[240px] truncate text-[10px] font-bold uppercase tracking-wide text-[hsl(198_70%_84%)]">{storeName}</p>
            <h1 className="text-sm font-black uppercase tracking-wide text-[hsl(0_0%_100%)]">{headerTitle}</h1>
          </div>
          <div className="ml-auto flex items-center gap-1 text-[10px] font-bold">
            <span className="hidden h-7 items-center rounded-sm border border-[hsl(199_76%_36%)] bg-[hsl(204_80%_16%)] px-3 uppercase text-[hsl(0_0%_100%)] sm:flex">
              Operador: Admin - Wanderson Camargo
            </span>
            <button onClick={() => void loadLatestData()} className="h-7 rounded-sm border border-[hsl(199_76%_36%)] bg-[hsl(204_80%_16%)] px-3 text-[hsl(0_0%_100%)]">Atualizar</button>
            <span className="h-7 rounded-sm border border-[hsl(199_76%_36%)] bg-[hsl(204_80%_16%)] px-3 leading-7">{cartItemCount} itens</span>
          </div>
        </div>
      </header>

      <main className="grid h-[calc(100vh-45px)] grid-cols-[minmax(0,1fr)_340px] gap-1 overflow-hidden p-1 max-sm:grid-cols-1 max-sm:overflow-auto">
        <section className="flex min-h-0 flex-col overflow-hidden border border-[hsl(199_78%_18%)] bg-[hsl(199_88%_31%)]">
          <div className="grid grid-cols-[1fr_104px] gap-1 border-b border-[hsl(199_78%_18%)] bg-[hsl(203_88%_22%)] p-1">
            <div className="grid grid-cols-5 gap-1">
              {deliveryTypes.map((dt) => (
                <button
                  key={dt.id}
                  onClick={() => handleDeliveryTypeChange(dt.id)}
                  className={cn(
                    "h-8 border text-[9px] font-black uppercase leading-none",
                    deliveryType === dt.id
                      ? "border-[hsl(0_0%_100%)] bg-[hsl(0_0%_100%)] text-[hsl(203_88%_22%)]"
                      : "border-[hsl(199_76%_36%)] bg-[hsl(197_58%_91%)] text-[hsl(203_88%_22%)]",
                  )}
                >
                  {dt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-[hsl(197_58%_91%)] px-2 text-[10px] font-black text-[hsl(203_88%_22%)]">
              <Search size={12} />
              <input
                placeholder="Código"
                type="number"
                inputMode="numeric"
                onChange={(e) => {
                  const input = e.target as HTMLInputElement;
                  const val = input.value.trim();
                  if (!val) return;
                  if (shouldShowTablePicker) return;
                  const codeNum = parseInt(val);
                  if (Number.isNaN(codeNum)) return;
                  const exact = products.find((p) => p.product_code === codeNum);
                  if (exact) {
                    addToCart(exact);
                    input.value = "";
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (shouldShowTablePicker) { toast.error("Selecione uma mesa primeiro"); return; }
                  const val = (e.target as HTMLInputElement).value.trim();
                  const codeNum = parseInt(val);
                  const exact = products.find((p) => p.product_code === codeNum);
                  if (exact) { addToCart(exact); (e.target as HTMLInputElement).value = ""; }
                  else if (val) toast.error(`Código ${val} não encontrado`);
                }}
                className="min-w-0 flex-1 bg-transparent text-[11px] font-black outline-none placeholder:text-[hsl(203_60%_38%)]"
              />
            </div>
          </div>

          {shouldShowTablePicker ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="mb-2 flex items-center justify-between gap-2 bg-[hsl(197_58%_91%)] px-3 py-2 text-[hsl(203_88%_22%)]">
                <div>
                  <p className="text-[10px] font-black uppercase">Selecione uma mesa</p>
                  <p className="text-[9px] font-bold">Mesas livres abrem comanda. Mesas ocupadas abrem a mesa atual.</p>
                </div>
                <button type="button" onClick={() => void loadLatestData()} className="h-7 bg-[hsl(203_88%_22%)] px-3 text-[9px] font-black uppercase text-[hsl(0_0%_100%)]">Atualizar</button>
              </div>
              <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {restaurantTables.map((table) => {
                  const openOrder = openTableOrders.find((order) => order.restaurant_table_id === table.id);
                  const occupied = Boolean(openOrder);
                  const charging = openOrder?.table_stage === "charging";
                  return (
                    <button key={table.id} type="button" onClick={() => handleSelectTable(table, openOrder)} className={cn("min-h-24 border-2 p-3 text-left font-black uppercase shadow-sm", occupied ? "border-[hsl(0_72%_51%)] bg-[hsl(0_72%_92%)] text-[hsl(203_88%_22%)]" : "border-[hsl(142_70%_35%)] bg-[hsl(142_70%_92%)] text-[hsl(203_88%_22%)]")}>
                      <span className="block text-lg leading-none">{table.name || `Mesa ${String(table.table_number).padStart(2, "0")}`}</span>
                      <span className="mt-2 block text-[10px]">{occupied ? (charging ? "Aguardando pagamento" : "Ocupada") : "Livre"}</span>
                      <span className="mt-3 block bg-[hsl(203_88%_22%)] px-2 py-1 text-center text-[9px] text-[hsl(0_0%_100%)]">{occupied ? "Ver mesa" : "Selecionar"}</span>
                    </button>
                  );
                })}
                {restaurantTables.length === 0 && <div className="col-span-full bg-[hsl(197_58%_91%)] p-4 text-center text-[11px] font-black uppercase text-[hsl(203_88%_22%)]">Nenhuma mesa cadastrada</div>}
              </div>
            </div>
          ) : <div className="grid min-h-0 flex-1 grid-cols-[76px_1fr] gap-1 overflow-hidden p-1 max-sm:min-h-[520px]">
            <div className="space-y-1 overflow-y-auto pr-0.5">
              <button onClick={() => setSelectedCategory(null)} className={cn("h-9 w-full border text-[9px] font-black uppercase", !selectedCategory ? "border-[hsl(0_0%_100%)] bg-[hsl(0_0%_100%)] text-[hsl(203_88%_22%)]" : "border-[hsl(199_76%_36%)] bg-[hsl(197_58%_91%)] text-[hsl(203_88%_22%)]")}>Todos</button>
              {categories.map((cat) => (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={cn("min-h-9 w-full whitespace-normal break-words border px-1 py-1 text-[8px] font-black uppercase leading-tight", selectedCategory === cat.id ? "border-[hsl(0_0%_100%)] bg-[hsl(0_0%_100%)] text-[hsl(203_88%_22%)]" : "border-[hsl(199_76%_36%)] bg-[hsl(197_58%_91%)] text-[hsl(203_88%_22%)]")}>{cat.name}</button>
              ))}
            </div>

            <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
              <div className="flex h-8 items-center gap-2 bg-[hsl(197_58%_91%)] px-2 text-[hsl(203_88%_22%)]">
                <Search size={14} />
                <input
                  ref={productSearchInputRef}
                  placeholder="Buscar produtos"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="min-w-0 flex-1 bg-transparent text-[12px] font-bold outline-none placeholder:text-[hsl(203_60%_38%)]"
                />
              </div>
              <div className="grid flex-1 auto-rows-min grid-cols-3 gap-1 overflow-y-auto pr-1 min-[1180px]:grid-cols-5 min-[900px]:grid-cols-4 max-sm:grid-cols-3">
                {filteredProducts.map((product) => {
                  const inCart = cart.find((i) => i.product.id === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={cn(
                        "relative flex min-h-[58px] items-start gap-1 border bg-[hsl(197_58%_91%)] p-1 text-left text-[hsl(203_88%_22%)] shadow-sm",
                        inCart ? "border-[hsl(43_95%_50%)] ring-2 ring-[hsl(43_95%_50%)]" : "border-[hsl(199_76%_36%)]",
                      )}
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center border border-[hsl(199_76%_36%)] bg-[hsl(0_0%_100%)] text-[10px] font-black">
                        {product.product_code ?? ""}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-normal break-words text-[9px] font-black uppercase leading-tight">{product.name}</p>
                        <p className="mt-0.5 text-[10px] font-black">R$ {fmt(product.price)}</p>
                      </div>
                      {inCart && <span className="absolute right-0 top-0 bg-[hsl(43_95%_50%)] px-1 text-[9px] font-black text-[hsl(203_88%_22%)]">{inCart.quantity}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>}

          <div className="shrink-0 border-t border-[hsl(199_78%_18%)] bg-[hsl(0_0%_100%)] text-[hsl(203_88%_22%)]">
            <div className="grid h-7 grid-cols-[34px_minmax(0,1fr)_86px_54px_24px] items-center border-b border-[hsl(199_78%_18%)] bg-[hsl(203_88%_22%)] px-1 text-[9px] font-black uppercase text-[hsl(0_0%_100%)]">
              <span>Qtde</span><span>Produto</span><span className="text-right">Valor</span><span className="text-center">Adic.</span><span />
            </div>
            <div className="grid max-h-[28vh] auto-rows-min grid-cols-1 gap-0 overflow-y-auto">
              {!hasCart ? (
                <div className="col-span-full p-2 text-center text-[11px] font-bold text-[hsl(203_60%_38%)]">Selecione os produtos acima</div>
              ) : cart.map((item) => {
                const itemAddonsTotal = item.addons.reduce((s, a) => s + a.price * a.quantity, 0);
                return (
                  <div key={item.product.id} className="border-b border-r border-[hsl(200_45%_82%)] px-1 py-0.5 text-[10px] font-bold">
                    <div className="grid grid-cols-[34px_minmax(0,1fr)_86px_54px_24px] items-center gap-1">
                      <input type="number" min="1" value={item.quantity} onChange={(e) => updateItemQuantityManual(item.product.id, e.target.value)} className="h-5 w-full bg-[hsl(197_58%_91%)] text-center font-black outline-none" />
                      <span className="whitespace-normal break-words uppercase leading-tight">{item.product.name}</span>
                      <span className="text-right font-black">R$ {fmt(item.customPrice * item.quantity + itemAddonsTotal)}</span>
                      <button onClick={() => setAddonModalProductId(item.product.id)} className="min-h-5 bg-[hsl(203_88%_22%)] px-1 text-[8px] font-black uppercase leading-tight text-[hsl(0_0%_100%)]">{item.addons.length ? `${item.addons.length} add` : "+ Add"}</button>
                      <button onClick={() => removeItem(item.product.id)} className="grid h-5 w-5 place-items-center bg-[hsl(203_88%_22%)] text-[hsl(0_0%_100%)]"><Trash2 size={11} /></button>
                    </div>
                    {(item.addons.length > 0 || item.observations.trim()) && (
                      <div className="ml-9 mt-0.5 space-y-0.5 text-[9px] font-black leading-tight text-[hsl(203_60%_38%)]">
                        {item.addons.map((addon) => <p key={addon.addon_id} className="whitespace-normal break-words">+ {addon.quantity}x {addon.name}</p>)}
                        {item.observations.trim() && <p className="whitespace-normal break-words">Obs: {item.observations.trim()}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden border border-[hsl(199_78%_18%)] bg-[hsl(197_58%_91%)] text-[hsl(203_88%_22%)] max-sm:min-h-[760px]">
          <div className="grid grid-cols-2 border-b border-[hsl(199_78%_18%)] bg-[hsl(203_88%_22%)] text-[hsl(0_0%_100%)]">
            <label className="border-r border-[hsl(199_76%_36%)] px-2 py-1 text-[10px] font-black uppercase">
              Código
              <div className="mt-1 h-6 bg-[hsl(197_58%_91%)] px-1 leading-6 text-[hsl(203_88%_22%)]">{isTableOrder ? mesaCode : `#${displayedOrderNumber ? String(displayedOrderNumber).padStart(5, "0") : "XXXXX"}`}</div>
            </label>
            {!isTableOrder ? (
              <label className="px-2 py-1 text-[10px] font-black uppercase">
                Cliente
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Cliente" className="mt-1 h-6 w-full bg-[hsl(197_58%_91%)] px-1 text-[11px] font-black text-[hsl(203_88%_22%)] outline-none" />
              </label>
            ) : (
              <div className="px-2 py-1 text-[10px] font-black uppercase">
                Status
                <div className="mt-1 h-6 bg-[hsl(197_58%_91%)] px-1 leading-6 text-[hsl(203_88%_22%)]">{isChargingTable ? "Aguard. pagamento" : editOrderId ? "Aberta" : selectedTable ? "Livre" : "Selecione"}</div>
              </div>
            )}
          </div>

          {!isTableOrder && <div className="border-b border-[hsl(199_78%_18%)] p-1">
            <CustomerSearch
              onSelect={(profile) => {
                setCustomerName(profile.full_name);
                setCustomerPhone(profile.phone);
                setSelectedCustomerId(profile.user_id);
                setSelectedCustomerCode(`T${String(profile.customer_code).padStart(5, "0")}`);
                if (deliveryType === "delivery") {
                  setAddressStreet(profile.street || "");
                  setAddressNumber(profile.number || "");
                  setAddressNeighborhood(profile.neighborhood || "");
                  setAddressComplement([profile.complement, profile.quadra ? `Qd ${profile.quadra}` : "", profile.lote ? `Lt ${profile.lote}` : ""].filter(Boolean).join(" "));
                }
              }}
              onClear={() => { setSelectedCustomerId(null); setSelectedCustomerCode(""); }}
            />
          </div>}

          {isTableOrder && !editOrderId && (
            <div className="border-b border-[hsl(199_78%_18%)] p-1">
              <button type="button" onClick={() => { setSelectedTableId(null); setCart([]); }} className="h-8 w-full bg-[hsl(203_88%_22%)] text-[10px] font-black uppercase text-[hsl(0_0%_100%)]">Ver mesas</button>
            </div>
          )}

            <div className="flex-1 overflow-y-auto border-t border-[hsl(199_78%_18%)] bg-[hsl(197_58%_91%)] p-1">
            {(!isTableOrder || isChargingTable) && <div className="grid grid-cols-5 gap-1">
              {(isTableOrder ? tablePaymentMethods : paymentMethods).map((pm) => (
                <button key={pm.id} type="button" onClick={() => setPaymentMethod(pm.id)} className={cn("min-h-8 whitespace-normal break-words border px-0.5 text-[7px] font-black uppercase leading-tight", paymentMethod === pm.id ? "border-[hsl(203_88%_22%)] bg-[hsl(203_88%_22%)] text-[hsl(0_0%_100%)]" : "border-[hsl(199_76%_36%)] bg-[hsl(0_0%_100%)]")}>{pm.label}</button>
              ))}
            </div>}

            <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] font-bold">
              {!isTableOrder && <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Telefone" className="h-7 border border-[hsl(199_76%_36%)] px-1 outline-none" />}
              {!isTableOrder && (deliveryType === "consumo") && <input value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Mesa" className="h-7 border border-[hsl(199_76%_36%)] px-1 outline-none" />}
            </div>

            {deliveryType === "delivery" && (
              <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] font-bold">
                <input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Rua" className="h-7 border border-[hsl(199_76%_36%)] px-1 outline-none" />
                <input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="Nº" className="h-7 border border-[hsl(199_76%_36%)] px-1 outline-none" />
                <input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} placeholder="Complemento" className="h-7 border border-[hsl(199_76%_36%)] px-1 outline-none" />
                <div className="col-span-2">
                  <NeighborhoodAutocomplete variant="kiosk" value={addressNeighborhood} onChange={(val, fee) => { setAddressNeighborhood(val); setDeliveryFeeOverridden(false); if (typeof fee === "number") setCustomDeliveryFee(fee.toFixed(2)); }} placeholder="Bairro" allowInactive refreshKey={dataRefreshKey} className="rounded-none px-2 py-1" dropdownClassName="left-0 right-0 w-full" />
                </div>
              </div>
            )}

            <textarea value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Observações" rows={2} className="mt-1 w-full resize-none border border-[hsl(199_76%_36%)] px-1 text-[10px] font-bold outline-none" />

            <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] font-black">
              {deliveryType === "delivery" && <label className="flex items-center gap-1 bg-[hsl(0_0%_100%)] px-1">Entrega R$<input type="number" step="0.01" value={customDeliveryFee} onChange={(e) => { setCustomDeliveryFee(e.target.value); setDeliveryFeeOverridden(true); }} className="min-w-0 flex-1 bg-transparent text-right outline-none" /></label>}
              <label className="flex items-center gap-1 bg-[hsl(0_0%_100%)] px-1">Desconto R$<input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="min-w-0 flex-1 bg-transparent text-right outline-none" /></label>
              {(!isTableOrder || isChargingTable) && paymentMethod === "dinheiro" && <label className="flex items-center gap-1 bg-[hsl(0_0%_100%)] px-1">Troco para: R$<input type="number" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} className="min-w-0 flex-1 bg-transparent text-right outline-none" /></label>}
            </div>
            {paymentMethod === "dinheiro" && changeReturnValue > 0 && (
              <div className="mt-1 space-y-1 text-[9px] font-black uppercase">
                <div className="bg-[hsl(0_0%_0%)] px-2 py-1 text-center text-[13px] text-[hsl(0_0%_100%)]">Devolver: R$ {fmt(changeReturnValue)}</div>
                <p className="text-[hsl(203_88%_22%)]">Troco feito em</p>
                <div className="grid grid-cols-3 gap-1">
                {changeMethods.map((method) => (
                  <button key={method.id} onClick={() => setChangeMethod(method.id)} className={cn("min-h-7 border px-1", changeMethod === method.id ? "border-[hsl(203_88%_22%)] bg-[hsl(203_88%_22%)] text-[hsl(0_0%_100%)]" : "border-[hsl(199_76%_36%)] bg-[hsl(0_0%_100%)] text-[hsl(203_88%_22%)]")}>{method.label}</button>
                ))}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t-4 border-[hsl(203_88%_22%)] bg-[hsl(197_58%_91%)] p-2">
            <p className="text-sm font-black text-[hsl(203_88%_22%)]">Valor Total</p>
            <div className="mt-1 bg-[hsl(0_0%_100%)] px-2 py-2 text-right text-3xl font-black tracking-tight text-[hsl(0_0%_8%)]">R$ {fmt(total)}</div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button onClick={() => navigate("/admin")} className="h-8 bg-[hsl(204_80%_16%)] text-[10px] font-black uppercase text-[hsl(0_0%_100%)]">Cancelar</button>
              <button onClick={() => isTableOrder && editOrderId && !isChargingTable ? setTableStage("charging") : isTableOrder && isChargingTable ? setTableConfirmAction("finalize") : handleSubmit()} disabled={loading || !hasCart || (isTableOrder && !selectedTable)} className="h-8 bg-[hsl(203_88%_22%)] text-[10px] font-black uppercase text-[hsl(0_0%_100%)] disabled:opacity-50">
                {loading ? "Salvando..." : isTableOrder && editOrderId && !isChargingTable ? "Cobrar" : editOrderId ? "Finalizar" : isTableOrder ? "Abrir mesa" : "Criar pedido"}
              </button>
            </div>
            {isTableOrder && editOrderId && (
              <div className="mt-1 grid grid-cols-2 gap-1">
                <button onClick={() => routePopupToPrint(openPrintPopup(), `/admin/imprimir/${editOrderId}?tipo=mesa_conta`)} disabled={loading || !hasCart} className="min-h-8 bg-[hsl(203_88%_22%)] px-1 text-[9px] font-black uppercase leading-tight text-[hsl(0_0%_100%)] disabled:opacity-50">Imprimir conta</button>
                {isChargingTable ? (
                  <button onClick={() => { setTableStage("open"); setPaymentMethod("dinheiro"); setChangeFor(""); }} disabled={loading} className="min-h-8 bg-[hsl(204_80%_16%)] px-1 text-[9px] font-black uppercase leading-tight text-[hsl(0_0%_100%)] disabled:opacity-50">Cancelar pagamento</button>
                ) : (
                  <>
                    <button onClick={() => setTableConfirmAction("cancel")} disabled={loading} className="min-h-8 bg-[hsl(0_72%_51%)] px-1 text-[9px] font-black uppercase leading-tight text-[hsl(0_0%_100%)] disabled:opacity-50">Cancelar mesa</button>
                    <button onClick={() => handleSubmit({ stay: true, printKitchen: "new" })} disabled={loading || !hasCart || !hasUnsentKitchenItems} className={cn("min-h-8 bg-[hsl(204_80%_16%)] px-1 text-[9px] font-black uppercase leading-tight text-[hsl(0_0%_100%)] disabled:opacity-50", hasUnsentKitchenItems && "animate-pulse ring-2 ring-[hsl(43_95%_50%)]")}>Enviar novos</button>
                    <button onClick={() => handleSubmit({ stay: true, printKitchen: "all" })} disabled={loading || !hasCart} className="min-h-8 bg-[hsl(204_80%_16%)] px-1 text-[9px] font-black uppercase leading-tight text-[hsl(0_0%_100%)] disabled:opacity-50">Enviar tudo</button>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>

        <AlertDialog open={Boolean(tableConfirmAction)} onOpenChange={(open) => !open && setTableConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tableConfirmAction === "cancel" ? "Cancelar mesa?" : "Finalizar mesa?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {tableConfirmAction === "cancel"
                  ? "A mesa será enviada diretamente para cancelados."
                  : "A mesa será finalizada e enviada diretamente para finalizados."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={(event) => { event.preventDefault(); tableConfirmAction === "cancel" ? void cancelTableOrder() : void handleSubmit(); }} disabled={loading}>
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={Boolean(addonModalItem)} onOpenChange={(open) => !open && setAddonModalProductId(null)}>
          <DialogContent className="max-h-[86vh] max-w-[520px] overflow-y-auto border-[hsl(199_76%_36%)] bg-[hsl(197_58%_91%)] p-3 text-[hsl(203_88%_22%)]">
            <DialogHeader>
              <DialogTitle className="text-sm font-black uppercase text-[hsl(203_88%_22%)]">Adicionais: {addonModalItem?.product.name}</DialogTitle>
            </DialogHeader>
            {addonModalItem && (
              <div className="space-y-2">
                <label className="flex h-8 items-center gap-2 border border-[hsl(199_76%_36%)] bg-[hsl(0_0%_100%)] px-2 text-xs font-black">Quantidade<input type="number" min="1" value={addonModalItem.quantity} onChange={(e) => updateItemQuantityManual(addonModalItem.product.id, e.target.value)} className="min-w-0 flex-1 bg-transparent text-right outline-none" /></label>
                <button onClick={() => toggleCombo(addonModalItem.product.id)} className={cn("w-full border px-2 py-2 text-xs font-black uppercase", addonModalItem.isCombo ? "border-[hsl(43_95%_50%)] bg-[hsl(43_95%_50%)] text-[hsl(203_88%_22%)]" : "border-[hsl(199_76%_36%)] bg-[hsl(0_0%_100%)] text-[hsl(203_88%_22%)]")}>Combo</button>
                <input placeholder="Obs item" value={addonModalItem.observations} onChange={(e) => updateItemObs(addonModalItem.product.id, e.target.value)} className="h-8 w-full border border-[hsl(199_76%_36%)] px-2 text-xs font-bold outline-none" />
                <label className="flex h-8 items-center gap-2 border border-[hsl(199_76%_36%)] bg-[hsl(0_0%_100%)] px-2 text-xs font-black">Valor R$<input type="number" step="0.01" value={addonModalItem.customPrice} onChange={(e) => updateItemPrice(addonModalItem.product.id, e.target.value)} className="min-w-0 flex-1 bg-transparent text-right outline-none" /></label>
                {addonModalOptions.length === 0 ? <p className="py-3 text-center text-xs font-bold">Nenhum adicional disponível</p> : addonModalOptions.map((addon) => {
                  const currentQty = addonModalItem.addons.find((a) => a.addon_id === addon.id)?.quantity || 0;
                  const step = addonModalItem.isCombo ? addonModalItem.quantity : 1;
                  return (
                    <div key={addon.id} className={cn("flex items-center justify-between border p-2", currentQty > 0 ? "border-[hsl(203_88%_22%)] bg-[hsl(0_0%_100%)]" : "border-[hsl(199_76%_36%)] bg-[hsl(0_0%_100%)]")}>
                      <div className="min-w-0 pr-2">
                        <p className="whitespace-normal break-words text-xs font-black uppercase leading-tight">{addon.name}</p>
                        <p className="text-[10px] font-bold">{addon.price > 0 ? `+ R$ ${fmt(addon.price)}` : "Grátis"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button onClick={() => handleSetAddon([addonModalItem.product.id], addon.id, addon, Math.max(0, currentQty - step))} className="grid h-8 w-8 place-items-center border border-[hsl(203_88%_22%)] bg-[hsl(0_0%_100%)] text-[hsl(203_88%_22%)]"><Minus size={14} /></button>
                        <span className="min-w-7 text-center text-sm font-black">{currentQty}</span>
                        <button onClick={() => handleSetAddon([addonModalItem.product.id], addon.id, addon, currentQty + step)} className="grid h-8 w-8 place-items-center bg-[hsl(203_88%_22%)] text-[hsl(0_0%_100%)]"><Plus size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default AdminManualOrder;
