/**
 * POST /extract-docx-text endpoint - Extract text from DOCX files
 */

import type { Request, Response } from 'express';
import mammoth from 'mammoth';

export function createExtractDocxTextHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { base64Content } = req.body;
      const filename = req.headers['x-filename'] || 'unknown';

      console.log(`[DOCX] Processing file: ${filename}`);

      if (!base64Content) {
        res.status(400).json({ success: false, error: 'base64Content is required' });
        return;
      }

      // Convert base64 to buffer
      const buffer = Buffer.from(base64Content, 'base64');

      console.log(
        `[DOCX] ${filename} - buffer size: ${buffer.length}, first 4 bytes:`,
        buffer.slice(0, 4).toString('hex')
      );

      // Check if this is actually a DOCX file (should start with PK for ZIP)
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        console.warn(
          `[DOCX] ${filename} - File does not appear to be a DOCX/ZIP file. First bytes:`,
          buffer.slice(0, 10).toString('hex')
        );
        // Check if it's a PDF instead
        if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
          throw new Error(
            `This appears to be a PDF file, not a DOCX. Please use the PDF extraction endpoint. File: ${filename}`
          );
        }
        throw new Error(
          'Invalid DOCX file format. File must be a valid ZIP archive (Office Open XML).'
        );
      }

      // Extract text from DOCX - mammoth accepts Node.js Buffer directly
      const result = await mammoth.extractRawText({ buffer: buffer });
      const text = result.value.trim();

      res.json({
        success: true,
        text,
        messages: result.messages, // Any warnings or errors from mammoth
      });
    } catch (error) {
      console.error('DOCX text extraction failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract text from DOCX',
      });
    }
  };
}
