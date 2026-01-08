# GitHub Copilot Setup Wizard Integration

This document describes the GitHub Copilot setup wizard integration that was added to the AutoMaker onboarding flow.

## Overview

GitHub Copilot is now fully integrated into the AutoMaker setup wizard, appearing as a dedicated step after Cursor setup. Users can authenticate with GitHub Copilot using either:

1. **Environment Variable** - Set `GITHUB_TOKEN` before starting the app (recommended)
2. **Interactive Login** - Use GitHub device flow to authenticate directly from the UI

## Setup Flow

The new setup flow is:

```
Welcome → Theme → Claude → Cursor → **GitHub Copilot** → GitHub CLI → Complete
```

The GitHub Copilot step is optional and can be skipped if users don't have a Copilot subscription.

## User Experience

### Initial State

When users reach the Copilot step, they see:

- Current authentication status
- Two authentication options:
  - Option 1: Instructions to set `GITHUB_TOKEN` environment variable
  - Option 2: Interactive login button

### Authentication Methods

#### Option 1: Environment Variable (Recommended)

**Setup:**

```bash
export GITHUB_TOKEN="ghp_your_github_personal_access_token"
```

**Advantages:**

- No interaction needed during setup
- Token persists across restarts
- Better for automated deployments

**How to get a token:**

1. Visit https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "AutoMaker Copilot")
4. Select scope: `read:user` (minimum required)
5. Generate and copy the token

#### Option 2: Interactive Login

**Flow:**

1. User clicks "Start Interactive Login" button
2. Server initiates GitHub device flow
3. User sees instructions in server console:
   - URL to visit (e.g., https://github.com/login/device)
   - Code to enter
4. User completes authorization on GitHub
5. Server polls for completion
6. UI automatically updates when authenticated

**Advantages:**

- No need to generate token manually
- Guided process with clear instructions
- Works without touching environment variables

### Authenticated State

Once authenticated, users see:

- ✓ Checkmark indicating success
- Confirmation message
- List of available models
- Option to continue or refresh status

## Technical Implementation

### Backend Components

#### 1. Status Endpoint

**Route:** `GET /api/setup/copilot-status`

**Response:**

```json
{
  "success": true,
  "installed": true,
  "authenticated": true,
  "hasApiKey": true,
  "method": "sdk",
  "instructions": "..."
}
```

#### 2. Authentication Endpoint

**Route:** `POST /api/setup/auth-copilot`

**Response:**

```json
{
  "success": true,
  "authenticated": true,
  "message": "Successfully authenticated with GitHub Copilot",
  "tokenPreview": "ghu_xxxxx..."
}
```

### Frontend Components

#### 1. Setup Store Updates

**Added State:**

```typescript
export interface CopilotStatus {
  installed: boolean;
  authenticated: boolean;
  hasApiKey: boolean;
  method: string;
  error?: string;
  instructions?: string;
}
```

**Added Actions:**

- `setCopilotStatus(status: CopilotStatus | null)`

#### 2. Setup Step Component

**Location:** `apps/ui/src/components/views/setup-view/steps/copilot-setup-step.tsx`

**Features:**

- Auto-checks status on mount
- Displays current authentication state
- Shows instructions for both auth methods
- "Start Interactive Login" button
- "Refresh Status" button to re-check
- "Skip for Now" option
- Only allows "Continue" when authenticated

#### 3. API Client Methods

**Added to `HttpApiClient`:**

```typescript
getCopilotStatus(): Promise<CopilotStatusResponse>
authCopilot(): Promise<CopilotAuthResponse>
```

## Setup Wizard Flow Logic

### Navigation

```typescript
// Forward navigation
cursor → copilot → github

// Backward navigation
github → copilot → cursor
```

### Skip Logic

- Skip button is available at all times
- Skipping moves to next step (GitHub CLI setup)
- Can return to configure later via Settings

### Completion

- Continue button only enabled when authenticated
- Or user can skip to proceed without Copilot
- Authentication status saved in setup store

## Files Modified/Created

### Backend (3 files)

- `apps/server/src/routes/setup/routes/copilot-status.ts` (new)
- `apps/server/src/routes/setup/routes/auth-copilot.ts` (new)
- `apps/server/src/routes/setup/index.ts` (modified - registered routes)

### Frontend (5 files)

- `apps/ui/src/store/setup-store.ts` (modified - added Copilot state)
- `apps/ui/src/lib/http-api-client.ts` (modified - added API methods)
- `apps/ui/src/components/views/setup-view.tsx` (modified - added step)
- `apps/ui/src/components/views/setup-view/steps/index.ts` (modified - exported component)
- `apps/ui/src/components/views/setup-view/steps/copilot-setup-step.tsx` (new)

## User Guidance

### During Setup

The UI provides:

- Clear status indicators (✓ for success, yellow for pending)
- Contextual instructions based on current state
- Direct link to GitHub token generation page
- Error messages if authentication fails
- Success confirmation when complete

### After Setup

Users can:

- Select Copilot models from model dropdowns
- Use GPT-4o, Claude 3.5 Sonnet, o1-preview, etc.
- Re-authenticate if needed via Settings
- Check status via `/api/setup/copilot-status`

## Troubleshooting

### Common Issues

1. **"No GitHub access token found"**
   - Ensure `GITHUB_TOKEN` is set
   - Or use interactive login

2. **"Failed to fetch Copilot token"**
   - Verify Copilot subscription is active
   - Check token has `read:user` scope
   - Try generating a new token

3. **Authentication timeout**
   - Interactive flow has ~60 second timeout
   - Retry if device code expired
   - Use environment variable method instead

### Server Console

When using interactive login, watch server console for:

```
===========================================
GitHub Authentication Required
===========================================

Please visit: https://github.com/login/device

And enter code: XXXX-XXXX

===========================================
```

## Future Enhancements

Possible improvements:

- [ ] Show device code in UI instead of console only
- [ ] Display remaining quota/usage in setup step
- [ ] Auto-detect if token is expired and re-authenticate
- [ ] Remember authentication across app restarts
- [ ] Support for Business/Enterprise account types

## Related Documentation

- [GitHub Copilot Integration](./github-copilot-integration.md) - Full provider documentation
- [Setup Wizard Architecture](./setup-wizard.md) - General setup flow documentation
- [Provider Architecture](./server/providers.md) - How providers work

## Testing

To test the integration:

1. **Without GITHUB_TOKEN:**

   ```bash
   # Start app
   pnpm dev

   # Go through setup wizard
   # When reaching Copilot step, click "Start Interactive Login"
   # Follow console instructions
   ```

2. **With GITHUB_TOKEN:**

   ```bash
   export GITHUB_TOKEN="ghp_..."
   pnpm dev

   # Go through setup wizard
   # Copilot step should show authenticated immediately
   ```

3. **Skip and configure later:**
   ```bash
   # Click "Skip for Now" during setup
   # Later, go to Settings → Providers → GitHub Copilot
   ```
