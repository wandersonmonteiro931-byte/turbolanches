import BottomNav from "@/components/BottomNav";

const Orders = () => {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-4 py-6">
        <div className="mx-auto max-w-md">
          <h1 className="text-3xl text-fire-gradient">PEDIDOS</h1>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4">
        <div className="flex flex-col items-center justify-center py-20">
          <span className="text-6xl">📦</span>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Nenhum pedido ainda</h2>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            Seus pedidos aparecerão aqui. Que tal fazer o primeiro?
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Orders;
