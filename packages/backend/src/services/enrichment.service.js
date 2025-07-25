/**
 * Multi-pass enrichment service for OOP-POS-MDF data
 * This service performs AI-powered enrichment of menu items and categories
 */

const chalk = require('chalk');
const { generateEmbedding } = require('./embedding.service');
const { invokeSimpleQuery } = require('./llm.service');

// Intelligent prompt templates for name abbreviation
const BUTTON_NAME_PROMPT_TEMPLATE = `
You are an expert UI text designer creating concise labels for POS system buttons.
Your task is to create a short name for a button from a full product name.

## INSTRUCTIONS ##
1.  **Output Format:** The result MUST be two lines, separated by a single newline character (\\n).
2.  **Character Limit:** Each of the two lines MUST NOT exceed 10 characters.
3.  **Content Logic:**
    - Analyze the full product name to identify the two most significant and descriptive words.
    - Remove all articles, prepositions, and connector words (e.g., "di", "and", "with").
    - Place the most important word on the first line and the second most important word on the second line.
4.  **CRITICAL OUTPUT RULE:** Your response MUST contain ONLY the resulting text for the button. DO NOT include any explanations, markdown, JSON formatting, or any other characters.

## EXAMPLES ##

- Full Name: "Pesto di Mykonos"
- Correct Output: Pesto\\nMykonos

- Full Name: "Lemon Garlic Shrimps"
- Correct Output: Lemon\\nShrimps

- Full Name: "90s Pasta Salad"
- Incorrect Output: 90s Pasta\\nSalad (First line is too long)
- Correct Output: Pasta\\nSalad

- Full Name: "Avocado Pistachio Cream"
- Incorrect Output: {"button": "Avocado..."} (Contains JSON)
- Correct Output: Avocado\\nPistachio

## YOUR TASK ##
Now, apply this logic to the following product.
Full Name: "{productName}"
`;

const RECEIPT_NAME_PROMPT_TEMPLATE = `
You are an expert at summarizing text for limited-space displays like cash register receipts.
Your task is to create a condensed, single-line name from a full product name.

## INSTRUCTIONS ##
1.  **Output Format:** The result MUST be a single line of text.
2.  **Character Limit:** The entire output MUST NOT exceed 42 characters.
3.  **Content Logic:**
    - Retain the most important and identifying words.
    - Use common, understandable abbreviations if necessary to meet the length requirement (e.g., "Cream" -> "Crm", "Chocolate" -> "Choc").
    - Remove generic words if the specific words are more descriptive.
4.  **CRITICAL OUTPUT RULE:** Your response MUST contain ONLY the resulting text. DO NOT include any explanations or formatting.

## EXAMPLES ##

- Full Name: "Hello Pasta with Truffle Mushroom Cream Sauce"
- Correct Output: Hello Pasta Truffle Mushroom Crm

- Full Name: "Extra Parmesan Add-on"
- Correct Output: Extra Parmesan Add-on

## YOUR TASK ##
Now, apply this logic to the following product.
Full Name: "{productName}"
`;

/**
 * Main enrichment function that orchestrates the multi-pass process
 * @param {Object} mdfData - The OOP-POS-MDF configuration object
 * @param {Object} options - Enrichment options
 * @returns {Promise<Object>} - Enriched MDF data
 */
async function enrichMdfData(mdfData, options = {}) {
    console.log(chalk.blue('🔬 Starting multi-pass enrichment process...'));
    
    // Create a deep copy to avoid modifying the original
    const enrichedData = JSON.parse(JSON.stringify(mdfData));
    
    try {
        // Pass 1: Initial validation and preparation
        console.log(chalk.blue('\n📋 Pass 1: Validating and preparing data...'));
        await validateAndPrepareData(enrichedData);
        
        // Pass 2: Item enrichment and abbreviation generation
        if (!options.skipWebSearch) {
            console.log(chalk.blue('\n🔍 Pass 2: Enriching items with web data and generating abbreviations...'));
            await enrichItemsWithWebData(enrichedData);
        } else {
            console.log(chalk.gray('\n⏭️  Pass 2: Skipping web search enrichment'));
        }
        
        // Pass 3: Warengruppen (Main Groups) assignment
        if (!options.skipMainGroups) {
            console.log(chalk.blue('\n🏷️  Pass 3: Generating and assigning main groups (Warengruppen)...'));
            await generateAndAssignMainGroups(enrichedData);
        } else {
            console.log(chalk.gray('\n⏭️  Pass 3: Skipping main groups generation'));
        }
        
        // Pass 4: Final validation and cleanup
        console.log(chalk.blue('\n✅ Pass 4: Final validation and cleanup...'));
        await finalizeEnrichment(enrichedData);
        
        console.log(chalk.green('\n🎉 Multi-pass enrichment completed successfully!'));
        return enrichedData;
        
    } catch (error) {
        console.error(chalk.red(`\n❌ Enrichment failed: ${error.message}`));
        throw error;
    }
}

