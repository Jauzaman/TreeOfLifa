// Start Express server
// Längst upp i filen, före andra imports
require('dotenv').config();
const express = require("express");
const app = express();
// ...existing code...
// Serve static files from project root (for favicon, images, etc.)
app.use(express.static(__dirname));
// --- EMAIL CONFIRMATION SYSTEM ---
const emailConfirmations = new Map(); // email -> { code, expires }

function generateConfirmationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

// Endpoint to request email confirmation code
app.post('/api/request-email-confirmation', async (req, res) => {
    const { email } = req.body;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Ogiltig e-postadress' });
    }
    const code = generateConfirmationCode();
    const expires = Date.now() + 10 * 60 * 1000; // 10 min
    emailConfirmations.set(email, { code, expires });
    try {
        await transporter.sendMail({
            from: 'tree.of.liifa@gmail.com',
            to: email,
            subject: 'Din bekräftelsekod',
            html: `<p>Din bekräftelsekod är: <b>${code}</b></p><p>Koden är giltig i 10 minuter.</p>`
        });
        res.json({ message: 'Bekräftelsekod skickad till e-post.' });
    } catch (error) {
        res.status(500).json({ error: 'Kunde inte skicka e-post.' });
    }
});

// Endpoint to verify code
app.post('/api/verify-email-confirmation', (req, res) => {
    const { email, code } = req.body;
    const entry = emailConfirmations.get(email);
    if (!entry || entry.expires < Date.now()) {
        return res.status(400).json({ error: 'Koden har gått ut eller saknas.' });
    }
    if (entry.code !== code) {
        return res.status(400).json({ error: 'Felaktig kod.' });
    }
    // Mark email as confirmed
    emailConfirmations.set(email, { ...entry, confirmed: true });
    res.json({ message: 'E-post bekräftad.' });
});

function isEmailConfirmed(email) {
    const entry = emailConfirmations.get(email);
    return entry && entry.confirmed && entry.expires > Date.now();
}

// --- Ensure server starts and logs errors for Railway ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('uncaughtException', err => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
    console.error('Unhandled Rejection:', err);
});
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require('fs').promises;
const path = require('path');

// Handle CORS preflight requests for all API routes
app.options('*', (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,stripe-signature');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(204);
});

// Simple rate limiting (in-memory - for production use Redis)
const rateLimitMap = new Map();

const corsOptions = {
    origin: [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature']
};

app.use(cors(corsOptions));

// Middleware för webhook (måste vara före express.json())
app.use('/webhook', express.raw({ type: 'application/json' }));

// Vanlig JSON middleware för andra routes
app.use(express.json({ limit: '10mb' }));

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Explicitly allow CORS for all API responses
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    next();
});

// Simple rate limiting middleware
function rateLimit(maxRequests, windowMs) {
    return (req, res, next) => {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const now = Date.now();
        
        if (!rateLimitMap.has(ip)) {
            rateLimitMap.set(ip, []);
        }
        
        const requests = rateLimitMap.get(ip).filter(time => now - time < windowMs);
        
        if (requests.length >= maxRequests) {
            return res.status(429).json({ 
                error: 'För många förfrågningar. Försök igen senare.',
                type: 'rate_limit_exceeded'
            });
        }
        
        requests.push(now);
        rateLimitMap.set(ip, requests);
        next();
    };
}

// Clean up rate limit map every hour
setInterval(() => {
    const now = Date.now();
    for (const [ip, requests] of rateLimitMap.entries()) {
        const validRequests = requests.filter(time => now - time < 3600000);
        if (validRequests.length === 0) {
            rateLimitMap.delete(ip);
        } else {
            rateLimitMap.set(ip, validRequests);
        }
    }
}, 3600000);

// Trust Railway proxy headers (IMPORTANT for HTTPS)
app.set('trust proxy', 1);

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// LAGERSYSTEM - Håll lagerstatus i minnet (i produktion: använd databas)
let inventory = {
    'Mindre Lifah': { stock: 25, reserved: 0 },
    'Större Lifah': { stock: 15, reserved: 0 },
    'Aleppotvål': { stock: 30, reserved: 0 },
    'Presentset': { stock: 10, reserved: 0 },
    'Kokosskrubb': { stock: 12, reserved: 0 },
    'Lifa Handske': { stock: 3, reserved: 0 },
    'Tvålunderlägg Lifa': { stock: 50, reserved: 0 }
};

// Spara/läs lagerstatus från fil (för persistens)
const INVENTORY_FILE = 'inventory.json';

async function saveInventory() {
    try {
        await fs.writeFile(INVENTORY_FILE, JSON.stringify(inventory, null, 2));
        console.log('💾 Lager sparat');
    } catch (error) {
        console.error('Fel vid sparande av lager:', error);
    }
}

async function loadInventory() {
    try {
        const data = await fs.readFile(INVENTORY_FILE, 'utf8');
        inventory = JSON.parse(data);
        console.log('📦 Lager laddat:', inventory);
    } catch (error) {
        console.log('⚠️ Kunde inte ladda lager, använder standardvärden');
        await saveInventory();
    }
}

