import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IngredientsTab from "@/components/admin/pricing/IngredientsTab";
import ExtraCostsTab from "@/components/admin/pricing/ExtraCostsTab";
import ProfitDashboard from "@/components/admin/pricing/ProfitDashboard";

const AdminPricing = () => {
  const [tab, setTab] = useState("ingredients");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="ingredients">Ingredientes</TabsTrigger>
          <TabsTrigger value="costs">Custos Extras</TabsTrigger>
          <TabsTrigger value="profit">Lucro</TabsTrigger>
        </TabsList>
        <TabsContent value="ingredients">
          <IngredientsTab />
        </TabsContent>
        <TabsContent value="costs">
          <ExtraCostsTab />
        </TabsContent>
        <TabsContent value="profit">
          <ProfitDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPricing;
