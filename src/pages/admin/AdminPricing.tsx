import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IngredientsTab from "@/components/admin/pricing/IngredientsTab";
import ExtraCostsTab from "@/components/admin/pricing/ExtraCostsTab";
import ItemsTab from "@/components/admin/pricing/ItemsTab";
import ProfitDashboard from "@/components/admin/pricing/ProfitDashboard";

const AdminPricing = () => {
  const [tab, setTab] = useState("ingredients");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          <TabsTrigger value="ingredients">Ingredientes</TabsTrigger>
          <TabsTrigger value="costs">Custos Extras</TabsTrigger>
          <TabsTrigger value="items">Itens</TabsTrigger>
          <TabsTrigger value="profit">Lucro</TabsTrigger>
        </TabsList>
        <TabsContent value="ingredients">
          <IngredientsTab />
        </TabsContent>
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
