# TreeOfLifa 🌿

E-commerce platform for natural loofah sponges and coconut scrubs.

## 🔒 Security Setup

### Initial Setup After Cloning

1. **Create Environment Variables File**
   ```bash
   cp .env.example .env
   ```

2. **Configure Your Keys** (Edit `.env` file)
   - Get Stripe keys from: https://dashboard.stripe.com/apikeys
   - Get PayPal credentials from: https://developer.paypal.com/
   - Generate Gmail app password: https://myaccount.google.com/apppasswords
   - Create a strong random ADMIN_KEY

3. **Configure Frontend Keys**
   - Edit `config.js` with your actual publishable keys
   - **IMPORTANT:** `config.js` should be generated during deployment, not committed to git

### Deployment Configuration

#### Vercel Environment Variables
Set these in your Vercel project settings:

**Required:**
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYPAL_CLIENT_ID`
- `GMAIL_APP_PASSWORD`
- `ADMIN_KEY`
- `API_BASE_URL`
- `NODE_ENV=production`

#### Build Command for config.js
Add to your build process to generate `config.js`:
```bash
echo "window.APP_CONFIG = { STRIPE_PUBLISHABLE_KEY: '$STRIPE_PUBLISHABLE_KEY', PAYPAL_CLIENT_ID: '$PAYPAL_CLIENT_ID', API_BASE_URL: '$API_BASE_URL' };" > config.js
```

## 🚨 Security Best Practices

### DO NOT commit:
- `.env` files
- `config.js` with real values
- `inventory.json` or `orders.json`
- Any files containing API keys or secrets

### Key Rotation Schedule
- **Stripe Keys:** Rotate every 6 months or immediately if compromised
- **Admin Keys:** Change quarterly
- **Gmail App Password:** Regenerate if suspicious activity detected

### If Your Repository Was Public
1. **Immediately rotate ALL credentials:**
   - Generate new Stripe keys
   - Create new PayPal credentials
   - Generate new Gmail app password
   - Create new ADMIN_KEY

2. **Check Stripe Dashboard** for unauthorized charges

3. **Monitor logs** for suspicious activity

4. **Review git history** and use tools like:
   ```bash
   git log --all --full-history -- "*config*" "*env*"
   ```

## 🛡️ Security Features

### Rate Limiting
- Payment endpoints: 10 requests/minute per IP
- Admin endpoints: 5 requests/minute per IP
- Automatic IP-based throttling

### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Additional Protections
- CORS restrictions
- Brute-force delay on admin authentication
- Webhook signature verification
- Input validation on all endpoints

## 📦 Installation

```bash
npm install
```

## 🚀 Running Locally

```bash
npm start
# or for development:
npm run dev
```

## 📧 Support

For security issues, contact: tree.of.liifa@gmail.com

## ⚠️ Important Notes

- Never share your `.env` file
- Never commit sensitive credentials to git
- Use environment variables for ALL secrets
- Keep your dependencies updated
- Review logs regularly for security issues

---

**Last Updated:** November 25, 2025
