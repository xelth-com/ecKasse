const { searchProducts } = require('./src/services/search.service');

console.log('Testing hybrid search for "кружка"...');

searchProducts('кружка').then(result => {
  console.log('\n=== SEARCH RESULTS ===');
  console.log('Success:', result.success);
  console.log('Message:', result.message);
  console.log('Search Method:', result.metadata?.searchMethod);
  console.log('Execution Time:', result.metadata?.executionTime + 'ms');
  
  if (result.results && result.results.length > 0) {
    console.log('\nFound Products:');
    result.results.forEach((item, i) => {
      console.log(`${i+1}. ${item.productName} - ${item.price}€`);
      if (item.similarity) console.log(`   Similarity: ${item.similarity}%`);
      if (item.levenshteinDistance !== undefined) console.log(`   Edit Distance: ${item.levenshteinDistance}`);
    });
  } else {
    console.log('\nNo products found.');
  }
}).catch(err => {
  console.error('Error:', err);
}).finally(() => {
  process.exit(0);
});