/**
 * Pass 1: Validate and prepare the data structure
 * @param {Object} enrichedData - The MDF data to validate
 */
async function validateAndPrepareData(enrichedData) {
    // Verify essential structure exists
    if (!enrichedData.company_details) {
        throw new Error('Invalid MDF structure: missing company_details');
    }
    
    if (!enrichedData.company_details.branches) {
        throw new Error('Invalid MDF structure: missing branches');
    }
    
    // Count items and categories for progress tracking
    let totalItems = 0;
    let totalCategories = 0;
    
    for (const branch of enrichedData.company_details.branches) {
        if (branch.point_of_sale_devices) {
            for (const pos of branch.point_of_sale_devices) {
                if (pos.items_for_this_pos) {
                    totalItems += pos.items_for_this_pos.length;
                }
                if (pos.categories_for_this_pos) {
                    totalCategories += pos.categories_for_this_pos.length;
                }
            }
        }
    }
    
    console.log(chalk.cyan(`   Found ${totalItems} items and ${totalCategories} categories to process`));
    
    // Initialize global configurations if not present
    if (!enrichedData.company_details.global_configurations) {
        enrichedData.company_details.global_configurations = {};
    }
    
    if (!enrichedData.company_details.global_configurations.main_groups_definitions) {
        enrichedData.company_details.global_configurations.main_groups_definitions = [];
    }
    
    console.log(chalk.green('   ✅ Data structure validated and prepared'));
}

/**
 * Pass 2: Enrich items with web data and generate abbreviations
 * @param {Object} enrichedData - The MDF data to enrich
 */
async function enrichItemsWithWebData(enrichedData) {
    let processedItems = 0;
    let totalItems = 0;
    
    // Count total items first
    for (const branch of enrichedData.company_details.branches) {
        if (branch.point_of_sale_devices) {
            for (const pos of branch.point_of_sale_devices) {
                if (pos.items_for_this_pos) {
                    totalItems += pos.items_for_this_pos.length;
                }
            }
        }
    }
    
    console.log(chalk.cyan(`   Processing ${totalItems} items...`));
    
    // Process each item
    for (const branch of enrichedData.company_details.branches) {
        if (branch.point_of_sale_devices) {
            for (const pos of branch.point_of_sale_devices) {
                if (pos.items_for_this_pos) {
                    for (const item of pos.items_for_this_pos) {
                        processedItems++;
                        
                        try {
                            console.log(chalk.gray(`   Processing item ${processedItems}/${totalItems}: ${item.display_names?.menu?.de || 'Unknown'}`));
                            
                            // Enrich with web data
                            await enrichItemWithWebData(item);
                            
                            // Generate receipt abbreviation
                            await generateReceiptAbbreviation(item);
                            
                            // Generate button abbreviation
                            await generateButtonAbbreviation(item);
                            
                            // Small delay to avoid rate limiting
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                        } catch (error) {
                            console.log(chalk.yellow(`   ⚠️  Warning: Failed to enrich item ${item.display_names?.menu?.de || 'Unknown'}: ${error.message}`));
                        }
                    }
                }
            }
        }
    }
    
    console.log(chalk.green(`   ✅ Processed ${processedItems} items`));
}

/**
 * Enrich a single item with web data
 * @param {Object} item - The item to enrich
 */
