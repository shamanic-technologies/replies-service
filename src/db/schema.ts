import { pgTable, uuid, text, timestamp, index, pgEnum } from "drizzle-orm/pg-core";

export const journalistReplyStatusEnum = pgEnum("journalist_reply_status", [
  "positive_for_earned",
  "positive_for_paid",
  "earned_publication_confirmed",
  "paid_publication_confirmed",
  "more_info_asked",
  "not_interested",
  "unsubscribe",
  "out_of_office",
  "bounced",
  "other",
]);

export const journalistReplySourceEnum = pgEnum("journalist_reply_source", [
  "auto",
  "manual",
]);

export const journalistReplies = pgTable(
  "journalist_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journalistId: text("journalist_id").notNull(),
    campaignId: text("campaign_id").notNull(),
    brandId: text("brand_id").notNull(),
    orgId: text("org_id").notNull(),
    userId: text("user_id"),
    parentRunId: text("parent_run_id"),
    runId: text("run_id"),
    audienceId: text("audience_id"),
    status: journalistReplyStatusEnum("status").notNull(),
    source: journalistReplySourceEnum("source").notNull(),
    setByUserId: text("set_by_user_id"),
    note: text("note"),
    fromEmail: text("from_email"),
    toEmail: text("to_email"),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    inReplyToMessageId: text("in_reply_to_message_id"),
    emailReceivedAt: timestamp("email_received_at", { withTimezone: true }),
    publicationUrl: text("publication_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_jr_journalist_campaign").on(table.journalistId, table.campaignId, table.createdAt.desc()),
    index("idx_jr_brand").on(table.brandId),
    index("idx_jr_org").on(table.orgId),
    index("idx_jr_status").on(table.status),
    index("idx_jr_source").on(table.source),
    index("idx_jr_brand_status").on(table.brandId, table.status),
  ]
);

export type JournalistReply = typeof journalistReplies.$inferSelect;
export type NewJournalistReply = typeof journalistReplies.$inferInsert;
