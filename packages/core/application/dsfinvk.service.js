const db = require('../db/knex');
const logger = require('../config/logger');
const xmlbuilder = require('xmlbuilder');
const { Parser } = require('json2csv');
const archiver = require('archiver');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Helper to format numbers with a period decimal separator (DSFinV-K compliant)
const formatNumber = (num, decimals = 2) => {
    if (num === null || num === undefined) return '';
    const numValue = parseFloat(num);
    if (isNaN(numValue)) return '';
    return numValue.toFixed(decimals);
};

// Helper to format dates to the required ISO 8601 format with timezone
const formatDate = (date) => {
    if (!date) return '';
    try {
        return new Date(date).toISOString();
    } catch (e) {
        return '';
    }
};

class DsfinvkService {

    /**
     * Generates DSFinV-K export in different modes based on environment
     * @param {Object} options - Export options
     * @param {string} options.startDate - Start date for export
     * @param {string} options.endDate - End date for export
     * @param {number} options.userId - User ID for tracking
     * @param {boolean} options.async - Force async mode (optional)
     * @returns {Promise} Export result based on mode
     */
    async generateExport(options = {}) {
        logger.info({ service: 'DsfinvkService', function: 'generateExport', options }, 'Starting DSFinV-K export process...');
        const { startDate, endDate, userId, async: forceAsync } = options;
        
        if (!startDate || !endDate) {
            throw new Error('Start date and end date are required for export.');
        }

        const isProduction = process.env.NODE_ENV === 'production' || forceAsync;
        
        if (isProduction) {
            return await this.generateAsyncExport(options);
        } else {
            return await this.generateSyncExport(options);
        }
    }

    /**
     * Generates export asynchronously for production use
     */
    async generateAsyncExport(options) {
        const { startDate, endDate, userId } = options;
        const jobId = uuidv4();
        const downloadToken = crypto.randomBytes(32).toString('hex');
        
        // Create job record
        await db('export_jobs').insert({
            job_id: jobId,
            status: 'PENDING',
            export_type: 'dsfinvk',
            parameters: JSON.stringify({ startDate, endDate }),
            download_token: downloadToken,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            created_by: userId
        });

        // Start background processing
        setImmediate(() => this.processAsyncExport(jobId, { startDate, endDate }));
        
        return { 
            success: true, 
            jobId, 
            status: 'PENDING',
            message: 'Export job started. Use jobId to check status.' 
        };
    }

    /**
     * Generates export synchronously for development use
     */
    async generateSyncExport(options) {
        const { startDate, endDate } = options;
        const exportId = `dsfinvk-export-${Date.now()}`;
        const exportPath = path.join(__dirname, `../../../../tmp/${exportId}`);
        
        await fsp.mkdir(exportPath, { recursive: true });

        try {
            const context = {
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(`${endDate}T23:59:59.999Z`).toISOString(),
                kassenabschlussNr: 1, 
                kasseId: 'kasse_1' 
            };

            await this.generateAllFiles(exportPath, context);
            const zipPath = await this.createZipWithTar(exportPath, exportId);
            
            logger.info({ exportId, zipPath }, 'DSFinV-K export package created successfully.');
            return { success: true, path: zipPath, exportId };
        } catch (error) {
            logger.error({ service: 'DsfinvkService', function: 'generateSyncExport', error: error.message, stack: error.stack }, 'DSFinV-K export failed.');
            throw error;
        } finally {
            fsp.rm(exportPath, { recursive: true, force: true }).catch(err => logger.warn(`Failed to cleanup temp dir: ${err.message}`));
        }
    }

