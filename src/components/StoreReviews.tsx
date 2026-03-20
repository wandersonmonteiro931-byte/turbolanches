import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  tags: string[];
  created_at: string;
  admin_response: string;
  profiles?: { full_name: string } | null;
}

interface StoreReviewsProps {
  compact?: boolean;
}

const StoreReviews = ({ compact = false }: StoreReviewsProps) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      // Get visible reviews with profile names
      const { data, count } = await supabase
        .from("reviews")
        .select("id, rating, comment, tags, created_at, admin_response, user_id", { count: "exact" })
        .eq("visible", true)
        .order("created_at", { ascending: false })
        .limit(compact ? 3 : 10);

      if (data && data.length > 0) {
        // Fetch profile names
        const userIds = [...new Set(data.map((r) => r.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const profileMap: Record<string, string> = {};
        profiles?.forEach((p) => {
          profileMap[p.user_id] = p.full_name;
        });

        const enriched = data.map((r) => ({
          ...r,
          tags: (r.tags as string[]) || [],
          admin_response: (r as any).admin_response || "",
          profiles: { full_name: profileMap[r.user_id] || "Cliente" },
        }));

        setReviews(enriched);
      }

      if (count !== null) setTotalCount(count);

      // Calculate average from ALL visible reviews
      const { data: allRatings } = await supabase
        .from("reviews")
        .select("rating")
        .eq("visible", true);

      if (allRatings && allRatings.length > 0) {
        const avg = allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length;
        setAvgRating(Math.round(avg * 10) / 10);
      }

      setLoading(false);
    };

    fetchReviews();
  }, [compact]);

  const abbreviateName = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length <= 1) return name;
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  if (loading || totalCount === 0) return null;

  return (
    <div className="mt-6">
      {/* Rating Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          <Star size={18} className="fill-amber-400 text-amber-400" />
          <span className="text-lg font-extrabold text-foreground tabular-nums">
            {avgRating.toFixed(1)}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          ({totalCount} avaliação{totalCount !== 1 ? "es" : ""})
        </span>
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        {reviews.map((review, i) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
            className="rounded-xl bg-background p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-bold text-foreground">
                {abbreviateName(review.profiles?.full_name || "Cliente")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(review.created_at).toLocaleDateString("pt-BR")}
              </span>
            </div>

            {/* Stars */}
            <div className="flex items-center gap-0.5 mb-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={14}
                  className={s <= review.rating ? "fill-amber-400 text-amber-400" : "text-border fill-transparent"}
                />
              ))}
            </div>

            {/* Tags */}
            {review.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {review.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Comment */}
            {review.comment && (
              <p className="text-sm text-foreground/80 leading-relaxed">{review.comment}</p>
            )}

            {/* Admin Response */}
            {review.admin_response && (
              <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 p-3">
                <p className="text-[11px] font-bold text-primary mb-0.5">Resposta da loja</p>
                <p className="text-xs text-foreground/70">{review.admin_response}</p>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default StoreReviews;
