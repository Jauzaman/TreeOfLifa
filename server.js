// Start Express server
// Längst upp i filen, före andra imports
require('dotenv').config();

// Importera paket
const express = require("express");
const app = express();
const Stripe = require("stripe");
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
    'Presentset': { stock: 10, reserved: 0 }
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
    service: 'gmail',
    auth: {
        user: 'tree.of.liifa@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD
    }
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

        const customerEmail = {
            from: 'tree.of.liifa@gmail.com',
            to: orderData.customer.email,
            subject: `Orderbekräftelse - ${orderData.orderId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #4a7c59;">🌿 TreeOfLifa</h1>
                        <h2 style="color: #2d4a2b;">Tack för din beställning!</h2>
                    </div>
                    
                    <p>Hej ${orderData.customer.name},</p>
                    <p>Vi har tagit emot din beställning och den kommer att skickas inom 2-3 arbetsdagar.</p>
                    
                    <div style="background: #f8fffe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #2d4a2b;">Din beställning</h3>
                        <p><strong>Ordernummer:</strong> ${orderData.orderId}</p>
                        <p><strong>Datum:</strong> ${new Date(orderData.timestamp).toLocaleString('sv-SE')}</p>
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
                        ${orderData.items.map(item => `
                            <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                                <span>${item.name} x ${item.quantity}</span>
                                <span>${item.price * item.quantity} kr</span>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #ddd;">
                            <span>Frakt:</span>
                            <span>${orderData.shipping} kr</span>
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
            `
        };

        // Skicka båda emailen parallellt
        await Promise.all([
            transporter.sendMail(ownerEmail),
            transporter.sendMail(customerEmail)
        ]);

        console.log('Emails sent successfully for order:', orderData.orderId);
        res.status(200).json({ 
            success: true, 
            message: 'Order received and emails sent',
            orderId: orderData.orderId 
        });
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

        console.log('📧 Skickar bekräftelsemail för order:', orderData.orderId);
        
        // Använd befintlig email-funktion
        const response = await fetch(`${process.env.APP_URL || 'http://localhost:3001'}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        
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