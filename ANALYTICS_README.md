# TreeOfLifa Analytics System

## Overview
Comprehensive visitor and behavior tracking system that monitors customer interactions, cart patterns, checkout flow, and abandonment.

## Features Tracked

### 📊 Visitor Metrics
- **Unique Visitors**: Persistent visitor ID stored in localStorage
- **Session Count**: Number of visits per visitor
- **First Visit**: When the visitor first arrived
- **Last Visit**: Most recent visit timestamp
- **Returning Visitors**: Identifies repeat customers

### 🛒 Shopping Behavior
- **Product Views**: Which products are being viewed
- **Add to Cart**: Items added to cart with price and quantity
- **Remove from Cart**: Items removed before purchase
- **Cart Value**: Total value of cart at any time
- **Cart Abandonment**: When users leave with items in cart

### 💳 Checkout Funnel
- **Checkout Initiated**: When user opens checkout modal
- **Payment Method Selected**: Card vs Swish selection
- **Form Fields Filled**: Which fields user completes
- **Checkout Abandoned**: When and why users abandon checkout
- **Purchase Completed**: Successful order completion

### 📈 Key Metrics
- **Conversion Rate**: % of checkout attempts that complete
- **Abandonment Rate**: % of checkouts that are abandoned
- **Average Session Duration**: How long visitors stay
- **Average Cart Value**: Typical cart size
- **Most Viewed Products**: Popular products
- **Checkout Drop-off Points**: Where users abandon

## How It Works

### Client-Side (analytics.js)
1. Creates unique visitor ID on first visit
2. Tracks all events with timestamps
3. Stores session data in localStorage
4. Sends data to server when session ends (page close/navigate away)

### Server-Side (server.js)
- `/api/analytics` - Receives and stores analytics data
- `/api/analytics/dashboard?key=ADMIN_KEY` - View analytics dashboard
- Data stored in `analytics.json`

### Integration (index.html)
Automatically tracks:
- Page navigation (Hem, Om oss, Produkter)
- Product interactions
- Cart operations
- Checkout steps
- Purchase completion

## Viewing Analytics

### Admin Dashboard
1. Open `analytics-dashboard.html` in browser (or deploy to your domain)
2. Enter admin key (set in environment variable `ADMIN_KEY`)
3. View real-time analytics data

### Dashboard Sections
- **Overview Cards**: Total visitors, sessions, conversion stats
- **Recent Sessions**: Last 50 sessions with status
- **Top Visitors**: Most active visitors
- **Abandonment Analysis**: Where users drop off

## Data Collected

### Session Data
```json
{
  "visitorId": "visitor_1234567890_abc123",
  "sessionId": "session_1234567890_xyz789",
  "sessionCount": 3,
  "timestamp": "2025-12-02T10:30:00.000Z",
  "duration": 180,
  "totalEvents": 15,
  "uniquePageViews": 3,
  "uniqueProductViews": 5,
  "reachedCheckout": true,
  "abandonedCheckout": false,
  "completedPurchase": true
}
```

### Visitor Profile
```json
{
  "firstSeen": "2025-12-01T14:20:00.000Z",
  "lastSeen": "2025-12-02T10:30:00.000Z",
  "sessionCount": 3,
  "totalEvents": 45,
  "totalPageViews": 12,
  "totalProductViews": 18,
  "checkoutAttempts": 2,
  "checkoutAbandons": 1,
  "completedPurchases": 1,
  "totalRevenue": 149
}
```

## Insights You Can Gain

### 1. **Product Popularity**
- Which products are most viewed
- Which products are added to cart most
- Which products are removed most (may indicate pricing/shipping shock)

### 2. **Checkout Abandonment Patterns**
- **No Payment Selected**: User didn't choose payment method
- **Form Not Filled**: User opened checkout but didn't fill info
- **Card Details Not Entered**: User selected card but didn't complete
- **Closed Checkout**: User actively closed the modal

### 3. **Customer Segmentation**
- **New vs Returning**: First-time visitors vs repeat customers
- **Browsers vs Buyers**: Users who view vs users who purchase
- **Cart Abandoners**: Users with high cart value but no purchase

### 4. **Conversion Optimization**
- Identify friction points in checkout
- See where users drop off most
- Compare conversion rates for different products
- Track A/B test results

## Privacy & GDPR Compliance

### Data Stored
- ✅ Anonymous visitor IDs (not personally identifiable)
- ✅ Behavioral data (clicks, views, cart actions)
- ✅ Session metadata (duration, timestamps)
- ❌ No personal information (names, emails, addresses)
- ❌ No payment card details

### User Control
- Data stored in browser localStorage
- User can clear localStorage to reset tracking
- No cross-site tracking
- No third-party analytics services

### Recommendations for GDPR
1. Add cookie/tracking consent banner
2. Include analytics disclosure in privacy policy
3. Provide opt-out mechanism
4. Set data retention policy (e.g., 90 days)

## Configuration

### Environment Variables
```bash
ADMIN_KEY=your-secret-admin-key
```

### Analytics Settings (analytics.js)
```javascript
// Session timeout (15 minutes)
setTimeout(() => {
    releaseReservation(reservationId, reserved);
}, 15 * 60 * 1000);
```

## Usage Examples

### Track Custom Event
```javascript
if (analytics) {
    analytics.trackEvent('custom_event_name', { 
        customData: 'value',
        anotherField: 123
    });
}
```

### Track Product View
```javascript
analytics.trackProductView('Kokosskrubb', 25);
```

### Track Checkout Step
```javascript
analytics.trackCheckoutStep('payment_info_entered', {
    hasEmail: true,
    hasAddress: true
});
```

## Monitoring & Alerts

### Set Up Alerts For:
- High abandonment rate (>70%)
- Low conversion rate (<5%)
- Specific product out of stock views
- Checkout errors

### Regular Review
- Check dashboard weekly
- Analyze abandonment reasons
- Optimize checkout flow based on data
- A/B test changes

## Future Enhancements

### Potential Additions:
1. **Heatmaps**: Click/scroll tracking on product pages
2. **User Recordings**: Session replay for UX analysis
3. **Email Collection**: Track newsletter signups
4. **Social Sharing**: Track product shares
5. **Referral Tracking**: Track traffic sources
6. **Cohort Analysis**: Group users by acquisition date
7. **Funnel Visualization**: Visual checkout funnel
8. **Real-time Alerts**: Webhook notifications for key events

## Troubleshooting

### Analytics Not Loading
- Check browser console for errors
- Verify `analytics.js` is loaded before main script
- Check if localStorage is enabled

### Data Not Appearing in Dashboard
- Verify admin key is correct
- Check server logs for errors
- Ensure `analytics.json` file is writable
- Test API endpoint manually

### Session Data Not Saving
- Check browser console for sendBeacon errors
- Verify API endpoint is accessible
- Check CORS settings

## Questions?

Contact: tree.of.liifa@gmail.com
