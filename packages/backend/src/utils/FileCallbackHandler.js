// File: packages/backend/src/utils/FileCallbackHandler.js
const fs = require('fs');
const { BaseCallbackHandler } = require("@langchain/core/callbacks");

class FileCallbackHandler extends BaseCallbackHandler {
  name = "FileCallbackHandler";

  constructor(logPath = 'logs/langchain_trace.log') {
    super();
    // Ensure log directory exists
    const logDir = logPath.substring(0, logPath.lastIndexOf('/'));
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logStream = fs.createWriteStream(logPath, { flags: 'a' });
    this.log(`--- New Session: ${new Date().toISOString()} ---`);
  }

  log(message) {
    this.logStream.write(message + '\n');
  }

  async handleChainStart(chain, inputs) {
    this.log(`[CHAIN_START] Name: ${chain.name} | Inputs: ${JSON.stringify(inputs)}`);
  }

  async handleChainEnd(outputs) {
    this.log(`[CHAIN_END] Outputs: ${JSON.stringify(outputs)}`);
  }

  async handleLLMStart(llm, prompts) {
    this.log(`[LLM_START] Model: ${JSON.stringify(llm.name)} | Prompts: ${JSON.stringify(prompts)}`);
  }

  async handleLLMEnd(output) {
    this.log(`[LLM_END] Output: ${JSON.stringify(output)}`);
  }
  
  async handleLLMError(err) {
    this.log(`[LLM_ERROR] Error: ${JSON.stringify(err)}`);
  }

  async handleToolStart(tool, input) {
    this.log(`[TOOL_START] Name: ${tool.name} | Input: ${input}`);
  }

  async handleToolEnd(output) {
    this.log(`[TOOL_END] Output: ${output}`);
  }
  
  async handleToolError(err) {
    this.log(`[TOOL_ERROR] Error: ${JSON.stringify(err)}`);
  }

  async handleAgentAction(action) {
    this.log(`[AGENT_ACTION] Action: ${JSON.stringify(action)}`);
  }
}

module.exports = { FileCallbackHandler };