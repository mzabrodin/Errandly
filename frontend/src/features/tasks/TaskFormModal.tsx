import { clsx } from 'clsx';
import { useState, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '../../shared/api/errors';
import { useCreateTask, useUpdateTask } from '../../shared/api/tasks';
import type { EditScope, Task } from '../../shared/api/types';
import { toLocalInputValue } from '../../shared/lib/dates';
import { Button } from '../../shared/ui/Button';
import { Field, FormError, Input, Select, Textarea } from '../../shared/ui/Field';
import { Modal } from '../../shared/ui/Modal';
import { Segmented } from '../../shared/ui/Segmented';
import { useToast } from '../../shared/ui/Toast';
import { useCurrentGroup } from '../groups/useCurrentGroup';
import styles from './TaskFormModal.module.css';
import {
  initialState,
  isoWeekday,
  isRecurrenceType,
  RECURRENCE_TYPES,
  serverFieldError,
  toTaskInput,
  validateForm,
  type Errors,
  type FormState,
  type SetField,
} from './taskFormState';
import { toStringList } from './translationList';

interface TaskFormModalProps {
  open: boolean;
  task: Task | null;
  defaultDay?: Date | undefined;
  onClose: () => void;
}

export function TaskFormModal({
  open,
  task,
  defaultDay,
  onClose,
}: TaskFormModalProps): JSX.Element | null {
  return open ? (
    <TaskForm
      key={task?.id ?? `new-${defaultDay?.toISOString() ?? ''}`}
      task={task}
      defaultDay={defaultDay}
      onClose={onClose}
    />
  ) : null;
}

/** Збереження форми: редагування або створення з тостом про результат */
function useSaveTask(
  task: Task | null,
  onClose: () => void,
): {
  mutation: ReturnType<typeof useCreateTask> | ReturnType<typeof useUpdateTask>;
  save: (state: FormState, scope: EditScope) => void;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const { group, membersById } = useCurrentGroup();
  const create = useCreateTask(group.id);
  const update = useUpdateTask(group.id);

  const save = (state: FormState, scope: EditScope): void => {
    const input = toTaskInput(state);
    if (task !== null) {
      update.mutate(
        { ...input, id: task.id, scope: task.recurrence.type !== 'once' ? scope : 'one' },
        {
          onSuccess: () => {
            toast(t('taskForm.saved'));
            onClose();
          },
        },
      );
      return;
    }
    create.mutate(input, {
      onSuccess: (created) => {
        const assignee =
          created.assigneeId === null ? undefined : membersById.get(created.assigneeId);
        toast(
          assignee
            ? t('taskForm.created', { name: assignee.name })
            : t('taskForm.createdUnassigned'),
        );
        onClose();
      },
    });
  };

  return { mutation: task === null ? create : update, save };
}

function TaskForm({
  task,
  defaultDay,
  onClose,
}: {
  task: Task | null;
  defaultDay?: Date | undefined;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { mutation, save } = useSaveTask(task, onClose);
  const [state, setState] = useState(() => initialState(task, defaultDay));
  const [errors, setErrors] = useState<Errors>({});
  const [scope, setScope] = useState<EditScope>('one');
  const [minDue] = useState(() => toLocalInputValue(new Date()));
  const isEdit = task !== null;
  const recurring = task !== null && task.recurrence.type !== 'once';
  // змінити повторюваність можна лише для всієї серії
  const recurrenceLocked = isEdit && (!recurring || scope === 'one');

  const set: SetField = (key, value) => setState((current) => ({ ...current, [key]: value }));
  const [weekdaysTouched, setWeekdaysTouched] = useState(false);

  // у минулому не можна ставити лише новий термін; прострочену задачу редагувати можна
  const dueChanged = !isEdit || state.dueAt !== toLocalInputValue(new Date(task.dueAt));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const nextErrors = validateForm(state, dueChanged, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    save(state, scope);
  };

  const fieldError = (field: string): string | undefined =>
    serverFieldError(mutation.error, field, t);

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? t('taskForm.editTitle') : t('taskForm.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="task-form" loading={mutation.isPending}>
            {isEdit ? t('common.save') : t('taskForm.submitCreate')}
          </Button>
        </>
      }
    >
      <form id="task-form" className={styles.form} onSubmit={submit} noValidate>
        {mutation.error &&
          fieldError('title') === undefined &&
          fieldError('dueAt') === undefined && (
            <FormError>{errorMessage(mutation.error, t)}</FormError>
          )}

        {recurring && <ScopeChoice scope={scope} onChange={setScope} />}

        <TitleDescriptionFields
          state={state}
          set={set}
          titleError={errors.title ?? fieldError('title')}
        />

        <div className={styles.row}>
          <Field label={t('taskForm.dueAt')} error={errors.dueAt ?? fieldError('dueAt')}>
            {(props) => (
              <DueInput
                fieldProps={props}
                min={minDue}
                value={state.dueAt}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    dueAt: value,
                    // поки дні тижня не обирали вручну — підлаштовуємо під дату
                    weekdays:
                      weekdaysTouched || value === ''
                        ? current.weekdays
                        : [isoWeekday(new Date(value))],
                  }))
                }
              />
            )}
          </Field>
          <RepeatField state={state} set={set} disabled={recurrenceLocked} />
        </div>

        {state.recurrenceType === 'weekly' && (
          <WeekdaysFieldset
            weekdays={state.weekdays}
            disabled={recurrenceLocked}
            error={errors.weekdays}
            onChange={(value) => {
              setWeekdaysTouched(true);
              set('weekdays', value);
            }}
          />
        )}

        <DifficultyFieldset
          value={state.difficulty}
          onChange={(value) => set('difficulty', value)}
        />

        <AssigneeField value={state.assigneeId} onChange={(value) => set('assigneeId', value)} />
      </form>
    </Modal>
  );
}

