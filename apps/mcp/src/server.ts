import { McpToolContext } from "./types";

export interface ToolMap {
  [toolName: string]: {
    handle: (input: unknown, ctx: McpToolContext) => Promise<unknown>;
  };
}

export class McpServer {
  private readonly tools: ToolMap = {};

  registerTool(name: string, handler: (input: unknown, ctx: McpToolContext) => Promise<unknown>) {
    this.tools[name] = { handle: handler };
  }

  async handle(toolName: string, input: unknown, ctx: McpToolContext) {
    const tool = this.tools[toolName];
    if (!tool) {
      throw new Error(`Tool ${toolName} not registered`);
    }
    return tool.handle(input, ctx);
  }
}
