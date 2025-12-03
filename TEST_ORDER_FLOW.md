# Test Order Flow Guide

## 🧪 Complete Order Flow Testing

### Prerequisites
- Your site is live at: https://treeoflifa.se or https://treeoflifa-production.up.railway.app
- Stripe is configured with your keys (currently using LIVE keys - see note below)

---

## ⚠️ IMPORTANT: Test vs Live Mode

**You are currently using LIVE Stripe keys!** This means:
- Real cards will be charged real money
- To test safely, you need to switch to TEST mode keys

### How to Switch to Test Mode:

1. **Get your TEST keys from Stripe:**
   - Go to https://dashboard.stripe.com/test/apikeys
   - Copy your **Publishable key** (starts with `pk_test_`)
   - Copy your **Secret key** (starts with `sk_test_`)

2. **Update Railway environment variables:**
   - Go to Railway dashboard → Your project → Variables
   - Update `STRIPE_SECRET_KEY` to your TEST secret key
   - Update `STRIPE_WEBHOOK_SECRET` if you have webhook configured for test mode

3. **Update config.js:**
   - Replace the `pk_live_` key with your `pk_test_` key
   - Commit and push the change

---

## 🎯 Test Card Numbers (Stripe Test Mode Only)

### ✅ Successful Payment Cards

| Card Number | Description | CVC | Expiry | ZIP |
|------------|-------------|-----|--------|-----|
| `4242 4242 4242 4242` | Visa - Always succeeds | Any 3 digits | Any future date | Any 5 digits |
| `5555 5555 5555 4444` | Mastercard - Always succeeds | Any 3 digits | Any future date | Any 5 digits |
| `3782 822463 10005` | Amex - Always succeeds | Any 4 digits | Any future date | Any 5 digits |

### ❌ Test Card for Declined Payment

| Card Number | Description | CVC | Expiry | ZIP |
|------------|-------------|-----|--------|-----|
| `4000 0000 0000 0002` | Visa - Card declined | Any 3 digits | Any future date | Any 5 digits |
| `4000 0000 0000 9995` | Visa - Insufficient funds | Any 3 digits | Any future date | Any 5 digits |

### 🔐 Test 3D Secure (Authentication Required)

| Card Number | Description | CVC | Expiry | ZIP |
|------------|-------------|-----|--------|-----|
| `4000 0025 0000 3155` | Requires 3D Secure authentication | Any 3 digits | Any future date | Any 5 digits |

**Note:** For 3D Secure test cards, Stripe will show a test authentication modal. Click "Complete" to approve or "Fail" to decline.

---

## 📋 Complete Test Flow Steps

### Test 1: Successful Order with Email Confirmation

1. **Add products to cart:**
   - Open your site: https://treeoflifa.se
   - Click "Lägg i kundvagn" on 2-3 products
   - Verify cart count updates in header

2. **View cart:**
   - Click cart icon (🛒)
   - Verify products are listed
   - Test quantity buttons (+/-)
   - Check total calculation (subtotal + 49 kr shipping)

3. **Go to checkout:**
   - Click "Gå till kassan"
   - Checkout modal should open

4. **Fill in customer information:**
   ```
   Namn: Test Testsson
   Adress: Testgatan 123
   Postnummer: 12345
   Stad: Stockholm
   E-post: your.real.email@gmail.com  (use YOUR email to get confirmation)
   Telefon: 0701234567
   ```

5. **Select payment method:**
   - Click "Kort (Visa, Mastercard, Amex)"
   - Card input fields should appear

6. **Enter test card:**
   - Card number: `4242 4242 4242 4242`
   - Expiry: `12/25` (any future date)
   - CVC: `123`
   - Name: `Test Testsson`

7. **Submit order:**
   - Click "Slutför beställning"
   - Should see "Behandlar kortbetalning..." spinner
   - Wait for success message

8. **Verify success:**
   - ✅ Success message appears with order number
   - ✅ Cart is emptied
   - ✅ Checkout modal closes
   - ✅ Email confirmation sent to your email

9. **Check email:**
   - Look for email from TreeOfLifa
   - Subject: "Orderbekräftelse - TreeOfLifa"
   - Verify order details, products, total, delivery address

