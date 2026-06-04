# Brave Search Integration - Setup & Testing Guide

## Step 1: Get a Brave Search API Key

1. Go to https://api.search.brave.com/
2. Sign up for a free account or log in
3. Navigate to API Keys section
4. Create a new API key (or copy an existing one)
5. Copy your API key

## Step 2: Configure Local Environment

1. Update your `.env` file in the project root:
   ```bash
   ANTHROPIC_API_KEY=sk-ant-...  # Keep your existing key
   BRAVE_API_KEY=<YOUR_BRAVE_API_KEY_HERE>
   ```

2. Verify both environment variables are set:
   ```bash
   echo $env:ANTHROPIC_API_KEY
   echo $env:BRAVE_API_KEY
   ```

## Step 3: Local Testing

### Option A: Using Netlify CLI (Recommended)

1. Install Netlify CLI if you haven't already:
   ```bash
   npm install -g netlify-cli
   ```

2. In the project root, start the development server:
   ```bash
   netlify dev
   ```
   This will serve the app on `http://localhost:8888`

3. Open http://localhost:8888 in your browser and test:
   - Ask: "What are the latest AI trends in 2026?"
   - Ask: "What's trending in the tech industry right now?"
   - Ask: "Tell me about recent developments in automation"
   - Ask: "What's the current state of AI agents?"

4. Check that:
   - Jarvis searches the web when asking about current/recent information
   - Search results are accurate and include source URLs
   - Response incorporates real data from search results
   - Regular questions (non-current) don't trigger unnecessary searches

### Option B: Manual Testing with curl

1. Start the Netlify dev server:
   ```bash
   netlify dev
   ```

2. Test the search endpoint:
   ```powershell
   $body = @{
       query = "latest AI trends 2026"
   } | ConvertTo-Json
   
   Invoke-WebRequest -Uri "http://localhost:8888/.netlify/functions/brave-search" `
     -Method Post `
     -Headers @{"Content-Type"="application/json"} `
     -Body $body
   ```

3. Test the full chat with search:
   ```powershell
   $messages = @(
       @{
           role = "user"
           content = "What are the latest developments in AI in 2026?"
       }
   ) | ConvertTo-Json
   
   $body = @{
       messages = $messages
       memory = $null
   } | ConvertTo-Json
   
   Invoke-WebRequest -Uri "http://localhost:8888/.netlify/functions/claude" `
     -Method Post `
     -Headers @{"Content-Type"="application/json"} `
     -Body $body
   ```

## Step 4: Troubleshooting

### Issue: "Search service not configured"
- Check that `BRAVE_API_KEY` is set in `.env`
- Restart the dev server after updating `.env`

### Issue: "Invalid search API key"
- Verify your Brave API key is correct
- Make sure you're not using a test/sandbox key - get a real API key from the dashboard

### Issue: "Search rate limit exceeded"
- Brave Search API has rate limits on free tier
- Wait a few minutes before testing again
- Consider upgrading to a paid plan for higher limits

### Issue: Jarvis not using search
- Try explicit phrases like "latest", "current", "recent", "today"
- Check browser console for errors (F12 → Console)
- Check Netlify function logs: `netlify logs --function claude`

### Issue: Search returns no results
- Try different search terms
- Verify Brave API is working independently (see curl test above)
- Check network tab in DevTools (F12 → Network)

## Step 5: Deploy to Production

Once testing is successful:

1. **Add environment variable to Netlify:**
   - Go to your Netlify site dashboard
   - Site Settings → Environment Variables
   - Add: `BRAVE_API_KEY=<your_key>`

2. **Commit and push changes:**
   ```bash
   git add .
   git commit -m "feat: add Brave Search API integration for web search"
   git push
   ```

3. **Deploy:**
   - Automatic: Push to main/master branch (if auto-deploy is enabled)
   - Manual: Go to Netlify dashboard → Deploy → Trigger deploy

4. **Test in production:**
   - Open your live site
   - Ask about current topics and verify search works
   - Check that URLs are cited in responses

## What's New

- **New function**: `netlify/functions/brave-search.js` - Handles all Brave Search API calls
- **Updated function**: `netlify/functions/claude.js` - Now includes web_search tool
- **Updated config**: `.env.example` - Added BRAVE_API_KEY template
- **System prompt**: Updated to explain web search capability to Claude

## How It Works

1. When you ask Jarvis about current/recent information
2. Claude analyzes the question and decides if web search is needed
3. If needed, Claude calls the `web_search` tool with your query
4. The tool sends the query to `netlify/functions/brave-search`
5. The brave-search function calls Brave Search API
6. Results are returned to Claude
7. Claude synthesizes the information into a natural response
8. You see current, sourced information with URLs

## Notes

- Web search is intelligent: Claude only searches when necessary
- Results are limited to 5 most relevant sources
- All search results include URLs for verification
- Search is server-side: privacy is maintained
- Rate limiting applies: be reasonable with search frequency
