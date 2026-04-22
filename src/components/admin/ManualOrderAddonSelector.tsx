import { useState } from "react";
import { Plus, Minus, Check, Package } from "lucide-react";

interface Addon {
  id: string;
  name: string;
  price: number;
}

interface CartItemAddon {
  addon_id: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartItemForAddon {
  productId: string;
  productName: string;
  quantity: number;
  isCombo: boolean;
  addons: CartItemAddon[];
}

interface Props {
  items: CartItemForAddon[];
  availableAddons: Addon[];
  selectedItemIds: string[];
  onToggleCombo: (productId: string) => void;
  onToggleSelectItem: (productId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSetAddon: (productIds: string[], addonId: string, addon: Addon, quantity: number) => void;
}

const ManualOrderAddonSelector = ({
  items,
  availableAddons,
  selectedItemIds,
  onToggleCombo,
  onToggleSelectItem,
  onSelectAll,
  onClearSelection,
  onSetAddon,
}: Props) => {
  const [showAddonPanel, setShowAddonPanel] = useState(false);

  if (items.length === 0) return null;

  const selectedItems = items.filter((i) => selectedItemIds.includes(i.productId));

  const handleAddonChange = (addon: Addon, delta: number) => {
    if (selectedItemIds.length === 0) return;

    selectedItemIds.forEach((pid) => {
      const item = items.find((i) => i.productId === pid);
      if (!item) return;

      const existing = item.addons.find((a) => a.addon_id === addon.id);
      const currentQty = existing?.quantity || 0;

      if (item.isCombo) {
        const newQty = delta > 0
          ? currentQty + item.quantity
          : Math.max(0, currentQty - item.quantity);
        onSetAddon([pid], addon.id, addon, newQty);
        return;
      }

      const newQty = Math.max(0, currentQty + delta);
      onSetAddon([pid], addon.id, addon, newQty);
    });
  };

  return (
    <div className="space-y-3">
      {/* Item selection for bulk addon assignment */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-foreground">Selecione itens para adicionais</h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="rounded-sm border border-[hsl(199_76%_36%)] bg-[hsl(197_58%_91%)] px-2 py-1 text-[10px] font-bold text-[hsl(203_88%_22%)]"
          >
            Todos
          </button>
          <button
            onClick={onClearSelection}
            className="rounded-sm border border-border bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground"
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => {
          const isSelected = selectedItemIds.includes(item.productId);
          const addonsTotal = item.addons.reduce((s, a) => s + a.price * a.quantity, 0);

          return (
            <div key={item.productId} className="space-y-1">
              <div
                className={`flex items-center gap-2 rounded-sm px-3 py-2 cursor-pointer transition-all ${
                  isSelected ? "bg-[hsl(197_58%_91%)] border border-[hsl(199_76%_36%)]" : "bg-background border border-border"
                }`}
                onClick={() => onToggleSelectItem(item.productId)}
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                  isSelected ? "bg-[hsl(203_88%_22%)] border-[hsl(203_88%_22%)]" : "border-border"
                }`}>
                  {isSelected && <Check size={12} className="text-primary-foreground" />}
                </div>
                  <span className="min-w-0 flex-1 whitespace-normal break-words text-xs font-medium leading-tight text-foreground">
                  {item.quantity}x {item.productName}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCombo(item.productId);
                  }}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-[10px] font-bold transition-all ${
                    item.isCombo
                      ? "bg-[hsl(43_95%_50%)] text-[hsl(203_88%_22%)] ring-1 ring-[hsl(43_95%_50%)]"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Package size={10} />
                  Combo
                </button>
                {addonsTotal > 0 && (
                  <span className="text-[10px] font-bold text-[hsl(203_88%_22%)]">
                    +R$ {addonsTotal.toFixed(2).replace(".", ",")}
                  </span>
                )}
              </div>

              {/* Show current addons for this item */}
              {item.addons.length > 0 && (
                <div className="ml-7 flex flex-wrap gap-1">
                  {item.addons.map((a) => (
                    <span key={a.addon_id} className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {a.quantity}x {a.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Addon panel toggle */}
      <button
        onClick={() => setShowAddonPanel(!showAddonPanel)}
        className="w-full rounded-sm border border-dashed border-[hsl(199_76%_36%)] bg-[hsl(197_58%_91%)] px-3 py-2 text-xs font-bold text-[hsl(203_88%_22%)] transition-all hover:bg-[hsl(200_45%_82%)]"
      >
        {showAddonPanel ? "▲ Fechar adicionais" : `▼ Adicionar extras ${selectedItemIds.length > 0 ? `(${selectedItemIds.length} itens)` : ""}`}
      </button>

      {/* Addon list */}
      {showAddonPanel && availableAddons.length > 0 && (
        <div className="rounded-sm border border-border bg-background p-3 space-y-2">
          <p className="text-[10px] text-muted-foreground">
            {selectedItemIds.length > 0
              ? `Aplicando para: ${selectedItems.map((i) => `${i.quantity}x ${i.productName}`).join(", ")}`
              : "Selecione itens para liberar os adicionais"}
          </p>
          {availableAddons.map((addon) => {
            // Show aggregate qty across selected items
            const totalQty = selectedItems.reduce((sum, item) => {
              const found = item.addons.find((a) => a.addon_id === addon.id);
              return sum + (found?.quantity || 0);
            }, 0);

            return (
              <div
                key={addon.id}
                className={`flex items-center justify-between rounded-sm px-3 py-2 ${
                  totalQty > 0 ? "bg-[hsl(197_58%_91%)] border border-[hsl(199_76%_36%)]" : "bg-card"
                }`}
              >
                <div>
                    <span className="text-xs font-medium text-foreground">{addon.name}</span>
                  <p className="text-[10px] font-semibold text-[hsl(203_88%_22%)]">
                    {addon.price > 0 ? `+ R$ ${addon.price.toFixed(2).replace(".", ",")}` : "Grátis"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {totalQty > 0 && (
                    <button
                      onClick={() => handleAddonChange(addon, -1)}
                      disabled={selectedItemIds.length === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-sm border border-[hsl(203_88%_22%)] text-[hsl(203_88%_22%)] disabled:opacity-30"
                    >
                      <Minus size={14} />
                    </button>
                  )}
                  {totalQty > 0 && (
                    <span className="min-w-[20px] text-center text-xs font-bold text-foreground">{totalQty}</span>
                  )}
                  <button
                    onClick={() => handleAddonChange(addon, 1)}
                    disabled={selectedItemIds.length === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-sm bg-[hsl(203_88%_22%)] text-[hsl(0_0%_100%)] disabled:opacity-30"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddonPanel && availableAddons.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-3">Nenhum adicional disponível</p>
      )}
    </div>
  );
};

export default ManualOrderAddonSelector;
