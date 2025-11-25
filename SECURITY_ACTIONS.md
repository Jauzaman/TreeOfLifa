# 🚨 URGENT SECURITY ACTIONS REQUIRED

## Immediate Actions (Do These NOW)

### 1. Rotate Stripe Keys
1. Go to https://dashboard.stripe.com/apikeys
2. Click "Roll secret key" for your Live keys
3. Update environment variables in Vercel with new keys
4. Update your local `.env` file

### 2. Rotate PayPal Credentials
1. Go to https://developer.paypal.com/dashboard/applications
2. Reset your client credentials
3. Update environment variables

### 3. Generate New Gmail App Password
1. Go to https://myaccount.google.com/apppasswords
2. Delete old app password
3. Generate new one
4. Update GMAIL_APP_PASSWORD environment variable

### 4. Create New Admin Key
```bash
# Generate a strong random key:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Update ADMIN_KEY in your environment variables.

### 5. Update config.js
Edit `/Users/jauza/TreeOfLifa/config.js` and replace placeholder values with your NEW keys:
```javascript
window.APP_CONFIG = {
    STRIPE_PUBLISHABLE_KEY: 'pk_live_YOUR_NEW_KEY',
    PAYPAL_CLIENT_ID: 'YOUR_NEW_PAYPAL_CLIENT_ID',
    API_BASE_URL: 'https://tree-of-lifa.vercel.app'
};
```

**IMPORTANT:** Do NOT commit config.js with real values!

### 6. Commit Security Changes
```bash
git add .gitignore .env.example README.md config.js server.js index.html
git commit -m "Security: Remove exposed credentials and add protections"
git push origin main
```

### 7. Remove Exposed Keys from Git History (Advanced)
If you want to completely remove the exposed keys from git history:
```bash
# Use git-filter-repo or BFG Repo-Cleaner
# WARNING: This rewrites history - coordinate with team
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch index.html' \
  --prune-empty --tag-name-filter cat -- --all
```

## Files Changed
- ✅ `.gitignore` - Prevents committing sensitive files
- ✅ `config.js` - Template for client-side configuration
- ✅ `.env.example` - Template for environment variables
- ✅ `server.js` - Added rate limiting and security headers
- ✅ `index.html` - Removed hardcoded keys
- ✅ `README.md` - Security documentation

## Verification Checklist
- [ ] All Stripe keys rotated
- [ ] PayPal credentials rotated
- [ ] Gmail app password regenerated
- [ ] Admin key changed
- [ ] config.js updated with new keys (but not committed)
- [ ] Vercel environment variables updated
- [ ] Tested payment flow with new keys
- [ ] Monitored Stripe dashboard for 24 hours

## Next Steps
1. Deploy changes to Vercel
2. Test all payment methods
3. Monitor logs for any issues
4. Set up automated security scanning
5. Schedule quarterly credential rotation

---
**Priority:** 🔴 CRITICAL - Complete within 24 hours
