const { services } = require('../../../core');
const logger = require('../../../core/config/logger');

async function handleGenerateExport(payload) {
  const { startDate, endDate } = payload;
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required for DSFinV-K export.');
  }
  
  const result = await services.dsfinvk.generateExport({ startDate, endDate });
  
  logger.info({ result }, 'DSFinV-K export generated.');
  return {
    success: true, 
    message: `Export successfully generated at ${result.path}`,
    ...result 
  };
}

module.exports = {
  handleGenerateExport,
};