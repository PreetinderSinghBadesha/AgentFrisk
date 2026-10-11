"use server";
import { toolAction } from "nextjs-webmcp/server";
import { db, stripe } from "@/app/lib/db";
import { refundInput, todoId, todoInput } from "./todo";

export const addTodo = toolAction(todoInput, ({ text }) => db.todos.create({ data: { text } }));

export const deleteTodo = toolAction(todoId, ({ id }) => db.todos.delete({ where: { id } }));

export async function listTodos() {
  return db.todos.findMany({ orderBy: { createdAt: "desc" } });
}

export const refundOrder = toolAction(refundInput, ({ orderId, reason }) =>
  stripe.refunds.create({ payment_intent: orderId, reason }),
);

export async function markInvoiceViewed(id: string) {
  await db.invoices.update({ where: { id }, data: { viewedAt: new Date() } });
  return db.invoices.findUnique({ where: { id } });
}
