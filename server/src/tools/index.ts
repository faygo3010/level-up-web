import { coachTools } from './coach'
import { editTools } from './edit'
import { readTools } from './read'
import type { ToolDef } from './shared'
import { trackTools } from './track'
import { undoTools } from './undo'

export { ToolError, type ToolContext, type ToolDef, type ToolResult } from './shared'

/** Every action a connected chatbot can take. */
export const TOOLS: readonly ToolDef[] = [...readTools, ...coachTools, ...trackTools, ...undoTools, ...editTools] as unknown as readonly ToolDef[]