// Reservera produkter (när kund går till kassan)
function reserveItems(items) {
    const reservationId = 'RES-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    const reserved = [];
    
    try {
        // Kontrollera att alla produkter finns i lager
        for (const item of items) {
            console.log('Checking inventory for:', item.name, 'Available inventory keys:', Object.keys(inventory));
            
            if (!inventory[item.name]) {
                throw new Error(`Produkt "${item.name}" finns inte i lagersystemet. Tillgängliga produkter: ${Object.keys(inventory).join(', ')}`);
            }
            
            const available = inventory[item.name].stock - inventory[item.name].reserved;
            if (available < item.quantity) {
                throw new Error(`Inte tillräckligt med ${item.name} i lager. Tillgängligt: ${available}`);
            }
        }
        
        // Reservera alla produkter
        for (const item of items) {
            inventory[item.name].reserved += item.quantity;
            reserved.push({ name: item.name, quantity: item.quantity });
        }
        
        console.log('🔒 Produkter reserverade:', reservationId, reserved);
        saveInventory();
        
        // Ta bort reservation efter 15 minuter om ingen betalning sker
        setTimeout(() => {
            releaseReservation(reservationId, reserved);
        }, 15 * 60 * 1000);
        
        return { reservationId, reserved };
        
    } catch (error) {
        // Frigör eventuellt reserverade produkter vid fel
        for (const item of reserved) {
            inventory[item.name].reserved -= item.quantity;
        }
        throw error;
    }
}

// Frigör reservation
function releaseReservation(reservationId, reservedItems) {
    try {
        for (const item of reservedItems) {
            if (inventory[item.name]) {
                inventory[item.name].reserved = Math.max(0, 
                    inventory[item.name].reserved - item.quantity
                );
            }
        }
        console.log('🔓 Reservation frigjord:', reservationId);
        saveInventory();
    } catch (error) {
        console.error('Fel vid frigivning av reservation:', error);
    }
}

// Slutför köp (minska faktiskt lager)
function completeOrder(reservedItems) {
    try {
        for (const item of reservedItems) {
            if (inventory[item.name]) {
                inventory[item.name].stock -= item.quantity;
                inventory[item.name].reserved = Math.max(0, 
                    inventory[item.name].reserved - item.quantity
                );
            }
        }
        console.log('✅ Order slutförd, lager uppdaterat');
        saveInventory();
    } catch (error) {
        console.error('Fel vid slutförande av order:', error);
    }
}

// Konfigurera Gmail SMTP transport
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // TLS (not SSL)
    auth: {
        user: 'tree.of.liifa@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
});

// ----- LAGER-API ENDPOINTS ----- //

// Hämta aktuell lagerstatus
app.get('/api/inventory', (req, res) => {
    const publicInventory = {};
    
    for (const [productName, data] of Object.entries(inventory)) {
        const available = data.stock - data.reserved;
        publicInventory[productName] = {
            available: Math.max(0, available),
            inStock: available > 0,
            lowStock: available > 0 && available <= 5
        };
    }
    
    // Explicitly allow CORS for this endpoint
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,stripe-signature');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.json(publicInventory);
});

// Uppdatera lager (admin endpoint) - Protected with rate limiting
app.post('/api/inventory/update', rateLimit(5, 60000), (req, res) => {
    try {
        const { productName, newStock, adminKey } = req.body;
        
        // Enkel admin-autentisering (i produktion: använd proper auth)
        if (adminKey !== process.env.ADMIN_KEY) {
            // Add delay to prevent brute force
            setTimeout(() => {
                return res.status(401).json({ error: 'Ogiltig admin-nyckel' });
            }, 2000);
            return;
        }
        
        if (!inventory[productName]) {
            return res.status(404).json({ error: 'Produkten finns inte' });
        }
        
        inventory[productName].stock = parseInt(newStock);
        saveInventory();
        
        res.json({ 
            message: 'Lager uppdaterat',
            product: productName,
            newStock: inventory[productName].stock
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Fel vid uppdatering av lager' });
    }
});

// ----- BETALNINGS-API ENDPOINTS ----- //

// UPPDATERAD: Payment Intent med lagerreservation
app.post("/api/create-payment-intent", async (req, res) => {
    try {
        const { amount, currency, customer, items, metadata } = req.body;

        // Validering
        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                error: 'Ogiltigt belopp',
                type: 'validation_error'
            });
        }

        if (!customer?.name || !customer?.email) {
            return res.status(400).json({ 
                error: 'Kunduppgifter saknas',
                type: 'validation_error'
            });
        }


        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ 
                error: 'Inga produkter specificerade',
                type: 'validation_error'
            });
        }

        // NYTT: Kontrollera och reservera lager
        try {
            const reservation = reserveItems(items);
            console.log('Creating payment intent for amount:', amount, 'SEK');
            
            const paymentIntentData = {
                amount: Math.round(amount * 100), // Konvertera till öre
                currency: currency || 'sek',
                automatic_payment_methods: {
                    enabled: true,
                },
                metadata: {
                    orderId: metadata?.orderId || 'ORD-' + Date.now(),
                    reservationId: reservation.reservationId,
                    customerName: customer.name,
                    customerEmail: customer.email,
                    // ...add other metadata fields as needed...
                }
            };
            // Lägg till shipping om adress finns
            if (customer.address) {
                paymentIntentData.shipping = {
                    name: customer.name,
                    address: {
                        line1: customer.address.line1,
                        postal_code: customer.address.postal_code,
                        city: customer.address.city,
                        country: customer.address.country || 'SE'
                    }
                };
            }
            const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
            console.log('✅ Payment intent skapad:', paymentIntent.id);
            res.json({ 
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                reservationId: reservation.reservationId
            });
        } catch (inventoryError) {
            console.error('Lagerfel:', inventoryError.message);
            return res.status(400).json({
                error: inventoryError.message,
                type: 'inventory_error'
            });
        }
    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({ 
            error: 'Failed to process order',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Webhook endpoint för Stripe events (UPPDATERAD med lagerhantering)
app.post('/webhook', (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            console.log('⚠️  Webhook secret inte konfigurerad');
            return response.status(400).send('Webhook secret saknas');
        }

        event = stripe.webhooks.constructEvent(
            request.body, 
            sig, 
            process.env.STRIPE_WEBHOOK_SECRET
        );
        
    } catch (err) {
        console.log(`⚠ Webhook signature verification failed:`, err.message);
        return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('📨 Webhook mottagen:', event.type);

    // Hantera eventet
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('✅ PaymentIntent lyckades!', paymentIntent.id);
            console.log('📦 Order:', paymentIntent.metadata.orderId);
            
            // Slutför lagertransaktionen
            if (paymentIntent.metadata.items && paymentIntent.metadata.reservationId) {
                try {
                    const items = JSON.parse(paymentIntent.metadata.items);
                    completeOrder(items);
                } catch (error) {
                    console.error('Fel vid slutförande av lager:', error);
                }
            }
            
            handleSuccessfulPayment(paymentIntent);
            break;
            
        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled':
            const failedPayment = event.data.object;
            console.log('⚠ PaymentIntent misslyckades/avbruten:', failedPayment.id);
            
            // Frigör reservation vid misslyckad betalning
            if (failedPayment.metadata.reservationId && failedPayment.metadata.items) {
                try {
                    const items = JSON.parse(failedPayment.metadata.items);
                    releaseReservation(failedPayment.metadata.reservationId, items);
                } catch (error) {
                    console.error('Fel vid frigivning av reservation:', error);
                }
            }
            break;
            
        default:
            console.log(`ℹ️  Ohanterat event type: ${event.type}`);
    }

    response.json({ received: true });
});

