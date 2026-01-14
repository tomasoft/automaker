/**
 * Test Azure DevOps Wiki Integration with OAuth
 * 
 * This tests that your OAuth device code authentication can access wiki pages
 */

const SERVER_URL = 'http://localhost:3001';

// Replace these with your actual values
const ORGANIZATION = 'your-organization'; // e.g., 'contoso'
const PROJECT = 'your-project';           // e.g., 'MyProject'
const WIKI_ID = 'your-wiki-id';          // From the wiki URL

async function testWikiOAuth() {
  console.log('🔍 Testing Azure DevOps Wiki Integration with OAuth...\n');

  try {
    // Step 1: Check authentication status
    console.log('1️⃣ Checking authentication status...');
    const authResponse = await fetch(`${SERVER_URL}/api/azure-auth/status`);
    const authStatus = await authResponse.json();

    if (!authStatus.authenticated) {
      console.log('❌ Not authenticated!');
      console.log('\nPlease authenticate first:');
      console.log('  1. Go to Settings → DevOps Resources');
      console.log('  2. Click "Sign in with Microsoft"');
      console.log('  3. Follow the device code flow');
      return;
    }

    console.log('✅ Authenticated as:', authStatus.userId || 'User');
    console.log(`   Session ID: ${authStatus.sessionId}\n`);

    // Step 2: List wiki pages
    console.log('2️⃣ Fetching wiki pages...');
    console.log(`   Organization: ${ORGANIZATION}`);
    console.log(`   Project: ${PROJECT}`);
    console.log(`   Wiki ID: ${WIKI_ID}\n`);

    const pagesResponse = await fetch(
      `${SERVER_URL}/api/wiki/pages?organization=${ORGANIZATION}&project=${PROJECT}&wikiId=${WIKI_ID}`
    );

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      console.log('❌ Failed to fetch pages:', pagesResponse.status);
      console.log('Error:', errorText);
      
      if (pagesResponse.status === 401) {
        console.log('\n💡 This usually means:');
        console.log('  - Your session expired, try re-authenticating');
        console.log('  - You don\'t have permission to access this wiki');
      } else if (pagesResponse.status === 404) {
        console.log('\n💡 Check that your organization/project/wiki ID are correct');
      }
      return;
    }

    const pagesData = await pagesResponse.json();

    if (pagesData.success && pagesData.pages) {
      console.log(`✅ Found ${pagesData.pages.length} wiki pages!\n`);
      
      // Show first 10 pages
      console.log('📄 Sample pages:');
      pagesData.pages.slice(0, 10).forEach((page, idx) => {
        console.log(`   ${idx + 1}. ${page.path}`);
      });

      if (pagesData.pages.length > 10) {
        console.log(`   ... and ${pagesData.pages.length - 10} more`);
      }

      // Step 3: Try to fetch content of first page
      if (pagesData.pages.length > 0) {
        const testPage = pagesData.pages[0];
        console.log(`\n3️⃣ Testing page content fetch...`);
        console.log(`   Page: ${testPage.path}`);

        const contentResponse = await fetch(
          `${SERVER_URL}/api/wiki/page?organization=${ORGANIZATION}&project=${PROJECT}&wikiId=${WIKI_ID}&path=${encodeURIComponent(testPage.path)}`
        );

        if (contentResponse.ok) {
          const contentData = await contentResponse.json();
          if (contentData.success && contentData.content) {
            const preview = contentData.content.substring(0, 200);
            console.log(`\n✅ Successfully fetched page content!`);
            console.log(`\nPreview (first 200 chars):`);
            console.log('─'.repeat(60));
            console.log(preview + (contentData.content.length > 200 ? '...' : ''));
            console.log('─'.repeat(60));
          }
        } else {
          console.log('⚠️  Could not fetch page content');
        }
      }

      console.log('\n🎉 Wiki OAuth integration is working!');
      console.log('\n📝 Next steps:');
      console.log('  1. Go to Settings → DevOps Resources in the app');
      console.log('  2. Enter your organization, project, and wiki ID');
      console.log('  3. Click "Browse Wiki Pages" to see the tree view');
      console.log('  4. Attach pages to features in the Resources tab');

    } else {
      console.log('⚠️  No pages found or API returned unexpected format');
      console.log('Response:', JSON.stringify(pagesData, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\nMake sure:');
    console.log('  1. Server is running on port 3001');
    console.log('  2. You\'ve authenticated via Settings → DevOps Resources');
    console.log('  3. Organization/Project/Wiki ID are correct');
  }
}

// Run the test
testWikiOAuth();
