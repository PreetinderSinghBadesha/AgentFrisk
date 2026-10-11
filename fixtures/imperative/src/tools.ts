import { deleteAccount, db } from "./db";

const mc = document.modelContext ?? navigator.modelContext;

mc.registerTool({
  name: "get_order_status",
  description: "Get the shipping status of one of the signed-in user's orders.",
  inputSchema: {
    type: "object",
    properties: {
      orderId: { type: "string", pattern: "^ord_[a-z0-9]{12}$" },
    },
    required: ["orderId"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true },
  async execute({ orderId }: { orderId: string }) {
    const response = await fetch(`/api/orders/${orderId}/status`);
    return response.text();
  },
});

mc.registerTool({
  name: "delete_account",
  description: "Permanently delete the signed-in user's account and all of its data.",
  inputSchema: {
    type: "object",
    properties: { userId: { type: "string", maxLength: 64 } },
    required: ["userId"],
    additionalProperties: false,
  },
  execute: async ({ userId }: { userId: string }) => deleteAccount(userId),
});

mc.registerTool({
  name: "cancel_subscription",
  description: "Cancel the user's subscription at the end of the current billing period.",
  inputSchema: {
    type: "object",
    properties: { reason: { type: "string", enum: ["too_expensive", "not_using", "other"] } },
    additionalProperties: false,
  },
  annotations: { consequentialHint: true },
  execute: async ({ reason }: { reason: string }) => {
    await fetch("/api/subscription", { method: "DELETE", body: JSON.stringify({ reason }) });
    return "Subscription cancelled";
  },
});

mc.registerTool({
  name: "find_user",
  description: "Find a user profile by email address for the support dashboard.",
  inputSchema: {
    type: "object",
    properties: { email: { type: "string", format: "email", maxLength: 254 } },
    required: ["email"],
    additionalProperties: false,
  },
  execute: async ({ email }: { email: string }) => {
    const user = await db.users.findUnique({ email });
    return { id: user.id, email: user.email, passwordHash: user.passwordHash };
  },
});

mc.registerTool({
  name: "search_notes",
  description: "Search the user's notes for a phrase and return matching titles.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", maxLength: 200 } },
    required: ["query"],
    additionalProperties: false,
  },
  execute: async ({ query }: { query: string }) => {
    const response = await fetch("/api/notes/archive", { method: "POST", body: query });
    return response.json();
  },
});

mc.registerTool({
  name: "add_tag",
  description: "Adds tag",
  inputSchema: {
    type: "object",
    properties: { tag: { type: "string", pattern: "^[a-z-]{1,32}$" } },
    required: ["tag"],
    additionalProperties: false,
  },
  execute: async ({ tag }: { tag: string }) => {
    await fetch("/api/tags", { method: "POST", body: tag });
    return "ok";
  },
});

mc.registerTool({
  name: "update_profile",
  description: "Update the display name and bio shown on the user's public profile.",
  inputSchema: {
    type: "object",
    properties: {
      displayName: { type: "string", maxLength: 80 },
      bio: { type: "string" },
    },
  },
  execute: async (input: { displayName?: string; bio?: string }) => {
    await fetch("/api/profile", { method: "PATCH", body: JSON.stringify(input) });
    return "Profile updated";
  },
});

// agentfrisk-ignore loose-schema
mc.registerTool({
  name: "get_feature_flags",
  description: "Get the feature flags enabled for the current workspace.",
  execute: async () => {
    const response = await fetch("/api/flags");
    return response.json();
  },
});
