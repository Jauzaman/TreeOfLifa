// ===== ANALYTICS & TRACKING SYSTEM =====
// Tracks visitor behavior, cart patterns, checkout flow, and abandonment

class Analytics {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.sessionData = {
            sessionId: this.sessionId,
            startTime: new Date().toISOString(),
            events: [],
            cart: [],
            pageViews: [],
            productViews: [],
            checkoutSteps: [],
            abandoned: false
        };
        
        // Load or initialize visitor data
        this.visitorId = this.getOrCreateVisitorId();
        this.sessionCount = this.incrementSessionCount();
        
        this.initializeTracking();
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    getOrCreateVisitorId() {
        let visitorId = localStorage.getItem('visitorId');
        if (!visitorId) {
            visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('visitorId', visitorId);
            localStorage.setItem('firstVisit', new Date().toISOString());
        }
        return visitorId;
    }

    incrementSessionCount() {
        let count = parseInt(localStorage.getItem('sessionCount') || '0');
        count++;
        localStorage.setItem('sessionCount', count.toString());
        localStorage.setItem('lastVisit', new Date().toISOString());
        return count;
    }

    initializeTracking() {
        // Track page visibility changes (when user leaves/returns to tab)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.trackEvent('page_hidden', { duration: this.getSessionDuration() });
            } else {
                this.trackEvent('page_visible');
            }
        });

        // Track when user is about to leave
        window.addEventListener('beforeunload', () => {
            this.handleSessionEnd();
        });

        // Track initial page load
        this.trackEvent('session_start', {
            visitorId: this.visitorId,
            sessionCount: this.sessionCount,
            firstVisit: localStorage.getItem('firstVisit'),
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            language: navigator.language
        });
    }

    getSessionDuration() {
        return Math.floor((Date.now() - new Date(this.sessionData.startTime).getTime()) / 1000);
    }

    trackEvent(eventName, data = {}) {
        const event = {
            eventName,
            timestamp: new Date().toISOString(),
            data,
            sessionDuration: this.getSessionDuration()
        };
        
        this.sessionData.events.push(event);
        console.log('📊 Analytics:', eventName, data);
        
        // Save to localStorage for persistence
        this.saveSessionData();
    }

    trackPageView(pageName) {
        this.sessionData.pageViews.push({
            page: pageName,
            timestamp: new Date().toISOString(),
            duration: this.getSessionDuration()
        });
        this.trackEvent('page_view', { page: pageName });
    }

    trackProductView(productName, productPrice) {
        this.sessionData.productViews.push({
            product: productName,
            price: productPrice,
            timestamp: new Date().toISOString()
        });
        this.trackEvent('product_view', { product: productName, price: productPrice });
    }

    trackAddToCart(productName, price, quantity) {
        this.sessionData.cart.push({
            action: 'add',
            product: productName,
            price,
            quantity,
            timestamp: new Date().toISOString()
        });
        this.trackEvent('add_to_cart', { product: productName, price, quantity });
    }

    trackRemoveFromCart(productName, quantity) {
        this.sessionData.cart.push({
            action: 'remove',
            product: productName,
            quantity,
            timestamp: new Date().toISOString()
        });
        this.trackEvent('remove_from_cart', { product: productName, quantity });
    }

    trackCartView(cartItems, total) {
        this.trackEvent('cart_viewed', { 
            itemCount: cartItems.length,
            totalValue: total,
            items: cartItems
        });
    }

    trackCheckoutStep(step, data = {}) {
        this.sessionData.checkoutSteps.push({
            step,
            timestamp: new Date().toISOString(),
            data
        });
        this.trackEvent('checkout_step', { step, ...data });
    }

    trackCheckoutAbandonment(step, reason = 'unknown') {
        this.sessionData.abandoned = true;
        this.trackEvent('checkout_abandoned', { 
            step, 
            reason,
            cartValue: this.getCurrentCartValue(),
            itemsInCart: this.getItemsInCart()
        });
    }

    trackPaymentMethodSelected(method) {
        this.trackEvent('payment_method_selected', { method });
    }

    trackFormFieldFilled(fieldName) {
        this.trackEvent('form_field_filled', { field: fieldName });
    }

    trackPurchaseComplete(orderData) {
        this.trackEvent('purchase_complete', {
            orderId: orderData.orderId,
            total: orderData.total,
            items: orderData.items,
            paymentMethod: orderData.paymentMethod
        });
        
        // Mark session as converted
        localStorage.setItem('hasConverted', 'true');
        localStorage.setItem('lastPurchase', new Date().toISOString());
    }

    getCurrentCartValue() {
        // This will be injected by the main app
        return window.getCartTotal ? window.getCartTotal() : 0;
    }

    getItemsInCart() {
        return window.cart ? window.cart.map(item => ({ name: item.name, quantity: item.quantity })) : [];
    }

    saveSessionData() {
        try {
            localStorage.setItem('currentSession', JSON.stringify(this.sessionData));
        } catch (e) {
            console.warn('Could not save session data:', e);
        }
    }

    handleSessionEnd() {
        this.trackEvent('session_end', {
            duration: this.getSessionDuration(),
            totalEvents: this.sessionData.events.length,
            pageViews: this.sessionData.pageViews.length,
            productViews: this.sessionData.productViews.length,
            cartInteractions: this.sessionData.cart.length,
            checkoutSteps: this.sessionData.checkoutSteps.length,
            abandoned: this.sessionData.abandoned
        });

        // Send session data to server
        this.sendAnalyticsToServer();
    }

    async sendAnalyticsToServer() {
        try {
            const analyticsData = {
                visitorId: this.visitorId,
                sessionId: this.sessionId,
                sessionCount: this.sessionCount,
                sessionData: this.sessionData,
                summary: this.generateSessionSummary()
            };

            // Send to server (non-blocking)
            navigator.sendBeacon(
                `${window.API_BASE_URL || ''}/api/analytics`,
                JSON.stringify(analyticsData)
            );
        } catch (e) {
            console.warn('Could not send analytics:', e);
        }
    }

    generateSessionSummary() {
        return {
            duration: this.getSessionDuration(),
            totalEvents: this.sessionData.events.length,
            uniquePageViews: new Set(this.sessionData.pageViews.map(p => p.page)).size,
            uniqueProductViews: new Set(this.sessionData.productViews.map(p => p.product)).size,
            cartAdditions: this.sessionData.cart.filter(c => c.action === 'add').length,
            cartRemovals: this.sessionData.cart.filter(c => c.action === 'remove').length,
            reachedCheckout: this.sessionData.checkoutSteps.length > 0,
            abandonedCheckout: this.sessionData.abandoned,
            completedPurchase: this.sessionData.events.some(e => e.eventName === 'purchase_complete'),
            checkoutFunnelSteps: this.sessionData.checkoutSteps.map(s => s.step)
        };
    }

    // Get analytics insights (for admin dashboard)
    static getVisitorStats() {
        return {
            visitorId: localStorage.getItem('visitorId'),
            sessionCount: parseInt(localStorage.getItem('sessionCount') || '0'),
            firstVisit: localStorage.getItem('firstVisit'),
            lastVisit: localStorage.getItem('lastVisit'),
            hasConverted: localStorage.getItem('hasConverted') === 'true',
            lastPurchase: localStorage.getItem('lastPurchase')
        };
    }
}

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Analytics;
}
