import { pgTable, uuid, text, timestamp, decimal, jsonb, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core";

// Classification types
export const classificationEnum = pgEnum("classification", [
  "willing_to_meet",    // Strong interest, wants to schedule
  "interested",         // Positive response, open to discussion
  "needs_more_info",    // Curious but needs clarification
  "not_interested",     // Polite decline
  "out_of_office",      // Auto-reply, vacation
  "unsubscribe",        // Wants to be removed
  "bounce",             // Email bounced
  "other",              // Uncategorized
]);

// Qualification requests - stores all emails sent for qualification
export const qualificationRequests = pgTable(
  "qualification_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Source identification (which project/service sent this)
    sourceService: text("source_service").notNull(), // 'mcpfactory', 'pressbeat', etc.
    sourceOrgId: text("source_org_id").notNull(),    // Source organization identifier
    sourceRefId: text("source_ref_id"),              // Campaign run ID, pitch ID, etc.

    // Identity (from x-org-id / x-user-id headers)
    orgId: text("org_id"),
    userId: text("user_id"),
    brandId: text("brand_id"),
    campaignId: text("campaign_id"),
    runId: text("run_id"),                    // parent run ID (from caller)
    serviceRunId: text("service_run_id"),     // our own run ID in RunsService

    // Email content to qualify
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),

    // Original email reference (for threading)
    inReplyToMessageId: text("in_reply_to_message_id"),

    // Timestamps
    emailReceivedAt: timestamp("email_received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_qr_org").on(table.orgId),
    index("idx_qr_campaign").on(table.campaignId),
  ]
);

// Qualifications - AI analysis results
export const qualifications = pgTable("qualifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => qualificationRequests.id, { onDelete: "cascade" }),
  
  // Classification result
  classification: classificationEnum("classification").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  reasoning: text("reasoning"),
  
  // Extracted intent/action items
  suggestedAction: text("suggested_action"), // 'forward_to_client', 'auto_reply', 'ignore', etc.
  extractedDetails: jsonb("extracted_details"), // { meeting_time: "...", phone: "...", etc. }
  
  // Model info for tracking costs
  model: text("model").notNull().default("gemini-flash-lite"),
  inputTokens: decimal("input_tokens", { precision: 10, scale: 0 }),
  outputTokens: decimal("output_tokens", { precision: 10, scale: 0 }),
  costUsd: decimal("cost_usd", { precision: 10, scale: 6 }),
  
  // Raw response for debugging
  responseRaw: jsonb("response_raw"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Webhook callbacks - notify source service of qualification results
export const webhookCallbacks = pgTable("webhook_callbacks", {
  id: uuid("id").primaryKey().defaultRandom(),
  qualificationId: uuid("qualification_id")
    .notNull()
    .references(() => qualifications.id, { onDelete: "cascade" }),
  
  webhookUrl: text("webhook_url").notNull(),
  
  // Delivery status
  status: text("status").notNull().default("pending"), // 'pending', 'sent', 'failed'
  attempts: decimal("attempts", { precision: 3, scale: 0 }).notNull().default("0"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


export type QualificationRequest = typeof qualificationRequests.$inferSelect;
export type NewQualificationRequest = typeof qualificationRequests.$inferInsert;
export type Qualification = typeof qualifications.$inferSelect;
export type NewQualification = typeof qualifications.$inferInsert;
export type WebhookCallback = typeof webhookCallbacks.$inferSelect;
export type NewWebhookCallback = typeof webhookCallbacks.$inferInsert;
