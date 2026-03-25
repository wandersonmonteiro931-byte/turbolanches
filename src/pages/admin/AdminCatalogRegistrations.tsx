import { useState } from "react";
import { Link } from "react-router-dom";
import { FolderPlus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AdminProducts from "./AdminProducts";
import IngredientsTab from "@/components/admin/pricing/IngredientsTab";

const AdminCatalogRegistrations = () => {
  const [tab, setTab] = useState("items");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" />
              <CardTitle>Cadastros</CardTitle>
            </div>
            <CardDescription>
              Cadastre manualmente os itens e ingredientes usados no painel. Esses dados alimentam precificação, etiquetas e outras áreas administrativas.
            </CardDescription>
          </div>

          <Button asChild variant="outline">
            <Link to="/admin/precificacao">Ir para precificação</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full flex-wrap gap-2">
              <TabsTrigger value="items">Itens</TabsTrigger>
              <TabsTrigger value="ingredients">Ingredientes</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="mt-4">
              <AdminProducts />
            </TabsContent>
            <TabsContent value="ingredients" className="mt-4">
              <IngredientsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCatalogRegistrations;