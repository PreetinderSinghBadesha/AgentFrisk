import { z } from "zod";

export const todoInput = z.object({ text: z.string().min(1).max(200).describe("What to do") });
export const todoId = z.object({ id: z.uuid() });
export const refundInput = z.object({
  orderId: z.string().regex(/^ord_[a-z0-9]+$/),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]),
});