    /**
     * Background processor for async exports
     */
    async processAsyncExport(jobId, options) {
        try {
            // Update status to processing
            await db('export_jobs').where('job_id', jobId).update({
                status: 'PROCESSING',
                updated_at: new Date()
            });

            const { startDate, endDate } = options;
            const exportId = `dsfinvk-export-${Date.now()}`;
            const exportPath = path.join(__dirname, `../../../../tmp/${exportId}`);
            
            await fsp.mkdir(exportPath, { recursive: true });

            const context = {
                startDate: new Date(startDate).toISOString(),
                endDate: new Date(`${endDate}T23:59:59.999Z`).toISOString(),
                kassenabschlussNr: 1, 
                kasseId: 'kasse_1' 
            };

            await this.generateAllFiles(exportPath, context);
            const zipPath = await this.createZipWithTar(exportPath, exportId);
            
            // Update job as complete
            await db('export_jobs').where('job_id', jobId).update({
                status: 'COMPLETE',
                file_path: zipPath,
                updated_at: new Date()
            });

            logger.info({ jobId, zipPath }, 'Async DSFinV-K export completed successfully.');
            
            // Cleanup temp directory
            await fsp.rm(exportPath, { recursive: true, force: true });
            
        } catch (error) {
            logger.error({ jobId, error: error.message, stack: error.stack }, 'Async DSFinV-K export failed.');
            
            await db('export_jobs').where('job_id', jobId).update({
                status: 'FAILED',
                error_message: error.message,
                updated_at: new Date()
            });
        }
    }

    /**
     * Generate all DSFinV-K files
     */
    async generateAllFiles(exportPath, context) {
        await this.generateIndexXml(exportPath);
        // Stammdaten
        await this.generateCashRegisterCsv(exportPath, context);
        await this.generateTseCsv(exportPath, context);
        await this.generateVatCsv(exportPath, context);
        // Einzelaufzeichnungen
        await this.generateTransactionsCsv(exportPath, context);
        await this.generateLinesCsv(exportPath, context);
        await this.generateTransactionsVatCsv(exportPath, context);
        // Kassenabschluss
        await this.generateCashpointClosingCsv(exportPath, context);
        await this.generateBusinessCasesCsv(exportPath, context);
        await this.generatePaymentTypesCsv(exportPath, context);
    }

    async generateCsv(filePath, data, fields) {
        if (!data || data.length === 0) {
            await fsp.writeFile(filePath, fields.join(';') + '\n');
            return;
        }
        const parser = new Parser({ fields, delimiter: ';', quote: '"' });
        const csv = parser.parse(data);
        await fsp.writeFile(filePath, csv);
    }
    
    async generateIndexXml(exportPath) {
        logger.info('Generating index.xml...');
        const xml = xmlbuilder.create('DataSet', { version: '1.0', encoding: 'UTF-8' })
            .dtd('gdpdu-01-09-2004.dtd')
            .ele('Version', '2.4')
            .up()
            .ele('DataSupplier')
                .ele('Name', 'ecKasse POS System')
                .up()
                .ele('Location', 'Deutschland')
                .up()
                .ele('Comment', 'DSFinV-K 2.4 compliant export')
                .up()
            .up()
            .ele('Media')
                .ele('Name', 'DSFinV-K Export')
                .up()
                .ele('Table')
                    .ele('URL', 'cashpointclosing.csv')
                    .up()
                    .ele('Name', 'Stamm_Abschluss')
                    .up()
                .up()
                .ele('Table')
                    .ele('URL', 'location.csv')
                    .up()
                    .ele('Name', 'Stamm_Orte')
                    .up()
                .up()
                .ele('Table')
                    .ele('URL', 'cashregister.csv')
                    .up()
                    .ele('Name', 'Stamm_Kassen')
                    .up()
                .up()
                .ele('Table')
                    .ele('URL', 'tse.csv')
                    .up()
                    .ele('Name', 'Stamm_TSE')
                    .up()
                .up()
                .ele('Table')
                    .ele('URL', 'vat.csv')
                    .up()
                    .ele('Name', 'Stamm_USt')
                    .up()
                .up()
                .ele('Table')
                    .ele('URL', 'transactions.csv')
                    .up()
                    .ele('Name', 'Bonkopf')
                    .up()
                .up()
                .ele('Table')
                    .ele('URL', 'lines.csv')
                    .up()
                    .ele('Name', 'Bonpos')
                    .up()
                .up()
                .ele('Table')
                    .ele('URL', 'transactions_vat.csv')
                    .up()
                    .ele('Name', 'Bonkopf_USt')
                    .up()
                .up()
            .up()
            .end({ pretty: true });
        
        await fsp.writeFile(path.join(exportPath, 'index.xml'), xml);
        
        // Create a minimal DTD file
        const dtdContent = `<!ELEMENT DataSet (Version, DataSupplier, Media+)>
<!ELEMENT Version (#PCDATA)>
<!ELEMENT DataSupplier (Name, Location, Comment?)>
<!ELEMENT Name (#PCDATA)>
<!ELEMENT Location (#PCDATA)>
<!ELEMENT Comment (#PCDATA)>
<!ELEMENT Media (Name, Table+)>
<!ELEMENT Table (URL, Name, Range?, DecimalSymbol?, DigitGroupingSymbol?, VariableLength*)>
<!ELEMENT URL (#PCDATA)>
<!ELEMENT Range (#PCDATA)>
<!ELEMENT DecimalSymbol (#PCDATA)>
<!ELEMENT DigitGroupingSymbol (#PCDATA)>
<!ELEMENT VariableLength (Name, MaxLength)>
<!ELEMENT MaxLength (#PCDATA)>`;
        await fsp.writeFile(path.join(exportPath, 'gdpdu-01-09-2004.dtd'), dtdContent);
    }

