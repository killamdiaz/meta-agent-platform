import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState } from 'react';

const roleOptions = ['Finance', 'Outreach', 'Research', 'Operations', 'FounderCore'];
const toolOptions = ['Gmail', 'Docs', 'CRM', 'Notion', 'Slack'];

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; role: string; tools: Record<string, boolean>; objectives: string[] }) => Promise<void>;
}

export function CreateAgentModal({ open, onClose, onSubmit }: CreateAgentModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState(roleOptions[0]);
  const [objectives, setObjectives] = useState('');
  const [selectedTools, setSelectedTools] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) => ({ ...prev, [tool]: !prev[tool] }));
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        role,
        tools: selectedTools,
        objectives: objectives
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
      });
      setName('');
      setObjectives('');
      setSelectedTools({});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-slate-900 p-6 text-left align-middle shadow-xl border border-slate-700">
                <Dialog.Title className="text-lg font-medium text-white">Create Agent</Dialog.Title>
                <p className="text-sm text-slate-400 mb-4">Configure an agent with tools and objectives.</p>

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
                </div>

                {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-700/60"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-4 py-2 text-sm rounded-lg border border-emerald-500/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {submitting ? 'Creating…' : 'Create Agent'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default CreateAgentModal;
