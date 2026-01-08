# GitHub Copilot Integration

This document describes how to integrate and use GitHub Copilot as a model provider in AutoMaker.

## Overview

AutoMaker now supports GitHub Copilot as a model provider, allowing you to use GPT-4o, GPT-4 Turbo, Claude 3.5 Sonnet, and OpenAI o1 models through your GitHub Copilot subscription.

Based on: [copilot-api](https://github.com/ericc-ch/copilot-api)

## Features

- ✅ Authentication via GitHub device flow or token
- ✅ Support for multiple models (GPT-4o, GPT-4 Turbo, Claude 3.5 Sonnet, o1-preview, o1-mini)
- ✅ Streaming responses
- ✅ Vision support (for compatible models)
- ✅ Tool/function calling support
- ✅ Automatic token refresh

## Prerequisites

- Active GitHub Copilot subscription (Individual, Business, or Enterprise)
- GitHub account with Copilot access

## Setup

### Option 1: Using Environment Variable (Recommended)

Set your GitHub token as an environment variable:

```bash
export GITHUB_TOKEN="ghp_your_github_personal_access_token"
```

Or add it to your `.env` file:

```
GITHUB_TOKEN=ghp_your_github_personal_access_token
```

**Getting a GitHub Personal Access Token:**

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name (e.g., "AutoMaker Copilot")
4. Select scopes: `read:user` (minimum required)
5. Click "Generate token"
6. Copy the token (starts with `ghp_`)

### Option 2: Interactive Authentication

If no token is provided, you can use the interactive device flow:

1. Call the authentication endpoint:
   ```bash
   curl -X POST http://localhost:3008/api/copilot/auth
   ```

2. Follow the instructions:
   - Visit the provided URL
   - Enter the code shown
   - Authorize the application

3. The token will be cached for future use

## API Endpoints

### Authentication

**POST** `/api/copilot/auth`

Initiates GitHub device flow authentication.

**Response:**
```json
{
  "success": true,
  "message": "Successfully authenticated with GitHub Copilot",
  "token": "ghu_xxxxxx..."
}
```

### Status Check

**GET** `/api/copilot/status`

Checks if GitHub Copilot is authenticated and available.

**Response:**
```json
{
  "success": true,
  "status": {
    "installed": true,
    "authenticated": true,
    "hasApiKey": true,
    "method": "sdk"
  }
}
```

### Get Token

**GET** `/api/copilot/token`

Retrieves the current Copilot token (partially masked).

**Response:**
```json
{
  "success": true,
  "token": "ghu_xxxxx...xxxxx"
}
```

## Available Models

The following models are available through GitHub Copilot:

| Model ID | Name | Description | Context Window | Max Output |
|----------|------|-------------|----------------|------------|
| `gpt-4o` | GPT-4o | Most capable GPT-4 model | 128K | 4K |
| `gpt-4o-mini` | GPT-4o Mini | Fast and efficient | 128K | 4K |
| `gpt-4-turbo` | GPT-4 Turbo | Previous gen GPT-4 | 128K | 4K |
| `claude-3.5-sonnet` | Claude 3.5 Sonnet | Claude via Copilot | 200K | 4K |
| `o1-preview` | OpenAI o1 Preview | Advanced reasoning | 128K | 32K |
| `o1-mini` | OpenAI o1 Mini | Faster reasoning | 128K | 64K |

## Using GitHub Copilot Models

### Via Settings UI

1. Open Settings in AutoMaker
2. Go to "Models" section
3. Select a GitHub Copilot model from the dropdown
4. The model will now be used for agent sessions

### Via API

When creating an agent session or sending a message, specify a Copilot model:

```typescript
// Example: Using GPT-4o
await fetch('http://localhost:3008/api/agent/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key'
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    workingDirectory: '/path/to/project'
  })
});
```

### Model Selection

The provider factory automatically routes models based on their names:

- Models starting with `copilot-` → GitHub Copilot provider
- Models matching `gpt-*` patterns → GitHub Copilot provider
- Models matching `o1-*` patterns → GitHub Copilot provider
- Models starting with `claude-*` → Claude provider (unless prefixed with `copilot-`)
- Models starting with `cursor-*` → Cursor provider

## Architecture

### Provider Implementation

The GitHub Copilot integration consists of:

1. **`CopilotAuthManager`** (`apps/server/src/providers/copilot-auth.ts`)
   - Handles GitHub device flow authentication
   - Manages token caching and refresh
   - Converts GitHub tokens to Copilot API tokens

2. **`GitHubCopilotProvider`** (`apps/server/src/providers/github-copilot-provider.ts`)
   - Implements `BaseProvider` interface
   - Streams responses from GitHub Copilot API
   - Handles model mapping and configuration

3. **Routes** (`apps/server/src/routes/copilot/`)
   - `/auth` - Authentication endpoint
   - `/status` - Status check endpoint
   - `/token` - Token retrieval endpoint

### Authentication Flow

```
┌─────────┐                 ┌────────────┐                 ┌─────────────┐
│ Client  │                 │  AutoMaker │                 │   GitHub    │
└────┬────┘                 └─────┬──────┘                 └──────┬──────┘
     │                            │                               │
     │  POST /api/copilot/auth    │                               │
     ├───────────────────────────>│                               │
     │                            │  Request device code          │
     │                            ├──────────────────────────────>│
     │                            │  Device code + user code      │
     │                            │<──────────────────────────────┤
     │  Display instructions      │                               │
     │<───────────────────────────┤                               │
     │                            │                               │
     │    [User authorizes]       │                               │
     │───────────────────────────────────────────────────────────>│
     │                            │                               │
     │                            │  Poll for access token        │
     │                            ├──────────────────────────────>│
     │                            │  Access token                 │
     │                            │<──────────────────────────────┤
     │                            │                               │
     │                            │  Fetch Copilot token          │
     │                            ├──────────────────────────────>│
     │                            │  Copilot API token            │
     │                            │<──────────────────────────────┤
     │  Success + masked token    │                               │
     │<───────────────────────────┤                               │
     │                            │                               │
```

## Troubleshooting

### "No GitHub access token found"

**Solution:** Set the `GITHUB_TOKEN` environment variable or run the authentication flow.

### "Failed to fetch Copilot token"

**Causes:**
- GitHub account doesn't have active Copilot subscription
- GitHub token doesn't have required permissions (`read:user`)
- Copilot subscription expired

**Solution:** 
1. Verify your Copilot subscription at https://github.com/settings/copilot
2. Ensure your token has `read:user` scope
3. Try generating a new GitHub token

### "GitHub Copilot API error"

**Causes:**
- Rate limiting
- Invalid model name
- Network issues

**Solution:**
1. Check rate limits on your GitHub Copilot account
2. Verify model name is supported
3. Check network connectivity to `api.githubcopilot.com`

### Token Expiration

Copilot tokens automatically expire and are refreshed. If you encounter authentication errors:

1. The provider will automatically attempt to refresh the token
2. If refresh fails, re-run authentication: `POST /api/copilot/auth`
3. Or set a fresh `GITHUB_TOKEN` environment variable

## Rate Limits

GitHub Copilot has usage quotas based on your subscription type:

- **Individual:** Varies based on plan
- **Business:** Higher limits, org-wide tracking
- **Enterprise:** Highest limits, custom quotas

The provider automatically handles rate limit responses. If you hit rate limits:

1. Wait for the cooldown period
2. Consider upgrading your Copilot subscription
3. Use different models to distribute load

## Security Considerations

1. **Token Storage:** Tokens are cached in memory only and not persisted to disk
2. **Token Masking:** API endpoints only return partially masked tokens
3. **Environment Variables:** Store `GITHUB_TOKEN` securely (use `.env` file, not committed to git)
4. **Access Control:** Copilot endpoints require AutoMaker API authentication

## Related Documentation

- [Provider Architecture](./server/providers.md)
- [Model Configuration](./server/route-organization.md)
- [copilot-api Repository](https://github.com/ericc-ch/copilot-api)

## Contributing

To add support for new Copilot models:

1. Update `getAvailableModels()` in `GitHubCopilotProvider`
2. Add model mapping in `mapModelToCopilot()` if needed
3. Update model detection in `provider-factory.ts`
4. Test with the new model ID
