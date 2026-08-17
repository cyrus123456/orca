/* Why: the tab slice of the persisted workspace session (legacy terminal tabs
 * plus the unified tab model). Split out of workspace-session-schema.ts to keep
 * that file inside its line budget; the schemas themselves are unchanged. */
import { z } from 'zod'
import type { TabGroupLayoutNode, TuiAgent } from './types'
import { isValidTerminalTabId } from './terminal-tab-id'
import { isTuiAgent } from './tui-agent-config'

export const terminalTabIdSchema = z
  .string()
  .min(1)
  .refine(isValidTerminalTabId, 'terminal tab id must not contain ":"')

// ─── Terminal tab (legacy) ──────────────────────────────────────────

export const terminalTabSchema = z.object({
  id: terminalTabIdSchema,
  ptyId: z.string().nullable(),
  worktreeId: z.string(),
  title: z.string(),
  defaultTitle: z.string().optional(),
  generatedTitle: z.string().nullable().optional(),
  aiVaultTitle: z
    .object({
      agent: z.enum(['claude', 'codex']),
      sessionId: z.string(),
      title: z.string()
    })
    .nullable()
    .optional()
    .catch(undefined),
  quickCommandLabel: z.string().nullable().optional(),
  customTitle: z.string().nullable(),
  color: z.string().nullable(),
  isPinned: z.boolean().optional(),
  sortOrder: z.number(),
  createdAt: z.number(),
  generation: z.number().optional(),
  startupCwd: z.string().min(1).optional(),
  // Why: persist the launched agent so a restored idle agent tab keeps its
  // provider icon before any hook fires. `.catch(undefined)` keeps a stale or
  // unknown agent id from failing the whole-session parse (which would reset
  // every terminal/editor/browser to defaults).
  launchAgent: z
    .custom<TuiAgent>((v) => isTuiAgent(v))
    .optional()
    .catch(undefined),
  // Why: persist the custom agent id so a restored tab keeps its custom agent
  // icon. Without this, Zod strips the field on parse and the tab bar falls
  // back to the default shell icon after session restore. `.catch(undefined)`
  // tolerates a null/garbage value from a corrupted session so the whole-session
  // parse degrades to "no custom agent" instead of resetting every tab.
  customLaunchAgentId: z.string().min(1).optional().catch(undefined)
})

// ─── Unified tab model ──────────────────────────────────────────────

const tabContentTypeSchema = z.enum([
  'terminal',
  'editor',
  'diff',
  'conflict-review',
  'check-details',
  'browser',
  'simulator'
])

export const workspaceVisibleTabTypeSchema = z.enum(['terminal', 'editor', 'browser', 'simulator'])

export const tabSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  groupId: z.string(),
  worktreeId: z.string(),
  contentType: tabContentTypeSchema,
  label: z.string(),
  generatedLabel: z.string().nullable().optional(),
  aiVaultTitle: z
    .object({
      agent: z.enum(['claude', 'codex']),
      sessionId: z.string(),
      title: z.string()
    })
    .nullable()
    .optional()
    .catch(undefined),
  quickCommandLabel: z.string().nullable().optional(),
  customLabel: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.number(),
  isPreview: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  // Why: persist the per-tab native-chat view mode so 'chat' survives reload /
  // session restore. `.catch('terminal')` tolerates unknown future values (a
  // newer build that wrote an unrecognized mode) by degrading to the safe
  // default instead of failing the whole-session parse. Legacy/missing stays
  // undefined → 'terminal' in the renderer.
  viewMode: z.enum(['terminal', 'chat']).catch('terminal').optional(),
  // Why: mirror of TerminalTab.customLaunchAgentId so the unified tab model
  // preserves the custom agent binding across session restore. `.catch(...)`
  // keeps a corrupted null/garbage id from failing the whole-session parse.
  customLaunchAgentId: z.string().min(1).optional().catch(undefined)
})

export const tabGroupSchema = z.object({
  id: z.string(),
  worktreeId: z.string(),
  activeTabId: z.string().nullable(),
  tabOrder: z.array(z.string()),
  recentTabIds: z.array(z.string()).optional()
})

const tabGroupSplitDirectionSchema = z.enum(['horizontal', 'vertical'])

export const tabGroupLayoutNodeSchema: z.ZodType<TabGroupLayoutNode> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('leaf'),
      groupId: z.string()
    }),
    z.object({
      type: z.literal('split'),
      direction: tabGroupSplitDirectionSchema,
      first: tabGroupLayoutNodeSchema,
      second: tabGroupLayoutNodeSchema,
      ratio: z.number().optional()
    })
  ])
)
