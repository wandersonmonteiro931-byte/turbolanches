import { Fragment } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ProductRecipeEditor, { type ProductRecipeEditorChange } from "./ProductRecipeEditor";
import { formatCurrency } from "./pricingMoney";
import type { ProductCostRow } from "./productCosting";

interface ItemsCategoryTableProps {
  categoryName: string;
  rows: ProductCostRow[];
  expandedId: string | null;
  onToggleExpanded: (id: string) => void;
  onRecipeChange: (payload: ProductRecipeEditorChange) => void;
}

const ItemsCategoryTable = ({
  categoryName,
  rows,
  expandedId,
  onToggleExpanded,
  onRecipeChange,
}: ItemsCategoryTableProps) => {
  const averageMargin = rows.length > 0 ? rows.reduce((sum, row) => sum + row.margin, 0) / rows.length : 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{categoryName}</h3>
            <p className="text-xs text-muted-foreground">{rows.length} item(ns)</p>
          </div>
          <div className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
            Margem média: <span className="font-semibold text-foreground">{averageMargin.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4 pr-2">Item</TableHead>
            <TableHead className="px-2 text-right">Venda</TableHead>
            <TableHead className="px-2 text-right">Ingredientes</TableHead>
            <TableHead className="px-2 text-right">Custo direto</TableHead>
            <TableHead className="px-2 text-right">Extras</TableHead>
            <TableHead className="px-2 text-right">Custo total</TableHead>
            <TableHead className="px-2 text-right">Lucro</TableHead>
            <TableHead className="px-2 text-right">Margem</TableHead>
            <TableHead className="pl-2 pr-4 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedId === row.id;
            const emphasisClass = row.totalCost <= 0 ? "text-destructive" : "text-foreground";

            return (
              <Fragment key={row.id}>
                <TableRow className="align-top">
                  <TableCell className="py-3 pl-4 pr-2">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{row.name}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{row.active ? "Ativo" : "Oculto"}</span>
                        <span>•</span>
                        <span>{row.ingredientCount} ingrediente(s)</span>
                        {row.manualCost > 0 && (
                          <>
                            <span>•</span>
                            <span>Custo direto</span>
                          </>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-3 text-right text-foreground">{formatCurrency(row.price)}</TableCell>
                  <TableCell className={`px-2 py-3 text-right ${emphasisClass}`}>{formatCurrency(row.ingredientCost)}</TableCell>
                  <TableCell className={`px-2 py-3 text-right ${row.manualCost > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {formatCurrency(row.manualCost)}
                  </TableCell>
                  <TableCell className="px-2 py-3 text-right text-muted-foreground">{formatCurrency(row.extraCost)}</TableCell>
                  <TableCell className={`px-2 py-3 text-right font-medium ${emphasisClass}`}>{formatCurrency(row.totalCost)}</TableCell>
                  <TableCell className={`px-2 py-3 text-right ${row.profit < 0 ? "text-destructive" : "text-foreground"}`}>
                    {formatCurrency(row.profit)}
                  </TableCell>
                  <TableCell className={`px-2 py-3 text-right ${row.margin < 30 ? "text-destructive" : "text-primary"}`}>
                    {row.margin.toFixed(1)}%
                  </TableCell>
                  <TableCell className="py-3 pl-2 pr-4 text-right">
                    <button
                      onClick={() => onToggleExpanded(row.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {isExpanded ? "Fechar" : "Editar"}
                    </button>
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableCell colSpan={9} className="p-4">
                      <ProductRecipeEditor productId={row.id} onChange={onRecipeChange} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
};

export default ItemsCategoryTable;