10. **Check Stripe Dashboard:**
    - Go to https://dashboard.stripe.com/test/payments (or /payments for live)
    - Verify payment appears with correct amount
    - Check customer details

---

### Test 2: Declined Card

1. Add products to cart
2. Go to checkout
3. Fill in customer info
4. Use card: `4000 0000 0000 0002`
5. Click "Slutför beställning"
6. **Expected result:**
   - ❌ Error message: "Kortbetalning misslyckades"
   - Cart remains intact
   - No email sent
   - User can try again

---

### Test 3: 3D Secure Authentication

1. Add products to cart
2. Go to checkout
3. Fill in customer info
4. Use card: `4000 0025 0000 3155`
5. Click "Slutför beställning"
6. **Expected result:**
   - Stripe 3D Secure modal appears
   - Click "Complete authentication" to approve
   - Order completes successfully
   - Email confirmation sent

---

### Test 4: Out of Stock Product

1. Try to add "Större Lifah" to cart (currently 0 in stock)
2. **Expected result:**
   - ❌ Alert: "Tyvärr, denna produkt är tillfälligt slut i lager"
   - Product not added to cart

---

### Test 5: Cart Abandonment (Analytics)

1. Add products to cart
2. Go to checkout
3. Fill in some customer info
4. Close checkout modal without completing
5. **Expected result:**
   - Analytics tracks "checkout_abandoned"
   - Data appears in analytics dashboard

---

### Test 6: Swish Payment

1. Add products to cart
2. Go to checkout
3. Fill in customer info
4. Select "Swish"
5. **Expected result:**
   - Shows Swish payment instructions
   - Number: 123 164 91 77
   - Message shows order ID
   - Can manually verify payment

---

## 🐛 Troubleshooting

### No Email Received?

1. **Check spam folder**
2. **Verify email in Railway logs:**
   - Railway dashboard → Deployments → Logs
   - Search for: "📧 Confirmation email sent"
3. **Check EmailJS dashboard:**
   - https://dashboard.emailjs.com/admin
   - Verify email quota not exceeded
   - Check email history

### Payment Fails Immediately?

1. **Check browser console** for errors (F12 → Console tab)
2. **Verify Stripe keys** are correct in Railway and config.js
3. **Check Railway logs** for error messages
4. **Verify inventory:** Product might be out of stock

### Order Confirmation Shows But No Email?

- Check Railway logs for EmailJS errors
- Verify EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, EMAIL_PUBLIC_KEY are set in Railway

---

## 📊 What to Monitor

### Browser Console (F12):
- ✅ "✓ Payment intent created successfully"
- ✅ "📊 Analytics: session_start"
- ✅ "📊 Analytics: add_to_cart"
- ❌ Any red error messages

### Railway Server Logs:
- ✅ "💳 Payment intent created"
- ✅ "✅ Payment successful"
- ✅ "📧 Confirmation email sent"
- ✅ "📊 Analytics saved"
- ✅ "🔔 Webhook received: payment_intent.succeeded"

### Stripe Dashboard:
- Check payment appears
- Verify correct amount (subtotal + 49 SEK shipping)
- Check customer metadata

### Email Inbox:
- Confirmation email with order details
- Professional formatting
- All product info correct

---

## 🎬 Quick Test Script

Run this complete flow in 2 minutes:

```
1. Visit site → Add 2 products → View cart ✓
2. Checkout → Fill form with YOUR email ✓
3. Card: 4242 4242 4242 4242 | 12/25 | 123 ✓
4. Submit → Wait for success message ✓
5. Check email for confirmation ✓
6. Check Stripe dashboard for payment ✓
7. Done! 🎉
```

---

## 🔄 Switch Back to Live Mode

After testing, remember to:
1. Switch Stripe keys back to LIVE mode in Railway
2. Update config.js with `pk_live_` key
3. Test one more time with a real card (small amount)
4. You're ready for production! 🚀

---

## 📞 Need Help?

If something doesn't work:
1. Check Railway logs first
2. Check browser console
3. Verify all environment variables are set
4. Check Stripe dashboard for webhook errors
5. Let me know and I'll help debug!