// Hantera lyckad betalning
async function handleSuccessfulPayment(paymentIntent) {
    try {
        const customerAddress = paymentIntent.metadata.customerAddress ? 
            JSON.parse(paymentIntent.metadata.customerAddress) : {};
        const orderData = {
            orderId: paymentIntent.metadata.orderId,
            transactionId: paymentIntent.id,
            amount: paymentIntent.amount / 100,
            customer: {
                name: paymentIntent.metadata.customerName,
                email: paymentIntent.metadata.customerEmail,
                phone: paymentIntent.metadata.customerPhone,
                address: customerAddress.address || '',
                postalCode: customerAddress.postalCode || '',
                city: customerAddress.city || ''
            },
            items: JSON.parse(paymentIntent.metadata.items || '[]'),
            timestamp: paymentIntent.metadata.timestamp,
            paymentMethod: 'card',
            subtotal: (paymentIntent.amount / 100) - 49,
            shipping: 49,
            total: paymentIntent.amount / 100
        };

        // Send confirmation email to customer
        if (orderData.customer.email) {
            const itemList = orderData.items.map(item => `<li>${item.quantity} x ${item.name}</li>`).join('');
            const mailOptions = {
                from: 'tree.of.liifa@gmail.com',
                to: orderData.customer.email,
                subject: `Orderbekräftelse - ${orderData.orderId}`,
                html: `<h2>Tack för din beställning!</h2>
                    <p>Ordernummer: <b>${orderData.orderId}</b></p>
                    <p>Produkter:</p>
                    <ul>${itemList}</ul>
                    <p>Totalt: <b>${orderData.total} SEK</b></p>
                    <p>Leveransadress: ${orderData.customer.address}, ${orderData.customer.postalCode} ${orderData.customer.city}</p>
                    <p>Vi skickar din order så snart som möjligt!</p>`
            };
            try {
                await transporter.sendMail(mailOptions);
                console.log('📧 Orderbekräftelse skickad till:', orderData.customer.email);
            } catch (mailError) {
                console.error('⚠ Fel vid skickande av orderbekräftelse:', mailError);
            }
        }

        // Använd befintlig email-funktion (order API)
        try {
            await fetch(`${process.env.APP_URL || 'http://localhost:3001'}/api/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
        } catch (apiError) {
            console.error('⚠ Fel vid POST till order-API:', apiError);
        }
    } catch (error) {
        console.error('⚠ Fel vid hantering av lyckad betalning:', error);
    }
}

// Health check endpoint (UPPDATERAD)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        stripe_configured: !!process.env.STRIPE_SECRET_KEY,
        webhook_configured: !!process.env.STRIPE_WEBHOOK_SECRET,
        email_configured: !!process.env.GMAIL_APP_PASSWORD,
        inventory_loaded: !!inventory,
        total_products: Object.keys(inventory).length,
        low_stock_alerts: Object.entries(inventory)
            .filter(([name, data]) => (data.stock - data.reserved) <= 5)
            .map(([name, data]) => ({ name, available: data.stock - data.reserved }))
    });
});

// Root endpoint (UPPDATERAD)
app.post("/api/create-payment-intent", async (req, res) => {
    // Explicitly allow CORS for this endpoint
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,stripe-signature');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    const { amount, currency, customer, items, metadata } = req.body;

    // Validering
    if (!amount || amount <= 0) {
        return res.status(400).json({ 
            error: 'Ogiltigt belopp',
            type: 'validation_error'
        });
    }

    if (!customer?.name || !customer?.email) {
        return res.status(400).json({ 
            error: 'Kunduppgifter saknas',
            type: 'validation_error'
        });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
            error: 'Inga produkter specificerade',
            type: 'validation_error'
        });
    }

    // NYTT: Kontrollera och reservera lager
    try {
        const reservation = reserveItems(items);
        console.log('Creating payment intent for amount:', amount, 'SEK');
        
        const paymentIntentData = {
            amount: Math.round(amount * 100), // Konvertera till öre
            currency: currency || 'sek',
            automatic_payment_methods: {
                enabled: true,
            },
            metadata: {
                orderId: metadata?.orderId || 'ORD-' + Date.now(),
                reservationId: reservation.reservationId,
                customerName: customer.name,
                customerEmail: customer.email,
                // ...add other metadata fields as needed...
            }
        };
        // Lägg till shipping om adress finns
        if (customer.address) {
            paymentIntentData.shipping = {
                name: customer.name,
                address: {
                    line1: customer.address.line1,
                    postal_code: customer.address.postal_code,
                    city: customer.address.city,
                    country: customer.address.country || 'SE'
                }
            };
        }
        const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
        console.log('✅ Payment intent skapad:', paymentIntent.id);
        // Explicitly allow CORS for this endpoint
        const allowedOrigins = [
            'https://tree-of-lifa.vercel.app',
            'https://treeoflifa-production.up.railway.app',
            'https://treeoflifa.se',
            'http://localhost:3000',
            'http://127.0.0.1:5500'
        ];
        const origin = req.headers.origin;
        if (allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,stripe-signature');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        res.json({ 
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            reservationId: reservation.reservationId
        });
    } catch (inventoryError) {
        console.error('Lagerfel:', inventoryError.message);
        return res.status(400).json({
            error: inventoryError.message,
            type: 'inventory_error'
        });
    }
});

// ===== ORDER CONFIRMATION ENDPOINT =====
app.post('/api/orders', async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        const orderData = req.body;
        
        console.log('📦 Order received:', orderData.orderId);
        
        // Validate order data
        if (!orderData || !orderData.orderId) {
            console.log('❌ Invalid order data');
            return res.status(400).json({ error: 'Invalid order data - orderId required' });
        }
        
        // Respond immediately to avoid timeout
        res.status(200).json({ 
            success: true, 
            message: 'Order received',
            orderId: orderData.orderId
        });
        
        // Send emails asynchronously using SendGrid API (works on Railway!)
        (async () => {
            try {
                console.log('📧 [ORDER ' + orderData.orderId + '] Attempting to send emails via SendGrid...');
                console.log('📧 [ORDER ' + orderData.orderId + '] SENDGRID_API_KEY set:', !!process.env.SENDGRID_API_KEY);
                
                // Check if SendGrid API key is configured
                if (!process.env.SENDGRID_API_KEY) {
                    console.warn('⚠️ [ORDER ' + orderData.orderId + '] SENDGRID_API_KEY not configured - emails will not be sent');
                    console.warn('⚠️ Please add SENDGRID_API_KEY to Railway environment variables');
                    return;
                }
                
                console.log('✅ [ORDER ' + orderData.orderId + '] SENDGRID_API_KEY found, proceeding with email send...');
                
                // Send owner email
                try {
                    const ownerEmailHtml = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #4a7c59;">🎉 Ny beställning inkom!</h2>
                            
                            <div style="background: #f8fffe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #2d4a2b;">Orderinformation</h3>
                                <p><strong>Order ID:</strong> ${orderData.orderId}</p>
                                <p><strong>Datum:</strong> ${new Date(orderData.timestamp || Date.now()).toLocaleString('sv-SE')}</p>
                                <p><strong>Total:</strong> ${orderData.total} kr</p>
                                <p><strong>Betalmetod:</strong> ${(orderData.paymentMethod || 'Okänd').toUpperCase()}</p>
                            </div>
                            
                            <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #2d4a2b;">Kundinformation</h3>
                                <p><strong>Namn:</strong> ${orderData.customer?.name || 'Ej angivet'}</p>
                                <p><strong>Email:</strong> ${orderData.customer?.email || 'Ej angivet'}</p>
                                <p><strong>Telefon:</strong> ${orderData.customer?.phone || 'Ej angivet'}</p>
                                <p><strong>Leveransadress:</strong><br>
                                   ${orderData.customer?.address || ''}<br>
                                   ${orderData.customer?.postalCode || ''} ${orderData.customer?.city || ''}
                                </p>
                            </div>
                            
                            <div style="background: #fff; padding: 20px; border: 1px solid #e8e8e8; border-radius: 8px;">
                                <h3 style="color: #2d4a2b;">Beställda produkter</h3>
                                ${(orderData.items || []).map(item => `
                                    <div style="padding: 10px 0; border-bottom: 1px solid #eee;">
                                        ${item.name} x ${item.quantity} = ${(item.price * item.quantity)} kr
                                    </div>
                                `).join('')}
                                <div style="padding: 15px 0; font-weight: bold; color: #4a7c59;">
                                    TOTALT: ${orderData.total} kr
                                </div>
                            </div>
                        </div>
                    `;
                    
                    console.log('� [ORDER ' + orderData.orderId + '] Sending owner email via Resend...');
                    const ownerResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + process.env.SENDGRID_API_KEY
                        },
                        body: JSON.stringify({
                            personalizations: [{
                                to: [{ email: 'tree.of.liifa@gmail.com' }]
                            }],
                            from: { email: 'noreply@treeoflifa.se', name: 'TreeOfLifa' },
                            subject: `🛒 Ny beställning - ${orderData.orderId}`,
                            content: [{
                                type: 'text/html',
                                value: ownerEmailHtml
                            }]
                        })
                    });
                    
                    if (ownerResponse.ok || ownerResponse.status === 202) {
                        console.log('✅ [ORDER ' + orderData.orderId + '] Owner email sent via SendGrid');
                    } else {
                        const error = await ownerResponse.json();
                        console.error('❌ [ORDER ' + orderData.orderId + '] Owner email failed, status:', ownerResponse.status);
                        console.error('❌ [ORDER ' + orderData.orderId + '] Error details:', JSON.stringify(error));
                    }
                } catch (err) {
                    console.error('❌ [ORDER ' + orderData.orderId + '] Owner email error:', err.message);
                }
                
                // Send customer email - send to owner's email with customer info
                if (orderData.customer?.email) {
                    try {
                        const customerEmailHtml = `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                <div style="text-align: center; margin-bottom: 30px;">
                                    <h1 style="color: #4a7c59;">🌿 TreeOfLifa</h1>
                                    <h2 style="color: #2d4a2b;">Tack för din beställning!</h2>
                                </div>
                                
                                <p>Hej ${orderData.customer.name || 'Kund'},</p>
                                <p>Vi har tagit emot din beställning och den kommer att skickas inom 2-3 arbetsdagar.</p>
                                
                                <div style="background: #f8fffe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                    <h3 style="color: #2d4a2b;">Din beställning</h3>
                                    <p><strong>Ordernummer:</strong> ${orderData.orderId}</p>
                                    <p><strong>Datum:</strong> ${new Date(orderData.timestamp || Date.now()).toLocaleString('sv-SE')}</p>
                                    <p><strong>Total:</strong> ${orderData.total} kr</p>
                                </div>
                                
                                <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                    <h3 style="color: #2d4a2b;">Leveransadress</h3>
                                    <p>${orderData.customer.name}<br>
                                       ${orderData.customer.address}<br>
                                       ${orderData.customer.postalCode} ${orderData.customer.city}</p>
                                </div>
                                
                                <div style="background: #fff; padding: 20px; border: 1px solid #e8e8e8; border-radius: 8px; margin: 20px 0;">
                                    <h3 style="color: #2d4a2b;">Beställda produkter</h3>
                                    ${(orderData.items || []).map(item => `
                                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                                            <span>${item.name} x ${item.quantity}</span>
                                            <span>${(item.price * item.quantity)} kr</span>
                                        </div>
                                    `).join('')}
                                    <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ddd;">
                                        <span>Frakt:</span>
                                        <span>${orderData.shipping || 49} kr</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; padding: 15px 0; font-weight: bold; font-size: 1.1em; color: #4a7c59;">
                                        <span>Totalt:</span>
                                        <span>${orderData.total} kr</span>
                                    </div>
                                </div>
                                
                                <p>Vi skickar ett spårningsnummer när paketet är på väg.</p>
                                
                                <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
                                    <p style="color: #666;">Med vänliga hälsningar,<br><strong>TreeOfLifa-teamet</strong></p>
                                    <p style="color: #666; font-size: 0.9em;">tree.of.liifa@gmail.com</p>
                                </div>
                            </div>
                        `;
                        
                        console.log('📬 [ORDER ' + orderData.orderId + '] Sending customer email to ' + orderData.customer.email + ' via SendGrid...');
                        const customerResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + process.env.SENDGRID_API_KEY
                            },
                            body: JSON.stringify({
                                personalizations: [{
                                    to: [{ email: orderData.customer.email }]
                                }],
                                from: { email: 'noreply@treeoflifa.se', name: 'TreeOfLifa' },
                                subject: `Orderbekräftelse - TreeOfLifa - ${orderData.orderId}`,
                                content: [{
                                    type: 'text/html',
                                    value: customerEmailHtml
                                }]
                            })
                        });
                        
                        if (customerResponse.ok || customerResponse.status === 202) {
                            console.log('✅ [ORDER ' + orderData.orderId + '] Customer email sent via SendGrid to ' + orderData.customer.email);
                        } else {
                            const error = await customerResponse.json();
                            console.error('❌ [ORDER ' + orderData.orderId + '] Customer email failed:', error);
                        }
                    } catch (err) {
                        console.error('❌ [ORDER ' + orderData.orderId + '] Customer email error:', err.message);
                    }
                }
                
                console.log('✅ [ORDER ' + orderData.orderId + '] Email sending completed');
                
            } catch (error) {
                console.error('❌ [ORDER ' + orderData.orderId + '] Unexpected email error:', error.message);
            }
        })();
        
    } catch (error) {
        console.error('❌ Order error:', error);
        res.status(500).json({ 
            error: 'Failed to process order',
            details: error.message
        });
    }
});

