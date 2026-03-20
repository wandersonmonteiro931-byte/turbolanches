import { useState } from "react";
import { Star, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const quickTags = [
  "Comida boa",
  "Entrega rápida",
  "Bem embalado",
  "Chegou frio",
  "Faltou item",
];

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  orderId: string;
  userId: string;
  orderNumber?: number;
  orderItems: { product_id: string | null; product_name: string }[];
}

const ReviewModal = ({ open, onClose, onSubmitted, orderId, userId, orderNumber, orderItems }: ReviewModalProps) => {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const displayItems = orderItems.length > 0
    ? orderItems
    : [{ product_id: null, product_name: orderNumber ? `Pedido #${String(orderNumber).padStart(5, "0")}` : "Avaliação geral do pedido" }];

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Selecione uma nota de 1 a 5 estrelas");
      return;
    }

    setSubmitting(true);

    const rows = [{
      user_id: userId,
      product_id: orderItems.find((i) => i.product_id)?.product_id || null,
      order_id: orderId,
      rating,
      comment: comment.trim() || "Avaliação geral do pedido",
      tags: selectedTags,
      visible: false,
    }];

    const { error } = await supabase.from("reviews").insert(rows);

    if (error) {
      console.error("Review insert error:", error);
      toast.error("Erro ao enviar avaliação: " + error.message);
      setSubmitting(false);
      return;
    }

    toast.success("Obrigado pela sua avaliação! ❤️");
    setSubmitting(false);
    onSubmitted?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-lg sm:rounded-3xl"
          >
            {/* Close button */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold text-foreground">
                O que você achou do seu pedido?
              </h2>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted">
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            {/* Stars */}
            <div className="flex items-center justify-center gap-2 py-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <motion.button
                  key={star}
                  whileTap={{ scale: 0.8 }}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  onClick={() => setRating(star)}
                  className="p-1"
                >
                  <Star
                    size={36}
                    className={`transition-colors ${
                      star <= (hoveredStar || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-border fill-transparent"
                    }`}
                  />
                </motion.button>
              ))}
            </div>

            {rating > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-sm font-semibold text-muted-foreground mb-4"
              >
                {rating === 1 && "Muito ruim 😞"}
                {rating === 2 && "Ruim 😕"}
                {rating === 3 && "Regular 😐"}
                {rating === 4 && "Bom 😊"}
                {rating === 5 && "Excelente! 🤩"}
              </motion.p>
            )}

            {/* Quick Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {quickTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    selectedTags.includes(tag)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Comment */}
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte mais sobre sua experiência... (opcional)"
              rows={3}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none"
            />

            {/* Items being reviewed */}
            <div className="mt-3 mb-4">
              <p className="text-xs text-muted-foreground font-medium mb-1.5">Itens do pedido:</p>
              <div className="flex flex-wrap gap-1.5">
                {displayItems.map((item, i) => (
                  <span
                    key={i}
                    className="inline-block rounded-lg bg-muted px-2 py-1 text-xs font-medium text-foreground"
                  >
                    {item.product_name}
                  </span>
                ))}
              </div>
            </div>

            {/* Submit */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
              className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Enviando..." : "Enviar Avaliação"}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReviewModal;
