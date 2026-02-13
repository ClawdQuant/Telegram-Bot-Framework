/**
 * Set Telegram Webhook
 * 
 * Visit this endpoint to register your webhook URL with Telegram.
 * GET /api/telegram/set-webhook
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
  }

  // Get the host from the request
  const host = req.headers.host || '';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message'],
      }),
    });

    const result = await response.json();

    if (result.ok) {
      return res.status(200).json({
        success: true,
        message: 'Webhook set successfully',
        webhook_url: webhookUrl,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.description,
      });
    }
  } catch (error) {
    console.error('Failed to set webhook:', error);
    return res.status(500).json({ error: 'Failed to set webhook' });
  }
}
