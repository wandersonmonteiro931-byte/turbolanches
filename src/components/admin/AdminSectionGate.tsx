import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

interface Props {
  onUnlock: () => void;
}

const AdminSectionGate = ({ onUnlock }: Props) => {
  const [input, setInput] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(false);

  // Parent handles validation via onUnlock; we just collect input
  return null; // This is handled inline in AdminLayout
};

export default AdminSectionGate;
