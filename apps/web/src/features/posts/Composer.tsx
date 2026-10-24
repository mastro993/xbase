import { RiAddLine, RiDeleteBinLine } from '@remixicon/react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Kbd } from '@xbase/ui/components/base/kbd/kbd';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { refineDraftFn } from '@/features/ai/ai.functions';
import { AI_NOT_CONFIGURED } from '@/features/ai/ai.schema';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { ButtonRouterLink, LinkButtonRouterLink } from '@/features/shell/router-links';
import { focusPageHeading, refocus } from '@/lib/focus';
import { readableError } from '@/lib/readable-error';
import { isShortcut, useModifierLabel } from './keyboard';
import { LocalTime } from './LocalTime';
import { deletePostFn, schedulePostFn, unschedulePostFn, updateDraftFn } from './posts.functions';
import { MAX_PARTS, type PostDto } from './posts.schema';
import { PostStatusAlert } from './PostStatusAlert';
import { ScheduleDialog } from './ScheduleDialog';
import { ThreadPartField } from './ThreadPartField';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { useThreadParts } from './use-thread-parts';

type Notice = { title: string; message: string; settingsLink?: boolean };

const HEADINGS: Record<PostDto['status'], string> = {
  draft: 'Draft',
  scheduled: 'Scheduled post',
  publishing: 'Publishing',
  published: 'Published post',
  failed: 'Failed post',
};

const sameTexts = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((text, index) => text === b[index]);

/**
 * Edits a draft or a queued post: one field per thread part, Save (⌘S / Ctrl+S), Refine with AI,
 * Schedule and Delete. The texts live here until saved; status and times come from the loader.
 */
