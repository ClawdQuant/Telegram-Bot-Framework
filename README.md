# Telegram Bot Framework for Web3

A full-featured Telegram bot framework for crypto/Web3 projects. Built with TypeScript, Vercel serverless functions, and Supabase.

## Features

- **Wallet Linking** - Secure wallet verification via signature
- **Portfolio Tracking** - Check token balances and staking status
- **Price Alerts** - Get notified when price hits your target
- **Whale Watchlist** - Track up to 10 wallets
- **Referral System** - Built-in referral tracking
- **Support Tickets** - User support system
- **Gas Tracker** - Check network gas prices
- **Leaderboards** - Top holders and stakers

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/link` | Link your wallet |
| `/unlink` | Unlink wallet |
| `/portfolio` | View token balance |
| `/staking` | View staking status |
| `/price` | Current token price |
| `/alert above/below [price]` | Set price alert |
| `/alerts` | View your alerts |
| `/watch [address]` | Track a wallet |
| `/watchlist` | View tracked wallets |
| `/refer` | Get referral link |
| `/gas` | Network gas price |
| `/convert [amount]` | Token to USD |
| `/contract` | Contract address |
| `/faq` | FAQ |
| `/support [message]` | Submit support ticket |

## Quick Start

### 1. Prerequisites

- [Vercel](https://vercel.com) account
- [Supabase](https://supabase.com) project
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### 2. Setup

```bash
# Clone the repo
git clone https://github.com/ClawdQuant/Telegram-Bot-Framework.git
cd Telegram-Bot-Framework

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### 3. Configure Environment

Edit `.env` with your values:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
TOKEN_ADDRESS=your_token_contract
STAKING_CONTRACT_ADDRESS=your_staking_contract (optional)
```

### 4. Setup Database

Run the SQL in `database/schema.sql` in your Supabase SQL Editor.

### 5. Deploy

```bash
# Deploy to Vercel
vercel --prod
```

### 6. Set Webhook

Visit: `https://your-domain.vercel.app/api/telegram/set-webhook`

## Project Structure

```
├── api/
│   ├── telegram/
│   │   ├── webhook.ts      # Main bot handler
│   │   ├── set-webhook.ts  # Webhook registration
│   │   └── verify-link.ts  # Wallet verification
│   └── cron/
│       └── check-alerts.ts # Price alert cron job
├── database/
│   └── schema.sql          # Supabase tables
├── src/
│   └── pages/
│       └── LinkWallet.tsx  # Wallet linking page (React)
└── vercel.json             # Vercel config with cron
```

## Customization

### Add Your Token

In `api/telegram/webhook.ts`, update:

```typescript
const TOKEN_ADDRESS = 'your_token_address';
const STAKING_CONTRACT_ADDRESS = 'your_staking_address'; // optional
```

### Add Commands

Add new command handlers in `webhook.ts`:

```typescript
async function handleMyCommand(chatId: number, user: TelegramUser): Promise<void> {
  await sendMessage(chatId, 'Your response here');
}

// In the switch statement:
case '/mycommand':
  await handleMyCommand(chatId, user);
  break;
```

### Customize Messages

All bot messages are in plain text with HTML formatting. Edit the strings in each handler function.

## API Reference

### Webhook Endpoint
`POST /api/telegram/webhook`

Receives updates from Telegram.

### Set Webhook
`GET /api/telegram/set-webhook`

Registers webhook URL with Telegram.

### Verify Wallet Link
`POST /api/telegram/verify-link`

```json
{
  "code": "link_code",
  "walletAddress": "0x...",
  "signature": "signed_message"
}
```

## Cron Jobs

Configure in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-alerts",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

## License

MIT License - feel free to use for your project!

## Credits

Built by [ClawdQuant](https://clawdquant.com)

---

Questions? Open an issue or join our [Telegram](https://t.me/ClawdQuant).
