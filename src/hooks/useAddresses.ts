import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CustomerAddress {
  id: string;
  user_id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  quadra: string;
  lote: string;
  city: string;
  state: string;
  zip_code: string;
  is_default: boolean;
}

export const useAddresses = () => {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAddresses = useCallback(async () => {
    if (!user) {
      setAddresses([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false });
    setAddresses((data as CustomerAddress[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  const defaultAddress = addresses.find((a) => a.is_default) || addresses[0] || null;

  const setDefault = async (id: string) => {
    if (!user) return;
    // Unset all defaults, then set the chosen one
    await supabase
      .from("customer_addresses")
      .update({ is_default: false } as any)
      .eq("user_id", user.id);
    await supabase
      .from("customer_addresses")
      .update({ is_default: true } as any)
      .eq("id", id);
    await fetchAddresses();
  };

  const addAddress = async (addr: Omit<CustomerAddress, "id" | "user_id" | "is_default">) => {
    if (!user) return;
    const isFirst = addresses.length === 0;
    await supabase.from("customer_addresses").insert({
      ...addr,
      user_id: user.id,
      is_default: isFirst,
    } as any);
    await fetchAddresses();
  };

  const updateAddress = async (id: string, addr: Partial<CustomerAddress>) => {
    await supabase
      .from("customer_addresses")
      .update(addr as any)
      .eq("id", id);
    await fetchAddresses();
  };

  const deleteAddress = async (id: string) => {
    await supabase.from("customer_addresses").delete().eq("id", id);
    await fetchAddresses();
  };

  return { addresses, defaultAddress, loading, fetchAddresses, setDefault, addAddress, updateAddress, deleteAddress };
};
