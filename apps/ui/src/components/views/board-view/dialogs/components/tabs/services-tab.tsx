import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import type { CrossBoundaryRisk, AffectedFile } from '@automaker/types';

interface ServicesTabProps {
  crossBoundaryRisks: CrossBoundaryRisk[];
  affectedFiles: AffectedFile[];
}

export function ServicesTab({ crossBoundaryRisks, affectedFiles }: ServicesTabProps) {
  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'medium':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'high':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Server className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'bg-green-500/10 text-green-700 dark:text-green-400';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
      case 'high':
        return 'bg-red-500/10 text-red-700 dark:text-red-400';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
    }
  };

  // Extract affected services from file paths
  const extractServiceName = (filePath: string): string | null => {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Try to match common service patterns:
    // 1. Backend/AzureFaultExplorer.* or Frontend/AzureFaultExplorer.* (from Service-Boundaries wiki)
    const backendFrontendMatch = normalizedPath.match(
      /(?:Backend|Frontend)\/AzureFaultExplorer\.([A-Z][a-z]+)\//i
    );
    if (backendFrontendMatch) {
      return `AzureFaultExplorer.${backendFrontendMatch[1]}`;
    }

    // 2. Microservices/Service[A-Z] (from Service-Boundaries wiki)
    const microserviceMatch = normalizedPath.match(/Microservices\/(Service[A-Z])\//i);
    if (microserviceMatch) {
      return microserviceMatch[1];
    }

    // 3. AzureFaultExplorer.* pattern without prefix (e.g., Core/... or Blazor/...)
    const azureMatch = normalizedPath.match(/^(?:.*\/)?(?:AzureFaultExplorer\.)?([A-Z][a-z]+)\//);
    if (azureMatch && ['Core', 'Api', 'Blazor'].includes(azureMatch[1])) {
      return `AzureFaultExplorer.${azureMatch[1]}`;
    }

    // 4. *Service pattern (e.g., OrderingService/, PaymentService/)
    const serviceMatch = normalizedPath.match(/([A-Z][a-z]+Service)\//);
    if (serviceMatch) {
      return serviceMatch[1];
    }

    // 5. Service[A-Z] pattern (e.g., ServiceA/, ServiceB/)
    const serviceLetterMatch = normalizedPath.match(/(?:^|\/)(Service[A-Z])\//);
    if (serviceLetterMatch) {
      return serviceLetterMatch[1];
    }

    // 6. Infrastructure folder
    if (normalizedPath.match(/(?:^|\/)Infrastructure\//i)) {
      return 'Infrastructure';
    }

    // 7. Tests folder
    if (normalizedPath.match(/(?:^|\/)(?:tests?|e2e|E2ETests)\//i)) {
      return 'E2ETests';
    }

    // 8. src/Services pattern - likely a shared services folder
    if (normalizedPath.match(/^src\/Services\//)) {
      return 'Shared Services';
    }

    return null;
  };

  const affectedServices = React.useMemo(() => {
    const serviceMap = new Map<string, { files: string[]; confidence: string[] }>();

    affectedFiles.forEach((file) => {
      const serviceName = extractServiceName(file.path);
      if (serviceName) {
        if (!serviceMap.has(serviceName)) {
          serviceMap.set(serviceName, { files: [], confidence: [] });
        }
        const service = serviceMap.get(serviceName)!;
        service.files.push(file.path);
        service.confidence.push(file.confidence);
      }
    });

    return Array.from(serviceMap.entries()).map(([name, data]) => ({
      name,
      fileCount: data.files.length,
      files: data.files,
      hasHighConfidence: data.confidence.includes('high'),
    }));
  }, [affectedFiles]);

  if (affectedServices.length === 0 && crossBoundaryRisks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No cross-service impacts detected</p>
          <p className="text-sm mt-2">Changes are contained within a single service</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Affected Services */}
      {affectedServices.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Affected Services</h3>
              <p className="text-xs text-muted-foreground">
                {affectedServices.length === 1
                  ? 'Changes are contained within a single service'
                  : `Changes impact ${affectedServices.length} services`}
              </p>
            </div>
            <div className="space-y-3">
              {affectedServices.map((service, index) => (
                <div key={index} className="p-3 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{service.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {service.fileCount} {service.fileCount === 1 ? 'file' : 'files'}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    {service.files.slice(0, 3).map((file, i) => (
                      <div key={i} className="font-mono truncate">
                        {file}
                      </div>
                    ))}
                    {service.files.length > 3 && (
                      <div className="text-muted-foreground/70">
                        +{service.files.length - 3} more...
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cross-Service Dependencies */}
      {crossBoundaryRisks.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Cross-Service Dependencies</h3>
              <p className="text-xs text-muted-foreground">
                Dependencies that cross service boundaries
              </p>
            </div>
            <div className="space-y-3">
              {crossBoundaryRisks.map((risk, index) => (
                <div key={index} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getRiskIcon(risk.risk)}</div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{risk.fromService}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{risk.toService}</span>
                        <Badge variant="secondary" className={getRiskColor(risk.risk)}>
                          {risk.risk} risk
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{risk.dependency}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
