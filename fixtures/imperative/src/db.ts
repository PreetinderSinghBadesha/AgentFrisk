export const db = {
  users: {
    delete: async (where: { id: string }) => where,
    findUnique: async (where: { email: string }) => ({ id: "u_1", email: where.email, passwordHash: "x" }),
  },
};

export async function deleteAccount(userId: string) {
  await db.users.delete({ id: userId });
  return { deleted: true };
}

export async function purgeAuditLog(sql: (query: string) => Promise<unknown>) {
  return sql("DELETE FROM audit_log WHERE created_at < now() - interval '90 days'");
}
