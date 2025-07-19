#!/usr/bin/env node

/**
 * Test script for createProduct functionality
 */

require('dotenv').config({ path: '../../.env' });

async function testCreateProduct() {
    console.log('🧪 Testing createProduct functionality...');
    
    // Test 1: Direct service test
    console.log('\n1. Testing product service directly...');
    const { createProduct } = require('./src/services/product.service.js');
    
    try {
        const productData = {
            name: 'Test Latte',
            price: 3.50,
            categoryName: 'Getränke', // Using test category we just created
            description: 'A delicious test latte created by AI agent'
        };
        
        console.log(`   Creating product: ${JSON.stringify(productData)}`);
        const result = await createProduct(productData);
        
        console.log(`   ✅ Service test: ${result.success ? 'PASS' : 'FAIL'}`);
        
        if (result.success) {
            console.log(`   📦 Product ID: ${result.data.id}`);
            console.log(`   🏷️ Name: ${result.data.name}`);
            console.log(`   💰 Price: ${result.data.price}`);
            console.log(`   📂 Category: ${result.data.categoryName}`);
        } else {
            console.log(`   ❌ Error: ${result.message}`);
        }
        
        // Test 2: Verify we can find the product with search
        if (result.success) {
            console.log('\n2. Testing that new product can be found...');
            const { searchProducts } = require('./src/services/search.service.js');
            
            setTimeout(async () => {
                try {
                    const searchResult = await searchProducts('Test Latte');
                    console.log(`   🔍 Search test: ${searchResult.success ? 'PASS' : 'FAIL'}`);
                    
                    if (searchResult.success && searchResult.results.length > 0) {
                        const foundProduct = searchResult.results.find(p => p.name.includes('Test Latte'));
                        if (foundProduct) {
                            console.log(`   ✅ Found created product: ${foundProduct.name} - ${foundProduct.price}`);
                        } else {
                            console.log(`   ⚠️ Product created but not found in search results yet`);
                        }
                    }
                } catch (searchError) {
                    console.log(`   ❌ Search test failed: ${searchError.message}`);
                }
            }, 1000); // Give it a moment for indexing
        }
        
    } catch (error) {
        console.log(`   ❌ Service test failed: ${error.message}`);
        console.error('Stack:', error.stack);
    }
    
    // Test 3: LLM integration test (optional, commented out for now due to timeout issues)
    /*
    console.log('\n3. Testing LLM service integration...');
    const { sendMessage } = require('./src/services/llm.service.js');
    
    try {
        const query = "создай товар 'Капучино Тест' цена 4.00 категория 'Getränke'";
        console.log(`   Query: "${query}"`);
        
        const timeout = setTimeout(() => {
            console.log('   ⏱️  LLM test timed out (30s)');
        }, 30000);
        
        const response = await sendMessage(query, []);
        clearTimeout(timeout);
        
        const responseText = response.text.toLowerCase();
        const hasSuccessIndicators = responseText.includes('создан') || 
                                   responseText.includes('добавлен') ||
                                   responseText.includes('успешно') ||
                                   responseText.includes('капучино');
        
        console.log(`   ✅ LLM integration test: ${hasSuccessIndicators ? 'PASS' : 'FAIL'}`);
        console.log(`   📝 Response: ${response.text.substring(0, 100)}...`);
        
    } catch (error) {
        console.log(`   ❌ LLM test failed: ${error.message}`);
    }
    */
    
    console.log('\n🎉 Testing complete!');
}

testCreateProduct().catch(console.error);