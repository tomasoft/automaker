/**
 * Wiki Browser Component
 *
 * Browse Azure DevOps wiki pages and attach them to features
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, Loader2, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';

interface WikiPage {
  id: string;
  path: string;
  name: string;
}

interface WikiBrowserProps {
  organization: string;
  project: string;
  wikiId: string;
  onAttachToFeature?: (page: { id: string; path: string; name: string; url: string }) => void;
}

export function WikiBrowser({
  organization,
  project,
  wikiId,
  onAttachToFeature,
}: WikiBrowserProps) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [pageContent, setPageContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [showFeatureDialog, setShowFeatureDialog] = useState(false);

  const features = useAppStore((state) => state.features || []);
  const updateFeature = useAppStore((state) => state.updateFeature);

  useEffect(() => {
    loadPages();
  }, [organization, project, wikiId]);

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

  const loadPageContent = async (page: WikiPage) => {
    setSelectedPage(page);
    setLoadingContent(true);
    try {
      const api = getHttpApiClient();
      const result = await api.azureDevOpsWiki.getPage({
        organization,
        project,
        wikiId,
        path: page.path,
      });

      if (result.success && result.page) {
        setPageContent(result.page.content);
      } else {
        toast.error('Failed to load page content', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (error) {
      toast.error('Failed to load page content', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoadingContent(false);
    }
  };

  const toggleExpanded = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const filteredPages = searchQuery
    ? pages.filter(
        (page) =>
          page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          page.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : pages;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Page Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pages</CardTitle>
          <CardDescription>Browse wiki pages</CardDescription>
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
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No pages found</div>
          ) : (
            <div className="space-y-1">
              {filteredPages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => loadPageContent(page)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors ${
                    selectedPage?.id === page.id ? 'bg-accent' : ''
                  }`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left truncate">{page.name}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Page Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
          <CardDescription>
            {selectedPage ? selectedPage.path : 'Select a page to preview'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingContent ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : selectedPage ? (
            <div className="space-y-4">
              <div className="prose prose-sm dark:prose-invert max-w-none max-h-96 overflow-auto">
                <pre className="whitespace-pre-wrap text-xs">{pageContent}</pre>
              </div>
              <Button
                onClick={() => {
                  if (selectedPage) {
                    setShowFeatureDialog(true);
                  }
                }}
                className="w-full"
              >
                Attach to Feature
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Select a page to view its content
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature Selection Dialog */}
      <Dialog open={showFeatureDialog} onOpenChange={setShowFeatureDialog}>
        <DialogContent className="max-w-2xl max-h-[600px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attach to Feature</DialogTitle>
            <DialogDescription>
              Select a feature to attach "{selectedPage?.name}" to
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {features.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No features found</p>
                <p className="text-xs mt-1">Create a feature first to attach wiki pages</p>
              </div>
            ) : (
              features.map((feature) => (
                <Button
                  key={feature.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3"
                  onClick={() => {
                    if (selectedPage) {
                      const pageUrl = `https://dev.azure.com/${organization}/${project}/_wiki/wikis/${wikiId}?pagePath=${encodeURIComponent(selectedPage.path)}`;
                      const newTextFile = {
                        id: `wiki-${selectedPage.id}-${Date.now()}`,
                        path: pageUrl,
                        filename: selectedPage.name,
                        mimeType: 'text/markdown',
                        content: pageContent,
                      };

                      const existingTextFiles = feature.textFilePaths || [];
                      const alreadyAttached = existingTextFiles.some((f) => f.path === pageUrl);

                      if (alreadyAttached) {
                        toast.info(
                          `Page "${selectedPage.name}" is already attached to this feature`
                        );
                      } else {
                        updateFeature(feature.id, {
                          textFilePaths: [...existingTextFiles, newTextFile],
                        });
                        toast.success(
                          `Attached "${selectedPage.name}" to "${feature.description}"`
                        );
                      }

                      setShowFeatureDialog(false);
                    }
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{feature.description}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {feature.category || 'No category'} • {feature.status || 'todo'}
                      </p>
                    </div>
                    {selectedPage &&
                      feature.textFilePaths?.some(
                        (f) =>
                          f.path ===
                          `https://dev.azure.com/${organization}/${project}/_wiki/wikis/${wikiId}?pagePath=${encodeURIComponent(selectedPage.path)}`
                      ) && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 ml-2" />}
                  </div>
                </Button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowFeatureDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
