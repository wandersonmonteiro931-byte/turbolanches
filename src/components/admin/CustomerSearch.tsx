import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  user_id: string;
  customer_code: number;
  full_name: string;
  phone: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string | null;
  quadra: string;
  lote: string;
  city: string;
  state: string;
}

interface CustomerSearchProps {
  onSelect: (profile: Profile) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}

const CustomerSearch = ({ onSelect, onClear, placeholder = "Buscar cliente (código, nome, telefone, endereço)...", className = "" }: CustomerSearchProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      // Search by code (T00001 -> 1), name, phone, or address
      const codeMatch = query.match(/^T?(\d+)$/i);
      let data: Profile[] = [];

      if (codeMatch) {
        const code = parseInt(codeMatch[1], 10);
        const { data: res } = await supabase
          .from("profiles")
          .select("user_id, customer_code, full_name, phone, street, number, neighborhood, complement, quadra, lote, city, state")
          .eq("customer_code", code)
          .limit(10);
        data = (res as Profile[]) || [];
      }

      if (data.length === 0) {
        const searchTerm = `%${query}%`;
        const { data: res } = await supabase
          .from("profiles")
          .select("user_id, customer_code, full_name, phone, street, number, neighborhood, complement, quadra, lote, city, state")
          .or(`full_name.ilike.${searchTerm},phone.ilike.${searchTerm},street.ilike.${searchTerm},neighborhood.ilike.${searchTerm}`)
          .limit(10);
        data = (res as Profile[]) || [];
      }

      setResults(data);
      setOpen(data.length > 0);
      setLoading(false);
    }, 300);
  }, [query]);

  const handleSelect = (profile: Profile) => {
    setSelected(profile);
    setQuery(`T${String(profile.customer_code).padStart(5, "0")} - ${profile.full_name}`);
    setOpen(false);
    onSelect(profile);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
    setResults([]);
    onClear?.();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
        <Search size={16} className="text-muted-foreground shrink-0" />
        <input
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) {
              setSelected(null);
              onClear?.();
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {loading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
        {selected && (
          <button onClick={handleClear} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {results.map((profile) => (
            <button
              key={profile.user_id}
              onClick={() => handleSelect(profile)}
              className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-muted transition-colors border-b border-border last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  T{String(profile.customer_code).padStart(5, "0")}
                </span>
                <span className="text-sm font-semibold text-foreground">{profile.full_name || "Sem nome"}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {profile.phone || "Sem telefone"}
                {profile.street ? ` · ${profile.street}, ${profile.number} - ${profile.neighborhood}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerSearch;
