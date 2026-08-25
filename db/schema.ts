import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["employee", "admin"] }).notNull().default("employee"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, table => [uniqueIndex("employees_email_unique").on(table.email)]);

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  timezone: text("timezone").notNull().default("Asia/Taipei"),
  budget: integer("budget").notNull(),
  nominationLimit: integer("nomination_limit").notNull().default(2),
  voteLimit: integer("vote_limit").notNull().default(4),
  startDate: text("start_date").notNull(),
  nominationDeadline: text("nomination_deadline").notNull(),
  votingDeadline: text("voting_deadline").notNull(),
  purchaseDate: text("purchase_date").notNull(),
  status: text("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft"),
  ...timestamps,
});

export const campaignMembers = sqliteTable("campaign_members", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  nameSnapshot: text("name_snapshot").notNull(),
  emailSnapshot: text("email_snapshot").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("campaign_member_unique").on(table.campaignId, table.employeeId)]);

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  brand: text("brand").notNull().default(""),
  name: text("name").notNull(),
  category: text("category").notNull(),
  size: text("size").notNull().default(""),
  referencePrice: integer("reference_price"),
  sourceUrl: text("source_url"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const nominations = sqliteTable("nominations", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  productId: text("product_id").notNull().references(() => products.id),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  priceSnapshot: integer("price_snapshot"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("nomination_member_product_unique").on(table.campaignId, table.employeeId, table.productId)]);

export const votes = sqliteTable("votes", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  productId: text("product_id").notNull().references(() => products.id),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  kind: text("kind", { enum: ["nomination", "regular"] }).notNull(),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("vote_member_product_unique").on(table.campaignId, table.employeeId, table.productId)]);

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  productId: text("product_id").notNull().references(() => products.id),
  employeeId: text("employee_id").notNull().references(() => employees.id),
  body: text("body").notNull(),
  deletedAt: text("deleted_at"),
  ...timestamps,
});

export const purchaseItems = sqliteTable("purchase_items", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  productId: text("product_id").notNull().references(() => products.id),
  rank: integer("rank").notNull(),
  voteCount: integer("vote_count").notNull(),
  unitPrice: integer("unit_price").notNull(),
  suggestedQuantity: integer("suggested_quantity").notNull(),
  finalQuantity: integer("final_quantity"),
  purchased: integer("purchased", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, table => [uniqueIndex("purchase_campaign_product_unique").on(table.campaignId, table.productId)]);

export const emailDeliveries = sqliteTable("email_deliveries", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id),
  employeeId: text("employee_id").references(() => employees.id),
  stage: text("stage", { enum: ["nomination", "voting", "purchase", "reminder"] }).notNull(),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status", { enum: ["queued", "sent", "failed"] }).notNull().default("queued"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
