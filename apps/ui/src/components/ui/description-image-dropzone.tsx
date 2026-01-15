import React, { useState, useRef, useCallback } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { cn } from '@/lib/utils';

const logger = createLogger('DescriptionImageDropZone');
import { ImageIcon, X, Loader2, FileText, FolderOpen, ExternalLink } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getElectronAPI } from '@/lib/electron';
import { getAuthenticatedImageUrl, apiFetch } from '@/lib/api-fetch';
import { useAppStore, type FeatureImagePath, type FeatureTextFilePath } from '@/store/app-store';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  sanitizeFilename,
  fileToBase64,
  fileToText,
  isTextFile,
  isImageFile,
  validateTextFile,
  getTextFileMimeType,
  generateFileId,
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_TEXT_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_TEXT_FILE_SIZE,
  formatFileSize,
} from '@/lib/image-utils';

// Map to store preview data by image ID (persisted across component re-mounts)
export type ImagePreviewMap = Map<string, string>;

// Re-export for convenience
export type { FeatureImagePath, FeatureTextFilePath };

interface DescriptionImageDropZoneProps {
  value: string;
  onChange: (value: string) => void;
  images: FeatureImagePath[];
  onImagesChange: (images: FeatureImagePath[]) => void;
  textFiles?: FeatureTextFilePath[];
  onTextFilesChange?: (textFiles: FeatureTextFilePath[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maxFiles?: number;
  maxFileSize?: number; // in bytes, default 10MB
  // Optional: pass preview map from parent to persist across tab switches
  previewMap?: ImagePreviewMap;
  onPreviewMapChange?: (map: ImagePreviewMap) => void;
  autoFocus?: boolean;
  error?: boolean; // Show error state with red border
}

export function DescriptionImageDropZone({
  value,
  onChange,
  images,
  onImagesChange,
  textFiles = [],
  onTextFilesChange,
  placeholder = 'Describe the feature...',
  className,
  disabled = false,
  maxFiles = 5,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  previewMap,
  onPreviewMapChange,
  autoFocus = false,
  error = false,
}: DescriptionImageDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // Use parent-provided preview map if available, otherwise use local state
  const [localPreviewImages, setLocalPreviewImages] = useState<Map<string, string>>(
    () => new Map()
  );

  // Determine which preview map to use - prefer parent-controlled state
  const previewImages = previewMap !== undefined ? previewMap : localPreviewImages;
  const setPreviewImages = useCallback(
    (updater: Map<string, string> | ((prev: Map<string, string>) => Map<string, string>)) => {
      if (onPreviewMapChange) {
        const currentMap = previewMap !== undefined ? previewMap : localPreviewImages;
        const newMap = typeof updater === 'function' ? updater(currentMap) : updater;
        onPreviewMapChange(newMap);
      } else {
        setLocalPreviewImages((prev) => {
          const newMap = typeof updater === 'function' ? updater(prev) : updater;
          return newMap;
        });
      }
    },
    [onPreviewMapChange, previewMap, localPreviewImages]
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentProject = useAppStore((state) => state.currentProject);

  // Construct server URL for loading saved images
  const getImageServerUrl = useCallback(
    (imagePath: string): string => {
      const projectPath = currentProject?.path || '';
      return getAuthenticatedImageUrl(imagePath, projectPath);
    },
    [currentProject?.path]
  );

  const saveImageToTemp = useCallback(
    async (base64Data: string, filename: string, mimeType: string): Promise<string | null> => {
      try {
        const api = getElectronAPI();
        // Check if saveImageToTemp method exists
        if (!api.saveImageToTemp) {
          // Fallback path when saveImageToTemp is not available
          logger.info('Using fallback path for image');
          return `.automaker/images/${Date.now()}_${filename}`;
        }

        // Get projectPath from the store if available
        const projectPath = currentProject?.path;
        const result = await api.saveImageToTemp(base64Data, filename, mimeType, projectPath);
        if (result.success && result.path) {
          return result.path;
        }
        logger.error('Failed to save image:', result.error);
        return null;
      } catch (error) {
        logger.error('Error saving image:', error);
        return null;
      }
    },
    [currentProject?.path]
  );

  const processFiles = useCallback(
    async (files: FileList) => {
      if (disabled || isProcessing) return;

      setIsProcessing(true);
      const newImages: FeatureImagePath[] = [];
      const newTextFiles: FeatureTextFilePath[] = [];
      const newPreviews = new Map(previewImages);
      const errors: string[] = [];

      // Calculate total current files
      const currentTotalFiles = images.length + textFiles.length;

      for (const file of Array.from(files)) {
        // Check if it's a text file
        if (isTextFile(file)) {
          const validation = validateTextFile(file, DEFAULT_MAX_TEXT_FILE_SIZE);
          if (!validation.isValid) {
            errors.push(validation.error!);
            continue;
          }

          // Check if we've reached max files
          const totalFiles = newImages.length + newTextFiles.length + currentTotalFiles;
          if (totalFiles >= maxFiles) {
            errors.push(`Maximum ${maxFiles} files allowed.`);
            break;
          }

          try {
            const content = await fileToText(file);
            const sanitizedName = sanitizeFilename(file.name);
            const textFilePath: FeatureTextFilePath = {
              id: generateFileId(),
              path: '', // Text files don't need to be saved to disk
              filename: sanitizedName,
              mimeType: getTextFileMimeType(file.name),
              content,
            };
            newTextFiles.push(textFilePath);
          } catch {
            errors.push(`${file.name}: Failed to read text file.`);
          }
        }
        // Check if it's an image file
        else if (isImageFile(file)) {
          // Validate file size
          if (file.size > maxFileSize) {
            const maxSizeMB = maxFileSize / (1024 * 1024);
            errors.push(`${file.name}: File too large. Maximum size is ${maxSizeMB}MB.`);
            continue;
          }

          // Check if we've reached max files
          const totalFiles = newImages.length + newTextFiles.length + currentTotalFiles;
          if (totalFiles >= maxFiles) {
            errors.push(`Maximum ${maxFiles} files allowed.`);
            break;
          }

          try {
            const base64 = await fileToBase64(file);
            const sanitizedName = sanitizeFilename(file.name);
            const tempPath = await saveImageToTemp(base64, sanitizedName, file.type);

            if (tempPath) {
              const imageId = `img-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
              const imagePathRef: FeatureImagePath = {
                id: imageId,
                path: tempPath,
                filename: sanitizedName,
                mimeType: file.type,
              };
              newImages.push(imagePathRef);
              // Store preview for display
              newPreviews.set(imageId, base64);
            } else {
              errors.push(`${file.name}: Failed to save image.`);
            }
          } catch {
            errors.push(`${file.name}: Failed to process image.`);
          }
        } else {
          errors.push(`${file.name}: Unsupported file type. Use images, .txt, or .md files.`);
        }
      }

      if (errors.length > 0) {
        logger.warn('File upload errors:', errors);
      }

      if (newImages.length > 0) {
        onImagesChange([...images, ...newImages]);
        setPreviewImages(newPreviews);
      }

      if (newTextFiles.length > 0 && onTextFilesChange) {
        onTextFilesChange([...textFiles, ...newTextFiles]);
      }

      setIsProcessing(false);
    },
    [
      disabled,
      isProcessing,
      images,
      textFiles,
      maxFiles,
      maxFileSize,
      onImagesChange,
      onTextFilesChange,
      previewImages,
      saveImageToTemp,
    ]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [disabled, processFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles]
  );

  const handleBrowseClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const removeImage = useCallback(
    (imageId: string) => {
      onImagesChange(images.filter((img) => img.id !== imageId));
      setPreviewImages((prev) => {
        const newMap = new Map(prev);
        newMap.delete(imageId);
        return newMap;
      });
    },
    [images, onImagesChange]
  );

  const removeTextFile = useCallback(
    (fileId: string) => {
      if (onTextFilesChange) {
        onTextFilesChange(textFiles.filter((file) => file.id !== fileId));
      }
    },
    [textFiles, onTextFilesChange]
  );

  // Handle paste events to detect and process images from clipboard
  // Works across all OS (Windows, Linux, macOS)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled || isProcessing) return;

      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const imageFiles: File[] = [];

      // Iterate through clipboard items to find images
      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];

        // Check if the item is an image
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            // Generate a filename for pasted images since they don't have one
            const extension = item.type.split('/')[1] || 'png';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const renamedFile = new File([file], `pasted-image-${timestamp}.${extension}`, {
              type: file.type,
            });
            imageFiles.push(renamedFile);
          }
        }
      }

      // If we found images, process them and prevent default paste behavior
      if (imageFiles.length > 0) {
        e.preventDefault();

        // Create a FileList-like object from the array
        const dataTransfer = new DataTransfer();
        imageFiles.forEach((file) => dataTransfer.items.add(file));
        processFiles(dataTransfer.files);
      }
      // If no images found, let the default paste behavior happen (paste text)
    },
    [disabled, isProcessing, processFiles]
  );

  return (
    <div className={cn('relative', className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_TEXT_EXTENSIONS].join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
        data-testid="description-file-input"
      />

      {/* Drop zone wrapper */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn('relative rounded-md transition-all duration-200', {
          'ring-2 ring-blue-400 ring-offset-2 ring-offset-background': isDragOver && !disabled,
        })}
      >
        {/* Drag overlay */}
        {isDragOver && !disabled && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-blue-500/20 border-2 border-dashed border-blue-400 pointer-events-none"
            data-testid="drop-overlay"
          >
            <div className="flex flex-col items-center gap-2 text-blue-400">
              <ImageIcon className="w-8 h-8" />
              <span className="text-sm font-medium">Drop files here</span>
            </div>
          </div>
        )}

        {/* Textarea */}
        <Textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error}
          className={cn('min-h-[120px]', isProcessing && 'opacity-50 pointer-events-none')}
          data-testid="feature-description-input"
        />
      </div>

      {/* Hint text */}
      <p className="text-xs text-muted-foreground mt-1">
        Paste, drag and drop files, or{' '}
        <button
          type="button"
          onClick={handleBrowseClick}
          className="text-primary hover:text-primary/80 underline"
          disabled={disabled || isProcessing}
        >
          browse
        </button>{' '}
        to attach context (images, .txt, .md)
      </p>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processing files...</span>
        </div>
      )}

      {/* File previews (images and text files) */}
      {(images.length > 0 || textFiles.length > 0) && (
        <div className="mt-3 space-y-2" data-testid="description-file-previews">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">
              {images.length + textFiles.length} file
              {images.length + textFiles.length > 1 ? 's' : ''} attached
            </p>
            <button
              type="button"
              onClick={() => {
                onImagesChange([]);
                setPreviewImages(new Map());
                if (onTextFilesChange) {
                  onTextFilesChange([]);
                }
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              Clear all
            </button>
            {(images.length > 0 || textFiles.length > 0) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const api = getElectronAPI();
                  const firstFile = images[0] || textFiles[0];
                  if (firstFile && firstFile.path) {
                    // Extract folder path from file path
                    const folderPath = firstFile.path.substring(0, firstFile.path.lastIndexOf('/'));
                    if (api?.openPath) {
                      await api.openPath(folderPath);
                    }
                  }
                }}
                className="h-6 text-xs"
              >
                <FolderOpen className="w-3 h-3 mr-1" />
                Show in Folder
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Image previews */}
            {images.map((image) => {
              const imageUrl = previewImages.has(image.id)
                ? previewImages.get(image.id)!
                : getImageServerUrl(image.path);

              return (
                <TooltipProvider key={image.id}>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <div
                        className="relative group rounded-md border border-muted bg-muted/50 overflow-hidden cursor-pointer"
                        data-testid={`description-image-preview-${image.id}`}
                      >
                        {/* Image thumbnail or placeholder */}
                        <div className="w-16 h-16 flex items-center justify-center bg-zinc-800">
                          {previewImages.has(image.id) ? (
                            <img
                              src={previewImages.get(image.id)}
                              alt={image.filename}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <img
                              src={getImageServerUrl(image.path)}
                              alt={image.filename}
                              className="max-w-full max-h-full object-contain"
                              onError={(e) => {
                                // If image fails to load, hide it
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                        </div>
                        {/* Remove button */}
                        {!disabled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(image.id);
                            }}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            data-testid={`remove-description-image-${image.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        {/* Filename tooltip on hover */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[10px] text-white truncate">{image.filename}</p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="p-2">
                      <div className="space-y-2">
                        <div className="font-semibold text-sm">{image.filename}</div>
                        <img
                          src={imageUrl}
                          alt={image.filename}
                          className="max-w-sm max-h-64 object-contain rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
            {/* Text file previews */}
            {textFiles.map((file) => {
              // Detect file type from extension
              const extension = file.filename.split('.').pop()?.toLowerCase() || '';
              const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
              const textExtensions = [
                'txt',
                'md',
                'json',
                'xml',
                'html',
                'css',
                'js',
                'ts',
                'tsx',
                'jsx',
                'yml',
                'yaml',
                'log',
                'csv',
              ];
              const pdfExtensions = ['pdf'];

              const isImage = imageExtensions.includes(extension);
              const isText = textExtensions.includes(extension);
              const isPdf = pdfExtensions.includes(extension);
              const isBinary = !isImage && !isText && !isPdf;

              // Prepare preview content
              let previewContent = '';
              let dataUrl = '';

              // For PDFs, create authenticated blob URL
              const [pdfBlobUrl, setPdfBlobUrl] = React.useState<string>('');

              React.useEffect(() => {
                if (isPdf && file.path && !pdfBlobUrl) {
                  // Fetch PDF with authentication and create blob URL
                  const endpoint = `/api/fs/image?path=${encodeURIComponent(file.path)}`;

                  apiFetch(endpoint, 'GET')
                    .then((response) => response.blob())
                    .then((blob) => {
                      const blobUrl = URL.createObjectURL(blob);
                      setPdfBlobUrl(blobUrl);
                    })
                    .catch((err) => {
                      console.error('Failed to load PDF:', err);
                    });
                }

                return () => {
                  if (pdfBlobUrl) {
                    URL.revokeObjectURL(pdfBlobUrl);
                  }
                };
              }, [isPdf, file.path, pdfBlobUrl]);

              // Helper to open file
              const openFile = async () => {
                try {
                  const api = getElectronAPI();
                  if (api?.openPath && file.path) {
                    await api.openPath(file.path);
                  }
                } catch (error) {
                  console.error('Failed to open file:', error);
                }
              };

              if (isImage) {
                // For images, content is base64
                dataUrl = `data:image/${extension};base64,${file.content}`;
              } else if (isText) {
                // For text files, decode base64 content
                try {
                  if (file.content && /^[A-Za-z0-9+/=]+$/.test(file.content)) {
                    previewContent = atob(file.content);
                  } else {
                    previewContent = file.content || '';
                  }
                  if (previewContent.length > 500) {
                    previewContent = previewContent.substring(0, 500) + '...';
                  }
                } catch (e) {
                  console.error('Failed to decode text content:', e);
                  previewContent = 'Unable to decode file content';
                }
              }

              return (
                <TooltipProvider key={file.id}>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <div
                        className="relative group rounded-md border border-muted bg-muted/50 overflow-hidden cursor-pointer"
                        data-testid={`description-text-file-preview-${file.id}`}
                      >
                        {/* Text file icon */}
                        <div className="w-16 h-16 flex items-center justify-center bg-zinc-800">
                          <FileText className="w-6 h-6 text-muted-foreground" />
                        </div>
                        {/* Remove button */}
                        {!disabled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTextFile(file.id);
                            }}
                            className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            data-testid={`remove-description-text-file-${file.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        {/* Filename and size tooltip on hover */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[10px] text-white truncate">{file.filename}</p>
                          <p className="text-[9px] text-white/70">
                            {formatFileSize(file.content.length)}
                          </p>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-2xl max-h-[600px] overflow-auto">
                      <div className="space-y-2">
                        <div className="font-semibold text-sm border-b pb-1 mb-2">
                          {file.filename}
                        </div>
                        {isImage ? (
                          // Image preview
                          <img
                            src={dataUrl}
                            alt={file.filename}
                            className="max-w-lg max-h-96 object-contain rounded"
                            onError={(e) => {
                              console.error('Image preview error for', file.filename);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : isPdf ? (
                          // PDF preview - serve from authenticated blob URL
                          <div className="space-y-2">
                            {pdfBlobUrl ? (
                              <iframe
                                src={pdfBlobUrl}
                                className="w-[600px] h-[500px] rounded border border-muted"
                                title={file.filename}
                              />
                            ) : (
                              <div className="w-[600px] h-[500px] flex items-center justify-center bg-zinc-900 rounded">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={openFile}
                              className="w-full"
                            >
                              <ExternalLink className="w-3 h-3 mr-2" />
                              Open in PDF Viewer
                            </Button>
                          </div>
                        ) : isText ? (
                          // Text content preview
                          <pre className="text-xs whitespace-pre-wrap font-mono bg-zinc-900 p-2 rounded max-w-lg">
                            {previewContent || 'No preview available'}
                          </pre>
                        ) : (
                          // Binary file with open button
                          <div className="text-sm space-y-3 p-3 bg-zinc-900 rounded">
                            <div className="space-y-1">
                              <div>
                                <span className="text-muted-foreground">Type:</span>{' '}
                                {extension.toUpperCase()} file
                              </div>
                              <div>
                                <span className="text-muted-foreground">Size:</span>{' '}
                                {formatFileSize(file.content.length)}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Preview not available for {extension.toUpperCase()} files
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={openFile}
                              className="w-full"
                            >
                              <ExternalLink className="w-3 h-3 mr-2" />
                              Open with Default App
                            </Button>
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground pt-1 border-t">
                          {isImage
                            ? 'Image'
                            : isPdf
                              ? 'PDF Document'
                              : isText
                                ? 'Text file'
                                : 'Binary file'}{' '}
                          • {formatFileSize(file.content.length)}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
