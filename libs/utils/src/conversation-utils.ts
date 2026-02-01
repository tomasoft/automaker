/**
 * Conversation history utilities for processing message history
 *
 * Provides standardized conversation history handling:
 * - Extract text from content (string or array format)
 * - Normalize content blocks to array format
 * - Format history as plain text for CLI-based providers
 * - Convert history to Claude SDK message format
 */

import type { ConversationMessage } from '@automaker/types';

/**
 * Extract plain text from message content (handles both string and array formats)
 *
 * @param content - Message content (string or array of content blocks)
 * @returns Extracted text content
 */
export function extractTextFromContent(
  content: string | Array<{ type: string; text?: string; source?: object }>
): string {
  if (typeof content === 'string') {
    return content;
  }

  // Extract text blocks only
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text || '')
    .join('\n');
}

/**
 * Normalize message content to array format
 *
 * @param content - Message content (string or array)
 * @returns Content as array of blocks
 */
export function normalizeContentBlocks(
  content: string | Array<{ type: string; text?: string; source?: object }>
): Array<{ type: string; text?: string; source?: object }> {
  if (Array.isArray(content)) {
    return content;
  }
  return [{ type: 'text', text: content }];
}

/**
 * Format conversation history as plain text for CLI-based providers
 *
 * @param history - Array of conversation messages
 * @returns Formatted text with role labels
 */
export function formatHistoryAsText(history: ConversationMessage[]): string {
  if (history.length === 0) {
    return '';
  }

  let historyText = 'Previous conversation:\n\n';

  for (const msg of history) {
    const contentText = extractTextFromContent(msg.content);
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    historyText += `${role}: ${contentText}\n\n`;
  }

  historyText += '---\n\n';
  return historyText;
}

/**
 * Convert conversation history to Claude SDK message format
 *
 * @param history - Array of conversation messages
 * @returns Array of Claude SDK formatted messages
 */
export function convertHistoryToMessages(history: ConversationMessage[]): Array<{
  type: 'user' | 'assistant';
  session_id: string;
  message: {
    role: 'user' | 'assistant';
    content: Array<{ type: string; text?: string; source?: object }>;
  };
  parent_tool_use_id: null;
}> {
  return history.map((historyMsg) => ({
    type: historyMsg.role,
    session_id: '',
    message: {
      role: historyMsg.role,
      content: normalizeContentBlocks(historyMsg.content),
    },
    parent_tool_use_id: null,
  }));
}

/**
 * Validate and fix conversation history to ensure tool_use/tool_result pairs are complete
 *
 * This prevents the error: "tool_use ids were found without tool_result blocks immediately after"
 *
 * @param messages - Conversation messages to validate
 * @returns Filtered messages with complete tool_use/tool_result pairs only
 */
export function validateToolUsePairs(messages: ConversationMessage[]): ConversationMessage[] {
  const validatedMessages: ConversationMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const nextMsg = messages[i + 1];

    // Check if this message has tool_use blocks (only if content is an array)
    const hasToolUse =
      Array.isArray(msg.content) && msg.content.some((block: any) => block.type === 'tool_use');

    if (hasToolUse) {
      // Extract tool_use IDs from current message
      const toolUseIds = Array.isArray(msg.content)
        ? msg.content
            .filter((block: any) => block.type === 'tool_use')
            .map((block: any) => block.tool_use_id || block.id)
            .filter(Boolean)
        : [];

      // Check if next message has tool_result blocks for all tool_use IDs
      const hasMatchingResults =
        nextMsg &&
        Array.isArray(nextMsg.content) &&
        toolUseIds.every((id) =>
          (nextMsg.content as any[]).some(
            (block: any) => block.type === 'tool_result' && block.tool_use_id === id
          )
        );

      if (!hasMatchingResults) {
        // Skip this message and the next (if it exists) to maintain conversation flow
        console.warn(
          `[conversation-utils] Skipping message ${i} with incomplete tool_use/tool_result pairs`
        );

        // If next message exists and has tool_result blocks, skip it too
        if (
          nextMsg &&
          Array.isArray(nextMsg.content) &&
          nextMsg.content.some((block: any) => block.type === 'tool_result')
        ) {
          i++; // Skip next message as well
        }

        continue;
      }
    }

    validatedMessages.push(msg);
  }

  return validatedMessages;
}

/**
 * Clean conversation messages to remove incomplete tool sequences
 * This is a more aggressive filter that removes any message with tool_use/tool_result blocks
 * that might cause API errors
 *
 * @param messages - Conversation messages to clean
 * @returns Messages with tool blocks removed
 */
export function stripIncompleteToolBlocks(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) {
      return msg;
    }

    // Check if message has tool blocks
    const hasToolBlocks = msg.content.some(
      (block: any) => block.type === 'tool_use' || block.type === 'tool_result'
    );

    if (!hasToolBlocks) {
      return msg;
    }

    // Filter out tool blocks, keep only text
    const textBlocks = msg.content.filter((block: any) => block.type === 'text');

    if (textBlocks.length === 0) {
      // If no text blocks remain, extract text from tool inputs/outputs
      const textContent = msg.content
        .map((block: any) => {
          if (block.type === 'tool_use') {
            return `[Tool: ${block.name}]`;
          }
          if (block.type === 'tool_result') {
            return block.content || '';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');

      return {
        ...msg,
        content: textContent,
      };
    }

    return {
      ...msg,
      content: textBlocks,
    };
  });
}
