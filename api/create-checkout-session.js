// api/create-checkout-session.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'sek',
          product_data: { name: 'Mindre Lifah' },
          unit_amount: 5000, // pris i öre
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://treeoflifa.se/success.html',
      cancel_url: 'https://treeoflifa.se/cancel.html',
    });

    res.status(200).json({ id: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
