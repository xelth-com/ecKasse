#!/usr/bin/env node

/**
 * Create test category for testing product creation
 */

require('dotenv').config({ path: '../../.env' });
const db = require('./src/db/knex');

async function createTestCategory() {
    console.log('🏗️ Creating test category...');
    
    try {
        // First, check if we have any pos_devices
        const posDevices = await db('pos_devices').select('*');
        console.log(`Found ${posDevices.length} POS devices`);
        
        if (posDevices.length === 0) {
            console.log('Creating test POS device...');
            // Create basic company first
            const [companyId] = await db('companies').insert({
                company_full_name: 'Test Company',
                meta_information: JSON.stringify({}),
                global_configurations: JSON.stringify({})
            }).returning('id');
            
            // Create basic branch
            const [branchId] = await db('branches').insert({
                company_id: companyId,
                branch_name: 'Test Branch',
                branch_address: 'Test Address'
            }).returning('id');
            
            // Create basic POS device
            const [posDeviceId] = await db('pos_devices').insert({
                branch_id: branchId,
                pos_device_name: 'Test POS',
                pos_device_type: 'terminal',
                pos_device_external_number: 1
            }).returning('id');
            
            console.log(`Created POS device with ID: ${posDeviceId}`);
        }
        
        // Get the first available POS device
        const posDevice = await db('pos_devices').first();
        console.log(`Using POS device ID: ${posDevice.id}`);
        
        // Create test categories
        const categories = [
            {
                pos_device_id: posDevice.id,
                source_unique_identifier: 'cat_drinks_test',
                category_names: JSON.stringify({ de: 'Getränke' }),
                category_type: 'drink',
                audit_trail: JSON.stringify({ created_by: 'test', created_at: new Date().toISOString() })
            },
            {
                pos_device_id: posDevice.id,
                source_unique_identifier: 'cat_food_test',
                category_names: JSON.stringify({ de: 'Speisen' }),
                category_type: 'food',
                audit_trail: JSON.stringify({ created_by: 'test', created_at: new Date().toISOString() })
            }
        ];
        
        const insertedCategories = await db('categories').insert(categories).returning('*');
        console.log(`Created ${insertedCategories.length} categories:`);
        
        insertedCategories.forEach(cat => {
            console.log(`  - ID: ${cat.id}, Name: ${cat.category_names}, Type: ${cat.category_type}`);
        });
        
        // Test the lookup now
        console.log('\n🧪 Testing category lookup...');
        const testCategory = await db('categories')
            .whereRaw("JSON_EXTRACT(category_names, '$.de') = ?", ['Getränke'])
            .first();
            
        console.log('Found category:', testCategory ? 'Yes' : 'No');
        if (testCategory) {
            console.log(`  ID: ${testCategory.id}, Names: ${testCategory.category_names}`);
        }
        
        console.log('✅ Test categories created successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

createTestCategory();