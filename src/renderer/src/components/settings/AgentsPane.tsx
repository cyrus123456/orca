/* eslint-disable max-lines -- Why: the Agents pane keeps catalog rows, default
   selection, per-agent controls, and runtime location together so settings
   reconciliation stays visible in one file. */
import { useId, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Terminal,
  Trash2
} from 'lucide-react'
import type { CustomAgent, GlobalSettings, TuiAgent } from '../../../../shared/types'
import { getAgentCatalog, AgentIcon } from '@/lib/agent-catalog'
import { useDetectedAgents, type AgentDetectionTarget } from '@/hooks/useDetectedAgents'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AgentAwakeSetting } from './AgentAwakeSetting'
import { AgentCacheTimerSection } from './AgentCacheTimerSection'
import { AgentRuntimeSetting } from './AgentRuntimeSetting'
import { DefaultAgentPill } from './AgentDefaultSetting'
import { buildCodexSessionSourceHomeControl } from './codex-session-source-home-control'
import {
  getAgentGeneratedTabTitlesDescription,
  getAgentGeneratedTabTitlesTitle
} from './agent-generated-tab-title-copy'
import { getAgentStatusHooksDescription, getAgentStatusHooksTitle } from './agent-status-hooks-copy'
import {
  SettingsBadge,
  SettingsSegmentedControl,
  SettingsSubsectionHeader,
  SettingsSwitchRow
} from './SettingsFormControls'
import {
  isTuiAgentEnabled,
  normalizeDisabledTuiAgents
} from '../../../../shared/tui-agent-selection'
import {
  getTuiAgentDefaultArgs,
  getTuiAgentDefaultEnv,
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import {
  applyAgentPermissionMode,
  resolveAgentPermissionModeSummary,
  type AgentPermissionMode
} from '../../../../shared/tui-agent-permissions'
import { getSettingOwnershipSummary } from './setting-ownership'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import { CustomAgentIcon } from '../agent/CustomAgentIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { getAgentsPaneSearchEntries } from './agents-search'
import {
  buildAgentAvailabilitySettingsUpdate,
  createAgentAvailabilityUpdateQueue
} from './agent-availability-settings'
import { AgentAvailabilityControl, type AgentCatalogRowProps } from './AgentCatalogRow'
import { AgentDefaultSetting } from './AgentDefaultSetting'
import { AgentDetectionCatalog } from './AgentDetectionCatalog'

export {
  buildAgentAvailabilitySettingsUpdate,
  createAgentAvailabilityUpdateQueue,
  getAgentsPaneSearchEntries,
  AgentAvailabilityControl
}

type AgentsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
}

const enqueueAgentAvailabilityUpdate = createAgentAvailabilityUpdateQueue()

export function AgentPermissionsSetting({
  mode,
  onChange
}: {
  mode: AgentPermissionMode
  onChange: (mode: Exclude<AgentPermissionMode, 'mixed'>) => void
}): React.JSX.Element {
  const visibleMode: Exclude<AgentPermissionMode, 'mixed'> = mode === 'manual' ? 'manual' : 'yolo'
  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={
          <span className="flex items-center gap-2">
            {translate('auto.components.settings.AgentsPane.agentPermissions', 'Agent Permissions')}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={translate(
                    'auto.components.settings.AgentsPane.agentPermissionsInfo',
                    'Agent permissions info'
                  )}
                  className="grid size-5 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                {translate(
                  'auto.components.settings.AgentsPane.agentPermissionsTooltip',
                  "Doesn't apply to agents where you've overridden launch arguments."
                )}
              </TooltipContent>
            </Tooltip>
          </span>
        }
        description={translate(
          'auto.components.settings.AgentsPane.agentPermissionsDescription',
          'Choose whether Orca launches agents with fewer permission prompts or with manual checks.'
        )}
        action={
          <SettingsSegmentedControl<AgentPermissionMode>
            value={visibleMode}
            onChange={(nextMode) => {
              if (nextMode !== 'mixed') {
                onChange(nextMode)
              }
            }}
            ariaLabel={translate(
              'auto.components.settings.AgentsPane.agentPermissions',
              'Agent Permissions'
            )}
            size="sm"
            options={[
              {
                value: 'yolo',
                label: translate('auto.components.settings.AgentsPane.agentPermissionsYolo', 'Yolo')
              },
              {
                value: 'manual',
                label: translate(
                  'auto.components.settings.AgentsPane.agentPermissionsManual',
                  'Manual'
                )
              }
            ]}
          />
        }
      />
    </section>
  )
}