// ===== ANALYTICS ENDPOINT =====
const analyticsFile = 'analytics.json';
let analyticsData = { sessions: [], visitors: {} };

async function loadAnalytics() {
    try {
        const data = await fs.readFile(analyticsFile, 'utf8');
        analyticsData = JSON.parse(data);
        console.log('📊 Analytics data loaded');
    } catch (error) {
        console.log('📊 No existing analytics data, starting fresh');
    }
}

async function saveAnalytics() {
    try {
        await fs.writeFile(analyticsFile, JSON.stringify(analyticsData, null, 2));
    } catch (error) {
        console.error('Error saving analytics:', error);
    }
}

// Load analytics on startup
loadAnalytics();

app.post('/api/analytics', async (req, res) => {
    // Set CORS headers dynamically (no wildcard when credentials might be included)
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        // Fallback for unknown origins
        res.setHeader('Access-Control-Allow-Origin', 'https://treeoflifa.se');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    try {
        // Handle text/plain payloads (sendBeacon default) by parsing JSON manually
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { /* ignore parse error */ }
        }
        const { visitorId, sessionId, sessionCount, sessionData, summary } = body || {};

        if (!visitorId || !sessionId || !summary) {
            console.warn('⚠️ Invalid analytics payload:', { hasBody: !!body, contentType: req.headers['content-type'] });
            return res.status(400).json({ error: 'Invalid analytics payload' });
        }

        // Store session data
        analyticsData.sessions.push({
            visitorId,
            sessionId,
            sessionCount,
            timestamp: new Date().toISOString(),
            ...summary
        });

        // Update visitor data
        if (!analyticsData.visitors[visitorId]) {
            analyticsData.visitors[visitorId] = {
                firstSeen: new Date().toISOString(),
                sessionCount: 0,
                totalEvents: 0,
                totalPageViews: 0,
                totalProductViews: 0,
                checkoutAttempts: 0,
                checkoutAbandons: 0,
                completedPurchases: 0,
                totalRevenue: 0
            };
        }

        const visitor = analyticsData.visitors[visitorId];
        visitor.lastSeen = new Date().toISOString();
        visitor.sessionCount++;
        visitor.totalEvents += summary.totalEvents || 0;
        visitor.totalPageViews += summary.uniquePageViews || 0;
        visitor.totalProductViews += summary.uniqueProductViews || 0;
        
        if (summary.reachedCheckout) visitor.checkoutAttempts++;
        if (summary.abandonedCheckout) visitor.checkoutAbandons++;
        if (summary.completedPurchase) visitor.completedPurchases++;

        // Save to file
        await saveAnalytics();

        console.log('📊 Analytics saved:', { visitorId, sessionId, summary: summary });

        res.json({ success: true, message: 'Analytics recorded' });
    } catch (error) {
        console.error('Error recording analytics:', error);
        res.status(500).json({ error: 'Failed to record analytics' });
    }
});