async function enrichItemWithWebData(item) {
    const itemName = item.display_names?.menu?.de || 'Unknown Item';
    
    try {
        // Create search query for the item
        const searchQuery = `Based on the dish "${itemName}", identify its cuisine type, typical ingredients, and meal type (appetizer, main course, dessert). Respond only with a JSON object containing keys: cuisine, ingredients, mealType.`;
        
        // Get LLM response using optimized query function
        const response = await invokeSimpleQuery(searchQuery);
        
        // Try to parse JSON response
        let enrichmentData;
        try {
            // Extract JSON from response text
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                enrichmentData = JSON.parse(jsonMatch[0]);
            } else {
                // Fallback: create structured data from text response
                enrichmentData = {
                    cuisine: 'Unknown',
                    ingredients: ['Unknown'],
                    mealType: 'Unknown'
                };
            }
        } catch (parseError) {
            console.log(chalk.yellow(`     Warning: Could not parse LLM response for ${itemName}`));
            enrichmentData = {
                cuisine: 'Unknown',
                ingredients: ['Unknown'],
                mealType: 'Unknown'
            };
        }
        
        // Initialize additional_item_attributes if not present
        if (!item.additional_item_attributes) {
            item.additional_item_attributes = {};
        }
        
        // Add enrichment data
        item.additional_item_attributes.ai_enrichment = {
            cuisine: enrichmentData.cuisine || 'Unknown',
            ingredients: Array.isArray(enrichmentData.ingredients) ? enrichmentData.ingredients : ['Unknown'],
            mealType: enrichmentData.mealType || 'Unknown',
            enriched_at: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(chalk.yellow(`     Warning: Web enrichment failed for ${itemName}: ${error.message}`));
        
        // Add minimal enrichment data as fallback
        if (!item.additional_item_attributes) {
            item.additional_item_attributes = {};
        }
        item.additional_item_attributes.ai_enrichment = {
            cuisine: 'Unknown',
            ingredients: ['Unknown'],
            mealType: 'Unknown',
            enriched_at: new Date().toISOString(),
            error: error.message
        };
    }
}

/**
 * Generate receipt abbreviation for an item using intelligent prompt
 * @param {Object} item - The item to generate abbreviation for
 */