export function AgentsPane({
  settings,
  updateSettings,
  wslSupportedPlatform,
  wslAvailable,
  wslDistros,
  wslCapabilitiesLoading
}: AgentsPaneProps): React.JSX.Element {
  const activeServerEnvironmentId = settings.activeRuntimeEnvironmentId?.trim() || null
  const agentDetectionTarget = useMemo<AgentDetectionTarget>(
    () =>
      activeServerEnvironmentId
        ? { kind: 'runtime', environmentId: activeServerEnvironmentId }
        : { kind: 'local' },
    [activeServerEnvironmentId]
  )
  const {
    detectedIds: detectedList,
    detectionFailed,
    isRefreshing,
    refresh: refreshTargetAgents
  } = useDetectedAgents(agentDetectionTarget)
  const refreshLocalAgents = useAppStore((state) => state.refreshDetectedAgents)
  const handleRefresh = (): void => void refreshTargetAgents()
  const activeServerName = useAppStore((state) =>
    activeServerEnvironmentId
      ? (state.runtimeEnvironments.find(
          (environment) => environment.id === activeServerEnvironmentId
        )?.name ?? null)
      : null
  )
  const detectedIds = useMemo<Set<string> | null>(
    () => (detectedList ? new Set(detectedList) : null),
    [detectedList]
  )
  const catalog = getAgentCatalog()
  const defaultAgent = settings.defaultTuiAgent
  const defaultCustomAgentId = settings.defaultCustomAgentId ?? null
  const agentOwnership = getSettingOwnershipSummary('agentLaunchDefaults')
  const cmdOverrides = settings.agentCmdOverrides ?? {}
  const agentDefaultArgs = settings.agentDefaultArgs ?? {}
  const agentDefaultEnv = settings.agentDefaultEnv ?? {}
  const disabledAgents = normalizeDisabledTuiAgents(settings.disabledTuiAgents)

  const setDefault = (id: TuiAgent | 'blank' | null): void => {
    // Why: setting a TuiAgent/blank default clears any custom default so the
    // two never compete; custom default takes priority when set.
    updateSettings({ defaultTuiAgent: id, defaultCustomAgentId: null })
  }

  const setDefaultCustomAgent = (id: string | null): void => {
    updateSettings({ defaultCustomAgentId: id })
  }

  const setAgentEnabled = (id: TuiAgent, enabled: boolean): void => {
    void enqueueAgentAvailabilityUpdate({
      getSettings: () => useAppStore.getState().settings,
      fallbackSettings: settings,
      updateSettings,
      agentId: id,
      enabled
    })
  }

  const saveOverride = (id: TuiAgent, value: string): void => {
    const next = { ...cmdOverrides }
    if (value) {
      next[id] = value
    } else {
      delete next[id]
    }
    updateSettings({ agentCmdOverrides: next })
  }

  const saveAgentArgs = (id: TuiAgent, value: string): void => {
    updateSettings({
      agentDefaultArgs: {
        ...agentDefaultArgs,
        [id]: value
      }
    })
  }

  const saveAgentEnv = (id: TuiAgent, value: Record<string, string>): void => {
    updateSettings({
      agentDefaultEnv: {
        ...agentDefaultEnv,
        [id]: value
      }
    })
  }

  const saveAgentPermissionMode = (mode: Exclude<AgentPermissionMode, 'mixed'>): void => {
    updateSettings(
      applyAgentPermissionMode({
        mode,
        agentDefaultArgs,
        agentDefaultEnv
      })
    )
  }

  const customAgents = settings.customAgents ?? []

  const saveCustomAgent = (agent: CustomAgent): void => {
    const existing = customAgents.findIndex((a) => a.id === agent.id)
    const next =
      existing !== -1
        ? customAgents.map((a) => (a.id === agent.id ? agent : a))
        : [...customAgents, agent]
    updateSettings({ customAgents: next })
  }

  const deleteCustomAgent = (id: string): void => {
    updateSettings({
      customAgents: customAgents.filter((a) => a.id !== id),
      // Why: clear the default if it pointed at the deleted agent so the
      // picker doesn't pin a stale id that no longer resolves to an agent.
      ...(defaultCustomAgentId === id ? { defaultCustomAgentId: null } : {})
    })
  }

  // Why: null means detection is in flight, not "all agents are installed".
  // Showing the full catalog here makes the default-agent picker flash invalid
  // options while switching between Windows and WSL detection contexts.
  const detectedAgents =
    detectedIds === null ? [] : getAgentCatalog().filter((agent) => detectedIds.has(agent.id))
  const enabledDetectedAgents = detectedAgents.filter((agent) =>
    isTuiAgentEnabled(agent.id, disabledAgents)
  )
  const undetectedAgents = getAgentCatalog().filter(
    (a) => detectedIds !== null && !detectedIds.has(a.id)
  )

  // Why: 'blank' is an explicit no-agent preference, not an auto fallback,
  // so the Auto pill should only light up when the default is null OR when a
  // selected agent id is no longer detected on PATH. A custom default overrides
  // TuiAgent selection, so Auto must not light up while a custom default is set.
  const isAutoDefault =
    defaultCustomAgentId === null &&
    (defaultAgent === null ||
      (defaultAgent !== 'blank' &&
        (!detectedIds?.has(defaultAgent) || !isTuiAgentEnabled(defaultAgent, disabledAgents))))
  const isBlankDefault = defaultCustomAgentId === null && defaultAgent === 'blank'

  // Why show an undetected default: when detection comes back empty there were
  // no agent pills at all, so the stored choice was invisible AND unrecoverable
  // -- nothing to click to put it back. Keeping it listed means a failed or
  // slow probe cannot quietly cost the user their setting.
  const storedDefaultAgent =
    defaultAgent !== null && defaultAgent !== 'blank'
      ? getAgentCatalog().find((agent) => agent.id === defaultAgent)
      : undefined
  const defaultAgentPills =
    storedDefaultAgent && !enabledDetectedAgents.some((agent) => agent.id === storedDefaultAgent.id)
      ? [...enabledDetectedAgents, storedDefaultAgent]
      : enabledDetectedAgents

  const getRowProps = (
    agent: (typeof catalog)[number],
    isDetected: boolean
  ): AgentCatalogRowProps => ({
    agentId: agent.id,
    label: agent.label,
    homepageUrl: agent.homepageUrl,
    defaultCmd: agent.cmd,
    defaultArgs: getTuiAgentDefaultArgs(agent.id),
    defaultEnv: getTuiAgentDefaultEnv(agent.id),
    isDetected,
    isEnabled: isTuiAgentEnabled(agent.id, disabledAgents),
    isDefault: isDetected && defaultAgent === agent.id,
    cmdOverride: isDetected ? cmdOverrides[agent.id] : undefined,
    argsOverride: resolveTuiAgentLaunchArgs(agent.id, agentDefaultArgs),
    envOverride: resolveTuiAgentLaunchEnv(agent.id, agentDefaultEnv),
    onSetDefault: isDetected ? () => updateSettings({ defaultTuiAgent: agent.id }) : () => {},
    onSetEnabled: (enabled) => setAgentEnabled(agent.id, enabled),
    onSaveOverride: isDetected
      ? (value) => {
          const next = { ...cmdOverrides }
          if (value) {
            next[agent.id] = value
          } else {
            delete next[agent.id]
          }
          updateSettings({ agentCmdOverrides: next })
        }
      : () => {},
    onSaveArgs: (value) =>
      updateSettings({ agentDefaultArgs: { ...agentDefaultArgs, [agent.id]: value } }),
    onSaveEnv: (value) =>
      updateSettings({ agentDefaultEnv: { ...agentDefaultEnv, [agent.id]: value } }),
    sessionSourceHome:
      isDetected && agent.id === 'codex'
        ? buildCodexSessionSourceHomeControl(settings, updateSettings)
        : undefined
  })

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SettingsSubsectionHeader
          title={translate('auto.components.settings.AgentsPane.385212c7a1', 'Default Agent')}
          description={agentOwnership.description}
        />

        <div className="flex flex-wrap gap-2">
          <DefaultAgentPill active={isAutoDefault} onClick={() => setDefault(null)}>
            {isAutoDefault && <Check className="size-3.5" />}
            {translate('auto.components.settings.AgentsPane.92033495ff', 'Auto')}
          </DefaultAgentPill>

          {/* Why: users who prefer to open a raw shell by default need a
              first-class "no agent" choice here — without it, the Auto pill
              is the closest option but silently launches the first detected
              agent, which is the opposite of what they want. */}
          <DefaultAgentPill active={isBlankDefault} onClick={() => setDefault('blank')}>
            <Terminal className="size-3.5" />
            {translate(
              'auto.components.settings.AgentsPane.110b74b022',
              'No agent (blank terminal)'
            )}
            {isBlankDefault && <Check className="size-3.5" />}
          </DefaultAgentPill>

          {enabledDetectedAgents.map((agent) => {
            // Why: a custom default overrides TuiAgent selection, so a TuiAgent
            // pill is only active when no custom default is set.
            const isActive = defaultCustomAgentId === null && defaultAgent === agent.id
            const isUndetected = detectedIds !== null && !detectedIds.has(agent.id)
            return (
              <DefaultAgentPill
                key={agent.id}
                active={isActive}
                onClick={() => setDefault(agent.id)}
                title={
                  isUndetected
                    ? translate(
                        'auto.components.settings.AgentsPane.storedDefaultUndetected',
                        'Saved as your default, but not detected right now'
                      )
                    : undefined
                }
              >
                <AgentIcon agent={agent.id} size={14} />
                {agent.label}
                {isActive && <Check className="size-3.5" />}
              </DefaultAgentPill>
            )
          })}

          {customAgents.length > 0 && (
            <div className="flex w-full flex-wrap gap-2 pt-1">
              <span className="w-full text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                {translate(
                  'auto.components.settings.AgentsPane.customAgentsDefaultGroup',
                  'Custom agents'
                )}
              </span>
              {customAgents.map((agent) => {
                const isActive = defaultCustomAgentId === agent.id
                return (
                  <DefaultAgentPill
                    key={agent.id}
                    active={isActive}
                    onClick={() => setDefaultCustomAgent(isActive ? null : agent.id)}
                  >
                    <CustomAgentIcon agent={agent} />
                    {agent.label}
                    {isActive && <Check className="size-3.5" />}
                  </DefaultAgentPill>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <AgentRuntimeSetting
        settings={settings}
        updateSettings={updateSettings}
        refresh={refreshLocalAgents}
        wslSupportedPlatform={wslSupportedPlatform}
        wslAvailable={wslAvailable}
        wslDistros={wslDistros}
        wslCapabilitiesLoading={wslCapabilitiesLoading}
      />
      <AgentStatusHooksSetting settings={settings} updateSettings={updateSettings} />
      <AgentGeneratedTabTitlesSetting settings={settings} updateSettings={updateSettings} />
      {!isPairedWebClientWindow() ? (
        <AgentAwakeSetting settings={settings} updateSettings={updateSettings} />
      ) : null}
      <AgentCacheTimerSection settings={settings} updateSettings={updateSettings} />

      <AgentPermissionsSetting mode={resolveAgentPermissionModeSummary({ agentDefaultArgs, agentDefaultEnv })} onChange={saveAgentPermissionMode} />

      <CustomAgentsSection
        customAgents={customAgents}
        onSave={saveCustomAgent}
        onDelete={deleteCustomAgent}
      />

      <AgentDetectionCatalog
        detectedAgents={detectedAgents}
        undetectedAgents={undetectedAgents}
        detectionPending={detectedIds === null}
        detectionFailed={detectionFailed}
        isRefreshing={isRefreshing}
        activeServerEnvironmentId={activeServerEnvironmentId}
        activeServerName={activeServerName}
        onRefresh={handleRefresh}
        getRowProps={getRowProps}
      />
    </div>
  )
}

function createCustomAgentId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

type CustomAgentEditorProps = {
  initial?: CustomAgent
  onSave: (agent: CustomAgent) => void
  onCancel: () => void
}

function CustomAgentEditor({
  initial,
  onSave,
  onCancel
}: CustomAgentEditorProps): React.JSX.Element {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [cmd, setCmd] = useState(initial?.cmd ?? '')
  const [args, setArgs] = useState(initial?.args ?? '')
  const [iconUrl, setIconUrl] = useState(initial?.iconUrl ?? '')
  const [faviconDomain, setFaviconDomain] = useState(initial?.faviconDomain ?? '')
  const [envText, setEnvText] = useState(() => {
    if (!initial?.env) {
      return ''
    }
    return Object.entries(initial.env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  })
  const [error, setError] = useState<string | null>(null)
  // Why: associate each field label with its input for screen-reader users.
  const editorInputBase = useId()

  const handleSave = (): void => {
    const trimmedLabel = label.trim()
    const trimmedCmd = cmd.trim()
    if (!trimmedLabel) {
      setError(
        translate('auto.components.settings.AgentsPane.customAgentNameRequired', 'Name is required')
      )
      return
    }
    if (!trimmedCmd) {
      setError(
        translate(
          'auto.components.settings.AgentsPane.customAgentCmdRequired',
          'Command is required'
        )
      )
      return
    }

    const env: Record<string, string> = {}
    for (const line of envText.split('\n')) {
      const trimmedLine = line.trim()
      if (!trimmedLine) {
        continue
      }
      const eqIndex = trimmedLine.indexOf('=')
      if (eqIndex <= 0) {
        setError(
          translate(
            'auto.components.settings.AgentsPane.customAgentEnvFormat',
            'Environment must be KEY=VALUE per line'
          )
        )
        return
      }
      env[trimmedLine.slice(0, eqIndex).trim()] = trimmedLine.slice(eqIndex + 1).trim()
    }

    const trimmedIconUrl = iconUrl.trim()
    const trimmedFaviconDomain = faviconDomain.trim()

    onSave({
      id: initial?.id ?? createCustomAgentId(),
      label: trimmedLabel,
      cmd: trimmedCmd,
      ...(args.trim() ? { args: args.trim() } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(trimmedIconUrl ? { iconUrl: trimmedIconUrl } : {}),
      ...(trimmedFaviconDomain ? { faviconDomain: trimmedFaviconDomain } : {})
    })
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-background/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${editorInputBase}-name`} className="text-xs text-muted-foreground">
            {translate('auto.components.settings.AgentsPane.customAgentName', 'Name')}
          </label>
          <Input
            id={`${editorInputBase}-name`}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              if (error) {
                setError(null)
              }
            }}
            placeholder={translate(
              'auto.components.settings.AgentsPane.customAgentNamePlaceholder',
              'My Agent'
            )}
            className="h-7 text-xs"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${editorInputBase}-cmd`} className="text-xs text-muted-foreground">
            {translate('auto.components.settings.AgentsPane.customAgentCmd', 'Command')}
          </label>
          <Input
            id={`${editorInputBase}-cmd`}
            value={cmd}
            onChange={(e) => {
              setCmd(e.target.value)
              if (error) {
                setError(null)
              }
            }}
            placeholder={translate(
              'auto.components.settings.AgentsPane.customAgentCmdPlaceholder',
              'my-agent'
            )}
            className="h-7 font-mono text-xs"
            spellCheck={false}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${editorInputBase}-args`} className="text-xs text-muted-foreground">
          {translate('auto.components.settings.AgentsPane.customAgentArgs', 'Arguments')}
        </label>
        <Input
          id={`${editorInputBase}-args`}
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder={translate(
            'auto.components.settings.AgentsPane.customAgentArgsPlaceholder',
            '--flag value'
          )}
          className="h-7 font-mono text-xs"
          spellCheck={false}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${editorInputBase}-env`} className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.AgentsPane.customAgentEnv',
            'Environment (one KEY=VALUE per line)'
          )}
        </label>
        <textarea
          id={`${editorInputBase}-env`}
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={translate(
            'auto.components.settings.AgentsPane.customAgentEnvPlaceholder',
            'API_KEY=xxx\nMODEL=gpt-4'
          )}
          rows={3}
          spellCheck={false}
          className="w-full resize-y rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${editorInputBase}-icon`} className="text-xs text-muted-foreground">
            {translate('auto.components.settings.AgentsPane.customAgentIconUrl', 'Icon URL')}
          </label>
          <div className="flex gap-1.5">
            <Input
              id={`${editorInputBase}-icon`}
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder={translate(
                'auto.components.settings.AgentsPane.customAgentIconUrlPlaceholder',
                'https://example.com/icon.png'
              )}
              className="h-7 flex-1 text-xs"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={async () => {
                try {
                  const result = await window.api.shell.pickAgentIconImage()
                  if (result?.dataUrl) {
                    setIconUrl(result.dataUrl)
                  }
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err))
                }
              }}
              className="h-7 shrink-0 gap-1 text-xs"
            >
              <FolderOpen className="size-3" />
              {translate('auto.components.settings.AgentsPane.customAgentIconBrowse', 'Browse')}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${editorInputBase}-favicon`} className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.AgentsPane.customAgentFaviconDomain',
              'Favicon Domain'
            )}
          </label>
          <Input
            id={`${editorInputBase}-favicon`}
            value={faviconDomain}
            onChange={(e) => setFaviconDomain(e.target.value)}
            placeholder={translate(
              'auto.components.settings.AgentsPane.customAgentFaviconDomainPlaceholder',
              'example.com'
            )}
            className="h-7 font-mono text-xs"
            spellCheck={false}
          />
        </div>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel} className="h-7 text-xs">
          {translate('auto.components.settings.AgentsPane.customAgentCancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          variant="default"
          size="xs"
          onClick={handleSave}
          className="h-7 text-xs"
        >
          {translate('auto.components.settings.AgentsPane.customAgentSave', 'Save')}
        </Button>
      </div>
    </div>
  )
}

type CustomAgentsSectionProps = {
  customAgents: CustomAgent[]
  onSave: (agent: CustomAgent) => void
  onDelete: (id: string) => void
}

function CustomAgentsSection({
  customAgents,
  onSave,
  onDelete
}: CustomAgentsSectionProps): React.JSX.Element {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate('auto.components.settings.AgentsPane.customAgentsTitle', 'Custom Agents')}
        description={translate(
          'auto.components.settings.AgentsPane.customAgentsDescription',
          'Add your own CLI agents that are not in the built-in catalog.'
        )}
        action={
          !isAdding ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setIsAdding(true)
                setEditingId(null)
              }}
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" />
              {translate('auto.components.settings.AgentsPane.customAgentAdd', 'Add')}
            </Button>
          ) : null
        }
      />

      {isAdding && (
        <CustomAgentEditor
          onSave={(agent) => {
            onSave(agent)
            setIsAdding(false)
          }}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {customAgents.length > 0 && (
        <div className="divide-y divide-border/40">
          {customAgents.map((agent) => {
            const isEditing = editingId === agent.id
            if (isEditing) {
              return (
                <CustomAgentEditor
                  key={agent.id}
                  initial={agent}
                  onSave={(updated) => {
                    onSave(updated)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )
            }
            const envSummary = agent.env
              ? Object.entries(agent.env)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(' ')
              : ''
            return (
              <div key={agent.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-background/50">
                  <CustomAgentIcon agent={agent} size={16} />
                </div>
                <div className="min-w-0 flex-1 sm:min-w-[12rem]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium leading-none">{agent.label}</span>
                    <SettingsBadge tone="muted">
                      {translate('auto.components.settings.AgentsPane.customAgentBadge', 'Custom')}
                    </SettingsBadge>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {agent.cmd}
                    {agent.args && <span className="ml-1.5 text-foreground/70">{agent.args}</span>}
                    {envSummary && <span className="ml-1.5 text-foreground/60">{envSummary}</span>}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditingId(agent.id)
                      setIsAdding(false)
                    }}
                    aria-label={translate(
                      'auto.components.settings.AgentsPane.customAgentEdit',
                      'Edit custom agent'
                    )}
                    className="size-7 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDelete(agent.id)}
                    aria-label={translate(
                      'auto.components.settings.AgentsPane.customAgentDelete',
                      'Delete custom agent'
                    )}
                    className="size-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {customAgents.length === 0 && !isAdding && (
        <div className="flex items-center justify-center rounded-md border border-dashed border-border/50 py-6 text-sm text-muted-foreground">
          {translate(
            'auto.components.settings.AgentsPane.customAgentsEmpty',
            'No custom agents. Click "Add" to create one.'
          )}
        </div>
      )}
    </section>
  )
}

export function AgentStatusHooksSetting({
  settings,
  updateSettings
}: AgentsPaneProps): React.JSX.Element {
  const enabled = settings.agentStatusHooksEnabled !== false
  return (
    <section className="space-y-3">
      <SettingsSwitchRow
        label={getAgentStatusHooksTitle()}
        description={getAgentStatusHooksDescription()}
        checked={enabled}
        onChange={() => updateSettings({ agentStatusHooksEnabled: !enabled })}
        ariaLabel={getAgentStatusHooksTitle()}
      />
    </section>
  )
}

export function AgentGeneratedTabTitlesSetting({ settings, updateSettings }: AgentsPaneProps) {
  const enabled = settings.tabAutoGenerateTitle === true
  return (
    <section className="space-y-3">
      <SettingsSwitchRow
        label={getAgentGeneratedTabTitlesTitle()}
        description={getAgentGeneratedTabTitlesDescription()}
        checked={enabled}
        onChange={() => updateSettings({ tabAutoGenerateTitle: !enabled })}
        ariaLabel={getAgentGeneratedTabTitlesTitle()}
      />
    </section>
  )
}
