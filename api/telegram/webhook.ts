/**
 * Telegram Bot Webhook
 * 
 * Full-featured bot for Web3 projects with:
 * - Wallet linking
 * - Portfolio tracking
 * - Price alerts
 * - Whale watchlist
 * - Referral system
 * - Support tickets
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// =====================================================
// CONFIGURATION - Update these for your project
// =====================================================

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase: SupabaseClient | null = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Your token contract addresses
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '';
const STAKING_CONTRACT_ADDRESS = process.env.STAKING_CONTRACT_ADDRESS || '';

// RPC endpoints (Base network - change for your chain)
const RPC_URLS = [
  'https://mainnet.base.org',
  'https://base.publicnode.com',
];

// Your project info
const PROJECT_NAME = 'My Project';
const PROJECT_URL = 'https://yourproject.com';
const BOT_USERNAME = 'YourBotUsername';

// =====================================================
// TYPES
// =====================================================

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; is_bot: boolean; first_name: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
}

interface TelegramUser {
  telegram_id: number;
  wallet_address: string | null;
  username: string | null;
  link_code: string | null;
  link_code_expires: string | null;
  linked_at: string | null;
  created_at: string;
  referral_code: string | null;
  referred_by: number | null;
  notifications_enabled: boolean;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

async function sendMessage(chatId: number, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}

function generateCode(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

async function rpcCall(method: string, params: any[]): Promise<any> {
  for (const rpcUrl of RPC_URLS) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const result = await response.json();
      if (result.result !== undefined) return result.result;
    } catch (error) {
      console.error(`RPC call failed for ${rpcUrl}:`, error);
    }
  }
  return null;
}

function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  if (num >= 1) return num.toFixed(2);
  return num.toFixed(6);
}

function formatUSD(num: number): string {
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// =====================================================
// USER MANAGEMENT
// =====================================================

async function getOrCreateUser(telegramId: number, username?: string): Promise<TelegramUser | null> {
  if (!supabase) return null;

  const { data: existing } = await supabase
    .from('telegram_users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (existing) {
    if (username && existing.username !== username) {
      await supabase.from('telegram_users').update({ username }).eq('telegram_id', telegramId);
    }
    return existing;
  }

  const referralCode = generateCode(8).toUpperCase();
  const { data: newUser, error } = await supabase
    .from('telegram_users')
    .insert({
      telegram_id: telegramId,
      username: username || null,
      referral_code: referralCode,
      notifications_enabled: true,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create user:', error);
    return null;
  }
  return newUser;
}

// =====================================================
// BLOCKCHAIN DATA
// =====================================================

async function getTokenBalance(walletAddress: string): Promise<{ balance: string; raw: bigint }> {
  if (!TOKEN_ADDRESS) return { balance: '0', raw: BigInt(0) };
  
  try {
    const paddedAddress = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    const result = await rpcCall('eth_call', [{ to: TOKEN_ADDRESS, data: `0x70a08231${paddedAddress}` }, 'latest']);
    if (result && result !== '0x') {
      const balance = BigInt(result);
      return { balance: formatNumber(Number(balance) / 1e18), raw: balance };
    }
  } catch (error) {
    console.error('Failed to get balance:', error);
  }
  return { balance: '0', raw: BigInt(0) };
}

async function getStakingData(walletAddress: string): Promise<{ staked: string; rewards: string } | null> {
  if (!STAKING_CONTRACT_ADDRESS) return null;
  
  try {
    const paddedAddress = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    
    const [stakedResult, earnedResult] = await Promise.all([
      rpcCall('eth_call', [{ to: STAKING_CONTRACT_ADDRESS, data: `0x70a08231${paddedAddress}` }, 'latest']),
      rpcCall('eth_call', [{ to: STAKING_CONTRACT_ADDRESS, data: `0x008cc262${paddedAddress}` }, 'latest']),
    ]);

    const stakedBalance = stakedResult ? BigInt(stakedResult) : BigInt(0);
    const earnedRewards = earnedResult ? BigInt(earnedResult) : BigInt(0);

    return {
      staked: formatNumber(Number(stakedBalance) / 1e18),
      rewards: (Number(earnedRewards) / 1e6).toFixed(4), // Assuming USDC rewards
    };
  } catch (error) {
    console.error('Failed to get staking data:', error);
    return null;
  }
}

async function getTokenPrice(): Promise<{ price: number; change24h: number; volume24h: number; marketCap: number } | null> {
  if (!TOKEN_ADDRESS) return null;
  
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`);
    const data = await response.json();
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      return {
        price: parseFloat(pair.priceUsd || '0'),
        change24h: parseFloat(pair.priceChange?.h24 || '0'),
        volume24h: parseFloat(pair.volume?.h24 || '0'),
        marketCap: parseFloat(pair.marketCap || '0'),
      };
    }
  } catch (error) {
    console.error('Failed to get price:', error);
  }
  return null;
}

async function getGasPrice(): Promise<string | null> {
  try {
    const result = await rpcCall('eth_gasPrice', []);
    if (result) {
      const gwei = Number(BigInt(result)) / 1e9;
      return gwei.toFixed(4);
    }
  } catch (error) {
    console.error('Failed to get gas:', error);
  }
  return null;
}

// =====================================================
// COMMAND HANDLERS
// =====================================================

async function handleStart(chatId: number, user: TelegramUser, args: string): Promise<void> {
  // Handle referral
  if (args && !user.referred_by && supabase) {
    const { data: referrer } = await supabase
      .from('telegram_users')
      .select('telegram_id')
      .eq('referral_code', args.toUpperCase())
      .single();
    
    if (referrer && referrer.telegram_id !== user.telegram_id) {
      await supabase.from('telegram_users').update({ referred_by: referrer.telegram_id }).eq('telegram_id', user.telegram_id);
      await supabase.from('telegram_referrals').insert({
        referrer_telegram_id: referrer.telegram_id,
        referred_telegram_id: user.telegram_id,
        referral_code: args.toUpperCase(),
        status: 'completed',
        completed_at: new Date().toISOString(),
      });
    }
  }

  const isLinked = !!user.wallet_address;
  let message = `Welcome to <b>${PROJECT_NAME} Bot</b>!\n\n`;
  
  if (isLinked) {
    message += `Wallet: <code>${shortenAddress(user.wallet_address!)}</code>\n\n`;
    message += `/portfolio - Your balance\n`;
    message += `/price - Token price\n`;
    message += `/help - All commands`;
  } else {
    message += `Use /link to connect your wallet\n`;
    message += `/help - See all commands`;
  }
  
  await sendMessage(chatId, message);
}

async function handleHelp(chatId: number): Promise<void> {
  const message = `<b>${PROJECT_NAME} Bot Commands</b>\n\n` +
    `<b>Account</b>\n` +
    `/link - Link wallet\n` +
    `/unlink - Unlink wallet\n` +
    `/notify - Toggle notifications\n\n` +
    `<b>Portfolio</b>\n` +
    `/portfolio - Token balance\n` +
    (STAKING_CONTRACT_ADDRESS ? `/staking - Staking status\n\n` : '\n') +
    `<b>Market</b>\n` +
    `/price - Token price\n` +
    `/gas - Gas price\n` +
    `/convert [amount] - To USD\n\n` +
    `<b>Alerts</b>\n` +
    `/alert above/below [price]\n` +
    `/alerts - View alerts\n` +
    `/deletealert [#]\n\n` +
    `<b>Watchlist</b>\n` +
    `/watch [address] [name]\n` +
    `/watchlist - View list\n` +
    `/unwatch [address]\n\n` +
    `<b>Referrals</b>\n` +
    `/refer - Your link\n` +
    `/referrals - Your invites\n\n` +
    `<b>Other</b>\n` +
    `/contract - Contract address\n` +
    `/faq - FAQ\n` +
    `/support [message]`;

  await sendMessage(chatId, message);
}

async function handleLink(chatId: number, telegramId: number, user: TelegramUser): Promise<void> {
  if (!supabase) {
    await sendMessage(chatId, 'Service unavailable.');
    return;
  }

  if (user.wallet_address) {
    await sendMessage(chatId, `Wallet already linked:\n<code>${user.wallet_address}</code>\n\nUse /unlink first.`);
    return;
  }

  const linkCode = generateCode(32);
  await supabase.from('telegram_users').update({ 
    link_code: linkCode, 
    link_code_expires: new Date(Date.now() + 15 * 60 * 1000).toISOString() 
  }).eq('telegram_id', telegramId);

  await sendMessage(chatId, `<a href="${PROJECT_URL}/link-telegram?code=${linkCode}">Click here to link your wallet</a>\n\nExpires in 15 minutes.`);
}

async function handleUnlink(chatId: number, telegramId: number, user: TelegramUser): Promise<void> {
  if (!supabase || !user.wallet_address) {
    await sendMessage(chatId, 'No wallet linked.');
    return;
  }

  await supabase.from('telegram_users').update({ wallet_address: null, linked_at: null }).eq('telegram_id', telegramId);
  await sendMessage(chatId, 'Wallet unlinked.');
}

async function handleNotify(chatId: number, telegramId: number, user: TelegramUser): Promise<void> {
  if (!supabase) return;

  const newState = !user.notifications_enabled;
  await supabase.from('telegram_users').update({ notifications_enabled: newState }).eq('telegram_id', telegramId);
  await sendMessage(chatId, newState ? 'Notifications enabled.' : 'Notifications disabled.');
}

async function handlePortfolio(chatId: number, user: TelegramUser): Promise<void> {
  if (!user.wallet_address) {
    await sendMessage(chatId, 'No wallet linked. Use /link first.');
    return;
  }

  const [{ balance, raw }, priceData] = await Promise.all([
    getTokenBalance(user.wallet_address),
    getTokenPrice(),
  ]);

  let usdValue = '';
  if (priceData && raw > BigInt(0)) {
    usdValue = ` (${formatUSD((Number(raw) / 1e18) * priceData.price)})`;
  }

  await sendMessage(chatId, `<b>Your Portfolio</b>\n\nBalance: ${balance}${usdValue}`);
}

async function handleStaking(chatId: number, user: TelegramUser): Promise<void> {
  if (!STAKING_CONTRACT_ADDRESS) {
    await sendMessage(chatId, 'Staking not configured.');
    return;
  }

  if (!user.wallet_address) {
    await sendMessage(chatId, 'No wallet linked. Use /link first.');
    return;
  }

  const data = await getStakingData(user.wallet_address);
  if (!data) {
    await sendMessage(chatId, 'Failed to fetch staking data.');
    return;
  }

  await sendMessage(chatId, `<b>Staking Status</b>\n\nStaked: ${data.staked}\nRewards: ${data.rewards}`);
}

async function handlePrice(chatId: number): Promise<void> {
  const priceData = await getTokenPrice();
  if (!priceData) {
    await sendMessage(chatId, 'Unable to fetch price.');
    return;
  }

  const changeEmoji = priceData.change24h >= 0 ? '📈' : '📉';
  const changeSign = priceData.change24h >= 0 ? '+' : '';

  await sendMessage(chatId,
    `<b>Token Price</b>\n\n` +
    `Price: $${formatNumber(priceData.price)}\n` +
    `${changeEmoji} 24h: ${changeSign}${priceData.change24h.toFixed(2)}%\n` +
    `Volume: ${formatUSD(priceData.volume24h)}\n` +
    `MCap: ${formatUSD(priceData.marketCap)}`
  );
}

async function handleGas(chatId: number): Promise<void> {
  const gas = await getGasPrice();
  await sendMessage(chatId, gas ? `Gas: ${gas} Gwei` : 'Unable to fetch gas.');
}

async function handleConvert(chatId: number, args: string): Promise<void> {
  const amount = parseFloat(args);
  if (isNaN(amount) || amount <= 0) {
    await sendMessage(chatId, 'Usage: /convert [amount]');
    return;
  }

  const priceData = await getTokenPrice();
  if (!priceData) {
    await sendMessage(chatId, 'Unable to fetch price.');
    return;
  }

  await sendMessage(chatId, `${formatNumber(amount)} = ${formatUSD(amount * priceData.price)}`);
}

async function handleAlert(chatId: number, telegramId: number, args: string): Promise<void> {
  if (!supabase) return;

  const parts = args.split(' ');
  if (parts.length < 2) {
    await sendMessage(chatId, 'Usage: /alert above 0.001');
    return;
  }

  const alertType = parts[0].toLowerCase();
  const targetPrice = parseFloat(parts[1]);

  if (!['above', 'below'].includes(alertType) || isNaN(targetPrice)) {
    await sendMessage(chatId, 'Invalid. Use: /alert above [price]');
    return;
  }

  const { count } = await supabase
    .from('telegram_price_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', telegramId)
    .eq('triggered', false);

  if ((count || 0) >= 5) {
    await sendMessage(chatId, 'Max 5 alerts. Delete some first.');
    return;
  }

  await supabase.from('telegram_price_alerts').insert({ telegram_id: telegramId, alert_type: alertType, target_price: targetPrice });
  await sendMessage(chatId, `Alert set: ${alertType} $${targetPrice}`);
}

async function handleAlerts(chatId: number, telegramId: number): Promise<void> {
  if (!supabase) return;

  const { data: alerts } = await supabase
    .from('telegram_price_alerts')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('triggered', false);

  if (!alerts?.length) {
    await sendMessage(chatId, 'No active alerts.');
    return;
  }

  let message = '<b>Your Alerts</b>\n\n';
  alerts.forEach((a, i) => {
    message += `${i + 1}. ${a.alert_type} $${a.target_price}\n`;
  });

  await sendMessage(chatId, message);
}

async function handleDeleteAlert(chatId: number, telegramId: number, args: string): Promise<void> {
  if (!supabase) return;

  const index = parseInt(args) - 1;
  const { data: alerts } = await supabase
    .from('telegram_price_alerts')
    .select('id')
    .eq('telegram_id', telegramId)
    .eq('triggered', false);

  if (!alerts || index < 0 || index >= alerts.length) {
    await sendMessage(chatId, 'Alert not found.');
    return;
  }

  await supabase.from('telegram_price_alerts').delete().eq('id', alerts[index].id);
  await sendMessage(chatId, 'Alert deleted.');
}

async function handleWatch(chatId: number, telegramId: number, args: string): Promise<void> {
  if (!supabase) return;

  const parts = args.split(' ');
  const address = parts[0];
  const nickname = parts.slice(1).join(' ') || null;

  if (!address?.startsWith('0x') || address.length !== 42) {
    await sendMessage(chatId, 'Usage: /watch [address] [name]');
    return;
  }

  const { count } = await supabase
    .from('telegram_watchlist')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', telegramId);

  if ((count || 0) >= 10) {
    await sendMessage(chatId, 'Max 10 wallets.');
    return;
  }

  await supabase.from('telegram_watchlist').upsert({ telegram_id: telegramId, wallet_address: address.toLowerCase(), nickname });
  await sendMessage(chatId, `Watching: ${nickname || shortenAddress(address)}`);
}

async function handleWatchlist(chatId: number, telegramId: number): Promise<void> {
  if (!supabase) return;

  const { data: wallets } = await supabase
    .from('telegram_watchlist')
    .select('*')
    .eq('telegram_id', telegramId);

  if (!wallets?.length) {
    await sendMessage(chatId, 'Watchlist empty.');
    return;
  }

  let message = '<b>Watchlist</b>\n\n';
  for (const w of wallets) {
    const { balance } = await getTokenBalance(w.wallet_address);
    message += `${w.nickname || shortenAddress(w.wallet_address)}: ${balance}\n`;
  }

  await sendMessage(chatId, message);
}

async function handleUnwatch(chatId: number, telegramId: number, args: string): Promise<void> {
  if (!supabase || !args?.startsWith('0x')) {
    await sendMessage(chatId, 'Usage: /unwatch [address]');
    return;
  }

  await supabase.from('telegram_watchlist').delete().eq('telegram_id', telegramId).eq('wallet_address', args.toLowerCase());
  await sendMessage(chatId, 'Removed.');
}

async function handleRefer(chatId: number, user: TelegramUser): Promise<void> {
  await sendMessage(chatId, `Your referral link:\n\nhttps://t.me/${BOT_USERNAME}?start=${user.referral_code}`);
}

async function handleReferrals(chatId: number, telegramId: number): Promise<void> {
  if (!supabase) return;

  const { count } = await supabase
    .from('telegram_referrals')
    .select('*', { count: 'exact', head: true })
    .eq('referrer_telegram_id', telegramId);

  await sendMessage(chatId, `Total referrals: ${count || 0}`);
}

async function handleContract(chatId: number): Promise<void> {
  await sendMessage(chatId, `<b>Contract</b>\n\n<code>${TOKEN_ADDRESS}</code>`);
}

async function handleFaq(chatId: number): Promise<void> {
  await sendMessage(chatId,
    `<b>FAQ</b>\n\n` +
    `<b>How do I link my wallet?</b>\n` +
    `Use /link and follow the instructions.\n\n` +
    `<b>How do alerts work?</b>\n` +
    `Set with /alert above [price]. You'll be notified when triggered.`
  );
}

async function handleSupport(chatId: number, telegramId: number, args: string): Promise<void> {
  if (!args || args.length < 5) {
    await sendMessage(chatId, 'Usage: /support [your message]');
    return;
  }

  if (supabase) {
    await supabase.from('telegram_support_tickets').insert({ telegram_id: telegramId, subject: 'Support', message: args });
  }

  await sendMessage(chatId, 'Support request submitted.');
}

// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Bot not configured' });
  }

  try {
    const update: TelegramUpdate = req.body;

    if (!update.message?.text) {
      return res.status(200).json({ ok: true });
    }

    const { message } = update;
    const chatId = message.chat.id;
    const telegramId = message.from.id;
    const username = message.from.username;
    const text = message.text.trim();

    const user = await getOrCreateUser(telegramId, username);
    if (!user) {
      await sendMessage(chatId, 'Service unavailable.');
      return res.status(200).json({ ok: true });
    }

    const [command, ...argParts] = text.split(' ');
    const args = argParts.join(' ');
    const cmd = command.toLowerCase();

    switch (cmd) {
      case '/start': await handleStart(chatId, user, args); break;
      case '/help': await handleHelp(chatId); break;
      case '/link': await handleLink(chatId, telegramId, user); break;
      case '/unlink': await handleUnlink(chatId, telegramId, user); break;
      case '/notify': await handleNotify(chatId, telegramId, user); break;
      case '/portfolio':
      case '/balance': await handlePortfolio(chatId, user); break;
      case '/staking': await handleStaking(chatId, user); break;
      case '/price': await handlePrice(chatId); break;
      case '/gas': await handleGas(chatId); break;
      case '/convert': await handleConvert(chatId, args); break;
      case '/alert': await handleAlert(chatId, telegramId, args); break;
      case '/alerts': await handleAlerts(chatId, telegramId); break;
      case '/deletealert': await handleDeleteAlert(chatId, telegramId, args); break;
      case '/watch': await handleWatch(chatId, telegramId, args); break;
      case '/watchlist': await handleWatchlist(chatId, telegramId); break;
      case '/unwatch': await handleUnwatch(chatId, telegramId, args); break;
      case '/refer': await handleRefer(chatId, user); break;
      case '/referrals': await handleReferrals(chatId, telegramId); break;
      case '/contract': await handleContract(chatId); break;
      case '/faq': await handleFaq(chatId); break;
      case '/support': await handleSupport(chatId, telegramId, args); break;
      default:
        if (text.startsWith('/')) {
          await sendMessage(chatId, 'Unknown command. Use /help');
        }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ ok: true });
  }
}
