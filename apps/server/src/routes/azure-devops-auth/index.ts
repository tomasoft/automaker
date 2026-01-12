/**
 * Azure DevOps authentication routes
 *
 * Provides OAuth 2.0 device flow endpoints for Azure DevOps wiki access
 */

import express from 'express';
import { createStartAzureAuthHandler } from './routes/start-azure-auth.js';
import { createPollAzureAuthHandler } from './routes/poll-azure-auth.js';
import { createCheckAzureAuthHandler } from './routes/check-azure-auth.js';
import { createLogoutAzureAuthHandler } from './routes/logout-azure-auth.js';

const router = express.Router();

// Start device flow authentication
router.post('/start', createStartAzureAuthHandler());

// Poll for authentication completion
router.post('/poll', createPollAzureAuthHandler());

// Check current authentication status
router.get('/status', createCheckAzureAuthHandler());

// Logout and revoke tokens
router.delete('/logout', createLogoutAzureAuthHandler());

export default router;
