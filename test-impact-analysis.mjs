/**
 * Test Script for Impact Analysis
 * 
 * Run this to test the impact analysis endpoint directly
 */

const SERVER_URL = 'http://localhost:3001';

async function testImpactAnalysis() {
  const testFeature = {
    id: 'test-feature-1',
    title: 'Test Feature for Impact Analysis',
    category: 'feature',
    status: 'spec',
    spec: `
# Feature: Update User Authentication

## Changes Required

- Modify \`src/auth/login.ts\` to add MFA support
- Update \`src/auth/session-manager.ts\` to handle MFA tokens
- Create new file \`src/auth/mfa-validator.ts\` for MFA logic
- Modify \`src/api/routes/auth-routes.ts\` to add new MFA endpoints

## Dependencies

- Add \`speakeasy\` package for TOTP generation
- Update \`jsonwebtoken\` to handle extended session data
    `,
    projectPath: process.env.TEST_PROJECT_PATH || 'E:\\User\\Documents\\Visual Studio 2022\\Projects\\automaker',
    description: 'Add multi-factor authentication to user login',
    priority: 'medium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  console.log('Testing Impact Analysis API...\n');
  console.log('Feature:', testFeature.title);
  console.log('Project:', testFeature.projectPath);
  console.log('\nSending request to:', `${SERVER_URL}/api/features/analyze-impact`);

  try {
    const response = await fetch(`${SERVER_URL}/api/features/analyze-impact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        feature: testFeature,
        projectPath: testFeature.projectPath,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Request failed:', response.status);
      console.error('Error:', result);
      return;
    }

    if (result.success && result.data) {
      const analysis = result.data;
      
      console.log('\n✅ Impact Analysis Successful!\n');
      console.log('='.repeat(60));
      console.log(`Risk Score: ${analysis.riskScore}/100 (${analysis.riskLevel})`);
      console.log('='.repeat(60));
      
      console.log(`\n📁 Affected Files (${analysis.affectedFiles.length}):`);
      analysis.affectedFiles.forEach(file => {
        const exists = file.exists ? '✓' : '✗ (new)';
        console.log(`  ${exists} ${file.path}`);
        console.log(`     Confidence: ${file.confidence}, Pattern: ${file.matchedPattern}`);
      });

      console.log(`\n🔗 Direct Dependencies (${analysis.directImpacts.length}):`);
      analysis.directImpacts.forEach(impact => {
        console.log(`  → ${impact.path} (${impact.hops} hop${impact.hops > 1 ? 's' : ''})`);
        console.log(`     Type: ${impact.type}, Strength: ${impact.strength}`);
      });

      console.log(`\n↗️  Indirect Dependencies (${analysis.indirectImpacts.length}):`);
      analysis.indirectImpacts.forEach(impact => {
        console.log(`  → ${impact.path} (${impact.hops} hops)`);
      });

      console.log(`\n🚨 Cross-Boundary Risks (${analysis.crossBoundaryRisks.length}):`);
      analysis.crossBoundaryRisks.forEach(risk => {
        console.log(`  ⚠️  ${risk.fromService} → ${risk.toService}`);
        console.log(`     Files: ${risk.affectedFiles.join(', ')}`);
        console.log(`     Severity: ${risk.severity}`);
      });

      console.log(`\n⚡ Gotchas Detected (${analysis.gotchas.length}):`);
      analysis.gotchas.forEach(gotcha => {
        console.log(`  🔔 ${gotcha.ruleName}`);
        console.log(`     Severity: ${gotcha.severity}, Action: ${gotcha.action}`);
        console.log(`     Files: ${gotcha.affectedFiles.join(', ')}`);
        if (gotcha.suggestedAction) {
          console.log(`     💡 ${gotcha.suggestedAction}`);
        }
        if (gotcha.wikiPages && gotcha.wikiPages.length > 0) {
          console.log(`     📖 Related docs: ${gotcha.wikiPages.join(', ')}`);
        }
      });

      console.log(`\n⏱️  Analysis Timing:`);
      if (analysis.analysisTiming) {
        console.log(`  Files extraction: ${analysis.analysisTiming.files}ms`);
        console.log(`  Graph traversal: ${analysis.analysisTiming.graph}ms`);
        console.log(`  Rules evaluation: ${analysis.analysisTiming.rules}ms`);
        console.log(`  Wiki matching: ${analysis.analysisTiming.wiki}ms`);
        console.log(`  Total: ${analysis.analysisTiming.total}ms`);
      }

    } else {
      console.log('\n⚠️  Analysis returned no data');
      console.log('Message:', result.message || result.error);
      console.log('\nThis usually means:');
      console.log('  1. Repository not analyzed yet (go to Settings → DevOps Resources)');
      console.log('  2. Repository graph not available');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nMake sure:');
    console.error('  1. Server is running on port 3001');
    console.error('  2. Repository has been analyzed');
    console.error('  3. Project path exists and is valid');
  }
}

// Run the test
testImpactAnalysis();
