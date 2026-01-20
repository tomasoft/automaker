import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Download,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Paperclip,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { getElectronAPI } from '@/lib/electron';
import { getModelProvider, addProviderPrefix } from '@automaker/types';

interface AzureWorkItem {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  assignedTo: string;
  description?: string;
  acceptanceCriteria?: string;
  tags?: string;
  priority?: number;
  url: string;
  parentId?: number;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
}

interface ChildWorkItem {
  id: number;
  title: string;
  workItemType: string;
  state: string;
  description?: string;
  acceptanceCriteria?: string;
  url: string;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
  }>;
}

interface ImportWorkItemsDialogProps {
  open: boolean;
  onClose: () => void;
  projectPath: string;
  onImported?: () => void;
}

export function ImportWorkItemsDialog({
  open,
  onClose,
  projectPath,
  onImported,
}: ImportWorkItemsDialogProps) {
  const addFeature = useAppStore((state) => state.addFeature);
  const phaseModels = useAppStore((state) => state.phaseModels);
  const defaultPlanningMode = useAppStore((state) => state.defaultPlanningMode);
  const defaultRequirePlanApproval = useAppStore((state) => state.defaultRequirePlanApproval);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [workItems, setWorkItems] = useState<AzureWorkItem[]>([]);
  const [childWorkItems, setChildWorkItems] = useState<Map<number, ChildWorkItem[]>>(new Map());
  const [selectedWorkItems, setSelectedWorkItems] = useState<Set<number>>(new Set());
  const [selectedChildren, setSelectedChildren] = useState<Set<number>>(new Set());
  const [expandedWorkItems, setExpandedWorkItems] = useState<Set<number>>(new Set());
  const [organization, setOrganization] = useState('');
  const [project, setProject] = useState('');

  // Get Azure DevOps config from server when dialog opens
  useEffect(() => {
    const loadConfig = async () => {
      if (!open) return;

      try {
        // Check auth status (server will auto-detect session)
        const authCheckUrl = 'http://localhost:3008/api/azure-auth/status';

        const authResponse = await fetch(authCheckUrl);

        console.log('[ImportWorkItems] Auth check URL:', authCheckUrl);
        console.log('[ImportWorkItems] Auth check response status:', authResponse.status);

        if (!authResponse.ok) {
          console.warn('[ImportWorkItems] Auth check failed with status:', authResponse.status);
          toast.error('Failed to check Azure DevOps authentication');
          return;
        }

        const authData = await authResponse.json();
        console.log(
          '[ImportWorkItems] Auth check response data:',
          JSON.stringify(authData, null, 2)
        );

        if (!authData.authenticated) {
          console.warn(
            '[ImportWorkItems] Not authenticated with Azure DevOps. Auth data:',
            authData
          );
          toast.error(
            'Not authenticated with Azure DevOps. Please authenticate in Settings → DevOps Resources.'
          );
          return;
        }

        console.log('[ImportWorkItems] Authenticated successfully');

        // Now get the config
        const azureConfigResponse = await fetch(
          'http://localhost:3008/api/azure-devops-wiki/config',
          {
            credentials: 'include',
          }
        );

        if (azureConfigResponse.ok) {
          const configData = await azureConfigResponse.json();
          if (configData.success && configData.organization && configData.project) {
            setOrganization(configData.organization);
            setProject(configData.project);
          } else if (configData.authenticated && !configData.organization) {
            // User is authenticated but config not in settings - check localStorage
            const localOrg = localStorage.getItem('azure_devops_organization');
            const localProject = localStorage.getItem('azure_devops_project');
            const localWikiId = localStorage.getItem('azure_devops_wikiId');

            if (localOrg && localProject) {
              setOrganization(localOrg);
              setProject(localProject);
            } else {
              toast.error('Azure DevOps organization and project not configured');
            }
          } else if (!configData.authenticated) {
            toast.error('Not authenticated with Azure DevOps');
          } else {
            toast.error('Azure DevOps organization and project not configured');
          }
        } else {
          toast.error('Failed to load Azure DevOps configuration');
        }
      } catch (error) {
        console.error('Failed to load Azure config:', error);
        toast.error('Failed to load Azure DevOps configuration');
      }
    };

    loadConfig();
  }, [open]);

  // Fetch work items when dialog opens
  useEffect(() => {
    const fetchWorkItems = async () => {
      if (!open || !organization || !project) {
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:3008/api/azure-devops-work-items/list?organization=${encodeURIComponent(organization)}&project=${encodeURIComponent(project)}`,
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              'Not authenticated with Azure DevOps. Please authenticate in Settings → DevOps Resources.'
            );
          }
          throw new Error('Failed to fetch work items');
        }

        const data = await response.json();
        if (data.success && data.workItems) {
          // Filter out work items that have a parent in the current result set
          // This prevents showing tasks both at the top level and as children of their feature
          const allWorkItemIds = new Set(data.workItems.map((wi: AzureWorkItem) => wi.id));
          const topLevelWorkItems = data.workItems.filter((wi: AzureWorkItem) => {
            // Include the work item if it has no parent, or if its parent is not in this result set
            return !wi.parentId || !allWorkItemIds.has(wi.parentId);
          });

          setWorkItems(topLevelWorkItems);
          const filteredCount = data.workItems.length - topLevelWorkItems.length;
          if (filteredCount > 0) {
            toast.success(
              `Found ${data.workItems.length} work items (${filteredCount} shown as children)`
            );
          } else {
            toast.success(`Found ${topLevelWorkItems.length} work items assigned to you`);
          }
        } else {
          throw new Error(data.error || 'Failed to fetch work items');
        }
      } catch (error) {
        console.error('Failed to fetch work items:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to fetch work items');
        setWorkItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkItems();
  }, [open, organization, project]);

  // Fetch child work items when a work item is expanded
  const fetchChildWorkItems = useCallback(
    async (parentId: number) => {
      if (!organization || !project) {
        return;
      }

      try {
        const response = await fetch(
          `http://localhost:3008/api/azure-devops-work-items/children?organization=${encodeURIComponent(organization)}&project=${encodeURIComponent(project)}&parentId=${parentId}`,
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch child work items');
        }

        const data = await response.json();
        if (data.success && data.childWorkItems) {
          setChildWorkItems((prev) => new Map(prev).set(parentId, data.childWorkItems));
        }
      } catch (error) {
        console.error('Failed to fetch child work items:', error);
        toast.error('Failed to fetch child work items');
      }
    },
    [organization, project]
  );

  const toggleWorkItemExpanded = useCallback(
    (workItemId: number) => {
      setExpandedWorkItems((prev) => {
        const next = new Set(prev);
        if (next.has(workItemId)) {
          next.delete(workItemId);
        } else {
          next.add(workItemId);
          // Fetch children if not already loaded
          if (!childWorkItems.has(workItemId)) {
            fetchChildWorkItems(workItemId);
          }
        }
        return next;
      });
    },
    [childWorkItems, fetchChildWorkItems]
  );

  const toggleWorkItemSelected = (workItemId: number) => {
    const workItem = workItems.find((wi) => wi.id === workItemId);

    setSelectedWorkItems((prev) => {
      const next = new Set(prev);
      if (next.has(workItemId)) {
        next.delete(workItemId);
        // Also deselect children when deselecting a Feature
        if (workItem?.workItemType === 'Feature') {
          const children = childWorkItems.get(workItemId);
          if (children) {
            setSelectedChildren((prevChildren) => {
              const nextChildren = new Set(prevChildren);
              children.forEach((child) => nextChildren.delete(child.id));
              return nextChildren;
            });
          }
        }
      } else {
        next.add(workItemId);
        // Auto-select children when selecting a Feature
        if (workItem?.workItemType === 'Feature') {
          const children = childWorkItems.get(workItemId);
          if (children) {
            setSelectedChildren((prevChildren) => {
              const nextChildren = new Set(prevChildren);
              children.forEach((child) => nextChildren.add(child.id));
              return nextChildren;
            });
          }
        }
      }
      return next;
    });
  };

  const toggleChildSelected = (childId: number) => {
    setSelectedChildren((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) {
        next.delete(childId);
      } else {
        next.add(childId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedWorkItems.size === workItems.length) {
      setSelectedWorkItems(new Set());
      setSelectedChildren(new Set());
    } else {
      setSelectedWorkItems(new Set(workItems.map((wi) => wi.id)));
      // Don't auto-select children
    }
  };

  const handleImport = async () => {
    if (selectedWorkItems.size === 0 && selectedChildren.size === 0) {
      toast.error('Please select at least one work item to import');
      return;
    }

    setIsImporting(true);
    try {
      // When a Feature is selected, we import its children (User Stories/Bugs) instead
      // of the Feature itself. Non-Feature work items are imported directly.
      const selectedItems = workItems.filter((wi) => selectedWorkItems.has(wi.id));
      const itemsToImport: ChildWorkItem[] = [];

      // For each selected work item:
      // - If it's a Feature, import all its children
      // - If it's not a Feature (Bug, User Story, etc.), import it directly
      for (const item of selectedItems) {
        if (item.workItemType === 'Feature') {
          // Import children of this Feature
          let children = childWorkItems.get(item.id);

          // If children haven't been loaded yet, fetch them
          if (!children) {
            await fetchChildWorkItems(item.id);
            children = childWorkItems.get(item.id);
          }

          if (children && children.length > 0) {
            itemsToImport.push(...children);
          } else {
            toast.warning(`Feature "${item.title}" has no child work items to import`);
          }
        } else {
          // Import non-Feature work items directly
          itemsToImport.push({
            id: item.id,
            title: item.title,
            workItemType: item.workItemType,
            state: item.state,
            description: item.description,
            acceptanceCriteria: item.acceptanceCriteria,
            url: item.url,
            attachments: item.attachments,
          });
        }
      }

      // Also include manually selected children
      childWorkItems.forEach((children, parentId) => {
        children.forEach((child) => {
          if (selectedChildren.has(child.id) && !itemsToImport.find((i) => i.id === child.id)) {
            itemsToImport.push(child);
          }
        });
      });

      // Helper function to fetch and process comments
      const getWorkItemComments = async (workItemId: number): Promise<string> => {
        try {
          const response = await fetch(
            `http://localhost:3008/api/azure-devops-work-items/comments?organization=${encodeURIComponent(organization)}&project=${encodeURIComponent(project)}&workItemId=${workItemId}`,
            { credentials: 'include' }
          );

          if (!response.ok) {
            console.warn(`Failed to fetch comments for work item ${workItemId}`);
            return '';
          }

          const data = await response.json();
          if (!data.success || !data.comments || data.comments.length === 0) {
            return '';
          }

          // Filter out our own "Imported to AutoMaker" comments
          const relevantComments = data.comments.filter(
            (comment: any) =>
              !comment.text.includes('Imported to AutoMaker as feature') &&
              !comment.text.includes('Linked to AutoMaker feature')
          );

          if (relevantComments.length === 0) {
            return '';
          }

          // Format comments as markdown
          const commentsText = relevantComments
            .map((comment: any) => {
              // Strip HTML tags for simple text extraction
              const textContent = comment.text.replace(/<[^>]*>/g, '').trim();
              return `**Comment by ${comment.createdBy} (${new Date(comment.createdDate).toLocaleDateString()}):**\n${textContent}`;
            })
            .join('\n\n---\n\n');

          return `\n\n## Comments from Azure DevOps\n\n${commentsText}`;
        } catch (error) {
          console.warn(`Failed to fetch comments for work item ${workItemId}:`, error);
          return '';
        }
      };

      // Helper function to download comment attachments
      const downloadCommentAttachments = async (
        workItemId: number,
        featureId: string
      ): Promise<
        Array<{ id: string; path: string; filename: string; mimeType: string; content: string }>
      > => {
        try {
          const response = await fetch(
            `http://localhost:3008/api/azure-devops-work-items/comments?organization=${encodeURIComponent(organization)}&project=${encodeURIComponent(project)}&workItemId=${workItemId}`,
            { credentials: 'include' }
          );

          if (!response.ok) {
            return [];
          }

          const data = await response.json();
          if (!data.success || !data.comments) {
            return [];
          }

          // Collect all attachments from comments
          const allAttachments: Array<{ id: string; name: string; url: string }> = [];
          for (const comment of data.comments) {
            if (comment.attachments && comment.attachments.length > 0) {
              allAttachments.push(...comment.attachments);
            }
          }

          if (allAttachments.length === 0) {
            return [];
          }

          console.log(
            `Found ${allAttachments.length} attachments in comments for work item ${workItemId}`
          );

          // Download comment attachments using same logic as work item attachments
          return await downloadAttachments(
            { id: workItemId, attachments: allAttachments } as any,
            featureId
          );
        } catch (error) {
          console.warn(
            `Failed to download comment attachments for work item ${workItemId}:`,
            error
          );
          return [];
        }
      };

      // Helper function to download and save attachments
      const downloadAttachments = async (
        workItem:
          | AzureWorkItem
          | ChildWorkItem
          | { id: number; attachments: Array<{ id: string; name: string; url: string }> },
        featureId: string
      ): Promise<
        Array<{ id: string; path: string; filename: string; mimeType: string; content: string }>
      > => {
        if (!workItem.attachments || workItem.attachments.length === 0) {
          console.log(`No attachments found for work item ${workItem.id}`);
          return [];
        }

        console.log(
          `Downloading ${workItem.attachments.length} attachments for work item ${workItem.id}:`,
          workItem.attachments.map((a) => a.name)
        );

        const api = getElectronAPI();
        const attachmentFiles: Array<{
          id: string;
          path: string;
          filename: string;
          mimeType: string;
          content: string;
        }> = [];

        for (const attachment of workItem.attachments) {
          try {
            console.log(`Processing attachment: ${attachment.name}`);

            // Download attachment from server
            const response = await fetch(
              `http://localhost:3008/api/azure-devops-work-items/attachment/${attachment.id}?organization=${encodeURIComponent(organization)}&project=${encodeURIComponent(project)}`,
              { credentials: 'include' }
            );

            if (!response.ok) {
              console.warn(
                `Failed to download attachment ${attachment.name}:`,
                response.statusText
              );
              continue;
            }

            const blob = await response.blob();
            console.log(
              `Downloaded blob for ${attachment.name}, size: ${blob.size}, type: ${blob.type}`
            );

            const arrayBuffer = await blob.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            console.log(`ArrayBuffer size: ${buffer.length}`);

            // Convert to base64
            const base64 = btoa(String.fromCharCode(...buffer));
            const mimeType = blob.type || 'application/octet-stream';
            console.log(`Base64 length: ${base64.length}, mimeType: ${mimeType}`);

            // First save to temp location
            if (!api.saveImageToTemp) {
              console.warn('saveImageToTemp not available, skipping attachment:', attachment.name);
              continue;
            }

            const tempResult = await api.saveImageToTemp(
              base64,
              attachment.name,
              mimeType,
              projectPath
            );

            console.log(`saveImageToTemp result:`, tempResult);

            if (!tempResult.success || !tempResult.path) {
              console.warn(`Failed to save attachment ${attachment.name}`);
              continue;
            }

            // Save to context folder with base64 encoding
            const contextPath = `${projectPath}/.automaker/features/${featureId}/context`;
            const contextFilePath = `${contextPath}/${attachment.name}`;

            console.log(`Saving to context: ${contextFilePath}`);

            // Create context directory
            await api.mkdir(contextPath);

            // Write file with base64 encoding - server will decode and save as binary
            const writeResult = await api.writeFile(contextFilePath, base64, 'base64');
            console.log(`Write result:`, writeResult);

            if (writeResult.success) {
              console.log(`Successfully saved ${attachment.name} to ${contextFilePath}`);

              // Delete the temp file now that it's been moved to context folder
              try {
                if (api.deleteFile) {
                  await api.deleteFile(tempResult.path);
                  console.log(`Deleted temp file: ${tempResult.path}`);
                }
              } catch (cleanupError) {
                console.warn(`Failed to delete temp file ${tempResult.path}:`, cleanupError);
              }

              attachmentFiles.push({
                id: `attachment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                path: contextFilePath,
                filename: attachment.name,
                mimeType,
                content: base64, // Keep base64 for preview
              });
            } else {
              console.warn(`Failed to save file for ${attachment.name}`);
            }
          } catch (error) {
            console.error(`Failed to save attachment ${attachment.name}:`, error);
          }
        }

        return attachmentFiles;
      };

      // Convert work items to features and add to store
      let importCount = 0;
      const api = getElectronAPI();

      if (!api.features) {
        throw new Error('Features API not available');
      }

      // Import all items (children of Features or directly selected non-Feature items)
      for (const child of itemsToImport) {
        // Get default model from phase models (same as Add Feature dialog)
        const defaultPhaseModel = phaseModels.featureGenerationModel;
        const defaultThinkingLevel = defaultPhaseModel?.thinkingLevel || 'none';

        // Normalize the model to include provider prefix if needed
        let normalizedModel: string;
        if (defaultPhaseModel?.model) {
          const modelString = defaultPhaseModel.model as string;
          const provider = getModelProvider(modelString);
          normalizedModel = addProviderPrefix(modelString, provider);
        } else {
          // Fallback to sonnet (same as Add Feature dialog)
          normalizedModel = 'sonnet';
        }

        const featureId = `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Fetch comments for the work item
        const commentsText = await getWorkItemComments(child.id);

        // Build comprehensive description including description and acceptance criteria
        console.log('Child work item data:', child);
        console.log('Description:', child.description);
        console.log('Acceptance Criteria:', child.acceptanceCriteria);
        const baseDescription = buildDescription(child);
        console.log('Built description:', baseDescription);

        const feature = {
          id: featureId,
          title: `[${child.workItemType}] ${child.title}`,
          category: child.workItemType.toLowerCase().replace(' ', '-'),
          description: baseDescription + commentsText,
          status: 'backlog' as const,
          steps: [],
          model: normalizedModel,
          thinkingLevel: defaultThinkingLevel,
          planningMode: defaultPlanningMode,
          requirePlanApproval: defaultRequirePlanApproval,
          azureWorkItemId: child.id,
          azureWorkItemUrl: child.url,
        };

        // Persist to backend
        const result = await api.features.create(projectPath, feature);
        if (result.success && result.feature) {
          // Download and attach files from Azure DevOps work item
          const attachmentFiles = await downloadAttachments(child, featureId);
          console.log(
            `Downloaded ${attachmentFiles.length} attachment files for feature ${featureId}:`,
            attachmentFiles.map((f) => f.filename)
          );

          // Download and attach files from comments
          const commentAttachments = await downloadCommentAttachments(child.id, featureId);
          console.log(
            `Downloaded ${commentAttachments.length} comment attachment files for feature ${featureId}:`,
            commentAttachments.map((f) => f.filename)
          );

          const allAttachments = [...attachmentFiles, ...commentAttachments];

          if (allAttachments.length > 0) {
            // Categorize attachments: images go to imagePaths, others to textFilePaths
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
            const images = allAttachments
              .filter((file) => {
                const ext = file.filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
                return imageExtensions.includes(ext);
              })
              .map((file) => ({
                id: file.id,
                path: file.path,
                filename: file.filename,
                mimeType: file.mimeType,
              }));

            const docsWithoutText = allAttachments.filter((file) => {
              const ext = file.filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
              return !imageExtensions.includes(ext);
            });

            // Extract text from DOCX and PDF files
            const docs = await Promise.all(
              docsWithoutText.map(async (file) => {
                const ext = file.filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
                const filename = file.filename; // Capture filename in closure
                const fileContent = file.content; // Capture content in closure to avoid race conditions
                let description = '';

                // Debug: Check what content we actually have
                console.log(
                  `[PARENT] Processing ${filename} (${ext}), content length: ${fileContent?.length}`
                );
                if (fileContent) {
                  const firstBytes = atob(fileContent.substring(0, 20));
                  const bytes = firstBytes.split('').map((c) => c.charCodeAt(0));
                  console.log(
                    `[PARENT] ${filename} first bytes:`,
                    bytes.slice(0, 4),
                    bytes[0] === 0x25 && bytes[1] === 0x50
                      ? 'PDF'
                      : bytes[0] === 0x50 && bytes[1] === 0x4b
                        ? 'ZIP/DOCX'
                        : 'Unknown'
                  );
                }

                // Detect actual file type by magic bytes (first few bytes of base64-decoded content)
                let actualFileType = ext;
                if (fileContent) {
                  try {
                    // Decode first few bytes to check file signature
                    const firstBytes = atob(fileContent.substring(0, 20));
                    const bytes = firstBytes.split('').map((c) => c.charCodeAt(0));

                    // Check for PDF signature (%PDF)
                    if (
                      bytes[0] === 0x25 &&
                      bytes[1] === 0x50 &&
                      bytes[2] === 0x44 &&
                      bytes[3] === 0x46
                    ) {
                      actualFileType = '.pdf';
                      console.log(`File ${filename} has extension ${ext} but is actually a PDF`);
                    }
                    // Check for ZIP/DOCX signature (PK)
                    else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
                      if (ext !== '.docx' && ext !== '.doc') {
                        actualFileType = '.docx';
                        console.log(
                          `File ${filename} has extension ${ext} but is actually a ZIP/DOCX`
                        );
                      }
                    }
                  } catch (e) {
                    console.warn(`Could not detect file type for ${filename}:`, e);
                  }
                }

                if (actualFileType === '.docx' || actualFileType === '.doc') {
                  // Try to extract text from DOCX
                  try {
                    console.log(`[PARENT] Extracting DOCX text from ${filename}...`);
                    const extractResponse = await fetch(
                      'http://localhost:3008/api/azure-devops-work-items/extract-docx-text',
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'X-Filename': filename, // Add filename to headers for debugging
                        },
                        credentials: 'include',
                        body: JSON.stringify({ base64Content: fileContent }),
                      }
                    );

                    if (extractResponse.ok) {
                      const extractData = await extractResponse.json();
                      if (extractData.success && extractData.text) {
                        description = `[Word Document: ${file.filename}]\n\n## Extracted Content:\n\n${extractData.text}\n\n---\n\nFile location: ${file.path}`;
                      } else {
                        description = `[Word Document: ${file.filename}]\n\n⚠️ Could not extract text from this document.\n\nFile location: ${file.path}`;
                      }
                    } else {
                      description = `[Word Document: ${file.filename}]\n\n⚠️ Could not extract text from this document.\n\nFile location: ${file.path}`;
                    }
                  } catch (error) {
                    console.warn(`Failed to extract text from ${file.filename}:`, error);
                    description = `[Word Document: ${file.filename}]\n\n⚠️ Could not extract text from this document.\n\nFile location: ${file.path}`;
                  }
                } else if (actualFileType === '.pdf') {
                  // Try to extract text from PDF
                  try {
                    console.log(
                      `[PARENT] Extracting PDF text from ${filename} (detected as PDF)...`
                    );
                    const extractResponse = await fetch(
                      'http://localhost:3008/api/azure-devops-work-items/extract-pdf-text',
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ base64Content: fileContent }),
                      }
                    );

                    if (extractResponse.ok) {
                      const extractData = await extractResponse.json();
                      console.log(`[PARENT] PDF extraction result:`, {
                        success: extractData.success,
                        textLength: extractData.text?.length,
                        text: extractData.text?.substring(0, 100),
                      });
                      if (extractData.success && extractData.text) {
                        description = `[PDF Document: ${file.filename}]\n\n## Extracted Content:\n\n${extractData.text}\n\n---\n\nFile location: ${file.path}`;
                        console.log(`[PARENT] PDF description set, length:`, description.length);
                      } else {
                        console.warn(`[PARENT] PDF extraction returned no text`);
                        description = `[PDF Document: ${file.filename}]\n\n⚠️ Could not extract text from this PDF.\n\nFile location: ${file.path}`;
                      }
                    } else {
                      console.error(
                        `[PARENT] PDF extraction failed with status:`,
                        extractResponse.status
                      );
                      description = `[PDF Document: ${file.filename}]\n\n⚠️ Could not extract text from this PDF.\n\nFile location: ${file.path}`;
                    }
                  } catch (error) {
                    console.warn(`Failed to extract text from ${file.filename}:`, error);
                    description = `[PDF Document: ${file.filename}]\n\n⚠️ Could not extract text from this PDF.\n\nFile location: ${file.path}`;
                  }
                } else if (ext === '.xlsx' || ext === '.xls') {
                  description = `[Excel Spreadsheet: ${file.filename}]\n\nThis spreadsheet was attached from Azure DevOps and may contain:\n- Data requirements or schemas\n- Test cases or scenarios\n- Calculations or formulas\n- Reference data\n\nRefer to the feature description for relevant data details. File location: ${file.path}`;
                } else if (
                  ext === '.txt' ||
                  ext === '.md' ||
                  actualFileType === '.txt' ||
                  actualFileType === '.md'
                ) {
                  // Read text file content
                  try {
                    if (fileContent) {
                      const textContent = atob(fileContent);
                      description = `[Text File: ${file.filename}]\n\n## Content:\n\n${textContent}\n\n---\n\nFile location: ${file.path}`;
                    } else {
                      description = `[Text File: ${file.filename}]\n\n⚠️ Could not read text file content.\n\nFile location: ${file.path}`;
                    }
                  } catch (error) {
                    console.warn(`Failed to read text from ${file.filename}:`, error);
                    description = `[Text File: ${file.filename}]\n\n⚠️ Could not read text file content.\n\nFile location: ${file.path}`;
                  }
                } else {
                  description = `[Attachment: ${file.filename}]\n\nFile type: ${file.mimeType}\nFile location: ${file.path}\n\nThis file was attached from Azure DevOps. Review the feature description and comments for relevant details from this attachment.`;
                }

                return {
                  id: file.id,
                  path: file.path,
                  filename: file.filename,
                  mimeType: file.mimeType,
                  content: description,
                };
              })
            );

            // Update feature with categorized attachments
            if (images.length > 0) {
              result.feature.imagePaths = images;
            }
            if (docs.length > 0) {
              result.feature.textFilePaths = docs;
            }

            console.log(`Updating feature - Images: ${images.length}, Docs: ${docs.length}`);
            const updateResult = await api.features.update(
              projectPath,
              result.feature.id,
              result.feature
            );
            console.log(`Feature update result:`, updateResult);
          }

          addFeature(result.feature);
          importCount++;

          // Update Azure DevOps work item status to Active
          try {
            await fetch('http://localhost:3008/api/azure-devops-work-items/update-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                organization,
                project,
                workItemId: child.id,
                status: 'Active',
              }),
            });
          } catch (statusError) {
            console.warn('Failed to update Azure DevOps work item status:', statusError);
            // Don't fail the import if status update fails
          }

          // Add two-way link: link the Azure DevOps work item back to this feature
          try {
            const featureUrl = `automaker://feature/${result.feature.id}`; // Deep link to feature
            await fetch('http://localhost:3008/api/azure-devops-work-items/add-link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                organization,
                project,
                workItemId: child.id,
                linkUrl: featureUrl,
                linkComment: `Imported to AutoMaker as feature: ${result.feature.title}`,
              }),
            });
          } catch (linkError) {
            console.warn('Failed to add link to Azure DevOps work item:', linkError);
            // Don't fail the import if linking fails
          }
        }
      }

      toast.success(`Successfully imported ${importCount} work items to backlog`);
      onImported?.();
      onClose();
    } catch (error) {
      console.error('Failed to import work items:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to import work items');
    } finally {
      setIsImporting(false);
    }
  };

  const buildDescription = (item: AzureWorkItem | ChildWorkItem): string => {
    let description = '';

    if (item.description) {
      description += `## Description\n\n${stripHtml(item.description)}\n\n`;
    }

    if (item.acceptanceCriteria) {
      description += `## Acceptance Criteria\n\n${stripHtml(item.acceptanceCriteria)}\n\n`;
    }

    description += `## Azure DevOps Details\n\n`;
    description += `- Work Item ID: ${item.id}\n`;
    description += `- Type: ${item.workItemType}\n`;
    description += `- State: ${item.state}\n`;
    description += `- URL: ${item.url}\n`;

    if ('tags' in item && item.tags) {
      description += `- Tags: ${item.tags}\n`;
    }

    return description;
  };

  const stripHtml = (html: string): string => {
    // Simple HTML stripping - in production you might want a more robust solution
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]*>/g, '')
      .trim();
  };

  const getWorkItemIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'bug':
        return '🐛';
      case 'user story':
        return '📖';
      case 'feature':
        return '✨';
      case 'task':
        return '✓';
      default:
        return '📝';
    }
  };

  const getStateColor = (state: string) => {
    const stateLower = state.toLowerCase();
    if (stateLower.includes('new') || stateLower.includes('proposed')) return 'text-blue-500';
    if (stateLower.includes('active') || stateLower.includes('committed')) return 'text-yellow-500';
    if (stateLower.includes('resolved') || stateLower.includes('done')) return 'text-green-500';
    if (stateLower.includes('closed')) return 'text-gray-500';
    return 'text-gray-400';
  };

  const allSelected = selectedWorkItems.size === workItems.length && workItems.length > 0;
  const someSelected = selectedWorkItems.size > 0 && selectedWorkItems.size < workItems.length;

  // Calculate actual items to import (excluding Features, only counting their children + non-Feature items)
  const getActualImportCount = () => {
    let count = 0;
    const countedChildren = new Set<number>();

    // Count children of selected Features (from selectedChildren)
    selectedWorkItems.forEach((workItemId) => {
      const workItem = workItems.find((wi) => wi.id === workItemId);
      if (workItem?.workItemType === 'Feature') {
        const children = childWorkItems.get(workItemId);
        if (children) {
          children.forEach((child) => {
            if (selectedChildren.has(child.id)) {
              count += 1;
              countedChildren.add(child.id);
            }
          });
        }
      } else {
        // Count non-Feature items directly
        count += 1;
      }
    });

    // Add any manually selected children that weren't part of a selected Feature
    selectedChildren.forEach((childId) => {
      if (!countedChildren.has(childId)) {
        count += 1;
      }
    });

    return count;
  };

  // Calculate total available items to import (all children + non-Feature top-level items)
  const getTotalAvailableCount = () => {
    let count = 0;

    workItems.forEach((workItem) => {
      if (workItem.workItemType === 'Feature') {
        const children = childWorkItems.get(workItem.id);
        if (children) {
          count += children.length;
        }
      } else {
        count += 1;
      }
    });

    return count;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Work Items from Azure DevOps</DialogTitle>
          <DialogDescription>
            Select bugs, user stories, or features assigned to you to add to your backlog
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading work items...</span>
            </div>
          ) : workItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No work items found assigned to you</p>
              <p className="text-sm text-muted-foreground mt-1">
                in {organization}/{project}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Looking for: Bugs, User Stories, and Features
              </p>
            </div>
          ) : (
            <>
              {/* Select all header */}
              <div className="flex items-center gap-2 pb-3 border-b mb-3">
                <Checkbox
                  id="select-all"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={toggleSelectAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  {allSelected ? 'Deselect all' : 'Select all'} ({getActualImportCount()}/
                  {getTotalAvailableCount()})
                </label>
              </div>

              {/* Work items list */}
              <div className="space-y-2">
                {workItems.map((workItem) => {
                  const children = childWorkItems.get(workItem.id) || [];
                  const isExpanded = expandedWorkItems.has(workItem.id);
                  const hasChildren = workItem.workItemType === 'Feature';

                  return (
                    <div key={workItem.id}>
                      <div
                        className={cn(
                          'rounded-lg border p-3 transition-colors',
                          selectedWorkItems.has(workItem.id) && 'border-primary bg-primary/5'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedWorkItems.has(workItem.id)}
                            onCheckedChange={() => toggleWorkItemSelected(workItem.id)}
                            className="mt-1"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {hasChildren && (
                                    <button
                                      onClick={() => toggleWorkItemExpanded(workItem.id)}
                                      className="hover:bg-muted rounded p-0.5"
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </button>
                                  )}
                                  <span className="text-lg">
                                    {getWorkItemIcon(workItem.workItemType)}
                                  </span>
                                  <h4 className="font-medium text-sm truncate">{workItem.title}</h4>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span className="font-mono">#{workItem.id}</span>
                                  <span className="inline-flex items-center gap-1">
                                    {workItem.workItemType}
                                  </span>
                                  <span
                                    className={cn('font-medium', getStateColor(workItem.state))}
                                  >
                                    {workItem.state}
                                  </span>
                                  {workItem.priority !== undefined && (
                                    <span>Priority: {workItem.priority}</span>
                                  )}
                                  {workItem.attachments && workItem.attachments.length > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                      <Paperclip className="w-3 h-3" />
                                      {workItem.attachments.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Child work items */}
                      {isExpanded && children.length > 0 && (
                        <div className="ml-8 mt-2 space-y-2">
                          {children.map((child) => {
                            const isChildSelected = selectedChildren.has(child.id);
                            return (
                              <div
                                key={child.id}
                                className={cn(
                                  'rounded-lg border p-2 transition-colors',
                                  isChildSelected && 'border-primary bg-primary/5'
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={isChildSelected}
                                    onCheckedChange={() => toggleChildSelected(child.id)}
                                  />
                                  <span className="text-sm">
                                    {getWorkItemIcon(child.workItemType)}
                                  </span>
                                  <span className="text-sm font-medium flex-1">{child.title}</span>
                                  {child.attachments && child.attachments.length > 0 && (
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                      <Paperclip className="w-3 h-3" />
                                      {child.attachments.length}
                                    </span>
                                  )}
                                  <span className="text-xs font-mono text-muted-foreground">
                                    #{child.id}
                                  </span>
                                  <span
                                    className={cn(
                                      'text-xs font-medium',
                                      getStateColor(child.state)
                                    )}
                                  >
                                    {child.state}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              isLoading ||
              isImporting ||
              (selectedWorkItems.size === 0 && selectedChildren.size === 0)
            }
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Import Selected ({getActualImportCount()})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
