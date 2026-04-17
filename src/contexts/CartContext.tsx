import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { Product, ProductAddon, CartItem } from "@/data/menu";

const CART_STORAGE_KEY = "turbo-lanches-cart";
const COUPON_STORAGE_KEY = "turbo-lanches-coupon";

export interface AppliedCoupon {
  code: string;
  type: string;
  value: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity: number, addons: ProductAddon[], observations: string) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  appliedCoupon: AppliedCoupon | null;
  setAppliedCoupon: (coupon: AppliedCoupon | null) => void;
  couponDiscount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CartItem[];
      return parsed.map((item) => ({
        ...item,
        product: {
          ...item.product,
          description: "",
          ingredients: [],
        },
      }));
    }
  } catch {}
  return [];
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function loadCoupon(): AppliedCoupon | null {
  try {
    const raw = localStorage.getItem(COUPON_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveCoupon(coupon: AppliedCoupon | null) {
  try {
    if (coupon) {
      localStorage.setItem(COUPON_STORAGE_KEY, JSON.stringify(coupon));
    } else {
      localStorage.removeItem(COUPON_STORAGE_KEY);
    }
  } catch {}
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [appliedCoupon, setAppliedCouponState] = useState<AppliedCoupon | null>(loadCoupon);

  useEffect(() => {
    saveCart(items);
  }, [items]);

  useEffect(() => {
    saveCoupon(appliedCoupon);
  }, [appliedCoupon]);

  const setAppliedCoupon = useCallback((coupon: AppliedCoupon | null) => {
    setAppliedCouponState(coupon);
  }, []);

  const addItem = useCallback((product: Product, quantity: number, addons: ProductAddon[], observations: string) => {
    setItems((prev) => [
      ...prev,
      {
        product: { ...product, description: "", ingredients: [] },
        quantity,
        selectedAddons: addons,
        observations,
      },
    ]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, quantity } : item)));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setAppliedCouponState(null);
    localStorage.removeItem(CART_STORAGE_KEY);
    localStorage.removeItem(COUPON_STORAGE_KEY);
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => {
    const addonsTotal = item.selectedAddons.reduce((s, a) => s + a.price * (a.quantity || 1), 0);
    return sum + (item.product.price + addonsTotal) * item.quantity;
  }, 0);

  const couponDiscount = appliedCoupon
    ? appliedCoupon.type === "percentage"
      ? Math.min(totalPrice * (appliedCoupon.value / 100), totalPrice)
      : Math.min(appliedCoupon.value, totalPrice)
    : 0;

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice, appliedCoupon, setAppliedCoupon, couponDiscount }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};
