# Google Search Setup Guide

This guide walks you through setting up Google Custom Search for the ecKasse web search functionality.

## Prerequisites

- Google Cloud account with billing enabled
- Project with Gemini API already set up (you should have GEMINI_API_KEY working)

## Step 1: Enable Custom Search API

1. Go to the [Google Cloud Console API Library](https://console.cloud.google.com/apis/library/customsearch.googleapis.com)
2. Select the same project where your Gemini API is enabled
3. Click "Enable" for the "Custom Search API"

## Step 2: Create a Programmable Search Engine

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Click "Get Started" or "Create Search Engine"
3. In "What to search?", select **"Search the entire web"**
4. Give your search engine a name (e.g., "ecKasse Web Search")
5. Click "Create"
6. After creation, you'll see your **Search Engine ID** (looks like: `017576662512468239146:omuauf_lfve`)
7. Copy this ID - this is your `GCS_CX` value

## Step 3: Update Environment Variables

Update your `.env` file:

```env
# Your existing Gemini API key
GEMINI_API_KEY="your_actual_gemini_api_key_here"

# Google Custom Search API Settings
GCS_API_KEY="your_actual_gemini_api_key_here"  # Same as GEMINI_API_KEY
GCS_CX="your_actual_search_engine_id_here"     # From step 2
```

## Step 4: Test the Setup

Run the test script:

```bash
node test_google_research.js
```

## Troubleshooting

### Common Issues

1. **"Google API key not set"**
   - Make sure your GEMINI_API_KEY is valid and active
   - Ensure Custom Search API is enabled in Google Cloud Console

2. **"API key not valid"**
   - Check that the API key has access to Custom Search API
   - Verify billing is enabled on your Google Cloud project

3. **"Search engine ID not found"**
   - Double-check the Search Engine ID from the Programmable Search Engine console
   - Ensure it's set to search the entire web

### Testing Individual Components

```bash
# Test environment setup
node test_google_env.js

# Test basic research functionality
node test_google_research.js
```

## API Limits

- Free tier: 100 search queries per day
- For production use, consider upgrading to paid tier
- Monitor usage in Google Cloud Console

## Security Notes

- Never commit your actual API keys to version control
- Use environment variables for all sensitive configuration
- Consider using Google Cloud IAM for production deployments