// Admin endpoint to view analytics
app.get('/api/analytics/dashboard', (req, res) => {
    // Set CORS headers dynamically
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        res.setHeader('Access-Control-Allow-Origin', 'https://treeoflifa.se');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Normalize keys to avoid hidden whitespace/newline mismatches
    const receivedKeyRaw = req.query.key || '';
    const expectedKeyRaw = process.env.ADMIN_KEY || '';
    const adminKey = receivedKeyRaw.trim();
    const expectedKey = expectedKeyRaw.trim();

    // Debug logging
    console.log('🔑 Admin key check:');
    console.log('  Received key (raw):', receivedKeyRaw);
    console.log('  Expected key (raw):', expectedKeyRaw);
    console.log('  Received key (trimmed):', adminKey);
    console.log('  Expected key (trimmed):', expectedKey);
    console.log('  Keys match (raw):', receivedKeyRaw === expectedKeyRaw);
    console.log('  Keys match (trimmed):', adminKey === expectedKey);
    console.log('  Received key length (raw):', receivedKeyRaw.length);
    console.log('  Expected key length (raw):', expectedKeyRaw.length);
    console.log('  Received key length (trimmed):', adminKey.length);
    console.log('  Expected key length (trimmed):', expectedKey.length);
    
    if (adminKey !== expectedKey) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const stats = {
        totalVisitors: Object.keys(analyticsData.visitors).length,
        totalSessions: analyticsData.sessions.length,
        recentSessions: analyticsData.sessions.slice(-50),
        topVisitors: Object.entries(analyticsData.visitors)
            .sort((a, b) => b[1].sessionCount - a[1].sessionCount)
            .slice(0, 10)
            .map(([id, data]) => ({ visitorId: id, ...data })),
        conversionStats: {
            checkoutAttempts: Object.values(analyticsData.visitors).reduce((sum, v) => sum + v.checkoutAttempts, 0),
            checkoutAbandons: Object.values(analyticsData.visitors).reduce((sum, v) => sum + v.checkoutAbandons, 0),
            completedPurchases: Object.values(analyticsData.visitors).reduce((sum, v) => sum + v.completedPurchases, 0),
            totalRevenue: Object.values(analyticsData.visitors).reduce((sum, v) => sum + v.totalRevenue, 0)
        },
        abandonmentReasons: analyticsData.sessions
            .filter(s => s.abandonedCheckout)
            .map(s => {
                const checkoutSteps = s.checkoutFunnelSteps || [];
                return checkoutSteps[checkoutSteps.length - 1] || 'unknown';
            })
    };

    res.json(stats);
});