export function Composer({ post, aiReady }: { post: PostDto; aiReady: boolean }) {
  const router = useRouter();
  const navigate = useNavigate();
  const updateDraft = useServerFn(updateDraftFn);
  const schedulePost = useServerFn(schedulePostFn);
  const unschedulePost = useServerFn(unschedulePostFn);
  const deletePost = useServerFn(deletePostFn);
  const refineDraft = useServerFn(refineDraftFn);
  const formId = useId();
  const fieldId = useId();
  const aiHintId = useId();
  const modifier = useModifierLabel();

  const { parts, setText, add, remove } = useThreadParts(post.parts);
  const texts = parts.map((part) => part.text);
  const [savedTexts, setSavedTexts] = useState(post.parts);
  const dirty = !sameTexts(texts, savedTexts);
  const [saving, setSaving] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const [refining, setRefining] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ key: string; text: string } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // A busy button keeps its focus, but Unschedule goes away once it has worked: the heading takes
  // focus then.
  const heading = useRef<HTMLHeadingElement>(null);

  const frozen = post.status === 'publishing' || post.status === 'published';
  const queued = post.status === 'scheduled' || post.status === 'failed';

  // Focus follows the thread's shape: a new part, the neighbour of a removed one, or the empty
  // first part of a draft just created with New draft.
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef(post.parts.length === 1 && post.parts[0] === '' ? 'p0' : null);
  useEffect(() => {
    const key = pendingFocus.current;
    pendingFocus.current = null;
    if (key) fields.current.get(key)?.focus();
  }, [parts]);

  // Throws, so each caller shows the error where it belongs: the page, or the schedule dialog.
  const persist = async () => {
    const saved = await updateDraft({ data: { id: post.id, parts: texts } });
    setSavedTexts(saved.parts);
  };

  const save = async () => {
    if (saving || frozen || !dirty) return;
    setSaving(true);
    setNotice(null);
    try {
      await persist();
      await router.invalidate({ sync: true });
    } catch (cause) {
      setNotice({ title: 'Not saved', message: readableError(cause) });
    } finally {
      setSaving(false);
    }
  };

  // ⌘S / Ctrl+S anywhere on the page, instead of the browser's "Save page as".
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isShortcut(event, 's')) return;
      event.preventDefault();
      void saveRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Schedules the text on screen, so unsaved edits are saved first. Whatever was written gets
  // reloaded, even when scheduling then fails (an empty post, a time that has passed).
  const schedule = async (publishAt: Date) => {
    let changed = false;
    try {
      if (dirty) {
        await persist();
        changed = true;
      }
      await schedulePost({ data: { id: post.id, publishAt: publishAt.toISOString() } });
      changed = true;
    } finally {
      if (changed) await router.invalidate({ sync: true });
    }
  };

  const unschedule = async () => {
    if (unscheduling) return;
    setUnscheduling(true);
    setNotice(null);
    try {
      await unschedulePost({ data: { id: post.id } });
      await router.invalidate({ sync: true });
    } catch (cause) {
      setNotice({ title: 'Couldn’t unschedule', message: readableError(cause) });
    } finally {
      setUnscheduling(false);
      refocus(heading.current);
    }
  };

  // Leave first: reloading this route's loader would 404 on the deleted post.
  const destroy = async () => {
    await deletePost({ data: { id: post.id } });
    await navigate({ to: '/drafts', ignoreBlocker: true });
    await router.invalidate();
    focusPageHeading();
  };

  const refine = async (key: string, text: string) => {
    // Where focus was: the Refine button, or <body> after a click in Safari.
    const from = document.activeElement;
    setRefining(key);
    setNotice(null);
    try {
      const result = await refineDraft({ data: { text } });
      setUndo({ key, text });
      setText(key, result.text);
    } catch (cause) {
      const message = readableError(cause);
      setNotice({
        title: 'Couldn’t refine',
        message,
        settingsLink: message === AI_NOT_CONFIGURED,
      });
    } finally {
      setRefining(null);
      // The field shows the result, so it gets focus, unless the user has moved on meanwhile.
      requestAnimationFrame(() => {
        if (document.activeElement === from) fields.current.get(key)?.focus();
      });
    }
  };

  const onChange = (key: string, text: string) => {
    setText(key, text);
    // Undo would throw away what was typed since the refine.
    if (undo?.key === key) setUndo(null);
  };

  const addPart = () => {
    pendingFocus.current = add();
  };

  const removePart = (index: number) => {
    const key = parts[index]?.key;
    if (!key) return;
    pendingFocus.current = (parts[index - 1] ?? parts[index + 1])?.key ?? null;
    remove(key);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void save();
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <UnsavedChangesDialog dirty={dirty} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-title-3-semibold text-text-primary outline-none"
          >
            {HEADINGS[post.status]}
          </h2>
          <p role="status" className="text-body-regular text-text-secondary">
            {dirty ? (
              'Unsaved changes'
            ) : (
              <>
                Saved <LocalTime value={post.updatedAt} format="stamp" />
              </>
            )}
          </p>
        </div>
        {!frozen && (
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmButton
              leadingIcon={RiDeleteBinLine}
              title="Delete this post?"
              description={
                queued
                  ? 'It leaves the queue and is gone for good. This can’t be undone.'
                  : 'The draft is gone for good. This can’t be undone.'
              }
              action="Delete"
              errorTitle="Couldn’t delete"
              onConfirm={destroy}
            >
              Delete
            </ConfirmButton>
            {queued && (
              <Button
                variant="secondary"
                leadingIcon={unscheduling ? Spinner : undefined}
                aria-busy={unscheduling || undefined}
                onClick={unschedule}
              >
                Unschedule
              </Button>
            )}
            <ScheduleDialog
              label={queued ? 'Reschedule' : 'Schedule'}
              publishAt={post.publishAt}
              onConfirm={schedule}
            />
            <Button
              type="submit"
              form={formId}
              leadingIcon={saving ? Spinner : undefined}
              aria-busy={saving || undefined}
              aria-keyshortcuts="Meta+S Control+S"
            >
              <span className="inline-flex items-center gap-1.5">
                Save
                {modifier && <Kbd aria-hidden="true">{modifier}S</Kbd>}
              </span>
            </Button>
          </div>
        )}
      </header>

      <PostStatusAlert post={post} queueLink />
      {notice && (
        <Callout
          tone="error"
          role="alert"
          title={notice.title}
          action={
            notice.settingsLink && (
              <ButtonRouterLink to="/settings" variant="secondary" size="small">
                Open Settings
              </ButtonRouterLink>
            )
          }
        >
          {notice.message}
        </Callout>
      )}

      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        {parts.map((part, index) => (
          <ThreadPartField
            key={part.key}
            id={`${fieldId}-${part.key}`}
            index={index}
            total={parts.length}
            text={part.text}
            onChange={(text) => onChange(part.key, text)}
            fieldRef={(node) => {
              if (node) fields.current.set(part.key, node);
              else fields.current.delete(part.key);
            }}
            readOnly={frozen}
            onRefine={aiReady ? () => refine(part.key, part.text) : undefined}
            refining={refining === part.key}
            refineHintId={aiReady ? undefined : aiHintId}
            onUndo={
              undo?.key === part.key
                ? () => {
                    onChange(part.key, undo.text);
                    // Undo goes away with the refine: the restored text takes focus.
                    fields.current.get(part.key)?.focus();
                  }
                : undefined
            }
            onRemove={parts.length > 1 ? () => removePart(index) : undefined}
          />
        ))}
      </form>

      {!frozen && (
        <div className="flex flex-col items-start gap-3">
          <Button
            variant="secondary"
            leadingIcon={RiAddLine}
            disabled={parts.length >= MAX_PARTS}
            onClick={addPart}
          >
            Add a post to the thread
          </Button>
          {parts.length >= MAX_PARTS && (
            <p className="text-body-regular text-text-secondary">
              A thread can have up to {MAX_PARTS} posts.
            </p>
          )}
          {!aiReady && (
            <p id={aiHintId} className="text-body-regular text-text-secondary">
              Refine with AI needs an AI provider.{' '}
              <LinkButtonRouterLink to="/settings" className="underline">
                Set one up in Settings
              </LinkButtonRouterLink>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
