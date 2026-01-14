/**
 * Service Boundary Explorer
 *
 * Visualizes detected services and their components
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Package, FileCode, Database, Zap } from 'lucide-react';
import type { ServiceBoundary, RepositoryGraph } from '@automaker/types';

interface ServiceBoundaryExplorerProps {
  services: ServiceBoundary[];
  graph: RepositoryGraph;
}

export function ServiceBoundaryExplorer({ services, graph }: ServiceBoundaryExplorerProps) {
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());

  console.log('[ServiceBoundaryExplorer] Rendering with:', {
    servicesCount: services.length,
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      hasMetrics: !!s.metrics,
      metrics: s.metrics,
    })),
    graphNodesCount: graph.nodes.length,
    graphNodes: graph.nodes.slice(0, 5),
  });

  const toggleService = (serviceId: string) => {
    const newExpanded = new Set(expandedServices);
    if (newExpanded.has(serviceId)) {
      newExpanded.delete(serviceId);
    } else {
      newExpanded.add(serviceId);
    }
    setExpandedServices(newExpanded);
  };

  const getServiceComponents = (serviceId: string) => {
    return graph.nodes.filter((node) => node.serviceId === serviceId);
  };

  const getComponentIcon = (type: string) => {
    switch (type) {
      case 'Model':
        return <Database className="h-4 w-4" />;
      case 'Event':
        return <Zap className="h-4 w-4" />;
      default:
        return <FileCode className="h-4 w-4" />;
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Service Boundaries ({services.length})
        </CardTitle>
        <CardDescription>Detected services and their components</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {services.map((service) => {
            const isExpanded = expandedServices.has(service.id);
            const components = getServiceComponents(service.id);

            return (
              <div key={service.id} className="border rounded-lg">
                <button
                  onClick={() => toggleService(service.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Package className="h-4 w-4" />
                    <span className="font-medium">{service.name}</span>
                    <Badge variant="secondary">{service.technology}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{service.metrics?.fileCount || 0} files</span>
                    <span>{components.length} components</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1">
                    <p className="text-sm text-muted-foreground mb-2">{service.rootPath}</p>
                    {components.length > 0 ? (
                      <div className="space-y-1 pl-6">
                        {components.map((component) => (
                          <div key={component.id} className="flex items-center gap-2 text-sm py-1">
                            {getComponentIcon(component.type)}
                            <span className="text-muted-foreground">{component.type}:</span>
                            <span>{component.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground pl-6">No components detected</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
