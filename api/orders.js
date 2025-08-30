// api/orders.js - Vercel serverless function
const nodemailer = require('nodemailer');

// Konfigurera Gmail SMTP transport
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: 'tree.of.liifa@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD // Detta sätter du som environment variable i Vercel
    }
});

export default async function handler(req, res) {
    // Endast POST-requests tillåtna
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    // CORS headers för att tillåta requests från din frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    try {
        const orderData = req.body;
        
        // Validera att vi har orderdata
        if (!orderData || !orderData.orderId) {
            return res.status(400).json({ error: 'Invalid order data' });
        }

        console.log('New order received:', orderData.orderId);

        // Skicka notis-email till dig (ägaren)
        const ownerEmail = {
            from: 'tree.of.liifa@gmail.com',
            to: 'tree.of.liifa@gmail.com', // Din email
            subject: `🛒 Ny TreeOfLifa beställning - ${orderData.orderId}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4a7c59;">🎉 Ny beställning inkom!</h2>
                    
                    <div style="background: #f8fffe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #2d4a2b;">Orderinformation</h3>
                        <p><strong>Order ID:</strong> ${orderData.orderId}</p>
                        <p><strong>Datum:</strong> ${new Date(orderData.timestamp).toLocaleString('sv-SE')}</p>
                        <p><strong>Total:</strong> ${orderData.total} kr</p>
                        <p><strong>Betalmetod:</strong> ${orderData.paymentMethod.toUpperCase()}</p>
                        ${orderData.transactionId ? `<p><strong>Transaction ID:</strong> ${orderData.transactionId}</p>` : ''}
                    </div>
                    
                    <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #2d4a2b;">Kundinformation</h3>
                        <p><strong>Namn:</strong> ${orderData.customer.name}</p>
                        <p><strong>Email:</strong> ${orderData.customer.email}</p>
                        <p><strong>Telefon:</strong> ${orderData.customer.phone}</p>
                        <p><strong>Leveransadress:</strong><br>
                           ${orderData.customer.address}<br>
                           ${orderData.customer.postalCode} ${orderData.customer.city}
                        </p>
                    </div>
                    
                    <div style="background: #fff; padding: 20px; border: 1px solid #e8e8e8; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #2d4a2b;">Beställda produkter</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f5f5f5;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Produkt</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">Antal</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Pris</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Summa</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orderData.items.map(item => `
                                    <tr>
                                        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
                                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${item.quantity}</td>
                                        <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${item.price} kr</td>
                                        <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${item.price * item.quantity} kr</td>
                                    </tr>
                                `).join('')}
                                <tr style="background: #f9f9f9; font-weight: bold;">
                                    <td style="padding: 10px; border-top: 2px solid #4a7c59;" colspan="3">Produkter:</td>
                                    <td style="padding: 10px; text-align: right; border-top: 2px solid #4a7c59;">${orderData.subtotal} kr</td>
                                </tr>
                                <tr style="background: #f9f9f9;">
                                    <td style="padding: 10px;" colspan="3">Frakt:</td>
                                    <td style="padding: 10px; text-align: right;">${orderData.shipping} kr</td>
                                </tr>
                                <tr style="background: #4a7c59; color: white; font-weight: bold;">
                                    <td style="padding: 15px;" colspan="3">TOTALT:</td>
                                    <td style="padding: 15px; text-align: right;">${orderData.total} kr</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #666;">
                        <p>Logga in på din admin-panel för att hantera beställningen</p>
                    </div>
                </div>
            `
        };

        // Skicka bekräftelse-email till kunden
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

        // Skicka båda emailen
        await Promise.all([
            transporter.sendMail(ownerEmail),
            transporter.sendMail(customerEmail)
        ]);

        console.log('Emails sent successfully for order:', orderData.orderId);
        
        // Returnera framgång
        res.status(200).json({ 
            success: true, 
            message: 'Order received and emails sent',
            orderId: orderData.orderId 
        });

    } catch (error) {
        console.error('Error processing order:', error);
        
        // Returnera fel men visa inte känslig information
        res.status(500).json({ 
            error: 'Failed to process order',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

// För att hantera OPTIONS requests (CORS preflight)
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '1mb',
        },
    },
}