// ===== NEWSLETTER SUBSCRIPTION SYSTEM =====
const NEWSLETTER_FILE = 'newsletter_subscribers.json';
let subscribers = [];

async function loadSubscribers() {
    try {
        const data = await fs.readFile(NEWSLETTER_FILE, 'utf8');
        subscribers = JSON.parse(data);
        console.log('📧 Newsletter subscribers loaded:', subscribers.length);
    } catch (error) {
        console.log('📧 No existing subscribers, starting fresh');
        subscribers = [];
        await saveSubscribers();
    }
}

async function saveSubscribers() {
    try {
        await fs.writeFile(NEWSLETTER_FILE, JSON.stringify(subscribers, null, 2));
    } catch (error) {
        console.error('Error saving subscribers:', error);
    }
}

// Load subscribers on startup
loadSubscribers();

// Subscribe to newsletter
app.post('/api/newsletter/subscribe', rateLimit(3, 3600000), async (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    try {
        const { email } = req.body;
        
        // Validation
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ error: 'Ogiltig e-postadress' });
        }
        
        // Check if already subscribed
        if (subscribers.some(sub => sub.email.toLowerCase() === email.toLowerCase())) {
            return res.status(400).json({ error: 'Du är redan prenumerant' });
        }
        
        // Add subscriber
        const subscriber = {
            email: email.toLowerCase(),
            subscriptionDate: new Date().toISOString(),
            id: 'SUB-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
        };
        
        subscribers.push(subscriber);
        await saveSubscribers();
        
        console.log('📧 New newsletter subscriber:', email);
        res.status(201).json({ 
            success: true, 
            message: 'Tack för att du prenumererar! Du får snart ett bekräftelsemejl.'
        });
    } catch (error) {
        console.error('Error subscribing to newsletter:', error);
        res.status(500).json({ error: 'Kunde inte prenumerera på nyhetsbrevet' });
    }
});

