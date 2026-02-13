/**
 * Price Alerts Cron Job
 * 
 * Checks token price against user alerts and sends notifications.
 * Configure in vercel.json to run every 5 minutes.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '';

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

async function getCurrentPrice(): Promise<number | null> {
  if (!TOKEN_ADDRESS) return null;
  
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
    const data = await response.json();
    
    if (data.pairs?.length > 0) {
      const pair = data.pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      return parseFloat(pair.priceUsd || '0');
    }
  } catch (error) {
    console.error('Failed to get price:', error);
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret
  const cronSecret = req.headers['authorization'];
  if (req.method !== 'GET' && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabase || !BOT_TOKEN) {
    return res.status(500).json({ error: 'Not configured' });
  }

  try {
    const currentPrice = await getCurrentPrice();
    if (!currentPrice) {
      return res.status(500).json({ error: 'Failed to get price' });
    }

    // Get untriggered alerts
    const { data: alerts } = await supabase
      .from('telegram_price_alerts')
      .select('*, telegram_users(notifications_enabled)')
      .eq('triggered', false);

    if (!alerts?.length) {
      return res.status(200).json({ message: 'No alerts', price: currentPrice });
    }

    let triggered = 0;

    for (const alert of alerts) {
      const shouldTrigger = 
        (alert.alert_type === 'above' && currentPrice >= alert.target_price) ||
        (alert.alert_type === 'below' && currentPrice <= alert.target_price);

      if (shouldTrigger) {
        await supabase
          .from('telegram_price_alerts')
          .update({ triggered: true, triggered_at: new Date().toISOString() })
          .eq('id', alert.id);

        const userSettings = alert.telegram_users as any;
        if (userSettings?.notifications_enabled !== false) {
          const emoji = alert.alert_type === 'above' ? '📈' : '📉';
          await sendTelegramMessage(
            alert.telegram_id,
            `${emoji} <b>Price Alert!</b>\n\nPrice is now ${alert.alert_type} $${alert.target_price}\nCurrent: $${currentPrice.toFixed(10)}`
          );
          triggered++;
        }
      }
    }

    return res.status(200).json({ price: currentPrice, checked: alerts.length, triggered });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
