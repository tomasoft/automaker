/**
 * POST /extract-pdf-text endpoint - Extract text from PDF files
 */

import type { Request, Response } from 'express';

export function createExtractPdfTextHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { base64Content } = req.body;

      if (!base64Content) {
        res.status(400).json({ success: false, error: 'base64Content is required' });
        return;
      }

      // Convert base64 to Uint8Array (required by pdfjs)
      const buffer = Buffer.from(base64Content, 'base64');
      const uint8Array = new Uint8Array(buffer);

      // Use pdfjs-dist - Mozilla's reliable PDF parser
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

      // Load PDF from Uint8Array
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;

      // Extract text from all pages
      const textParts: string[] = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        textParts.push(pageText);
      }

      const text = textParts.join('\n\n').trim();

      res.json({
        success: true,
        text,
      });
    } catch (error) {
      console.error('PDF text extraction failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract text from PDF',
      });
    }
  };
}
