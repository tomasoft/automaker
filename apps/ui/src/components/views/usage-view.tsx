/**
 * Usage Tracking View - Display token and cost statistics
 */

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsageStatsDisplay } from '@/components/usage-stats-display';
import { BarChart3, DollarSign, Wallet, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function UsageView() {
  const { currentProject, maxBudget, getProjectBudget, setProjectBudget } = useAppStore();
  const [activeTab, setActiveTab] = useState<'project' | 'overall'>('project');

  const projectBudget = currentProject ? getProjectBudget(currentProject.path) : undefined;

  const handleBudgetChange = (value: string) => {
    if (!currentProject) return;
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= maxBudget) {
      setProjectBudget(currentProject.path, numValue);
    }
  };

  // Calculate budget warning (dummy cost for now - would be replaced with actual cost tracking)
  const currentCost = 0; // TODO: Get actual cost from usage stats
  const budgetPercentage = projectBudget ? (currentCost / projectBudget) * 100 : 0;
  const showBudgetWarning = budgetPercentage >= 80;

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>No Project Selected</CardTitle>
            <CardDescription>Please select or create a project first</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6" />
              Usage & Costs
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track tokens and costs across all AI models
            </p>
          </div>

          {/* Project Budget Input */}
          {currentProject && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-muted-foreground" />
                <div className="flex flex-col">
                  <Label htmlFor="project-budget" className="text-xs text-muted-foreground mb-1">
                    Project Budget (£)
                  </Label>
                  <Input
                    id="project-budget"
                    type="number"
                    min="0"
                    max={maxBudget}
                    value={projectBudget || ''}
                    onChange={(e) => handleBudgetChange(e.target.value)}
                    placeholder={`Max £${maxBudget}`}
                    className="w-32 h-8"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Budget Warning Alert */}
        {currentProject && projectBudget && showBudgetWarning && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Warning: You have used {budgetPercentage.toFixed(1)}% of your allocated budget (£
              {currentCost.toFixed(2)} of £{projectBudget.toFixed(2)})
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'project' | 'overall')}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="project">Current Project</TabsTrigger>
            <TabsTrigger value="overall">All Projects</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="project" className="mt-0">
              <UsageStatsDisplay projectPath={currentProject.path} />
            </TabsContent>

            <TabsContent value="overall" className="mt-0">
              <UsageStatsDisplay />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
