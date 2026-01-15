/**
 * Routes for chat interface
 */

import { Router, type Request, type Response } from 'express';
import type {
  CreateChatSessionRequest,
  SendChatMessageRequest,
  CreateFeatureFromChatRequest,
} from '@automaker/types';
import { getChatService } from '../../services/chat-service.js';
import { createLogger } from '@automaker/utils';

const router = Router();
const logger = createLogger('chat-routes');

/**
 * POST /api/chat/sessions
 * Create a new chat session
 */
router.post(
  '/sessions',
  async (req: Request<object, object, CreateChatSessionRequest>, res: Response) => {
    try {
      const service = getChatService();
      const session = await service.createSession(req.body);

      res.json({ success: true, session });
    } catch (error) {
      logger.error('Failed to create chat session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create chat session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/chat/sessions/:projectPath
 * List all chat sessions for a project
 */
router.get('/sessions/:projectPath', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.params;
    const service = getChatService();
    const sessions = await service.listSessions(decodeURIComponent(projectPath));

    res.json({ success: true, sessions });
  } catch (error) {
    logger.error('Failed to list chat sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list chat sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/chat/sessions/detail/:sessionId
 * Get a specific chat session
 */
router.get('/sessions/detail/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const service = getChatService();
    const session = await service.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found',
      });
    }

    res.json({ success: true, session });
  } catch (error) {
    logger.error('Failed to get chat session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/chat/sessions/:sessionId
 * Delete a chat session
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const service = getChatService();
    await service.deleteSession(sessionId);

    res.json({ success: true, message: 'Chat session deleted' });
  } catch (error) {
    logger.error('Failed to delete chat session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete chat session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/chat/sessions/:sessionId/title
 * Update chat session title
 */
router.patch('/sessions/:sessionId/title', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Title is required',
      });
    }

    const service = getChatService();
    const session = await service.updateSessionTitle(sessionId, title);

    res.json({ success: true, session });
  } catch (error) {
    logger.error('Failed to update chat session title:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update session title',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/chat/sessions/:sessionId/stream
 * Stream a message in a chat session (Server-Sent Events)
 */
router.get('/sessions/:sessionId/stream', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const message = req.query.message as string;

    const service = getChatService();

    // Get the session to retrieve projectPath
    const session = await service.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const stream = service.sendMessage({
      sessionId,
      content: message,
      projectPath: session.projectPath,
    });

    for await (const chunk of stream) {
      // Send as SSE event
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.end();
  } catch (error) {
    logger.error('Failed to stream chat message:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to send message',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } else {
      // If headers already sent, send error as SSE
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`
      );
      res.end();
    }
  }
});

/**
 * POST /api/chat/send
 * Send a message in a chat session (Server-Sent Events for streaming)
 */
router.post(
  '/send',
  async (req: Request<object, object, SendChatMessageRequest>, res: Response) => {
    try {
      const service = getChatService();

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      const stream = service.sendMessage(req.body);

      for await (const chunk of stream) {
        // Send as SSE event
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      res.end();
    } catch (error) {
      logger.error('Failed to send chat message:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to send message',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } else {
        // If headers already sent, send error as SSE
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          })}\n\n`
        );
        res.end();
      }
    }
  }
);

/**
 * POST /api/chat/associate-feature
 * Associate a feature with a chat session
 */
router.post('/associate-feature', async (req: Request, res: Response) => {
  try {
    const { sessionId, featureId } = req.body;

    if (!sessionId || !featureId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and featureId are required',
      });
    }

    const service = getChatService();
    const session = await service.associateFeature(sessionId, featureId);

    res.json({ success: true, session });
  } catch (error) {
    logger.error('Failed to associate feature with chat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to associate feature',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/chat/link-feature
 * Link a feature to the chat session for prompt refinement
 */
router.post('/link-feature', async (req: Request, res: Response) => {
  try {
    const { sessionId, featureId, featureName } = req.body;

    if (!sessionId || !featureId || !featureName) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, featureId, and featureName are required',
      });
    }

    const service = getChatService();
    const session = await service.linkFeature(sessionId, featureId, featureName);

    res.json({ success: true, session });
  } catch (error) {
    logger.error('Failed to link feature with chat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link feature',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/chat/unlink-feature
 * Unlink the feature from the chat session
 */
router.post('/unlink-feature', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required',
      });
    }

    const service = getChatService();
    const session = await service.unlinkFeature(sessionId);

    res.json({ success: true, session });
  } catch (error) {
    logger.error('Failed to unlink feature from chat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unlink feature',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/chat/load-feature-context
 * Load feature spec/description into chat as initial context
 */
router.post('/load-feature-context', async (req: Request, res: Response) => {
  try {
    const { sessionId, featureId, projectPath } = req.body;

    if (!sessionId || !featureId || !projectPath) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, featureId, and projectPath are required',
      });
    }

    const service = getChatService();

    // Import feature loader to get feature data
    const { FeatureLoader } = await import('../../services/feature-loader.js');
    const featureLoader = new FeatureLoader();
    const feature = await featureLoader.get(projectPath, featureId);

    if (!feature) {
      return res.status(404).json({
        success: false,
        error: 'Feature not found',
      });
    }

    // Build context message from feature
    const contextContent = `<details>
<summary>Feature Context: ${feature.title || feature.id}</summary>

**Feature ID:** ${feature.id}
**Category:** ${feature.category || 'General'}
**Description:** ${feature.description || 'No description provided'}

${feature.spec ? `**Current Specification:**\n${feature.spec}\n\n` : ''}
</details>

I want to refine the prompt/specification for this feature. Please review the current spec and help me improve it based on best practices, clarity, and completeness.
Please return the refined specification inside a <feature_spec> XML tag block.
Inside the block, include the "@title: " meta property if you want to update the title.
The rest of the content inside <feature_spec> will be used as the new description.

Example:
<feature_spec>
@title: New Feature Title

# Feature Overview
This is the new description...
</feature_spec>
`;

    // Add context message to the session
    const contextMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      role: 'user' as const,
      content: contextContent,
      timestamp: new Date().toISOString(),
      metadata: {
        type: 'feature-context',
        featureId,
      },
    };

    const session = await service.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found',
      });
    }

    session.messages.push(contextMessage);
    session.updatedAt = new Date().toISOString();

    // Save and link the feature
    await service.linkFeature(sessionId, featureId, feature.title || feature.id);

    res.json({
      success: true,
      feature,
      contextMessage,
      session,
    });
  } catch (error) {
    logger.error('Failed to load feature context:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load feature context',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/chat/update-feature-spec
 * Update feature spec/title/description based on chat discussion
 */
router.post('/update-feature-spec', async (req: Request, res: Response) => {
  try {
    const { sessionId, featureId, newSpec, title, description, projectPath } = req.body;

    if (!sessionId || !featureId || !projectPath) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, featureId, and projectPath are required',
      });
    }

    // Import feature loader to update feature
    const { FeatureLoader } = await import('../../services/feature-loader.js');
    const featureLoader = new FeatureLoader();

    const feature = await featureLoader.get(projectPath, featureId);
    if (!feature) {
      return res.status(404).json({
        success: false,
        error: 'Feature not found',
      });
    }

    // Update feature
    const updates: any = {};
    if (newSpec) updates.spec = newSpec;
    if (title) updates.title = title;
    if (description) updates.description = description;

    await featureLoader.update(projectPath, featureId, updates);

    const updatedFeature = await featureLoader.get(projectPath, featureId);

    const service = getChatService();
    const session = await service.getSession(sessionId);

    res.json({
      success: true,
      feature: updatedFeature,
      session,
    });
  } catch (error) {
    logger.error('Failed to update feature spec:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update feature spec',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