type FieldRenderProps = Parameters<Parameters<typeof Field>[0]['children']>[0];

function ScopeChoice({
  scope,
  onChange,
}: {
  scope: EditScope;
  onChange: (scope: EditScope) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.scope}>
      <span className={styles.scopeLabel}>{t('taskForm.scopeQuestion')}</span>
      <Segmented
        size="sm"
        label={t('taskForm.scopeQuestion')}
        value={scope}
        onChange={onChange}
        options={[
          { value: 'one', label: t('taskForm.scopeOne') },
          { value: 'series', label: t('taskForm.scopeSeries') },
        ]}
      />
    </div>
  );
}

function TitleDescriptionFields({
  state,
  set,
  titleError,
}: {
  state: FormState;
  set: SetField;
  titleError: string | undefined;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('taskForm.name')} error={titleError}>
        {(props) => (
          <Input
            {...props}
            maxLength={100}
            placeholder={t('taskForm.namePlaceholder')}
            value={state.title}
            onChange={(event) => set('title', event.target.value)}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- перше поле щойно відкритої модалки
            autoFocus
          />
        )}
      </Field>

      <Field label={t('taskForm.description')}>
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            placeholder={t('taskForm.descriptionPlaceholder')}
            value={state.description}
            onChange={(event) => set('description', event.target.value)}
          />
        )}
      </Field>
    </>
  );
}

function DueInput({
  fieldProps,
  min,
  value,
  onChange,
}: {
  fieldProps: FieldRenderProps;
  min: string;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <Input
      {...fieldProps}
      type="datetime-local"
      min={min}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function RepeatField({
  state,
  set,
  disabled,
}: {
  state: FormState;
  set: SetField;
  disabled: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <Field label={t('taskForm.repeat')}>
      {(props) => (
        <Select
          {...props}
          value={state.recurrenceType}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            if (isRecurrenceType(value)) set('recurrenceType', value);
          }}
        >
          {RECURRENCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`tasks.repeat.${type}`)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function WeekdaysFieldset({
  weekdays,
  disabled,
  error,
  onChange,
}: {
  weekdays: number[];
  disabled: boolean;
  error: string | undefined;
  onChange: (weekdays: number[]) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const weekdayNames = toStringList(t('weekdays.short', { returnObjects: true }));
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend className={styles.legend}>{t('taskForm.weekdays')}</legend>
      <div className={styles.weekdays}>
        {weekdayNames.map((name, index) => {
          const day = index + 1;
          const checked = weekdays.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={checked}
              className={clsx(styles.weekday, checked && styles.weekdayOn)}
              onClick={() =>
                onChange(checked ? weekdays.filter((value) => value !== day) : [...weekdays, day])
              }
            >
              {name}
            </button>
          );
        })}
      </div>
      {error !== undefined && error !== '' && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function DifficultyFieldset({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{t('taskForm.difficulty')}</legend>
      <Segmented
        label={t('taskForm.difficulty')}
        value={value}
        onChange={onChange}
        options={[1, 2, 3, 4, 5].map((option) => ({ value: option, label: option }))}
      />
      <p className={styles.hint}>{t('taskForm.difficultyHint')}</p>
    </fieldset>
  );
}

function AssigneeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { group } = useCurrentGroup();
  return (
    <Field label={t('taskForm.assignee')} hint={value === '' ? t('taskForm.autoHint') : undefined}>
      {(props) => (
        <Select {...props} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t('taskForm.auto')}</option>
          {group.members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
