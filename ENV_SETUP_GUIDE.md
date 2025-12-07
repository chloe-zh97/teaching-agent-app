# Environment Variables & Secrets Setup Guide

## 🔐 Setting Secrets with Raindrop Framework

Since you're using **Raindrop Framework** (not direct Cloudflare Workers), you need to use Raindrop commands, not Wrangler.

---

## ✅ Method 1: Using Raindrop CLI (Recommended)

### Set the ElevenLabs API Key

```bash
# Set the secret (it will prompt you for the value)
raindrop build env set ELEVENLABS_API_KEY

# Or provide the value directly (less secure - visible in command history)
raindrop build env set ELEVENLABS_API_KEY "your_api_key_here"
```

**⚠️ Security Tip:** Use the first command (without value) so your key isn't stored in command history.

### Verify the Secret is Set

```bash
# Get the secret (value will be masked for security)
raindrop build env get ELEVENLABS_API_KEY
```

---

## 📝 Step-by-Step Instructions

1. **Make sure you're authenticated:**
   ```bash
   raindrop auth list
   ```
   If not logged in:
   ```bash
   raindrop auth login
   ```

2. **Set your ElevenLabs API key:**
   ```bash
   cd "/Users/shluo03/Desktop/ai champion/teaching-agent-app"
   raindrop build env set ELEVENLABS_API_KEY
   ```
   
   When prompted, paste your ElevenLabs API key (it starts with `sk_`)

3. **Verify it's set:**
   ```bash
   raindrop build env get ELEVENLABS_API_KEY
   ```

4. **Deploy/restart your app:**
   ```bash
   npm run start
   ```

---

## 🌐 Method 2: Using Cloudflare Dashboard

If you prefer a GUI approach:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to: **Workers & Pages** → Your Worker Service
3. Go to **Settings** → **Environment Variables**
4. Click **Add variable**
   - Variable name: `ELEVENLABS_API_KEY`
   - Value: Your ElevenLabs API key
   - Type: Secret (encrypted)
5. Click **Save**

**Note:** You'll need to find your specific Worker in the Cloudflare dashboard. Raindrop creates Workers with specific naming patterns.

---

## 💻 Method 3: Local Development (.dev.vars)

For local testing before deployment:

1. Create a `.dev.vars` file in your project root:
   ```bash
   echo "ELEVENLABS_API_KEY=sk_your_key_here" > .dev.vars
   ```

2. **⚠️ CRITICAL:** Add to `.gitignore` to avoid committing secrets:
   ```bash
   echo ".dev.vars" >> .gitignore
   ```

3. Verify it's ignored:
   ```bash
   git status
   # .dev.vars should NOT appear in the list
   ```

---

## 🔍 Get Your ElevenLabs API Key

1. Go to [elevenlabs.io](https://elevenlabs.io)
2. Sign up or log in
3. Navigate to **Profile** → **API Keys**
4. Click **Generate New API Key** or copy existing key
5. The key starts with `sk_`

---

## ✅ Verification Checklist

After setting the secret:

- [ ] Secret is set using `raindrop build env get ELEVENLABS_API_KEY`
- [ ] App is redeployed: `npm run start`
- [ ] Check logs for any errors: `raindrop logs tail`
- [ ] Test an agent creation endpoint

---

## 🐛 Troubleshooting

### Error: "command not found: wrangler"

**Solution:** You're using Raindrop, not Wrangler. Use `raindrop build env set` instead.

### Error: "not authenticated"

**Solution:** 
```bash
raindrop auth login
```

### Secret not appearing in code

**Check:**
1. The secret is set: `raindrop build env get ELEVENLABS_API_KEY`
2. The app is redeployed after setting the secret
3. The code accesses it correctly: `c.env.ELEVENLABS_API_KEY`

### Need to list all secrets

```bash
# Check available commands
raindrop build env --help
```

---

## 📚 Additional Environment Variables

You may also want to set:

```bash
# JWT Configuration (if using JWT auth)
raindrop build env set JWT_SECRET "your-jwt-secret"
raindrop build env set JWT_ISSUER "your-app-name"

# CORS Origins (comma-separated)
raindrop build env set ALLOWED_ORIGINS "https://your-frontend.com,http://localhost:3000"
```

---

## 🔒 Security Best Practices

1. ✅ **Never commit secrets to git** - Always use `.gitignore`
2. ✅ **Use Raindrop secrets** - They're encrypted at rest
3. ✅ **Rotate keys regularly** - Update expired or compromised keys
4. ✅ **Use separate keys** - Different keys for dev/staging/production
5. ✅ **Limit key permissions** - Only grant necessary permissions in ElevenLabs dashboard

---

## Quick Reference

```bash
# Set secret (prompts for value)
raindrop build env set ELEVENLABS_API_KEY

# Get secret (shows masked value)
raindrop build env get ELEVENLABS_API_KEY

# List all commands
raindrop build env --help

# Check authentication
raindrop auth list
```

---

**Need Help?** Check the main `TROUBLESHOOTING.md` guide for more common issues.

