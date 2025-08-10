// /api/create-checkout-session.js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // sk_live_xxx från Stripe

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Endast POST tillåten' });
  }

  try {
    const { items, method } = req.body;

    // Omvandla varor till Stripe line items
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'sek',
        product_data: { name: item.name },
        unit_amount: item.price * 100, // kronor → ören
      },
      quantity: item.quantity,
    }));

    // Bestäm betalmetod(er) baserat på vad användaren valde
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
    });

    res.status(200).json({ id: session.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kunde inte skapa checkout-session' });
  }
}
