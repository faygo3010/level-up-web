import { coachTools } from './coach.js'
import { editTools } from './edit.js'
import { readTools } from './read.js'
import type { ToolDef } from './shared.js'
import { trackTools } from './track.js'
import { undoTools } from './undo.js'

export { ToolError, type ToolContext, type ToolDef, type ToolResult } from './shared.js'

/** Every action a connected chatbot can take. */
export const TOOLS: readonly ToolDef[] = [...readTools, ...coachTools, ...trackTools, ...undoTools, ...editTools] as unknown as readonly ToolDef[]
