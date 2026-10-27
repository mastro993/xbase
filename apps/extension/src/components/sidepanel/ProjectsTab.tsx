import { Add01Icon } from '@hugeicons/core-free-icons';
import {
  MAX_PROJECT_FIELD_LENGTH,
  MAX_PROJECTS,
  type Project,
  type ProjectField,
} from '@xbase/ai/profile';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Input } from '@xbase/ui/components/base/input/input';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAutosave } from '@/hooks/use-autosave';
import { updateSettings } from '@/hooks/use-settings';
import type { Settings } from '@/lib/settings';
import { TextareaField } from './TextareaField';

export function ProjectsTab({ settings }: { settings: Settings }) {
  const { projects } = settings;
  const full = projects.length >= MAX_PROJECTS;
  const [added, setAdded] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  function add() {
    const id = crypto.randomUUID();
    setAdded(id); // focuses the new card's name once it renders
    void updateSettings((s) => ({
      ...s,
      projects: [...s.projects, { id, name: '', description: '', link: '' }],
    }));
  }

  function remove(id: string) {
    void updateSettings((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }));
    addButton.current?.focus();
  }

  return (
    // min-w-0: a fieldset defaults to min-content width, which overflows narrow panels.
    <fieldset className="flex min-w-0 flex-col gap-4">
      <legend className="mb-1 text-headline-medium text-text-primary">Projects</legend>
      <p className="text-body-regular text-text-secondary">
        Add what you build, up to {MAX_PROJECTS}. The AI mentions a project only when it fits, using
        only what you write here. Projects without a name are skipped.
      </p>
      {projects.length > 0 && (
        <ul className="flex flex-col gap-4">
          {projects.map((p, i) => (
            <ProjectCard
              key={p.id}
              project={p}
              position={i + 1}
              settings={settings}
              autoFocus={p.id === added}
              onRemove={() => remove(p.id)}
            />
          ))}
        </ul>
      )}
      {/* aria-disabled, not disabled: remove() moves focus here, even at the limit. */}
      <Button
        ref={addButton}
        variant="secondary"
        leadingIcon={Add01Icon}
        className="self-start"
        aria-disabled={full || undefined}
        onClick={() => !full && add()}
      >
        Add project
      </Button>
    </fieldset>
  );
}

const PLACEHOLDERS: Record<ProjectField, string> = {
  name: 'e.g. "Acme Notes"',
  description: 'e.g. "Markdown notes app for small teams. 2k paying users, built solo."',
  link: 'e.g. "https://acme.app"',
};

function ProjectCard({
  project,
  position,
  settings,
  autoFocus,
  onRemove,
}: {
  project: Project;
  position: number;
  settings: Settings;
  autoFocus: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const confirmId = useId();

  const apply = (field: ProjectField) => (s: Settings, text: string) => ({
    ...s,
    // A project removed meanwhile (here or in another panel) stays removed.
    projects: s.projects.map((p) => (p.id === project.id ? { ...p, [field]: text } : p)),
  });
  const fields = {
    name: useAutosave(settings, project.name, apply('name')),
    description: useAutosave(settings, project.description, apply('description')),
    link: useAutosave(settings, project.link, apply('link')),
  };
  const statuses = new Set(Object.values(fields).map((f) => f.status));
  const saved = statuses.has('saved') && !statuses.has('editing');
  const label = fields.name.draft.trim() || `project ${position}`;

  const control = (field: ProjectField) => ({
    id: `project-${project.id}-${field}`,
    value: fields[field].draft,
    maxLength: MAX_PROJECT_FIELD_LENGTH[field],
    placeholder: PLACEHOLDERS[field],
    onChange: fields[field].onChange,
    onBlur: fields[field].flush,
  });

  return (
    <li className="rounded-3xl border border-border-button-default bg-background-primary-default p-4">
      {/* min-w-0: a fieldset defaults to min-content width, which overflows narrow panels. */}
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="sr-only">Project {position}</legend>
        <Input label="Name" {...control('name')} autoFocus={autoFocus} />
        <TextareaField label="Description" {...control('description')} className="min-h-12" />
        {/* Any link is kept, with or without a scheme: native validation would mark one without
            it invalid, with no message. */}
        <Input label="Link" {...control('link')} type="url" validationBehavior="aria" />
        {confirming ? (
          <div role="group" aria-labelledby={confirmId} className="flex items-center gap-2">
            <span
              id={confirmId}
              className="min-w-0 flex-1 truncate text-body-regular text-text-primary"
            >
              Remove {label}?
            </span>
            <Button size="small" variant="danger" onClick={onRemove}>
              Remove
            </Button>
            {/* The safe choice gets focus, so a repeated Enter doesn't remove the project. */}
            <Button
              size="small"
              variant="secondary"
              autoFocus
              onClick={() => {
                flushSync(() => setConfirming(false));
                removeButton.current?.focus();
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span role="status" className="text-caption-1-medium text-text-secondary">
              {saved && 'Saved'}
            </span>
            <Button
              ref={removeButton}
              size="small"
              variant="secondary"
              onClick={() => setConfirming(true)}
            >
              Remove
              <span className="sr-only"> {label}</span>
            </Button>
          </div>
        )}
      </fieldset>
    </li>
  );
}
