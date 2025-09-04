require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { searchProducts } = require('../application/search.service');
const db = require('../db/knex');

async function testSearchContext() {
  console.log('--- Running Context-Aware Search Test ---');
  try {
    console.log('\n[Test Case 1] Searching for "cafe crema" without context...');
    const results1 = await searchProducts('cafe crema');
    console.log('Results:', results1.message);
    console.log('Top hit:', results1.results[0]?.productName);

    console.log('\n[Test Case 2] Searching for "cafe crema" with "drink" context...');
    const results2 = await searchProducts('cafe crema', { categoryContext: 'drink' });
    console.log('Results:', results2.message);
    console.log('Top hit:', results2.results[0]?.productName);
    const hasPesto = results2.results.some(r => r.productName.toLowerCase().includes('pesto'));
    if (!hasPesto) {
        console.log('✅ SUCCESS: Pesto was correctly excluded from the results.');
    } else {
        console.log('❌ FAILURE: Pesto was incorrectly included in the results.');
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await db.destroy();
  }
}

testSearchContext();