# eckasse CLI Tool

Command-line interface for parsing restaurant menus using AI (Gemini 2.5/2.0) and converting them to OOP-POS-MDF format.

## Quick Start

```bash
# Parse single PDF menu
node cli.js parse-menu menu.pdf --restaurant-name "My Restaurant"

# Parse multiple files with rate limit protection
node cli.js parse-menu page1.pdf page2.pdf --restaurant-name "Restaurant" --batch-delay 10

# Append to existing configuration
node cli.js parse-menu new_page.pdf --append existing_config.json
```

## Key Features

- **Direct file processing**: Sends PDF/images directly to Gemini (no OCR)
- **Smart naming**: Auto-generates filenames with restaurant name and timestamp
- **Batch processing**: Multiple files with configurable delays
- **Append mode**: Add new menu pages to existing configurations
- **Rate limit handling**: Automatic partial saves and resume capability

## Commands

### `parse-menu <input...>`

Parse restaurant menu files into OOP-POS-MDF format.

### `import-mdf <filepath>`

Import a complete OOP-POS-MDF JSON file into the database, overwriting existing data.

**Options:**
- `--force` - Skip confirmation prompt and proceed with import
- `--dry-run` - Validate the JSON structure without actually importing
- `--validate` - Validate against schema before importing

**Examples:**
```bash
# Import configuration into database
node cli.js import-mdf menu_outputs/Park_Avenue_2025-07-06T22-58.json

# Dry run to check file structure
node cli.js import-mdf config.json --dry-run --validate

# Force import without confirmation
node cli.js import-mdf config.json --force
```

### `export-mdf [output]`

Export current database state to OOP-POS-MDF JSON file with "_exp" suffix.

**Options:**
- `--validate` - Validate exported configuration against schema
- `--pretty` - Format JSON output with indentation (default: true)
- `--force` - Overwrite existing output file without confirmation

**Examples:**
```bash
# Export current database state
node cli.js export-mdf
# → Creates: menu_outputs/Park_Avenue_2025-07-07T00-34_exp.json

# Export to specific file
node cli.js export-mdf backup/current_state.json

# Export with validation
node cli.js export-mdf --validate

# Force overwrite existing file
node cli.js export-mdf backup.json --force
```

## Database Management Workflow

The CLI tools enable a complete database management workflow:

```bash
# 1. Parse menu from files
node cli.js parse-menu menu.pdf --restaurant-name "Park Avenue"
# → Creates: menu_outputs/Park_Avenue_2025-07-06T22-58.json

# 2. Import into database for AI agent operations
node cli.js import-mdf menu_outputs/Park_Avenue_2025-07-06T22-58.json
# Database now contains: 1 company, 1 branch, 1 POS device, 5 categories, 24 items

# 3. Make changes via AI agent (through web interface or API)
# Agent can: add/modify/delete items, change prices, create categories, etc.

# 4. Export current state to see changes
node cli.js export-mdf
# → Creates: menu_outputs/Park_Avenue_2025-07-07T00-34_exp.json
# Shows current state after AI agent modifications

# 5. Compare or backup the modified state
# The _exp.json file contains the current state with all changes
```

### Parse Menu Options:
- `-o, --output <file>` - Custom output filename (auto-generated if not specified)
- `-a, --append <file>` - Append to existing configuration
- `--restaurant-name <name>` - Restaurant name (used in filename and LLM prompt)
- `--batch-delay <seconds>` - Delay between files (default: 5s)
- `--language <lang>` - Primary language (default: de)
- `--validate` - Validate generated configuration

**Examples:**
```bash
# Basic usage
node cli.js parse-menu menu.pdf --restaurant-name "Park Avenue"
# → Creates: menu_outputs/Park_Avenue_2025-07-06T22-15.json

# Multiple files with delay
node cli.js parse-menu page1.pdf page2.pdf page3.pdf --restaurant-name "Big Restaurant" --batch-delay 15
# → Creates: menu_outputs/Big_Restaurant_2025-07-06T22-15_3files.json

# Add more pages later
node cli.js parse-menu page4.pdf --append menu_outputs/Big_Restaurant_2025-07-06T22-15_3files.json
# → Updates existing file with new items
```

## Rate Limit Handling

When Gemini rate limits are hit:
1. **Partial results** are automatically saved
2. **Resume instructions** are displayed
3. Use `--append` to continue from where you left off

```bash
# If processing fails at file 3 of 5, resume with:
node cli.js parse-menu remaining_files.pdf --append menu_outputs/Restaurant_partial_2files_timestamp.json
```

## File Organization

```
menu_inputs/     # Input PDF/image files
menu_outputs/    # Generated configurations
├── Restaurant_Name_YYYY-MM-DDTHH-MM.json           # Parsed from menu files
├── Restaurant_Name_YYYY-MM-DDTHH-MM_3files.json    # Multiple files batch
├── Restaurant_Name_partial_2files_timestamp.json   # Partial results
└── Restaurant_Name_YYYY-MM-DDTHH-MM_exp.json       # Exported database state
```

**File Naming Convention:**
- **Parsed menus**: `RestaurantName_timestamp.json`
- **Batch processing**: `RestaurantName_timestamp_Nfiles.json`  
- **Partial results**: `RestaurantName_partial_Nfiles_timestamp.json`
- **Database exports**: `RestaurantName_timestamp_exp.json`

## Supported File Types

- **PDF**: `application/pdf`
- **Images**: PNG, JPEG, WebP, HEIC, HEIF
- **Video**: MP4, MOV, AVI (experimental)
- **Audio**: WAV, MP3, FLAC (experimental)

## AI Models

- **Primary**: Gemini 2.5-flash (higher quality, may hit limits)
- **Fallback**: Gemini 2.0-flash (more stable for large batches)

## Troubleshooting

**Rate Limits**: Increase `--batch-delay` or use `--append` to resume

**Large Menus**: Process in smaller batches, then combine with `--append`

**Poor Recognition**: Ensure good image quality, use `--validate` flag

**Import Issues**: 
- Use `--dry-run` to test file structure first
- Check database path in `.env` file 
- Ensure Gemini API key is configured for embedding generation

**Export Issues**:
- Make sure database contains data (run import first)
- Check file permissions in `menu_outputs/` directory
- Use `--force` to overwrite existing files

## Integration with AI Agent

The CLI tools work seamlessly with the AI agent system:

1. **Parse & Import**: Use CLI to get menu data into the database
2. **AI Operations**: Agent can modify items, prices, categories via natural language
3. **Export & Review**: Use CLI to export and review changes made by the agent
4. **Backup & Restore**: Export files serve as backups and can be re-imported

**Example Agent Operations:**
- "Add new item 'Tiramisu' for 6.50€ in Desserts category"
- "Increase all coffee prices by 10%"
- "Create new category 'Seasonal Specials'"
- "Remove item 'Old Menu Item'"

After any agent operations, run `export-mdf` to see the updated state.