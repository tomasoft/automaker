# Azure DevOps Wiki Integration

## Overview

AutoMaker now supports browsing Azure DevOps wiki pages and attaching them to features. This allows agents to access your organization's technical documentation, best practices, and standards when executing features.

## Setup

### 1. Authentication

Navigate to **Settings → DevOps Resources** in AutoMaker.

1. Click **Authenticate with Azure DevOps**
2. You'll receive a device code and URL
3. Visit the URL in your browser and enter the code
4. Sign in with your Azure DevOps account (SSO supported)
5. The authentication will complete automatically

### 2. Configure Wiki Access

Once authenticated, configure your wiki details:

- **Organization**: Your Azure DevOps organization name (e.g., `your-company`)
- **Project**: The project containing your wiki
- **Wiki ID**: The ID of the wiki to browse

> **Finding your Wiki ID**: Navigate to your wiki in Azure DevOps. The URL will be:
> `https://dev.azure.com/{organization}/{project}/_wiki/wikis/{wikiId}`

### 3. Browse Wiki Pages

Click **Browse Wiki Pages** to open the wiki browser:

- **Left Panel**: Tree view of all wiki pages with search functionality
- **Right Panel**: Preview of selected page content
- **Attach Button**: Add the current page to a feature

## Attaching Pages to Features

### From DevOps Resources

1. Navigate to **Settings → DevOps Resources**
2. Configure your wiki (organization, project, wiki ID)
3. Click **Browse Wiki Pages**
4. Select a page from the tree
5. Review the content in the preview pane
6. Click **Attach to Feature**
7. Select the feature from the list
8. The page will be attached and available to the agent

### From Feature Dialogs

When creating or editing a feature:

1. Navigate to the **Resources** tab
2. View all attached wiki pages
3. Remove pages using the trash icon
4. Open wiki pages in a new browser tab using the external link icon

## How It Works

### Authentication Flow

1. AutoMaker initiates an Azure DevOps device authorization flow
2. You authenticate via browser with your SSO credentials
3. No service principals or shared secrets are required
4. Your personal OAuth token is used for all API calls

### Wiki Access

1. AutoMaker calls Azure DevOps REST API (v7.1-preview.1)
2. Fetches list of pages from your configured wiki
3. Retrieves page content when you select a page
4. Stores page content with the feature for agent access

### Agent Execution

When an agent executes a feature with attached wiki pages:

1. The feature's `textFilePaths` array contains all attached pages
2. Each entry includes:
   - `id`: Unique identifier
   - `path`: Azure DevOps wiki URL
   - `filename`: Page name
   - `mimeType`: `text/markdown`
   - `content`: Full markdown content
3. The agent includes this content in its context
4. The agent can reference standards, best practices, and documentation

## Security

- **User OAuth**: Uses your personal Azure DevOps credentials
- **No Shared Secrets**: No service principals or API keys required
- **Organization Control**: Respects your Azure DevOps permissions
- **Secure Storage**: OAuth tokens stored securely in AutoMaker

## API Endpoints

### Server Routes

- `GET /api/azure-devops-wiki/wikis` - List available wikis
- `POST /api/azure-devops-wiki/pages` - List pages in a wiki
- `POST /api/azure-devops-wiki/page` - Get page content

### Request Format

**List Pages**:

```json
{
  "organization": "your-org",
  "project": "your-project",
  "wikiId": "your-wiki-id",
  "path": "/optional/path" // Optional: filter by path
}
```

**Get Page**:

```json
{
  "organization": "your-org",
  "project": "your-project",
  "wikiId": "your-wiki-id",
  "path": "/page/path"
}
```

## Troubleshooting

### Authentication Issues

**Problem**: Device code expires before completing authentication

- **Solution**: The code expires after 15 minutes. Start the authentication flow again.

**Problem**: "Not authenticated" error when browsing

- **Solution**: Re-authenticate from DevOps Resources settings.

### Wiki Access Issues

**Problem**: No pages appear in the browser

- **Solution**: Verify your organization, project, and wiki ID are correct.

**Problem**: "Failed to load pages" error

- **Solution**: Check that you have permission to access the wiki in Azure DevOps.

### Feature Attachment Issues

**Problem**: Attached pages don't appear in feature

- **Solution**: Check the Resources tab in the feature dialog. The page should be listed there.

**Problem**: Agent doesn't seem to use wiki content

- **Solution**: Verify the page content is not empty. Try re-attaching the page.

## Best Practices

1. **Organize Wiki Content**: Structure your wiki with clear categories and naming
2. **Use Meaningful Names**: Page names appear in the feature dialog
3. **Keep Pages Focused**: Smaller, focused pages are more useful than large documents
4. **Regular Updates**: Keep your wiki content current
5. **Test Agent Context**: Verify the agent understands your wiki content by testing features

## Example Use Cases

### Technical Standards

Attach your coding standards wiki page to features:

- Ensures agents follow your team's conventions
- References naming standards, patterns, and practices
- Maintains consistency across generated code

### API Documentation

Attach internal API documentation:

- Agents can reference correct endpoints
- Understand authentication requirements
- Follow proper request/response formats

### Architecture Guidelines

Attach architecture decision records (ADRs):

- Agents understand architectural constraints
- Follow established patterns
- Make consistent technology choices

### Domain Knowledge

Attach domain-specific documentation:

- Agents learn business rules
- Understand terminology
- Apply domain logic correctly

## Future Enhancements

Planned improvements:

- **Auto-discovery**: Automatically suggest relevant wiki pages based on feature description
- **Wiki Templates**: Create feature templates with pre-attached wiki pages
- **Content Caching**: Cache wiki content locally for faster access
- **Version Tracking**: Track which version of a wiki page was used
- **Multi-Wiki Support**: Browse multiple wikis simultaneously
