import burgerSmash from "@/assets/burger-smash.jpg";
import comboMeal from "@/assets/combo-meal.jpg";
import porcaoFritas from "@/assets/porcao-fritas.jpg";
import bebidas from "@/assets/bebidas.jpg";

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  image: string;
  category: string;
  rating: number;
  ratingCount: number;
  addons: ProductAddon[];
  popular?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedAddons: ProductAddon[];
  observations: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  image: string;
}

export const categories: Category[] = [
  { id: "hamburgueres", name: "Hambúrgueres", icon: "🍔", image: burgerSmash },
  { id: "combos", name: "Combos", icon: "🍟", image: comboMeal },
  { id: "porcoes", name: "Porções", icon: "🧆", image: porcaoFritas },
  { id: "bebidas", name: "Bebidas", icon: "🥤", image: bebidas },
];

export const products: Product[] = [
  {
    id: "1",
    name: "Turbo Smash Burger",
    description: "Dois hambúrgueres smash 90g, queijo cheddar derretido, cebola caramelizada, picles artesanal e molho especial da casa no pão brioche.",
    price: 32.90,
    originalPrice: 39.90,
    image: burgerSmash,
    category: "hamburgueres",
    rating: 4.8,
    ratingCount: 234,
    popular: true,
    addons: [
      { id: "a1", name: "Bacon extra", price: 5.00 },
      { id: "a2", name: "Queijo cheddar extra", price: 4.00 },
      { id: "a3", name: "Ovo", price: 3.00 },
      { id: "a4", name: "Cebola crispy", price: 3.50 },
    ],
  },
  {
    id: "2",
    name: "X-Turbo Bacon",
    description: "Hambúrguer artesanal 150g, bacon crocante, queijo prato, alface, tomate e maionese da casa no pão com gergelim.",
    price: 28.90,
    image: burgerSmash,
    category: "hamburgueres",
    rating: 4.6,
    ratingCount: 189,
    addons: [
      { id: "a1", name: "Bacon extra", price: 5.00 },
      { id: "a2", name: "Queijo cheddar extra", price: 4.00 },
      { id: "a5", name: "Hambúrguer extra", price: 8.00 },
    ],
  },
  {
    id: "3",
    name: "X-Turbo Salada",
    description: "Hambúrguer artesanal 150g, queijo prato, alface, tomate, cebola e maionese da casa.",
    price: 24.90,
    image: burgerSmash,
    category: "hamburgueres",
    rating: 4.5,
    ratingCount: 156,
    addons: [
      { id: "a1", name: "Bacon extra", price: 5.00 },
      { id: "a2", name: "Queijo cheddar extra", price: 4.00 },
    ],
  },
  {
    id: "4",
    name: "Combo Turbo",
    description: "Turbo Smash Burger + Batata frita média + Refrigerante 350ml. O combo mais pedido!",
    price: 44.90,
    originalPrice: 54.70,
    image: comboMeal,
    category: "combos",
    rating: 4.9,
    ratingCount: 312,
    popular: true,
    addons: [
      { id: "a6", name: "Trocar refri por suco", price: 2.00 },
      { id: "a7", name: "Batata grande", price: 5.00 },
    ],
  },
  {
    id: "5",
    name: "Combo Família",
    description: "2 X-Turbo Bacon + 1 Batata grande + 2 Refrigerantes 350ml. Perfeito para dividir!",
    price: 79.90,
    originalPrice: 94.70,
    image: comboMeal,
    category: "combos",
    rating: 4.7,
    ratingCount: 98,
    addons: [
      { id: "a7", name: "Batata grande extra", price: 12.00 },
      { id: "a8", name: "+1 Refrigerante", price: 6.00 },
    ],
  },
  {
    id: "6",
    name: "Batata Frita Cheddar & Bacon",
    description: "Porção generosa de batata frita crocante coberta com cheddar cremoso e bacon picado.",
    price: 26.90,
    image: porcaoFritas,
    category: "porcoes",
    rating: 4.7,
    ratingCount: 201,
    popular: true,
    addons: [
      { id: "a9", name: "Cheddar extra", price: 5.00 },
      { id: "a10", name: "Bacon extra", price: 5.00 },
    ],
  },
  {
    id: "7",
    name: "Onion Rings",
    description: "Anéis de cebola empanados e fritos, crocantes por fora e macios por dentro. Acompanha molho barbecue.",
    price: 19.90,
    image: porcaoFritas,
    category: "porcoes",
    rating: 4.4,
    ratingCount: 87,
    addons: [],
  },
  {
    id: "8",
    name: "Coca-Cola 350ml",
    description: "Coca-Cola lata gelada 350ml.",
    price: 6.90,
    image: bebidas,
    category: "bebidas",
    rating: 4.9,
    ratingCount: 500,
    addons: [],
  },
  {
    id: "9",
    name: "Suco de Laranja 300ml",
    description: "Suco natural de laranja feito na hora. Refrescante!",
    price: 8.90,
    image: bebidas,
    category: "bebidas",
    rating: 4.6,
    ratingCount: 145,
    addons: [
      { id: "a11", name: "Sem açúcar", price: 0 },
    ],
  },
];