    async generateCashpointClosingCsv(exportPath, context) {
        logger.info('Generating cashpointclosing.csv (Stamm_Abschluss)...');
        const totals = await db('active_transactions')
            .where('status', 'finished')
            .whereBetween('created_at', [context.startDate, context.endDate])
            .sum('total_amount as total_payments')
            .sum(db.raw(`CASE WHEN payment_type = 'Bar' THEN total_amount ELSE 0 END`))
            .as('total_cash');

        const data = [{
            Z_KASSE_ID: context.kasseId,
            Z_ERSTELLUNG: formatDate(new Date()),
            Z_NR: context.kassenabschlussNr,
            Z_SE_ZAHLUNGEN: formatNumber(totals[0].total_payments || 0),
            Z_SE_BARZAHLUNGEN: formatNumber(totals[0].total_cash || 0)
        }];
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'Z_SE_ZAHLUNGEN', 'Z_SE_BARZAHLUNGEN'];
        await this.generateCsv(path.join(exportPath, 'cashpointclosing.csv'), data, fields);
    }

    async generateBusinessCasesCsv(exportPath, context) {
        logger.info('Generating businesscases.csv (Z_GV_Typ)...');
        const businessCases = await db('active_transaction_items as ati')
            .join('active_transactions as at', 'ati.active_transaction_id', 'at.id')
            .leftJoin('dsfinvk_vat_mapping as dvm', 'ati.tax_rate', 'dvm.internal_tax_rate')
            .where('at.status', 'finished')
            .whereBetween('at.created_at', [context.startDate, context.endDate])
            .groupBy('dvm.dsfinvk_ust_schluessel', 'ati.tax_rate')
            .select(
                'dvm.dsfinvk_ust_schluessel as UST_SCHLUESSEL',
                'ati.tax_rate',
                db.raw('SUM(ati.total_price) as Z_UMS_BRUTTO')
            );

        const data = businessCases.map(bc => {
            const brutto = parseFloat(bc.Z_UMS_BRUTTO);
            const taxRate = parseFloat(bc.tax_rate);
            const netto = brutto / (1 + taxRate / 100);
            const ust = brutto - netto;
            return {
                Z_KASSE_ID: context.kasseId,
                Z_ERSTELLUNG: formatDate(new Date()),
                Z_NR: context.kassenabschlussNr,
                GV_TYP: 'Umsatz',
                UST_SCHLUESSEL: bc.UST_SCHLUESSEL || 5,
                Z_UMS_BRUTTO: formatNumber(brutto, 5),
                Z_UMS_NETTO: formatNumber(netto, 5),
                Z_UST: formatNumber(ust, 5)
            };
        });
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'GV_TYP', 'UST_SCHLUESSEL', 'Z_UMS_BRUTTO', 'Z_UMS_NETTO', 'Z_UST'];
        await this.generateCsv(path.join(exportPath, 'businesscases.csv'), data, fields);
    }

    async generatePaymentTypesCsv(exportPath, context) {
        logger.info('Generating payment.csv (Z_Zahlart)...');
        const payments = await db('active_transactions')
            .where('status', 'finished')
            .whereBetween('created_at', [context.startDate, context.endDate])
            .groupBy('payment_type')
            .select('payment_type as ZAHLART_NAME', db.raw('SUM(total_amount) as Z_ZAHLART_BETRAG'));

        const data = payments.map(p => ({
            Z_KASSE_ID: context.kasseId,
            Z_ERSTELLUNG: formatDate(new Date()),
            Z_NR: context.kassenabschlussNr,
            ZAHLART_TYP: p.ZAHLART_NAME === 'Bar' ? 'Bar' : 'Unbar',
            ZAHLART_NAME: p.ZAHLART_NAME,
            Z_ZAHLART_BETRAG: formatNumber(p.Z_ZAHLART_BETRAG)
        }));
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'ZAHLART_TYP', 'ZAHLART_NAME', 'Z_ZAHLART_BETRAG'];
        await this.generateCsv(path.join(exportPath, 'payment.csv'), data, fields);
    }
    
    async generateLocationsCsv(exportPath, context) {
        logger.info('Generating location.csv (Stamm_Orte)...');
        const locations = await db('dsfinvk_locations').select('*');
        const data = locations.map(loc => ({
            Z_KASSE_ID: context.kasseId,
            Z_ERSTELLUNG: formatDate(new Date()),
            Z_NR: context.kassenabschlussNr,
            LOC_NAME: loc.loc_name,
        }));
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'LOC_NAME'];
        await this.generateCsv(path.join(exportPath, 'location.csv'), data, fields);
    }
    
    async generateVatCsv(exportPath, context) {
        logger.info('Generating vat.csv (Stamm_USt)...');
        const vatMappings = await db('dsfinvk_vat_mapping').select('*').orderBy('dsfinvk_ust_schluessel', 'asc');
        const data = vatMappings.map(v => ({
            Z_KASSE_ID: context.kasseId,
            Z_ERSTELLUNG: formatDate(new Date()),
            Z_NR: context.kassenabschlussNr,
            UST_SCHLUESSEL: v.dsfinvk_ust_schluessel,
            UST_SATZ: formatNumber(v.internal_tax_rate, 2),
            UST_BESCHR: v.description
        }));
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'UST_SCHLUESSEL', 'UST_SATZ', 'UST_BESCHR'];
        await this.generateCsv(path.join(exportPath, 'vat.csv'), data, fields);
    }

    async generateCashRegisterCsv(exportPath, context) {
        logger.info('Generating cashregister.csv (Stamm_Kassen)...');
        const devices = await db('pos_devices').select('*');
        const data = devices.map(d => ({
            Z_KASSE_ID: context.kasseId,
            Z_ERSTELLUNG: formatDate(new Date()),
            Z_NR: context.kassenabschlussNr,
            KASSE_BRAND: d.kasse_brand || 'ecKasse',
            KASSE_MODELL: d.kasse_modell || 'e-Series',
            KASSE_SERIENNR: d.kasse_seriennr || `dev-${d.id}`,
            KASSE_SW_BRAND: d.kasse_sw_brand || 'ecKasse',
            KASSE_SW_VERSION: d.kasse_sw_version || '2.0.0',
            KASSE_BASISWAEH_CODE: 'EUR',
            KEINE_UST_ZUORDNUNG: '0'
        }));
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'KASSE_BRAND', 'KASSE_MODELL', 'KASSE_SERIENNR', 'KASSE_SW_BRAND', 'KASSE_SW_VERSION', 'KASSE_BASISWAEH_CODE', 'KEINE_UST_ZUORDNUNG'];
        await this.generateCsv(path.join(exportPath, 'cashregister.csv'), data, fields);
    }
    
    async generateTseCsv(exportPath, context) {
        logger.info('Generating tse.csv (Stamm_TSE)...');
        const tseData = await db('dsfinvk_tse').select('*');
        const data = tseData.map(t => ({
            Z_KASSE_ID: context.kasseId,
            Z_ERSTELLUNG: formatDate(new Date()),
            Z_NR: context.kassenabschlussNr,
            TSE_ID: t.id,
            TSE_SERIAL: t.tse_serial,
            TSE_SIG_ALGO: t.tse_sig_algo,
            TSE_ZEITFORMAT: t.tse_zeitformat,
            TSE_PD_ENCODING: t.tse_pd_encoding,
            TSE_PUBLIC_KEY: t.tse_public_key,
            TSE_ZERTIFIKAT_I: t.tse_zertifikat_i,
            TSE_ZERTIFIKAT_II: t.tse_zertifikat_ii
        }));
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'TSE_ID', 'TSE_SERIAL', 'TSE_SIG_ALGO', 'TSE_ZEITFORMAT', 'TSE_PD_ENCODING', 'TSE_PUBLIC_KEY', 'TSE_ZERTIFIKAT_I', 'TSE_ZERTIFIKAT_II'];
        await this.generateCsv(path.join(exportPath, 'tse.csv'), data, fields);
    }

    async generateTransactionsCsv(exportPath, context) {
        logger.info('Generating transactions.csv (Bonkopf)...');
        const transactions = await db('active_transactions as at')
            .leftJoin('users', 'at.user_id', 'users.id')
            .whereBetween('at.created_at', [context.startDate, context.endDate])
            .select('at.*', 'users.bediener_id', 'users.full_name as bediener_name');
        const data = transactions.map(tx => ({
            Z_KASSE_ID: context.kasseId,
            Z_ERSTELLUNG: formatDate(new Date()),
            Z_NR: context.kassenabschlussNr,
            BON_ID: tx.uuid,
            BON_NR: tx.bon_nr || tx.id,
            BON_TYP: 'Beleg',
            BON_STORNO: tx.status === 'cancelled' ? '1' : '0',
            BON_START: formatDate(tx.bon_start || tx.created_at),
            BON_ENDE: formatDate(tx.bon_end || tx.updated_at),
            BEDIENER_ID: tx.bediener_id || `user-${tx.user_id}`,
            BEDIENER_NAME: tx.bediener_name,
            UMS_BRUTTO: formatNumber(tx.total_amount)
        }));
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'BON_ID', 'BON_NR', 'BON_TYP', 'BON_STORNO', 'BON_START', 'BON_ENDE', 'BEDIENER_ID', 'BEDIENER_NAME', 'UMS_BRUTTO'];
        await this.generateCsv(path.join(exportPath, 'transactions.csv'), data, fields);
    }
    
    async generateLinesCsv(exportPath, context) {
        logger.info('Generating lines.csv (Bonpos)...');
        const items = await db('active_transaction_items as ati')
            .join('active_transactions as at', 'ati.active_transaction_id', 'at.id')
            .join('items as i', 'ati.item_id', 'i.id')
            .whereBetween('at.created_at', [context.startDate, context.endDate])
            .select('at.uuid as BON_ID', 'ati.id as POS_ZEILE', 'i.display_names', 'ati.quantity as MENGE', 'ati.unit_price as STK_BR', 'i.source_unique_identifier as ART_NR');

        const data = items.map(item => {
            let displayNames = {};
            try {
                displayNames = typeof item.display_names === 'string' ? JSON.parse(item.display_names) : item.display_names;
            } catch (e) {
                displayNames = { receipt: { de: 'Unknown Item' } };
            }
            
            return {
                Z_KASSE_ID: context.kasseId,
                Z_ERSTELLUNG: formatDate(new Date()),
                Z_NR: context.kassenabschlussNr,
                BON_ID: item.BON_ID,
                POS_ZEILE: item.POS_ZEILE,
                GV_TYP: 'Umsatz',
                ARTIKELTEXT: displayNames.receipt?.de || displayNames.button?.de || 'Unknown Item',
                MENGE: formatNumber(item.MENGE, 3),
                FAKTOR: '1,000',
                EINHEIT: 'Stk',
                STK_BR: formatNumber(item.STK_BR, 5),
                ART_NR: item.ART_NR || ''
            };
        });
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'BON_ID', 'POS_ZEILE', 'GV_TYP', 'ARTIKELTEXT', 'MENGE', 'FAKTOR', 'EINHEIT', 'STK_BR', 'ART_NR'];
        await this.generateCsv(path.join(exportPath, 'lines.csv'), data, fields);
    }
    
    async generateTransactionsVatCsv(exportPath, context) {
        logger.info('Generating transactions_vat.csv (Bonkopf_USt)...');
        const vatData = await db('active_transaction_items as ati')
            .join('active_transactions as at', 'ati.active_transaction_id', 'at.id')
            .leftJoin('dsfinvk_vat_mapping as dvm', 'ati.tax_rate', 'dvm.internal_tax_rate')
            .whereBetween('at.created_at', [context.startDate, context.endDate])
            .groupBy('at.uuid', 'dvm.dsfinvk_ust_schluessel', 'ati.tax_rate')
            .select(
                'at.uuid as BON_ID',
                'dvm.dsfinvk_ust_schluessel as UST_SCHLUESSEL',
                db.raw('SUM(ati.total_price) as BON_BRUTTO'),
                'ati.tax_rate'
            );
        const data = vatData.map(v => {
            const brutto = parseFloat(v.BON_BRUTTO);
            const taxRate = parseFloat(v.tax_rate);
            const netto = brutto / (1 + taxRate / 100);
            const ust = brutto - netto;
            return {
                Z_KASSE_ID: context.kasseId,
                Z_ERSTELLUNG: formatDate(new Date()),
                Z_NR: context.kassenabschlussNr,
                BON_ID: v.BON_ID,
                UST_SCHLUESSEL: v.UST_SCHLUESSEL || 5, // Default to 'Nicht Steuerbar' if no mapping
                BON_BRUTTO: formatNumber(brutto, 5),
                BON_NETTO: formatNumber(netto, 5),
                BON_UST: formatNumber(ust, 5)
            };
        });
        const fields = ['Z_KASSE_ID', 'Z_ERSTELLUNG', 'Z_NR', 'BON_ID', 'UST_SCHLUESSEL', 'BON_BRUTTO', 'BON_NETTO', 'BON_UST'];
        await this.generateCsv(path.join(exportPath, 'transactions_vat.csv'), data, fields);
    }

    /**
     * Creates a ZIP file containing a TAR archive (ZIP-in-TAR format)
     */
    async createZipWithTar(sourceDir, exportId) {
        const tarPath = path.join(__dirname, `../../../../tmp/${exportId}.tar`);
        const zipPath = path.join(__dirname, `../../../../tmp/${exportId}.zip`);
        
        try {
            // First create TAR archive
            await this.createTarArchive(sourceDir, tarPath);
            
            // Then embed TAR into ZIP
            await this.createZipArchive(tarPath, zipPath, 'export.tar');
            
            // Cleanup intermediate TAR file
            await fsp.unlink(tarPath);
            
            return zipPath;
        } catch (error) {
            // Cleanup on error
            try {
                await fsp.unlink(tarPath);
                await fsp.unlink(zipPath);
            } catch (cleanupError) {
                logger.warn('Failed to cleanup files during error:', cleanupError.message);
            }
            throw error;
        }
    }

    /**
     * Creates TAR archive from directory
     */
    async createTarArchive(sourceDir, outPath) {
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(outPath);
            const archive = archiver('tar');
            
            output.on('close', () => {
                logger.info(`${archive.pointer()} total bytes written to TAR: ${outPath}`);
                resolve();
            });
            
            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') { 
                    logger.warn('Archiver warning:', err); 
                } else { 
                    reject(err); 
                }
            });
            
            archive.on('error', (err) => reject(err));
            archive.pipe(output);
            archive.directory(sourceDir, false);
            archive.finalize();
        });
    }

    /**
     * Creates ZIP archive containing the TAR file
     */
    async createZipArchive(tarPath, zipPath, tarNameInZip = 'export.tar') {
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } }); // Maximum compression
            
            output.on('close', () => {
                logger.info(`${archive.pointer()} total bytes written to ZIP: ${zipPath}`);
                resolve();
            });
            
            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') { 
                    logger.warn('ZIP Archiver warning:', err); 
                } else { 
                    reject(err); 
                }
            });
            
            archive.on('error', (err) => reject(err));
            archive.pipe(output);
            archive.file(tarPath, { name: tarNameInZip });
            archive.finalize();
        });
    }

    /**
     * Get job status for async exports
     */
    async getJobStatus(jobId) {
        const job = await db('export_jobs')
            .select('id', 'job_id', 'status', 'error_message', 'download_token', 'expires_at', 'created_at', 'updated_at')
            .where('job_id', jobId)
            .first();
            
        if (!job) {
            throw new Error('Job not found');
        }
        
        return job;
    }

    /**
     * Get download info by secure token
     */
    async getDownloadInfo(token) {
        const job = await db('export_jobs')
            .select('file_path', 'expires_at')
            .where('download_token', token)
            .where('status', 'COMPLETE')
            .first();
            
        if (!job) {
            throw new Error('Invalid download token or file not ready');
        }
        
        if (new Date() > new Date(job.expires_at)) {
            throw new Error('Download link has expired');
        }
        
        return job;
    }
}

module.exports = new DsfinvkService();