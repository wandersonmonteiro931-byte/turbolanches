import { useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ExtraCostsTab from "@/components/admin/pricing/ExtraCostsTab";
import ItemsTab from "@/components/admin/pricing/ItemsTab";
import ProfitDashboard from "@/components/admin/pricing/ProfitDashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AdminPricing = () => {
  const [tab, setTab] = useState("items");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Precificação</CardTitle>
            <CardDescription>
              Cadastros de itens e ingredientes ficam em uma área própria. Aqui você ajusta ficha técnica, custos extras e análise de lucro sem cortes de conteúdo.
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/cadastros">Abrir cadastros</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">Use a área de cadastros para criar ou editar a base manual de itens e ingredientes.</p>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap gap-2">
          <TabsTrigger value="costs">Custos Extras</TabsTrigger>
          <TabsTrigger value="items">Itens</TabsTrigger>
          <TabsTrigger value="profit">Lucro</TabsTrigger>
        </TabsList>
        <TabsContent value="costs">
          <ExtraCostsTab />
        </TabsContent>
        <TabsContent value="items">
          <ItemsTab />
        </TabsContent>
        <TabsContent value="profit">
          <ProfitDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPricing;
