import { useState, useRef } from "react";
import { Upload, X } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
}

const ImageUpload = ({ value, onChange, folder = "general" }: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    const url = await uploadImage(file, folder);
    if (url) onChange(url);
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="relative inline-block">
          <img src={value} alt="Preview" className="max-w-full h-auto rounded-lg object-contain" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Upload size={16} />
        {uploading ? "Enviando..." : "Enviar imagem"}
      </button>
    </div>
  );
};

export default ImageUpload;
