-- Telegram Bot Database Schema
-- Run this in your Supabase SQL Editor

-- =====================================================
-- Users Table
-- =====================================================
CREATE TABLE IF NOT EXISTS telegram_users (
  telegram_id BIGINT PRIMARY KEY,
  wallet_address TEXT,
  username TEXT,
  link_code TEXT,
  link_code_expires TIMESTAMPTZ,
  linked_at TIMESTAMPTZ,
  referral_code TEXT UNIQUE,
  referred_by BIGINT REFERENCES telegram_users(telegram_id),
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_wallet ON telegram_users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_telegram_users_link_code ON telegram_users(link_code);
CREATE INDEX IF NOT EXISTS idx_telegram_users_referral ON telegram_users(referral_code);

-- =====================================================
-- Price Alerts Table
-- =====================================================
CREATE TABLE IF NOT EXISTS telegram_price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('above', 'below')),
  target_price DECIMAL(20, 10) NOT NULL,
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_telegram_id ON telegram_price_alerts(telegram_id);
CREATE INDEX IF NOT EXISTS idx_alerts_untriggered ON telegram_price_alerts(triggered) WHERE triggered = FALSE;

-- =====================================================
-- Whale Watchlist Table
-- =====================================================
CREATE TABLE IF NOT EXISTS telegram_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(telegram_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_telegram_id ON telegram_watchlist(telegram_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_wallet ON telegram_watchlist(wallet_address);

-- =====================================================
-- Referrals Table
-- =====================================================
CREATE TABLE IF NOT EXISTS telegram_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_telegram_id BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  referred_telegram_id BIGINT UNIQUE REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rewarded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON telegram_referrals(referrer_telegram_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON telegram_referrals(referral_code);

-- =====================================================
-- Support Tickets Table
-- =====================================================
CREATE TABLE IF NOT EXISTS telegram_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES telegram_users(telegram_id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_telegram_id ON telegram_support_tickets(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON telegram_support_tickets(status);

-- =====================================================
-- Enable RLS on all tables
-- =====================================================
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_support_tickets ENABLE ROW LEVEL SECURITY;

-- Allow service role access (for webhook)
CREATE POLICY "Allow public access to telegram_users" ON telegram_users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to telegram_price_alerts" ON telegram_price_alerts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to telegram_watchlist" ON telegram_watchlist
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to telegram_referrals" ON telegram_referrals
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access to telegram_support_tickets" ON telegram_support_tickets
  FOR ALL USING (true) WITH CHECK (true);
