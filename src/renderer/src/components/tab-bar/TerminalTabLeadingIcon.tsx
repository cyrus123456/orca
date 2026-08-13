import { AgentStateDot } from '@/components/AgentStateDot'
import { AgentIcon } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import type { CustomAgent, TerminalTab, TuiAgent } from '../../../../shared/types'
import { CustomAgentIcon } from '../agent/CustomAgentIcon'
import { FilledBellIcon } from '../sidebar/WorktreeCardHelpers'
import { ShellIcon } from './shell-icons'
import {
  terminalTabActivityToAgentDotState,
  type TerminalTabActivityStatus
} from './terminal-tab-activity-status'
import { translate } from '@/i18n/i18n'

type TerminalTabLeadingIconProps = {
  agent: TuiAgent | null
  activityStatus: TerminalTabActivityStatus
  shell: TerminalTab['shellOverride']
  showUnreadActivity: boolean
  isActive: boolean
  customAgent?: CustomAgent | null
}

type TerminalTabAgentIdentityIconProps = {
  agent: TuiAgent | null
  customAgent?: CustomAgent | null
  isActive: boolean
  className?: string
}

/** Keep the provider glyph treatment identical across every terminal-tab state.
 *  Why: a custom agent is the user's explicit launch choice and may wrap a
 *  known TuiAgent (e.g. a `claude` wrapper), so its identity icon takes
 *  precedence over any title/process-detected TuiAgent to avoid showing the
 *  wrong glyph and to reflect icon updates made in settings. */
function TerminalTabAgentIdentityIcon({
  agent,
  customAgent,
  isActive,
  className
}: TerminalTabAgentIdentityIconProps): React.JSX.Element | null {
  if (customAgent) {
    return (
      <span
        className={cn('inline-flex', !isActive && 'opacity-70', className)}
        data-agent-icon={customAgent.id}
        aria-hidden
      >
        <CustomAgentIcon agent={customAgent} size={12} />
      </span>
    )
  }
  if (!agent) {
    return null
  }
  return (
    <span
      className={cn('inline-flex', !isActive && 'opacity-70', className)}
      data-agent-icon={agent}
      aria-hidden
    >
      <AgentIcon agent={agent} size={12} />
    </span>
  )
}

/** Render a terminal tab's current state without hiding its agent or shell identity. */
export function TerminalTabLeadingIcon({
  agent,
  activityStatus,
  shell,
  showUnreadActivity,
  isActive,
  customAgent
}: TerminalTabLeadingIconProps): React.JSX.Element {
  const identityIcon =
    customAgent || agent ? (
      <TerminalTabAgentIdentityIcon
        agent={agent}
        customAgent={customAgent}
        isActive={isActive}
        className="mr-1 shrink-0"
      />
    ) : null

  if (showUnreadActivity) {
    return (
      <span
        data-testid="tab-activity-bell"
        aria-label={translate(
          'auto.components.tab.bar.TerminalTabLeadingIcon.7ab2964bea',
          'Unread agent completion'
        )}
        className="mr-1 inline-flex shrink-0 items-center gap-1"
      >
        <FilledBellIcon className="size-3 text-amber-500 drop-shadow-sm" />
        {identityIcon}
      </span>
    )
  }

  // Why: shared mapper with Cmd+J recent badges — working/permission/done only; active/inactive
  // fall through to agent/shell identity.
  const dotState = terminalTabActivityToAgentDotState(activityStatus)
  if (dotState) {
    return (
      <span
        data-testid="tab-agent-activity-indicator"
        data-agent-activity-status={activityStatus}
        className="mr-1 inline-flex shrink-0 items-center gap-1"
      >
        <AgentStateDot state={dotState} size="md" />
        {/* Why: status and identity answer different questions. Keep the agent
            logo beside the state glyph so parallel tabs remain scannable. */}
        {identityIcon}
      </span>
    )
  }

  if (identityIcon) {
    return identityIcon
  }

  // Why: ShellIcon renders a colored brand-style tile for PowerShell, CMD,
  // Git Bash, and WSL while retaining the generic terminal fallback elsewhere.
  return (
    <span
      className={`mr-1 inline-flex shrink-0 ${isActive ? '' : 'opacity-70'}`}
      data-shell-icon={shell ?? 'generic'}
      aria-hidden
    >
      <ShellIcon shell={shell} size={12} />
    </span>
  )
}
