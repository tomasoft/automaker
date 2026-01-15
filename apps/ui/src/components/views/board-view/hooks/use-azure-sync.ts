import { useEffect, useRef } from 'react';
import { useAppStore, Feature } from '@/store/app-store';

/**
 * Hook to sync feature status back to Azure DevOps work items
 *
 * When a feature with an azureWorkItemId is completed, this hook will
 * automatically update the corresponding Azure DevOps work item to "Closed"
 */
export function useAzureSync() {
  const features = useAppStore((state) => state.features);
  const previousFeaturesRef = useRef<Feature[]>([]);

  useEffect(() => {
    const previousFeatures = previousFeaturesRef.current;

    // Find features that just completed (status changed to 'completed' or 'verified')
    features.forEach((feature) => {
      const previousFeature = previousFeatures.find((f) => f.id === feature.id);

      // Check if feature just completed and has an Azure work item link
      if (
        feature.azureWorkItemId &&
        (feature.status === 'completed' || feature.status === 'verified') &&
        previousFeature &&
        previousFeature.status !== 'completed' &&
        previousFeature.status !== 'verified'
      ) {
        // Get organization and project from localStorage
        const organization = localStorage.getItem('azure_devops_organization');
        const project = localStorage.getItem('azure_devops_project');

        if (organization && project) {
          // Sync status back to Azure DevOps (set to Closed)
          fetch('http://localhost:3008/api/azure-devops-work-items/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              organization,
              project,
              workItemId: feature.azureWorkItemId,
              status: 'Closed',
            }),
          }).catch((error) => {
            console.warn(
              `Failed to sync feature ${feature.id} status to Azure DevOps work item ${feature.azureWorkItemId}:`,
              error
            );
          });
        }
      }
    });

    // Update reference for next comparison
    previousFeaturesRef.current = features;
  }, [features]);
}