// Get subscriber count (admin endpoint)
app.get('/api/newsletter/subscribers', (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    const adminKey = (req.query.key || '').trim();
    const expectedKey = (process.env.ADMIN_KEY || '').trim();
    
    if (adminKey !== expectedKey) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    res.json({
        totalSubscribers: subscribers.length,
        subscribers: subscribers.map(s => ({ email: s.email, subscriptionDate: s.subscriptionDate }))
    });
});

// ===== ABANDONED CART RECOVERY SYSTEM =====
const ABANDONED_CARTS_FILE = 'abandoned_carts.json';
let abandonedCarts = {};

async function loadAbandonedCarts() {
    try {
        const data = await fs.readFile(ABANDONED_CARTS_FILE, 'utf8');
        abandonedCarts = JSON.parse(data);
        console.log('🛒 Abandoned carts loaded');
    } catch (error) {
        console.log('🛒 No abandoned carts file, starting fresh');
        abandonedCarts = {};
        await saveAbandonedCarts();
    }
}

async function saveAbandonedCarts() {
    try {
        await fs.writeFile(ABANDONED_CARTS_FILE, JSON.stringify(abandonedCarts, null, 2));
    } catch (error) {
        console.error('Error saving abandoned carts:', error);
    }
}

// Load abandoned carts on startup
loadAbandonedCarts();

// Track abandoned cart
app.post('/api/abandoned-cart', rateLimit(5, 3600000), async (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    try {
        const { email, items, total } = req.body;
        
        if (!email || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid cart data' });
        }
        
        const cartId = 'CART-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const cartData = {
            id: cartId,
            email: email.toLowerCase(),
            items,
            total,
            timestamp: new Date().toISOString(),
            emailSent: false,
            recovered: false
        };
        
        abandonedCarts[cartId] = cartData;
        await saveAbandonedCarts();
        
        console.log('🛒 Abandoned cart tracked:', email);
        res.status(201).json({ 
            success: true, 
            message: 'Cart tracked',
            cartId
        });
    } catch (error) {
        console.error('Error tracking abandoned cart:', error);
        res.status(500).json({ error: 'Failed to track cart' });
    }
});

// Get abandoned carts (admin endpoint)
app.get('/api/abandoned-carts/list', (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    const adminKey = (req.query.key || '').trim();
    const expectedKey = (process.env.ADMIN_KEY || '').trim();
    
    if (adminKey !== expectedKey) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const cartsList = Object.values(abandonedCarts).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json({
        totalAbandoned: cartsList.length,
        recoveryPotential: cartsList.reduce((sum, cart) => sum + cart.total, 0),
        notRecovered: cartsList.filter(c => !c.recovered).length,
        carts: cartsList.slice(0, 50) // Latest 50
    });
});

// ===== PRODUCT REVIEWS SYSTEM =====
const REVIEWS_FILE = 'reviews.json';
let reviews = {};

async function loadReviews() {
    try {
        const data = await fs.readFile(REVIEWS_FILE, 'utf8');
        reviews = JSON.parse(data);
        console.log('⭐ Reviews loaded');
    } catch (error) {
        console.log('⭐ No existing reviews, starting fresh');
        reviews = {};
        await saveReviews();
    }
}

