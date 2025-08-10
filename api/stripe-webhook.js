import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false } // Viktigt för att verifiera webhook-signatur
};

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);

  try {
    const event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata.order_id;

      // Läs befintliga ordrar
      const logFile = path.join(process.cwd(), 'orders.json');
      let orders = JSON.parse(fs.readFileSync(logFile, 'utf8'));

      // Uppdatera status
      orders = orders.map(o => o.id === orderId ? { ...o, status: 'paid' } : o);
      fs.writeFileSync(logFile, JSON.stringify(orders, null, 2));

      console.log(`Order ${orderId} markerad som betald`);
    }

    res.status(200).end();

  } catch (err) {
    console.error(err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
}

// Helper för att läsa rå body
function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
