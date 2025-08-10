// /api/create-checkout-session.js
import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // sk_live_xxx från Stripe

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Endast POST tillåten' });
  }

  try {
    const { items, method, customer } = req.body;

    // Skapa orderobjekt
    const orderData = {
      id: `order_${Date.now()}`,
      date: new Date().toISOString(),
      customer,
      items,
      method,
      status: 'pending_payment'
    };

    // Loggfil (lokal – byt till extern databas i produktion)
    const logFile = path.join('/tmp', 'orders.json');
    let existingOrders = [];
    if (fs.existsSync(logFile)) {
      existingOrders = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    }
    existingOrders.push(orderData);
    fs.writeFileSync(logFile, JSON.stringify(existingOrders, null, 2));

    // Omvandla till Stripe format
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'sek',
        product_data: { name: item.name },
        unit_amount: item.price * 100,
      },
      quantity: item.quantity,
    }));

    // Betalmetod
    let paymentMethods = [];
    if (method === 'card') paymentMethods = ['card'];
    if (method === 'klarna') paymentMethods = ['klarna'];
    if (method === 'swish') paymentMethods = ['swish'];

    // Skapa Stripe Checkout-session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: paymentMethods,
      line_items: lineItems,
      mode: 'payment',
      success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/cancel.html`,
      metadata: { order_id: orderData.id }
    });

    res.status(200).json({ id: session.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kunde inte skapa checkout-session' });
  }
}
