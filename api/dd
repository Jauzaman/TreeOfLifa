// Importera paket
const express = require("express");
const Stripe = require("stripe");
const cors = require("cors");


// Skapa Express-app
const app = express();

// Anslut till Stripe med din test secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// ----- ROUTER FÖR BETALNINGAR ----- //

// Stripe Checkout (riktig betalning med testnyckel)
app.post("/api/checkout-stripe", async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items: req.body.items.map(item => ({
                price_data: {
                    currency: "sek",
                    product_data: { name: item.name },
                    unit_amount: item.price * 100, // öre
                },
                quantity: item.quantity,
            })),
            success_url: "https://tree-of-lifa.vercel.app/success.html",
            cancel_url: "https://tree-of-lifa.vercel.app/cancel.html",
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error("Stripe error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Klarna (simulerad)
app.post("/api/checkout-klarna", (req, res) => {
    res.json({ redirectUrl: "https://www.klarna.com/se/" });
});

// Swish (simulerad)
app.post("/api/checkout-swish", (req, res) => {
    res.json({ message: "Swish-betalning initierad (simulerad)" });
});

// Starta servern
app.listen(3000, () => {
    console.log("✅ Server körs på http://localhost:3000");
});
