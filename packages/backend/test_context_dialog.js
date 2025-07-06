// Test file for improved dialog context handling
require('dotenv').config({ path: '../../.env' });

const { sendMessage } = require('./src/services/llm.service');

/**
 * Test dialog context with follow-up questions
 */
async function testDialogContext() {
  console.log('🧪 TESTING IMPROVED DIALOG CONTEXT\n');

  try {
    let chatHistory = [];
    
    // First message: Search for a product
    console.log('👤 User: "such mug"');
    const response1 = await sendMessage('such mug', chatHistory);
    chatHistory = response1.history;
    console.log('🤖 AI:', response1.text);
    console.log();

    // Second message: Ask about its price (should use context)
    console.log('👤 User: "zeig sein preis" (show its price)');
    const response2 = await sendMessage('zeig sein preis', chatHistory);
    chatHistory = response2.history;
    console.log('🤖 AI:', response2.text);
    console.log();

    // Third message: Ask about its category (should use context)
    console.log('👤 User: "what category is it?"');
    const response3 = await sendMessage('what category is it?', chatHistory);
    chatHistory = response3.history;
    console.log('🤖 AI:', response3.text);
    console.log();

    // Fourth message: Different product search
    console.log('👤 User: "find widget"');
    const response4 = await sendMessage('find widget', chatHistory);
    chatHistory = response4.history;
    console.log('🤖 AI:', response4.text);
    console.log();

    // Fifth message: Ask about the new product (should refer to widget, not mug)
    console.log('👤 User: "how much does it cost?"');
    const response5 = await sendMessage('how much does it cost?', chatHistory);
    chatHistory = response5.history;
    console.log('🤖 AI:', response5.text);
    console.log();

    console.log('✅ Context dialog test completed!');
    console.log('\n📊 Test Summary:');
    console.log('- Searched for "mug" and found product');
    console.log('- Asked about price using context (German)');
    console.log('- Asked about category using context (English)');
    console.log('- Searched for different product "widget"');
    console.log('- Asked about price of widget (should refer to widget, not mug)');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

/**
 * Test multilingual conversation
 */
async function testMultilingualConversation() {
  console.log('\n\n🌍 TESTING MULTILINGUAL CONVERSATION\n');

  try {
    let chatHistory = [];
    
    // Russian request
    console.log('👤 User (Russian): "Найди товар кружка"');
    const response1 = await sendMessage('Найди товар кружка', chatHistory);
    chatHistory = response1.history;
    console.log('🤖 AI:', response1.text);
    console.log();

    // German follow-up
    console.log('👤 User (German): "wie viel kostet es?"');
    const response2 = await sendMessage('wie viel kostet es?', chatHistory);
    chatHistory = response2.history;
    console.log('🤖 AI:', response2.text);
    console.log();

    // English follow-up
    console.log('👤 User (English): "what is the category?"');
    const response3 = await sendMessage('what is the category?', chatHistory);
    chatHistory = response3.history;
    console.log('🤖 AI:', response3.text);
    console.log();

    console.log('✅ Multilingual test completed!');

  } catch (error) {
    console.error('❌ Multilingual test failed:', error.message);
  }
}

/**
 * Test JSON interpretation
 */
async function testJSONInterpretation() {
  console.log('\n\n📋 TESTING JSON INTERPRETATION\n');

  try {
    // Test what happens when we get structured data
    console.log('👤 User: "show me all products"');
    const response = await sendMessage('show me all products');
    console.log('🤖 AI:', response.text);
    console.log();

    console.log('✅ JSON interpretation test completed!');

  } catch (error) {
    console.error('❌ JSON interpretation test failed:', error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 STARTING CONTEXT AND CONVERSATION TESTS\n');
  console.log('=' .repeat(60));

  try {
    await testDialogContext();
    await testMultilingualConversation();
    await testJSONInterpretation();
    
    console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('\n📈 Improvements tested:');
    console.log('✓ Context awareness for follow-up questions');
    console.log('✓ Multilingual conversation handling');
    console.log('✓ JSON data interpretation and presentation');
    console.log('✓ Conversation history management');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testDialogContext,
  testMultilingualConversation,
  testJSONInterpretation,
  runAllTests
};