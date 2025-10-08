import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useMemo, useState } from 'react';
import type { BuildAgentResult } from '../types';

const roleOptions = ['Finance', 'Outreach', 'Research', 'Operations', 'FounderCore'];
const toolOptions = ['Gmail', 'Docs', 'CRM', 'Notion', 'Slack'];

type Mode = 'natural' | 'manual';

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  onCreateManual: (payload: { name: string; role: string; tools: Record<string, boolean>; objectives: string[] }) => Promise<void>;
  onGenerateFromPrompt: (payload: { promptText: string; persist?: boolean; spawn?: boolean }) => Promise<BuildAgentResult>;
}

export function CreateAgentModal({ open, onClose, onCreateManual, onGenerateFromPrompt }: CreateAgentModalProps) {
  const [mode, setMode] = useState<Mode>('natural');
  const [name, setName] = useState('');
  const [role, setRole] = useState(roleOptions[0]);
  const [objectives, setObjectives] = useState('');
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>({});
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [promptText, setPromptText] = useState('');
  const [spawnRequested, setSpawnRequested] = useState(false);
  const [naturalSubmitting, setNaturalSubmitting] = useState(false);
  const [naturalError, setNaturalError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<BuildAgentResult | null>(null);

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) => ({ ...prev, [tool]: !prev[tool] }));
  };

  const resetState = () => {
    setMode('natural');
    setName('');
    setRole(roleOptions[0]);
    setObjectives('');
    setSelectedTools({});
    setManualSubmitting(false);
    setManualError(null);
    setPromptText('');
    setSpawnRequested(false);
    setNaturalSubmitting(false);
    setNaturalError(null);
    setGeneratedResult(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSubmitManual = async () => {
    setManualError(null);
    setManualSubmitting(true);
    try {
      await onCreateManual({
        name,
        role,
        tools: selectedTools,
        objectives: objectives
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      });
      resetState();
      onClose();
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleGenerate = async () => {
    setNaturalError(null);
    setNaturalSubmitting(true);
    try {
      const result = await onGenerateFromPrompt({
        promptText,
        spawn: spawnRequested || undefined,
        persist: true
      });
      setGeneratedResult(result);
    } catch (err) {
      setNaturalError(err instanceof Error ? err.message : 'Failed to generate agent');
      setGeneratedResult(null);
    } finally {
      setNaturalSubmitting(false);
    }
  };

  const generatedSpec = generatedResult?.spec;

  const renderSecurityProfile = useMemo(() => {
    if (!generatedSpec) {
      return null;
    }

    const { securityProfile } = generatedSpec;
    return (
      <div className="space-y-2 bg-slate-900/60 border border-slate-700 rounded-xl p-4 text-sm">
        <h4 className="text-slate-200 font-semibold">Security Profile</h4>
        <div className="text-slate-300">
          <p>
            Sandbox: <span className="text-emerald-300">{securityProfile.sandbox ? 'Enabled' : 'Disabled'}</span>
          </p>
          <p>
            Internet Access:{' '}
            <span className={securityProfile.network.allowInternet ? 'text-emerald-300' : 'text-slate-300'}>
              {securityProfile.network.allowInternet ? 'Allowed' : 'Disabled'}
            </span>
          </p>
          {securityProfile.network.allowInternet && securityProfile.network.domainsAllowed.length > 0 && (
            <p>
              Domains: <span className="text-slate-200">{securityProfile.network.domainsAllowed.join(', ')}</span>
            </p>
          )}
          <p>
            Filesystem Read: <span className="text-slate-200">{securityProfile.filesystem.read.join(', ') || 'None'}</span>
          </p>
          <p>
            Filesystem Write: <span className="text-slate-200">{securityProfile.filesystem.write.join(', ') || 'None'}</span>
          </p>
          <p>
            Permissions: <span className="text-slate-200">{securityProfile.permissions.join(', ') || 'None'}</span>
          </p>
          <p>Timeout: {securityProfile.executionTimeout}s</p>
        </div>
      </div>
    );
  }, [generatedSpec]);

  const renderSpawnLogs = useMemo(() => {
    if (!generatedResult?.spawnResult?.logs?.length) {
      return null;
    }

    return (
      <div className="space-y-2 bg-slate-900/60 border border-slate-700 rounded-xl p-4 text-sm">
        <h4 className="text-slate-200 font-semibold">Sandbox Launch</h4>
        <p className="text-slate-300">Sandbox ID: {generatedResult.spawnResult.sandboxId}</p>
        <ul className="space-y-1 text-slate-300">
          {generatedResult.spawnResult.logs.map((log) => (
            <li key={`${log.timestamp}-${log.message}`} className="text-xs">
              <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span> {log.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }, [generatedResult]);

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-slate-900 p-6 text-left align-middle shadow-xl border border-slate-700">
                <Dialog.Title className="text-lg font-medium text-white">Create Agent</Dialog.Title>
                <p className="text-sm text-slate-400 mb-4">
                  Generate a secure agent from natural language or configure one manually.
                </p>

                <div className="flex gap-2 mb-4 text-sm">
                  <button
                    type="button"
                    onClick={() => setMode('natural')}
                    className={`px-3 py-1.5 rounded-lg border ${
                      mode === 'natural'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-800/60 border-slate-600 text-slate-300'
                    }`}
                  >
                    Natural Language
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className={`px-3 py-1.5 rounded-lg border ${
                      mode === 'manual'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-800/60 border-slate-600 text-slate-300'
                    }`}
                  >
                    Manual
                  </button>
                </div>

                {mode === 'natural' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-300">Describe the agent you need</label>
                      <textarea
                        rows={5}
                        value={promptText}
                        onChange={(event) => setPromptText(event.target.value)}
                        placeholder="e.g. Create an agent that monitors crypto prices and emails me a morning summary."
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-white"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={spawnRequested}
                        onChange={(event) => setSpawnRequested(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                      />
                      Immediately spawn this agent in a sandbox after creation
                    </label>

                    {naturalError && <p className="text-sm text-red-300">{naturalError}</p>}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700/60"
                        onClick={handleClose}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={naturalSubmitting || !promptText.trim()}
                        className="px-4 py-2 text-sm rounded-lg border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                      >
                        {naturalSubmitting ? 'Generating…' : 'Generate Agent'}
                      </button>
                    </div>

                    {generatedSpec && (
                      <div className="space-y-4 border-t border-slate-700 pt-4">
                        <div>
                          <h3 className="text-base font-semibold text-white">Generated Spec</h3>
                          <p className="text-sm text-slate-300">{generatedSpec.description}</p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-slate-200">Goals</h4>
                            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                              {generatedSpec.goals.map((goal) => (
                                <li key={goal}>{goal}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-slate-200">Capabilities</h4>
                            <p className="text-sm text-slate-300">
                              Tools: <span className="text-slate-100">{generatedSpec.capabilities.tools.join(', ')}</span>
                            </p>
                            <p className="text-sm text-slate-300">
                              Autonomy: <span className="text-slate-100">{generatedSpec.capabilities.autonomy_level}</span>
                            </p>
                            <p className="text-sm text-slate-300">
                              Memory: <span className="text-slate-100">{generatedSpec.capabilities.memory ? 'Enabled' : 'Disabled'}</span>
                            </p>
                            <p className="text-sm text-slate-300">
                              Cadence: <span className="text-slate-100">{generatedSpec.capabilities.execution_interval}</span>
                            </p>
                          </div>
                        </div>

                        {renderSecurityProfile}

                        {generatedResult?.savedAgent && (
                          <div className="space-y-1 text-sm text-slate-300 bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                            <h4 className="text-slate-200 font-semibold">Agent Saved</h4>
                            <p>
                              {generatedResult.savedAgent.name} created with ID{' '}
                              <span className="text-slate-100">{generatedResult.savedAgent.id}</span>.
                            </p>
                          </div>
                        )}

                        {renderSpawnLogs}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-300">Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300">Role</label>
                      <select
                        value={role}
                        onChange={(event) => setRole(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-white"
                      >
                        {roleOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300">Tools</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {toolOptions.map((tool) => (
                          <button
                            type="button"
                            key={tool}
                            onClick={() => toggleTool(tool)}
                            className={`px-3 py-1.5 rounded-lg border text-sm ${
                              selectedTools[tool]
                                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                                : 'bg-slate-800/60 border-slate-600 text-slate-300'
                            }`}
                          >
                            {tool}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300">Goals</label>
                      <textarea
                        rows={4}
                        value={objectives}
                        onChange={(event) => setObjectives(event.target.value)}
                        placeholder="One goal per line"
                        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-white"
                      />
                    </div>

                    {manualError && <p className="text-sm text-red-300">{manualError}</p>}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700/60"
                        onClick={handleClose}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitManual}
                        disabled={manualSubmitting || !name.trim()}
                        className="px-4 py-2 text-sm rounded-lg border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                      >
                        {manualSubmitting ? 'Creating…' : 'Create Agent'}
                      </button>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default CreateAgentModal;
