/**
 * Verify Wallet Link
 * 
 * Called from your website when user signs the verification message.
 * POST /api/telegram/verify-link
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyMessage } from 'ethers';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const { code, walletAddress, signature } = req.body;

  if (!code || !walletAddress || !signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find user with this link code
    const { data: user, error } = await supabase
      .from('telegram_users')
      .select('*')
      .eq('link_code', code)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'Invalid or expired link code' });
    }

    // Check if expired
    if (user.link_code_expires && new Date(user.link_code_expires) < new Date()) {
      return res.status(400).json({ error: 'Link code expired' });
    }

    // Verify signature
    const expectedMessage = `Link wallet to Telegram\n\nCode: ${code}`;
    const recoveredAddress = verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Update user
    await supabase
      .from('telegram_users')
      .update({
        wallet_address: walletAddress.toLowerCase(),
        linked_at: new Date().toISOString(),
        link_code: null,
        link_code_expires: null,
      })
      .eq('telegram_id', user.telegram_id);

    // Notify user on Telegram
    if (BOT_TOKEN) {
      await sendTelegramMessage(
        user.telegram_id,
        `✅ Wallet linked successfully!\n\n<code>${walletAddress}</code>\n\nUse /portfolio to check your balance.`
      );
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Verify link error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
}
