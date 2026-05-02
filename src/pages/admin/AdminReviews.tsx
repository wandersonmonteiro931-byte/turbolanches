import TurboLoader from "@/components/TurboLoader";
import { useEffect, useState, useMemo } from "react";
import { Star, Eye, EyeOff, MessageCircle, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Review {
  id: string;
  user_id: string;
  product_id: string | null;
  order_id: string | null;
  rating: number;
  comment: string | null;
  tags: string[];
  visible: boolean;
  admin_response: string;
  created_at: string;
  profile_name: string;
  product_name: string;
  order_number: number | null;
}

const AdminReviews = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState<string>("all");
  const [filterVisible, setFilterVisible] = useState<string>("all");
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  const fetchReviews = async () => {
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) {
      setLoading(false);
      return;
    }

    // Fetch profiles and products
    const userIds = [...new Set(data.map((r) => r.user_id))];
    const productIds = [...new Set(data.map((r) => r.product_id).filter(Boolean))] as string[];
    const orderIds = [...new Set(data.map((r) => r.order_id).filter(Boolean))] as string[];

    const [profilesRes, productsRes, ordersRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
      productIds.length > 0
        ? supabase.from("products").select("id, name").in("id", productIds)
        : Promise.resolve({ data: [] }),
      orderIds.length > 0
        ? supabase.from("orders").select("id, order_number").in("id", orderIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap: Record<string, string> = {};
    profilesRes.data?.forEach((p) => (profileMap[p.user_id] = p.full_name));

    const productMap: Record<string, string> = {};
    productsRes.data?.forEach((p) => (productMap[p.id] = p.name));

    const orderMap: Record<string, number> = {};
    ordersRes.data?.forEach((o: any) => (orderMap[o.id] = o.order_number));

    const enriched: Review[] = data.map((r) => ({
      ...r,
      tags: (r.tags as string[]) || [],
      visible: r.visible ?? true,
      admin_response: (r as any).admin_response || "",
      profile_name: profileMap[r.user_id] || "Cliente",
      product_name: r.product_id
        ? productMap[r.product_id] || "Produto removido"
        : r.order_id
          ? `Avaliação do pedido #${String(orderMap[r.order_id] || "").padStart(5, "0")}`
          : "Avaliação geral do pedido",
      order_number: r.order_id ? orderMap[r.order_id] || null : null,
    }));

    setReviews(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const toggleVisibility = async (id: string, current: boolean) => {
    const newVal = !current;
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, visible: newVal } : r)));

    const { error } = await supabase.from("reviews").update({ visible: newVal }).eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar visibilidade");
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, visible: current } : r)));
      return;
    }
    toast.success(newVal ? "Avaliação visível no app" : "Avaliação oculta do app");
  };

  const submitResponse = async (id: string) => {
    const trimmed = responseText.trim();
    const { error } = await supabase
      .from("reviews")
      .update({ admin_response: trimmed })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao salvar resposta");
      return;
    }

    setReviews((prev) =>
      prev.map((r) => (r.id === id ? { ...r, admin_response: trimmed } : r))
    );
    setRespondingId(null);
    setResponseText("");
    toast.success("Resposta salva!");
  };

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (filterRating !== "all" && r.rating !== Number(filterRating)) return false;
      if (filterVisible === "visible" && !r.visible) return false;
      if (filterVisible === "hidden" && r.visible) return false;
      return true;
    });
  }, [reviews, filterRating, filterVisible]);

  // Stats
  const stats = useMemo(() => {
    const total = reviews.length;
    if (total === 0) return { avg: 0, total: 0, distribution: [0, 0, 0, 0, 0] };
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / total;
    const distribution = [5, 4, 3, 2, 1].map(
      (star) => reviews.filter((r) => r.rating === star).length
    );
    return { avg: Math.round(avg * 10) / 10, total, distribution };
  }, [reviews]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <TurboLoader size={120} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-primary" />
          <h2 className="text-base font-bold text-foreground">Resumo das Avaliações</h2>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-extrabold text-foreground tabular-nums">
              {stats.avg.toFixed(1)}
            </p>
            <div className="flex items-center justify-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={14}
                  className={
                    s <= Math.round(stats.avg)
                      ? "fill-amber-400 text-amber-400"
                      : "text-border fill-transparent"
                  }
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{stats.total} avaliações</p>
          </div>

          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star, idx) => {
              const count = stats.distribution[idx];
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground w-4 text-right tabular-nums">
                    {star}
                  </span>
                  <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" />
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-6 tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterRating} onValueChange={setFilterRating}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Nota" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as notas</SelectItem>
            <SelectItem value="5">5 estrelas</SelectItem>
            <SelectItem value="4">4 estrelas</SelectItem>
            <SelectItem value="3">3 estrelas</SelectItem>
            <SelectItem value="2">2 estrelas</SelectItem>
            <SelectItem value="1">1 estrela</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterVisible} onValueChange={setFilterVisible}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Exibição" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="visible">Visíveis</SelectItem>
            <SelectItem value="hidden">Ocultas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reviews List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Star size={40} className="mx-auto text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma avaliação {filterRating !== "all" || filterVisible !== "all" ? "com esses filtros" : "recebida ainda"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => (
            <div
              key={review.id}
              className={`rounded-xl border bg-card p-4 space-y-3 transition-colors ${
                !review.visible ? "border-border/50 opacity-60" : "border-border"
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {review.profile_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={13}
                          className={
                            s <= review.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-border fill-transparent"
                          }
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    {review.order_number && (
                      <span className="text-[11px] font-medium text-primary">
                        #{String(review.order_number).padStart(5, "0")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={review.visible}
                    onCheckedChange={() => toggleVisibility(review.id, review.visible)}
                  />
                  {review.visible ? (
                    <Eye size={14} className="text-primary" />
                  ) : (
                    <EyeOff size={14} className="text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Product + Tags */}
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {review.product_name}
                </span>
                {review.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Comment */}
              {review.comment && (
                <p className="text-sm text-foreground/80">{review.comment}</p>
              )}

              {/* Admin Response */}
              {review.admin_response && respondingId !== review.id && (
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                  <p className="text-[11px] font-bold text-primary mb-0.5">Sua resposta:</p>
                  <p className="text-xs text-foreground/70">{review.admin_response}</p>
                  <button
                    onClick={() => {
                      setRespondingId(review.id);
                      setResponseText(review.admin_response);
                    }}
                    className="mt-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    Editar
                  </button>
                </div>
              )}

              {/* Response Form */}
              {respondingId === review.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Escreva sua resposta ao cliente..."
                    rows={2}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => submitResponse(review.id)}
                      disabled={!responseText.trim()}
                    >
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRespondingId(null);
                        setResponseText("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                !review.admin_response && (
                  <button
                    onClick={() => {
                      setRespondingId(review.id);
                      setResponseText("");
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <MessageCircle size={13} />
                    Responder
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminReviews;
