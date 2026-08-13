import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { reconcileTabOrder } from '@/components/tab-bar/reconcile-order'
import { pasteDraftWhenAgentReady } from '@/lib/agent-paste-draft'
import { translate } from '@/i18n/i18n'
import type { CustomAgent } from '../../../shared/types'
import type { LaunchSource } from '../../../shared/telemetry-events'

export type LaunchCustomAgentResult = {
  tabId: string
} | null

/** Launch a user-defined custom agent (not in the built-in TuiAgent catalog). */
export function launchCustomAgentInNewTab(args: {
  agent: CustomAgent
  worktreeId: string
  groupId?: string
  prompt?: string
  /** How to deliver an initial prompt. `auto-submit` (default) pastes+submits at
   *  terminal startup; `draft` and `submit-after-ready` wait for the agent's
   *  input-ready signal then bracketed-paste without/with Enter — mirroring the
   *  built-in agent launch path so callers requesting those modes keep their
   *  semantics instead of always degrading to a startup paste. */
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  launchSource?: LaunchSource
  onPromptDelivered?: () => void
}): LaunchCustomAgentResult {
  const {
    agent,
    worktreeId,
    groupId,
    prompt,
    promptDelivery = 'auto-submit',
    launchSource,
    onPromptDelivered
  } = args
  const store = useAppStore.getState()

  const command = [agent.cmd, agent.args].filter(Boolean).join(' ')
  if (!command.trim()) {
    return null
  }

  const tab = store.createTab(worktreeId, groupId, undefined, {
    quickCommandLabel: agent.label,
    customLaunchAgentId: agent.id
  })

  store.queueTabStartupCommand(tab.id, {
    command,
    ...(agent.env && Object.keys(agent.env).length > 0 ? { env: agent.env } : {}),
    telemetry: {
      agent_kind: 'other',
      launch_source: launchSource ?? 'tab_bar_quick_launch',
      request_kind: 'new'
    }
  })

  const trimmedPrompt = prompt?.trim() ?? ''
  if (trimmedPrompt) {
    if (promptDelivery === 'draft' || promptDelivery === 'submit-after-ready') {
      // Why: mirror the built-in agent launch path — wait for the agent's
      // input-ready (bracketed-paste handshake) signal, then paste the prompt
      // as an editable draft (draft) or paste+Enter (submit-after-ready). A
      // custom CLI that never reaches the handshake times out and surfaces a
      // toast instead of silently dropping the prompt.
      const submit = promptDelivery === 'submit-after-ready'
      void pasteDraftWhenAgentReady({
        tabId: tab.id,
        content: trimmedPrompt,
        submit,
        onTimeout: () => {
          toast.message(
            translate(
              'auto.lib.launch.agent.in.new.tab.a5a1f7033f',
              "Your {{value0}} wasn't sent — paste it once the agent is ready.",
              { value0: submit ? 'prompt' : 'notes' }
            )
          )
        }
      })
        .then((delivered) => {
          if (delivered) {
            onPromptDelivered?.()
          }
        })
        .catch((error) => console.error('Custom agent prompt delivery failed', error))
    } else {
      store.queueTabStartupCommand(tab.id, {
        command: trimmedPrompt,
        delivery: 'terminal-paste'
      })
      onPromptDelivered?.()
    }
  }

  store.setActiveTabType('terminal')

  const fresh = useAppStore.getState()
  const termIds = (fresh.tabsByWorktree[worktreeId] ?? []).map((t) => t.id)
  const editorIds = fresh.openFiles.filter((f) => f.worktreeId === worktreeId).map((f) => f.id)
  const browserIds = (fresh.browserTabsByWorktree?.[worktreeId] ?? []).map((t) => t.id)
  const base = reconcileTabOrder(
    fresh.tabBarOrderByWorktree[worktreeId],
    termIds,
    editorIds,
    browserIds
  )
  const order = base.filter((id) => id !== tab.id)
  order.push(tab.id)
  fresh.setTabBarOrder(worktreeId, order)

  return { tabId: tab.id }
}
