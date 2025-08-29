// /api/create-payment-intent endpoint
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, customer, items, metadata } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      customer: customer.email, // You might want to create a customer first
      metadata,
    });

    res.json({
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
