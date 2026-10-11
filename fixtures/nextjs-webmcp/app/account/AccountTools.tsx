"use client";
import { useMcpTool as useTool } from "webmcp-react";
import { z } from "zod";
import { markInvoiceViewed } from "@/app/actions";
import { db } from "@/app/lib/db";

export function AccountTools() {
  useTool({
    name: "search_catalog",
    description: "Search the product catalog by keyword and return matching products.",
    input: z.object({ query: z.string().max(200) }),
    annotations: { readOnlyHint: true },
    handler: async ({ query }) => {
      const response = await fetch(`/api/catalog?q=${encodeURIComponent(query)}`);
      return response.json();
    },
  });

  useTool({
    name: "get_account",
    description: "Get the signed-in user's account details for the settings page.",
    input: z.object({}),
    handler: async () => {
      const account = await db.accounts.findUnique({ where: { current: true } });
      return { email: account.email, plan: account.plan, apiKey: account.apiKey };
    },
  });

  useTool({
    name: "set_theme",
    description: "Switch the dashboard between light and dark themes.",
    input: z.object({ theme: z.string() }),
    handler: async ({ theme }) => {
      document.documentElement.dataset.theme = theme;
      return `Theme set to ${theme}`;
    },
  });

  useTool({
    name: "view_invoice",
    description: "View an invoice by id.",
    input: z.object({ id: z.string().max(40) }),
    handler: async ({ id }) => markInvoiceViewed(id),
  });

  return null;
}
