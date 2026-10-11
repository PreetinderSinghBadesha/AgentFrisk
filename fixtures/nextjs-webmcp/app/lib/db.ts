type Row = Record<string, unknown>;

const table = () => ({
  findMany: async (_args?: Row) => [] as Row[],
  findUnique: async (_args: Row) => ({}) as Row,
  create: async (args: Row) => args,
  update: async (args: Row) => args,
  delete: async (args: Row) => args,
});

export const db = { todos: table(), invoices: table(), accounts: table() };

export const stripe = {
  refunds: { create: async (args: Row) => args },
};