async function saveReviews() {
    try {
        await fs.writeFile(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
    } catch (error) {
        console.error('Error saving reviews:', error);
    }
}

// Load reviews on startup
loadReviews();

// Get reviews for a product
app.get('/api/reviews/:productName', (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    try {
        const productName = decodeURIComponent(req.params.productName);
        const productReviews = reviews[productName] || [];
        
        // Calculate stats
        const stats = {
            totalReviews: productReviews.length,
            averageRating: productReviews.length > 0 
                ? (productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length).toFixed(1)
                : 0,
            ratingDistribution: {
                5: productReviews.filter(r => r.rating === 5).length,
                4: productReviews.filter(r => r.rating === 4).length,
                3: productReviews.filter(r => r.rating === 3).length,
                2: productReviews.filter(r => r.rating === 2).length,
                1: productReviews.filter(r => r.rating === 1).length
            }
        };
        
        // Return reviews sorted by date (newest first)
        const sortedReviews = [...productReviews].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({
            stats,
            reviews: sortedReviews
        });
    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

// Submit a review
app.post('/api/reviews', rateLimit(3, 3600000), async (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    try {
        const { productName, customerName, rating, reviewText } = req.body;
        
        // Validation
        if (!productName || !customerName || !rating || !reviewText) {
            return res.status(400).json({ error: 'All fields required' });
        }
        
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be 1-5' });
        }
        
        if (reviewText.length < 10 || reviewText.length > 500) {
            return res.status(400).json({ error: 'Review must be 10-500 characters' });
        }
        
        // Create review
        const review = {
            id: 'REV-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            productName: escapeHtml(productName),
            customerName: escapeHtml(customerName),
            rating: parseInt(rating),
            reviewText: escapeHtml(reviewText),
            date: new Date().toISOString(),
            helpful: 0
        };
        
        // Store review
        if (!reviews[productName]) {
            reviews[productName] = [];
        }
        reviews[productName].push(review);
        await saveReviews();
        
        console.log('⭐ Review submitted for:', productName);
        res.status(201).json({ 
            success: true, 
            message: 'Tack för din recension!',
            review
        });
    } catch (error) {
        console.error('Error submitting review:', error);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

function escapeHtml(text) {
    const map = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// ===== GIVEAWAY SYSTEM =====
const GIVEAWAY_FILE = 'giveaway_entries.json';
let giveawayEntries = [];

async function loadGiveawayEntries() {
    try {
        const data = await fs.readFile(GIVEAWAY_FILE, 'utf8');
        giveawayEntries = JSON.parse(data);
        console.log('🎁 Giveaway entries loaded:', giveawayEntries.length);
    } catch (error) {
        console.log('🎁 No giveaway entries file, starting fresh');
        giveawayEntries = [];
        await saveGiveawayEntries();
    }
}

async function saveGiveawayEntries() {
    try {
        await fs.writeFile(GIVEAWAY_FILE, JSON.stringify(giveawayEntries, null, 2));
    } catch (error) {
        console.error('Error saving giveaway entries:', error);
    }
}

// Load giveaway entries on startup
loadGiveawayEntries();

// Submit giveaway entry
app.post('/api/giveaway/enter', rateLimit(2, 86400000), async (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    try {
        const { email, name, taggeds, installment } = req.body;
        
        // Validation
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ error: 'Ogiltig e-postadress' });
        }
        
        if (!name || name.length < 2) {
            return res.status(400).json({ error: 'Namn är obligatoriskt' });
        }
        
        // Check if already entered
        if (giveawayEntries.some(entry => entry.email.toLowerCase() === email.toLowerCase())) {
            return res.status(400).json({ error: 'Du har redan deltagit i giveaway' });
        }
        
        // Create entry
        const entry = {
            id: 'GIFT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            email: email.toLowerCase(),
            name: escapeHtml(name),
            taggeds: Array.isArray(taggeds) ? taggeds : [], // Tagged friends
            installment: installment || 1, // Which month/period
            timestamp: new Date().toISOString(),
            followsInstagram: false,
            followsNewsletter: false,
            valid: true
        };
        
        giveawayEntries.push(entry);
        await saveGiveawayEntries();
        
        console.log('🎁 Giveaway entry submitted:', email);
        res.status(201).json({ 
            success: true, 
            message: 'Lycka till i giveaway! Du kan vinna 863kr i produkter! 🍀',
            entryId: entry.id
        });
    } catch (error) {
        console.error('Error submitting giveaway entry:', error);
        res.status(500).json({ error: 'Kunde inte registrera giveaway-bidrag' });
    }
});

// Get giveaway stats (admin endpoint)
app.get('/api/giveaway/stats', (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    const adminKey = (req.query.key || '').trim();
    const expectedKey = (process.env.ADMIN_KEY || '').trim();
    
    if (adminKey !== expectedKey) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const validEntries = giveawayEntries.filter(e => e.valid);
    const installmentCounts = {};
    validEntries.forEach(entry => {
        installmentCounts[entry.installment] = (installmentCounts[entry.installment] || 0) + 1;
    });
    
    res.json({
        totalEntries: validEntries.length,
        uniqueEmails: new Set(validEntries.map(e => e.email)).size,
        installmentBreakdown: installmentCounts,
        entryEmail: validEntries.map(e => ({ 
            id: e.id,
            email: e.email, 
            name: e.name,
            tagged: e.taggeds.length,
            timestamp: e.timestamp 
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
});

// Pick random winner (admin endpoint)
app.post('/api/giveaway/pick-winner', rateLimit(1, 3600000), async (req, res) => {
    const allowedOrigins = [
        'https://tree-of-lifa.vercel.app',
        'https://treeoflifa-production.up.railway.app',
        'https://treeoflifa.se',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    try {
        const { adminKey, count = 5 } = req.body;
        
        if (!adminKey || adminKey.trim() !== (process.env.ADMIN_KEY || '').trim()) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const validEntries = giveawayEntries.filter(e => e.valid);
        
        if (validEntries.length < count) {
            return res.status(400).json({ 
                error: `Not enough valid entries. Have ${validEntries.length}, need ${count}`
            });
        }
        
        // Fisher-Yates shuffle
        const shuffled = [...validEntries];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        const winners = shuffled.slice(0, count);
        
        // Mark as won
        winners.forEach(winner => {
            const entry = giveawayEntries.find(e => e.id === winner.id);
            if (entry) {
                entry.won = true;
                entry.wonDate = new Date().toISOString();
            }
        });
        
        await saveGiveawayEntries();
        
        console.log('🎉 Giveaway winners picked:', winners.length);
        
        res.json({
            success: true,
            message: `${count} winners picked!`,
            winners: winners.map(w => ({ 
                id: w.id,
                email: w.email, 
                name: w.name,
                timestamp: w.timestamp 
            }))
        });
    } catch (error) {
        console.error('Error picking winners:', error);
        res.status(500).json({ error: 'Failed to pick winners' });
    }
});

// ===== TEST EMAIL ENDPOINT =====
app.post('/api/test-email', async (req, res) => {
    console.log('🧪 Testing email...');
    console.log('📧 GMAIL_APP_PASSWORD set:', !!process.env.GMAIL_APP_PASSWORD);
    console.log('📧 GMAIL_APP_PASSWORD length:', process.env.GMAIL_APP_PASSWORD?.length);
    console.log('📧 GMAIL_APP_PASSWORD value (first 4 chars):', process.env.GMAIL_APP_PASSWORD?.substring(0, 4) + '...');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    
    // Return env var status
    res.status(200).json({
        passwordSet: !!process.env.GMAIL_APP_PASSWORD,
        passwordLength: process.env.GMAIL_APP_PASSWORD?.length || 0,
        nodeEnv: process.env.NODE_ENV
    });
});