CREATE TYPE "AlertCondition" AS ENUM ('ABOVE', 'BELOW');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TABLE "watchlists" (
  "id" TEXT PRIMARY KEY, "market" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "watchlists_market_key" ON "watchlists"("market");
CREATE TABLE "price_alerts" (
  "id" TEXT PRIMARY KEY, "market" TEXT NOT NULL, "condition" "AlertCondition" NOT NULL,
  "target_price" DECIMAL(30,10) NOT NULL CHECK ("target_price" > 0),
  "enabled" BOOLEAN NOT NULL DEFAULT true, "trigger_once" BOOLEAN NOT NULL DEFAULT true,
  "cooldown_minutes" INTEGER NOT NULL DEFAULT 60 CHECK ("cooldown_minutes" BETWEEN 1 AND 10080),
  "last_triggered_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "price_alerts_market_enabled_idx" ON "price_alerts"("market", "enabled");
CREATE TABLE "price_alert_logs" (
  "id" TEXT PRIMARY KEY, "alert_id" TEXT, "market" TEXT NOT NULL,
  "target_price" DECIMAL(30,10) NOT NULL, "trigger_price" DECIMAL(30,10) NOT NULL,
  "condition" "AlertCondition" NOT NULL, "triggered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notification_status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "price_alert_logs_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "price_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "price_alert_logs_alert_id_idx" ON "price_alert_logs"("alert_id");
CREATE INDEX "price_alert_logs_triggered_at_idx" ON "price_alert_logs"("triggered_at");
