/**
 * Wiki Browser Component
 *
 * Browse Azure DevOps wiki pages and attach them to features with tree view
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Loader2,
  ChevronRight,
  ChevronDown,
  FileText,
  FolderClosed,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';

interface WikiPage {
  id: string;
  path: string;
  name: string;
}

interface WikiBrowserProps {
  organization: string;
  project: string;
  wikiId: string;
  initialSelectedPages?: Array<{
    id: string;
    path: string;
    name: string;
    url: string;
    content: string;
  }>;
  lockedPages?: Array<{
    id: string;
    path: string;
    name: string;
    url: string;
    content: string;
  }>;
  onSelectionChange?: (
    pages: Array<{ id: string; path: string; name: string; url: string; content: string }>
  ) => void;
  resetKey?: string | number; // Add a key to force re-initialization when needed
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  children: TreeNode[];
  isFolder: boolean;
}

// Normalize path by removing leading/trailing slashes
function normalizePath(path: string): string {
  if (!path) return '';
  return path.split('/').filter(Boolean).join('/');
}

// Extract wiki path from Azure DevOps URL
function extractWikiPathFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const match = url.match(/[?&]pagePath=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  } catch (e) {
    console.error('Failed to extract wiki path from URL:', e);
  }
  return null;
}

// Build tree structure from flat list of pages
function buildTree(pages: WikiPage[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort pages by path to ensure parents come before children
  const sortedPages = [...pages].sort((a, b) => a.path.localeCompare(b.path));

  for (const page of sortedPages) {
    const parts = page.path.split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;

      let node = nodeMap.get(currentPath);

      if (!node) {
        node = {
          id: currentPath,
          name: part,
          path: currentPath,
          children: [],
          isFolder: !isLastPart,
        };
        nodeMap.set(currentPath, node);
        currentLevel.push(node);
      }

      if (!isLastPart) {
        node.isFolder = true;
        currentLevel = node.children;
      }
    }
  }

  return root;
}

// Get all descendant page IDs from a node
function getDescendantIds(node: TreeNode): string[] {
  const ids: string[] = [];

  if (!node.isFolder) {
    ids.push(node.id);
  }

  for (const child of node.children) {
    ids.push(...getDescendantIds(child));
  }

  return ids;
}

export function WikiBrowser({
  organization,
  project,
  wikiId,
  initialSelectedPages,
  lockedPages,
  onSelectionChange,
  resetKey,
}: WikiBrowserProps) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [initialExpansionDone, setInitialExpansionDone] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lockedIds = useMemo(() => {
    const ids = new Set<string>();
    if (lockedPages) {
      lockedPages.forEach((p) => {
        const normalized = normalizePath(p.id);
        if (normalized) ids.add(normalized);
      });
    }
    return ids;
  }, [lockedPages]);
  const [attachedPages, setAttachedPages] = useState<
    Map<string, { id: string; path: string; name: string; url: string; content: string }>
  >(new Map());
  const initializedRef = useRef(false);
  const lastResetKeyRef = useRef(resetKey);

  // Reset initialization when resetKey changes
  useEffect(() => {
    if (resetKey !== lastResetKeyRef.current) {
      initializedRef.current = false;
      lastResetKeyRef.current = resetKey;
    }
  }, [resetKey]);

  // Initialize selected pages from initialSelectedPages (only on mount or explicit reset)
  useEffect(() => {
    // Only initialize if we haven't done so yet
    if (!initializedRef.current) {
      if (initialSelectedPages && initialSelectedPages.length > 0) {
        const initialIds = new Set<string>();
        const initialAttached = new Map<
          string,
          { id: string; path: string; name: string; url: string; content: string }
        >();

        initialSelectedPages.forEach((page: any) => {
          // The saved page.path is the URL, we need to extract the wiki path
          // page.url is also the URL, and page.id is the actual wiki path ID
          const wikiPath = page.id; // Use the id which is the normalized wiki path
          const pageData = page;

          if (wikiPath && pageData) {
            const normalized = normalizePath(wikiPath);
            if (normalized) {
              initialIds.add(normalized);
              initialAttached.set(normalized, pageData);
            }
          }
        });

        setSelectedIds(initialIds);
        setAttachedPages(initialAttached);

        // Auto-expand branches that contain selected pages
        const pathsToExpand = new Set<string>();
        initialIds.forEach((selectedPath) => {
          // Expand all parent paths
          const parts = selectedPath.split('/');
          for (let i = 1; i < parts.length; i++) {
            const parentPath = parts.slice(0, i).join('/');
            if (parentPath) {
              pathsToExpand.add(parentPath);
            }
          }
        });
        setExpandedPaths(pathsToExpand);
      }
      initializedRef.current = true;
    }
  }, [initialSelectedPages]);

  useEffect(() => {
    loadPages();
  }, [organization, project, wikiId]);

  const treeData = useMemo(() => buildTree(pages), [pages]);

  // Auto-expand first level of tree when pages load
  useEffect(() => {
    if (!initialExpansionDone && pages.length > 0) {
      const firstLevelPaths = new Set<string>();
      treeData.forEach((node) => {
        if (node.isFolder) {
          firstLevelPaths.add(node.id);
        }
      });
      setExpandedPaths((prev) => new Set([...prev, ...firstLevelPaths]));
      setInitialExpansionDone(true);
    }
  }, [pages, treeData, initialExpansionDone]);

  const loadPages = async (path?: string) => {
    setLoading(true);
    try {
      const api = getHttpApiClient();
      const result = await api.azureDevOpsWiki.listPages({
        organization,
        project,
        wikiId,
        path,
      });

      if (result.success && result.pages) {
        setPages(result.pages);
      } else {
        toast.error('Failed to load pages', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (error) {
      toast.error('Failed to load pages', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredTree = useMemo(() => {
    if (!searchQuery) return treeData;

    const filterNode = (node: TreeNode): TreeNode | null => {
      const matches =
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.path.toLowerCase().includes(searchQuery.toLowerCase());

      const filteredChildren = node.children
        .map((child) => filterNode(child))
        .filter((child): child is TreeNode => child !== null);

      if (matches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }

      return null;
    };

    return treeData
      .map((node) => filterNode(node))
      .filter((node): node is TreeNode => node !== null);
  }, [treeData, searchQuery]);

  const toggleExpanded = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const handleCheckboxChange = async (node: TreeNode, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    const api = getHttpApiClient();
    const pagesToUpdate: Array<{
      id: string;
      path: string;
      name: string;
      url: string;
      content: string;
    }> = [];

    if (node.isFolder) {
      // Select/deselect all descendants
      const descendantIds = getDescendantIds(node);
      const descendantPages = pages.filter((page) => {
        const normalized = normalizePath(page.path);
        return descendantIds.includes(normalized);
      });

      if (checked) {
        // Load content for all descendant pages
        for (const page of descendantPages) {
          const normalized = normalizePath(page.path);

          // Check if already loaded
          if (attachedPages.has(normalized)) {
            pagesToUpdate.push(attachedPages.get(normalized)!);
            newSelected.add(normalized);
            continue;
          }

          try {
            const result = await api.azureDevOpsWiki.getPage({
              organization,
              project,
              wikiId,
              path: page.path,
            });

            if (result.success && result.page) {
              const pageUrl = `https://dev.azure.com/${organization}/${project}/_wiki/wikis/${wikiId}?pagePath=${encodeURIComponent(page.path)}`;
              const pageData = {
                id: page.id,
                path: pageUrl,
                name: page.name,
                url: pageUrl,
                content: result.page.content || '',
              };
              pagesToUpdate.push(pageData);
              attachedPages.set(normalized, pageData);
              newSelected.add(normalized);
            }
          } catch (error) {
            console.error(`Failed to load content for ${page.path}:`, error);
          }
        }
      } else {
        // Remove all descendants
        descendantIds.forEach((id) => {
          newSelected.delete(id);
          attachedPages.delete(id);
        });
      }
    } else {
      // Individual page
      const normalized = normalizePath(node.path);

      if (checked) {
        // Check if already loaded
        if (attachedPages.has(normalized)) {
          pagesToUpdate.push(attachedPages.get(normalized)!);
          newSelected.add(normalized);
        } else {
          // Load content for this page
          const page = pages.find((p) => normalizePath(p.path) === normalized);
          if (page) {
            try {
              const result = await api.azureDevOpsWiki.getPage({
                organization,
                project,
                wikiId,
                path: page.path,
              });

              if (result.success && result.page) {
                const pageUrl = `https://dev.azure.com/${organization}/${project}/_wiki/wikis/${wikiId}?pagePath=${encodeURIComponent(page.path)}`;
                const pageData = {
                  id: page.id,
                  path: pageUrl,
                  name: page.name,
                  url: pageUrl,
                  content: result.page.content || '',
                };
                pagesToUpdate.push(pageData);
                attachedPages.set(normalized, pageData);
                newSelected.add(normalized);
              }
            } catch (error) {
              console.error(`Failed to load content for ${page.path}:`, error);
              return; // Don't update if failed to load
            }
          }
        }
      } else {
        newSelected.delete(normalized);
        attachedPages.delete(normalized);
      }
    }

    setSelectedIds(newSelected);

    // Notify parent of selection change
    if (onSelectionChange) {
      const allSelected = Array.from(newSelected)
        .map((id) => attachedPages.get(id))
        .filter(
          (p): p is { id: string; path: string; name: string; url: string; content: string } =>
            p !== undefined
        );
      onSelectionChange(allSelected);
    }
  };

  const isChecked = (node: TreeNode): boolean => {
    if (node.isFolder) {
      const descendantIds = getDescendantIds(node);
      return descendantIds.length > 0 && descendantIds.every((id) => selectedIds.has(id));
    }
    return selectedIds.has(node.id);
  };

  const isIndeterminate = (node: TreeNode): boolean => {
    if (!node.isFolder) return false;
    const descendantIds = getDescendantIds(node);
    const selectedCount = descendantIds.filter((id) => selectedIds.has(id)).length;
    return selectedCount > 0 && selectedCount < descendantIds.length;
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded = expandedPaths.has(node.id);
    const checked = isChecked(node);
    const indeterminate = isIndeterminate(node);
    const hasChildren = node.children.length > 0;

    // Calculate the checked state for the checkbox
    // Use "indeterminate" for folders with partial selection
    const checkboxState = indeterminate ? 'indeterminate' : checked;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded cursor-pointer group"
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
        >
          {hasChildren && (
            <button
              onClick={() => toggleExpanded(node.id)}
              className="p-0.5 hover:bg-accent-foreground/10 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-5" />}

          <Checkbox
            checked={checkboxState}
            onCheckedChange={(checked) => handleCheckboxChange(node, checked as boolean)}
          />

          {node.isFolder ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            ) : (
              <FolderClosed className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            )
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}

          <span
            className={`text-sm truncate flex-1 ${
              !node.isFolder && lockedIds.has(node.id) ? 'font-bold italic' : ''
            }`}
          >
            {node.name}
          </span>

          {/* Show indicator for selected pages */}
          {!node.isFolder && selectedIds.has(node.id) && (
            <span className="text-xs text-muted-foreground">✓</span>
          )}
          {/* Show count badge for collapsed folders with selections */}
          {node.isFolder && !isExpanded && (checked || indeterminate) && (
            <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
              {getDescendantIds(node).filter((id) => selectedIds.has(id)).length}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Wiki Pages</CardTitle>
            <CardDescription>
              {selectedIds.size > 0
                ? `${selectedIds.size} page(s) selected`
                : 'Select pages to include as context'}
            </CardDescription>
          </div>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {pages.length === 0 ? 'No pages found in wiki' : 'No pages match search'}
          </div>
        ) : (
          <div className="space-y-0.5">{filteredTree.map((node) => renderTreeNode(node))}</div>
        )}
      </CardContent>
    </Card>
  );
}
