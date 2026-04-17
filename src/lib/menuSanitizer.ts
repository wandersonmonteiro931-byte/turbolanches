// Sanitização de descrição do cardápio.
// Atualmente apenas normaliza espaços em branco — as descrições devem
// aparecer normalmente para o cliente, incluindo listas de ingredientes.
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export function sanitizeCustomerDescription(value?: string | null) {
  return normalizeWhitespace(value ?? "");
}