async function generateReceiptAbbreviation(item) {
    const itemName = item.display_names?.menu?.de || 'Unknown Item';
    
    try {
        const receiptQuery = RECEIPT_NAME_PROMPT_TEMPLATE.replace('{productName}', itemName);
        const response = await invokeSimpleQuery(receiptQuery);
        
        // Clean up the response
        let receiptText = response.trim();
        
        // Remove quotes if present
        receiptText = receiptText.replace(/^["']|["']$/g, '');
        
        // Ensure it's within the 42-character limit
        if (receiptText.length > 42) {
            receiptText = receiptText.substring(0, 42);
        }
        
        // Ensure we have display_names structure
        if (!item.display_names) {
            item.display_names = {};
        }
        
        // Update receipt name
        item.display_names.receipt = { de: receiptText };
        
    } catch (error) {
        console.log(chalk.yellow(`     Warning: Receipt abbreviation failed for ${itemName}: ${error.message}`));
        
        // Fallback: create simple abbreviation
        let fallbackAbbreviation = itemName;
        if (fallbackAbbreviation.length > 42) {
            fallbackAbbreviation = fallbackAbbreviation.substring(0, 42);
        }
        
        if (!item.display_names) {
            item.display_names = {};
        }
        item.display_names.receipt = { de: fallbackAbbreviation };
    }
}

/**
 * Generate button abbreviation for an item using intelligent prompt
 * @param {Object} item - The item to generate abbreviation for
 */
async function generateButtonAbbreviation(item) {
    const itemName = item.display_names?.menu?.de || 'Unknown Item';
    
    try {
        const buttonQuery = BUTTON_NAME_PROMPT_TEMPLATE.replace('{productName}', itemName);
        const response = await invokeSimpleQuery(buttonQuery);
        
        // Clean up the response
        let buttonText = response.trim();
        
        // Remove quotes if present
        buttonText = buttonText.replace(/^["']|["']$/g, '');
        
        // Handle literal \n in the response and convert to actual newline
        buttonText = buttonText.replace(/\\n/g, '\n');
        
        // Ensure we have exactly two lines
        const lines = buttonText.split('\n');
        let line1 = lines[0] || itemName.substring(0, 10);
        let line2 = lines[1] || '';
        
        // Truncate lines to 10 characters to ensure compliance
        line1 = line1.substring(0, 10).trim();
        line2 = line2.substring(0, 10).trim();
        
        const finalButtonText = line2 ? `${line1}\n${line2}` : line1;
        
        // Ensure we have display_names structure
        if (!item.display_names) {
            item.display_names = {};
        }
        
        // Update button name
        item.display_names.button = { de: finalButtonText };
        
    } catch (error) {
        console.log(chalk.yellow(`     Warning: Button abbreviation failed for ${itemName}: ${error.message}`));
        
        // Fallback: create simple button text
        let fallbackButton = itemName.substring(0, 10);
        
        if (!item.display_names) {
            item.display_names = {};
        }
        item.display_names.button = { de: fallbackButton };
    }
}

/**
 * Pass 3: Generate and assign main groups (Warengruppen)
 * @param {Object} enrichedData - The MDF data to process
 */
async function generateAndAssignMainGroups(enrichedData) {
    console.log(chalk.cyan('   Analyzing items to generate main groups...'));
    
    // Collect all enriched items for analysis
    const allItems = [];
    const allCategories = [];
    
    for (const branch of enrichedData.company_details.branches) {
        if (branch.point_of_sale_devices) {
            for (const pos of branch.point_of_sale_devices) {
                if (pos.items_for_this_pos) {
                    allItems.push(...pos.items_for_this_pos);
                }
                if (pos.categories_for_this_pos) {
                    allCategories.push(...pos.categories_for_this_pos);
                }
            }
        }
    }
    
    // Generate main groups based on all items
    const mainGroups = await generateMainGroups(allItems);
    
    // Update global configurations
    enrichedData.company_details.global_configurations.main_groups_definitions = mainGroups;
    
    // Assign categories to main groups
    await assignCategoriesToMainGroups(enrichedData, allCategories, allItems, mainGroups);
    
    console.log(chalk.green(`   ✅ Generated ${mainGroups.length} main groups and assigned categories`));
}

/**
 * Generate main groups based on item analysis
 * @param {Array} allItems - All items to analyze
 * @returns {Promise<Array>} - Array of main group definitions
 */
async function generateMainGroups(allItems) {
    try {
        // Create item analysis summary
        const itemSummary = allItems.map(item => ({
            name: item.display_names?.menu?.de || 'Unknown',
            cuisine: item.additional_item_attributes?.ai_enrichment?.cuisine || 'Unknown',
            mealType: item.additional_item_attributes?.ai_enrichment?.mealType || 'Unknown',
            ingredients: item.additional_item_attributes?.ai_enrichment?.ingredients || []
        }));
        
        const analysisQuery = `Analyze the following list of restaurant dishes and their attributes. Define a concise list of logical 'Main Groups' (Warengruppen) that cover all these items. The group names should be in German. Respond only with a JSON array of strings, like ["Vorspeisen", "Hauptgerichte", "Italienische Spezialitäten", "Getränke"].

Items to analyze:
${itemSummary.map(item => `- ${item.name} (${item.cuisine}, ${item.mealType})`).join('\n')}`;
        
        const response = await invokeSimpleQuery(analysisQuery);
        
        // Parse main groups from response
        let mainGroupNames;
        try {
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                mainGroupNames = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON array found in response');
            }
        } catch (parseError) {
            console.log(chalk.yellow('   Warning: Could not parse main groups, using defaults'));
            mainGroupNames = ['Vorspeisen', 'Hauptgerichte', 'Getränke', 'Desserts'];
        }
        
        // Convert to main group definitions
        const mainGroups = mainGroupNames.map((name, index) => ({
            main_group_unique_identifier: index + 1,
            main_group_names: { de: name }
        }));
        
        console.log(chalk.cyan(`   Generated main groups: ${mainGroupNames.join(', ')}`));
        return mainGroups;
        
    } catch (error) {
        console.log(chalk.yellow(`   Warning: Main groups generation failed: ${error.message}`));
        
        // Fallback main groups
        return [
            { main_group_unique_identifier: 1, main_group_names: { de: 'Vorspeisen' } },
            { main_group_unique_identifier: 2, main_group_names: { de: 'Hauptgerichte' } },
            { main_group_unique_identifier: 3, main_group_names: { de: 'Getränke' } },
            { main_group_unique_identifier: 4, main_group_names: { de: 'Desserts' } }
        ];
    }
}

/**
 * Assign categories to main groups
 * @param {Object} enrichedData - The MDF data
 * @param {Array} allCategories - All categories
 * @param {Array} allItems - All items
 * @param {Array} mainGroups - Available main groups
 */
async function assignCategoriesToMainGroups(enrichedData, allCategories, allItems, mainGroups) {
    console.log(chalk.cyan('   Assigning categories to main groups...'));
    
    const mainGroupNames = mainGroups.map(group => group.main_group_names.de);
    
    for (const category of allCategories) {
        try {
            // Find items in this category
            const categoryItems = allItems.filter(item => 
                item.linked_category_unique_identifier === category.category_unique_identifier
            );
            
            if (categoryItems.length === 0) {
                console.log(chalk.yellow(`   Warning: No items found for category ${category.category_names?.de || 'Unknown'}`));
                continue;
            }
            
            // Create item list for this category
            const itemNames = categoryItems.map(item => item.display_names?.menu?.de || 'Unknown');
            
            const assignmentQuery = `Given the main groups: ${JSON.stringify(mainGroupNames)}, which group is the best fit for a category that contains the following items: ${JSON.stringify(itemNames)}? Respond with only the single best-fit group name.`;
            
            const response = await invokeSimpleQuery(assignmentQuery);
            
            // Find matching main group
            const bestFitGroup = response.trim().replace(/['"]/g, '');
            const matchingGroup = mainGroups.find(group => 
                group.main_group_names.de === bestFitGroup
            );
            
            if (matchingGroup) {
                category.default_linked_main_group_unique_identifier = matchingGroup.main_group_unique_identifier;
                console.log(chalk.gray(`     Assigned "${category.category_names?.de}" to "${bestFitGroup}"`));
            } else {
                console.log(chalk.yellow(`     Warning: Could not find matching main group for "${bestFitGroup}"`));
                // Assign to first main group as fallback
                category.default_linked_main_group_unique_identifier = mainGroups[0].main_group_unique_identifier;
            }
            
        } catch (error) {
            console.log(chalk.yellow(`     Warning: Assignment failed for category ${category.category_names?.de}: ${error.message}`));
            // Assign to first main group as fallback
            category.default_linked_main_group_unique_identifier = mainGroups[0].main_group_unique_identifier;
        }
    }
}

/**
 * Pass 4: Finalize enrichment with validation and cleanup
 * @param {Object} enrichedData - The MDF data to finalize
 */
async function finalizeEnrichment(enrichedData) {
    // Update metadata to indicate enrichment
    if (!enrichedData.company_details.meta_information) {
        enrichedData.company_details.meta_information = {};
    }
    
    enrichedData.company_details.meta_information.enriched_at = new Date().toISOString();
    enrichedData.company_details.meta_information.enriched_by = 'eckasse-enrichment-service';
    
    // Add enrichment audit trail
    if (!enrichedData.company_details.meta_information.audit_trail) {
        enrichedData.company_details.meta_information.audit_trail = {};
    }
    
    if (!enrichedData.company_details.meta_information.audit_trail.change_log) {
        enrichedData.company_details.meta_information.audit_trail.change_log = [];
    }
    
    enrichedData.company_details.meta_information.audit_trail.change_log.push({
        timestamp: new Date().toISOString(),
        change_type: 'enrichment',
        description: 'Multi-pass AI enrichment applied',
        changed_by: 'eckasse-enrichment-service'
    });
    
    console.log(chalk.green('   ✅ Enrichment finalized and metadata updated'));
}

module.exports = {
    enrichMdfData
};