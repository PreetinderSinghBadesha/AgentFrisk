"use server";

const db = {
  subscribers: { create: async (data: { email: string }) => data },
};

export async function subscribe(formData: FormData) {
  const email = String(formData.get("email"));
  await db.subscribers.create({ email });
}
