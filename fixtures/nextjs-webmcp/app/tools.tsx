"use client";
import { ModelContext, defineTools, tool } from "nextjs-webmcp";
import { z } from "zod";
import { addTodo, deleteTodo, listTodos, refundOrder } from "@/app/actions";
import { refundInput, todoId, todoInput } from "@/app/todo";

const listTodosTool = tool({
  description: "List the signed-in user's todos, newest first.",
  input: z.object({}),
  annotations: { readOnlyHint: true },
  execute: listTodos,
});

const tools = defineTools({
  list_todos: listTodosTool,
  add_todo: tool({
    description: "Add a todo to the signed-in user's list.",
    input: todoInput,
    execute: addTodo,
  }),
  delete_todo: tool({
    description: "Delete one of the signed-in user's todos by id.",
    input: todoId,
    execute: deleteTodo,
  }),
  refund_order: tool({
    description: "Refund an order to the customer's original payment method.",
    input: refundInput,
    annotations: { consequentialHint: true },
    execute: refundOrder,
  }),
  get_todo: tool({
    description: "Get todo",
    input: todoId,
    execute: async ({ id }) => ({ id }),
  }),
});

export function TodoTools({ children }: { children: React.ReactNode }) {
  return <ModelContext tools={tools}>{children}</ModelContext>;
}
