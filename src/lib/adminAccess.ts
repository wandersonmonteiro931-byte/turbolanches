export type AdminAccountMode = "administration" | "seller" | "cashier" | "client";
export type StaffRole = "admin" | "seller" | "cashier";

export interface AdminSectionDefinition {
  path: string;
  label: string;
  group: string;
  description: string;
}

export const ACCOUNT_MODE_STORAGE_KEY = "turbo_lanches_account_mode";
export const ACCOUNT_MODE_EVENT = "turbo-account-mode-change";

export const ADMIN_SECTIONS: AdminSectionDefinition[] = [
  { path: "/admin", label: "Dashboard", group: "Operação", description: "Resumo da loja, caixa, ações rápidas e pedidos." },
  { path: "/admin/pedidos", label: "Pedidos", group: "Operação", description: "Consultar e gerenciar pedidos." },
  { path: "/cozinha", label: "Cozinha", group: "Operação", description: "Acompanhar preparo e produção." },
  { path: "/admin/novo-pedido", label: "Novo pedido", group: "Operação", description: "Criar pedidos manualmente no balcão." },
  { path: "/admin/fiados", label: "Fiados", group: "Financeiro", description: "Controlar vendas fiadas e recebimentos." },
  { path: "/admin/financeiro", label: "Financeiro", group: "Financeiro", description: "Saldos, extratos, taxas e repasses." },
  { path: "/admin/nao-pagos", label: "Não pagos", group: "Financeiro", description: "Pedidos com pagamento pendente." },
  { path: "/admin/produtos", label: "Produtos", group: "Catálogo", description: "Cadastrar e editar produtos." },
  { path: "/admin/cadastros", label: "Cadastros", group: "Catálogo", description: "Cadastros auxiliares do catálogo." },
  { path: "/admin/categorias", label: "Categorias", group: "Catálogo", description: "Organizar categorias do cardápio." },
  { path: "/admin/adicionais", label: "Adicionais", group: "Catálogo", description: "Gerenciar complementos e adicionais." },
  { path: "/admin/banners", label: "Banners", group: "Conteúdo", description: "Gerenciar banners da loja." },
  { path: "/admin/conteudo", label: "Conteúdo", group: "Conteúdo", description: "Editar textos e conteúdo do site." },
  { path: "/admin/entregas", label: "Entregas", group: "Operação", description: "Taxas, bairros e zonas de entrega." },
  { path: "/admin/horarios", label: "Horários", group: "Configuração", description: "Horários de funcionamento." },
  { path: "/admin/clientes", label: "Clientes", group: "Relacionamento", description: "Consultar clientes cadastrados." },
  { path: "/admin/notificacoes", label: "Notificações", group: "Relacionamento", description: "Enviar e acompanhar notificações." },
  { path: "/admin/cupons", label: "Cupons", group: "Marketing", description: "Criar e editar cupons." },
  { path: "/admin/comandas", label: "Comandas", group: "Impressão", description: "Modelos e impressão de comandas." },
  { path: "/admin/etiquetas", label: "Etiquetas", group: "Impressão", description: "Etiquetas gerais." },
  { path: "/admin/etiquetas-preco", label: "Etiquetas de preço", group: "Impressão", description: "Etiquetas de preço dos produtos." },
  { path: "/admin/administradores", label: "Equipe e acessos", group: "Administração", description: "Cadastrar administradores, vendedores, caixas e permissões." },
  { path: "/admin/raspadinha", label: "Raspadinha", group: "Marketing", description: "Campanhas e raspadinhas." },
  { path: "/admin/avaliacoes", label: "Avaliações", group: "Relacionamento", description: "Avaliações dos clientes." },
  { path: "/admin/precificacao", label: "Precificação", group: "Financeiro", description: "Custos, margens e preços." },
  { path: "/admin/reposicao", label: "Reposição", group: "Estoque", description: "Reposição e controle de estoque." },
  { path: "/admin/funcionarios", label: "Ponto / Funcionários", group: "Administração", description: "Equipe, ponto e funcionários." },
  { path: "/admin/ia", label: "IA do sistema", group: "Configuração", description: "Controles da inteligência artificial." },
  { path: "/admin/tv-publicidade", label: "TV / Publicidade", group: "Marketing", description: "Conteúdo para TV e publicidade." },
  { path: "/admin/impressora-wifi", label: "Impressora Wi-Fi", group: "Impressão", description: "Configuração da impressora Wi-Fi." },
  { path: "/admin/configuracoes", label: "Configurações", group: "Configuração", description: "Configurações gerais da loja." },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  admin: ADMIN_SECTIONS.map((section) => section.path),
  seller: [
    "/admin",
    "/admin/pedidos",
    "/admin/novo-pedido",
    "/admin/clientes",
    "/admin/produtos",
    "/admin/categorias",
    "/admin/adicionais",
    "/admin/cupons",
    "/admin/comandas",
    "/cozinha",
  ],
  cashier: [
    "/admin",
    "/admin/pedidos",
    "/admin/novo-pedido",
    "/admin/fiados",
    "/admin/nao-pagos",
    "/admin/clientes",
    "/admin/comandas",
    "/cozinha",
  ],
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrador",
  seller: "Vendedor",
  cashier: "Caixa",
};

export const MODE_LABELS: Record<AdminAccountMode, string> = {
  administration: "Administração",
  seller: "Vendedor",
  cashier: "Caixa",
  client: "Cliente",
};

export const normalizeAdminPath = (path: string) => {
  if (path === "/admin") return path;
  const section = [...ADMIN_SECTIONS]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => path === item.path || path.startsWith(`${item.path}/`));
  return section?.path || path;
};

export const getStoredAccountMode = (): AdminAccountMode => {
  if (typeof window === "undefined") return "administration";
  const value = window.localStorage.getItem(ACCOUNT_MODE_STORAGE_KEY);
  if (value === "seller" || value === "cashier" || value === "client" || value === "administration") return value;
  return "administration";
};

export const setStoredAccountMode = (mode: AdminAccountMode) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNT_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(ACCOUNT_MODE_EVENT, { detail: mode }));
};
