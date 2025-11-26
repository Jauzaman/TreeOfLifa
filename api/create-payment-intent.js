
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // Secure CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://treeoflifa.se');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const { amount, currency = 'sek', customer, metadata } = req.body;

    // Validate required fields
    if (!amount || amount < 1 || !customer?.name || !customer?.email) {
      return res.status(400).json({ error: 'Missing required payment or customer info' });
    }

    console.log('Creating payment intent for amount:', amount);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // SEK i ören
      currency,
      metadata,
      receipt_email: customer.email,
      shipping: {
        name: customer.name,
        address: customer.address
      },
      automatic_payment_methods: {
        enabled: true,
      }
    });

    console.log('Payment intent created successfully');

    res.json({
      clientSecret: paymentIntent.client_secret
    });

  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
};