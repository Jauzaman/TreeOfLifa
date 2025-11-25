// Configuration file - DO NOT COMMIT with real values
// This file should be served dynamically from your backend or build process

window.APP_CONFIG = {
    // These should be replaced during build/deployment
    STRIPE_PUBLISHABLE_KEY: '{{STRIPE_PUBLISHABLE_KEY}}',
    PAYPAL_CLIENT_ID: '{{PAYPAL_CLIENT_ID}}',
    API_BASE_URL: '{{API_BASE_URL}}' || 'https://tree-of-lifa.vercel.app'
};
