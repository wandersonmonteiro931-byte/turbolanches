import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSiteContent } from "@/hooks/useSiteContent";

const FlashPhrases = () => {
  const { content } = useSiteContent();
  const [index, setIndex] = useState(0);

  let phrases: string[] = [];
  try {
    const raw = content.flash_phrases;
    if (raw) phrases = JSON.parse(raw).filter((p: string) => p.trim());
  } catch {}

  useEffect(() => {
    if (phrases.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % phrases.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [phrases.length]);

  if (phrases.length === 0) return null;

  return (
    <div className="mt-2 h-6 overflow-hidden relative">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          transition={{
            enter: { duration: 0.3, ease: "easeOut" },
            exit: { duration: 0.25, ease: "easeIn" },
            duration: 0.3,
          }}
          className="text-xs font-semibold text-primary text-center whitespace-nowrap truncate"
        >
          {phrases[index % phrases.length]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
};

export default FlashPhrases;
