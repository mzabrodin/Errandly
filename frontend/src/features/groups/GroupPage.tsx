import {
  MoreHorizontal,
  Plane,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useState, type ComponentProps, type FormEvent, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';

import { errorMessage, isApiError } from '../../shared/api/errors';
import {
  useAddAbsence,
  useDeleteAbsence,
  useLeaveGroup,
  useRemoveMember,
  useSetMemberRole,
} from '../../shared/api/groups';
import type { Member } from '../../shared/api/types';
import { formatShortDate, toDateInputValue } from '../../shared/lib/dates';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Cloud } from '../../shared/ui/Decor';
import { Field, FormError, Input } from '../../shared/ui/Field';
import { Menu, MenuItem, MenuSeparator } from '../../shared/ui/Menu';
import { Modal } from '../../shared/ui/Modal';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Pill } from '../../shared/ui/Pill';
import { useToast } from '../../shared/ui/Toast';
import styles from './GroupPage.module.css';
import { InviteModal } from './InviteModal';
import { useCurrentGroup } from './useCurrentGroup';

type MenuTriggerProps = Parameters<ComponentProps<typeof Menu>['trigger']>[0];

function currentAbsence(member: Member): Member['absences'][number] | undefined {
  const today = toDateInputValue(new Date());
  return member.absences.find((absence) => absence.from <= today && today <= absence.to);
}

/** Кнопка «…» з діями над учасником */
function memberActionsTrigger(label: string) {
  return function MemberActionsTrigger(props: MenuTriggerProps): JSX.Element {
    return (
      <button type="button" className={styles.iconButton} aria-label={label} {...props}>
        <MoreHorizontal size={20} />
      </button>
    );
  };
}

function MemberCard({
  member,
  onRemove,
  onToggleAdmin,
}: {
  member: Member;
  onRemove?: (() => void) | undefined;
  onToggleAdmin?: (() => void) | undefined;
}): JSX.Element {
  const { t } = useTranslation();
  const { me } = useCurrentGroup();
  const away = currentAbsence(member);
  const isMe = member.userId === me.id;

  return (
    <Card as="li" className={styles.member}>
      <Avatar name={member.name} src={member.avatarUrl} color={member.color} size={52} />
      <div className={styles.memberInfo}>
        <div className={styles.memberName}>
          {member.name}
          {isMe && <span className={styles.me}> ({t('common.you')})</span>}
        </div>
        <div className={styles.memberEmail}>{member.email}</div>
        <div className={styles.memberTags}>
          <Pill tone={member.role === 'admin' ? 'lime' : 'cream'}>
            {t(member.role === 'admin' ? 'common.admin' : 'common.member')}
          </Pill>
          {away && (
            <Pill tone="sky">
              <Plane size={13} />
              {t('groups.awayUntil', { date: formatShortDate(away.to) })}
            </Pill>
          )}
        </div>
      </div>
      {onRemove && !isMe && (
        <Menu
          align="end"
          trigger={memberActionsTrigger(t('groups.memberActions', { name: member.name }))}
        >
          {(close) => (
            <>
              {onToggleAdmin && (
                <MenuItem
                  icon={
                    member.role === 'admin' ? <ShieldOff size={16} /> : <ShieldCheck size={16} />
                  }
                  onSelect={() => {
                    close();
                    onToggleAdmin();
                  }}
                >
                  {member.role === 'admin' ? t('groups.revokeAdmin') : t('groups.makeAdmin')}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem
                danger
                icon={<UserMinus size={16} />}
                onSelect={() => {
                  close();
                  onRemove();
                }}
              >
                {t('groups.remove')}
              </MenuItem>
            </>
          )}
        </Menu>
      )}
    </Card>
  );
}

function Absences(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { group, me, membersById } = useCurrentGroup();
  const add = useAddAbsence(group.id);
  const remove = useDeleteAbsence(group.id);
  const [today] = useState(() => toDateInputValue(new Date()));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [error, setError] = useState<string>();
  const mine = membersById.get(me.id)?.absences ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (to < from) return setError(t('groups.absenceInvalid'));
    setError(undefined);
    add.mutate({ from, to }, { onSuccess: () => toast(t('groups.absenceAdded')) });
  };

  return (
    <Card className={styles.absences}>
      <Cloud className={styles.cloud} size={110} />
      <h2 className={styles.sectionTitle}>{t('groups.absences')}</h2>
      <p className={styles.sectionText}>{t('groups.absencesText')}</p>

      {mine.length > 0 ? (
        <ul className={styles.absenceList}>
          {mine.map((absence) => (
            <li key={absence.id} className={styles.absence}>
              <Plane size={16} />
              <span>
                {formatShortDate(absence.from)} — {formatShortDate(absence.to)}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t('common.delete')}
                onClick={() => remove.mutate(absence.id)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>{t('groups.absenceNone')}</p>
      )}

      <form className={styles.absenceForm} onSubmit={submit} noValidate>
        <Field label={t('groups.absenceFrom')}>
          {(props) => (
            <Input
              {...props}
              type="date"
              min={today}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('groups.absenceTo')} error={error}>
          {(props) => (
            <Input
              {...props}
              type="date"
              min={from}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="secondary" loading={add.isPending}>
          {t('groups.absenceAdd')}
        </Button>
      </form>
      {add.error && <FormError>{errorMessage(add.error, t)}</FormError>}
    </Card>
  );
}

export function GroupPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { group, isAdmin } = useCurrentGroup();
  const setRole = useSetMemberRole(group.id);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);
  const inviteOpen = params.get('invite') === '1';

  const setInviteOpen = (open: boolean) =>
    setParams(
      (current) => {
        if (open) current.set('invite', '1');
        else current.delete('invite');
        return current;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title={group.name}
        subtitle={t('groups.membersCount', { count: group.members.length })}
        actions={
          isAdmin && (
            <Button icon={<UserPlus size={18} />} onClick={() => setInviteOpen(true)}>
              {t('groups.invite')}
            </Button>
          )
        }
      />

      <div className={styles.layout}>
        <section>
          <h2 className="visually-hidden">{t('groups.members')}</h2>
          <ul className={styles.members}>
            {group.members.map((member) => (
              <MemberCard
                key={member.userId}
                member={member}
                onRemove={isAdmin ? () => setRemoving(member) : undefined}
                onToggleAdmin={
                  isAdmin
                    ? () =>
                        setRole.mutate(
                          {
                            userId: member.userId,
                            role: member.role === 'admin' ? 'member' : 'admin',
                          },
                          {
                            onSuccess: () =>
                              toast(
                                member.role === 'admin'
                                  ? t('groups.adminRevoked', {
                                      name: member.name,
                                    })
                                  : t('groups.adminGranted', {
                                      name: member.name,
                                    }),
                              ),
                            onError: (roleError) => toast(errorMessage(roleError, t), 'error'),
                          },
                        )
                    : undefined
                }
              />
            ))}
          </ul>
        </section>

        <aside className={styles.side}>
          <Absences />
          <Button variant="danger" icon={<UserMinus size={16} />} onClick={() => setLeaving(true)}>
            {t('groups.leave')}
          </Button>
        </aside>
      </div>

      {isAdmin && (
        <InviteModal groupId={group.id} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      )}

      <RemoveMemberModal removing={removing} onClose={() => setRemoving(null)} />
      <LeaveGroupModal open={leaving} onClose={() => setLeaving(false)} />
    </>
  );
}

function RemoveMemberModal({
  removing,
  onClose,
}: {
  removing: Member | null;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { group } = useCurrentGroup();
  const removeMember = useRemoveMember(group.id);

  return (
    <Modal
      size="sm"
      open={removing !== null}
      onClose={onClose}
      title={t('groups.removeTitle', { name: removing?.name })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={removeMember.isPending}
            onClick={() =>
              removing &&
              removeMember.mutate(removing.userId, {
                onSuccess: () => {
                  toast(t('groups.removed', { name: removing.name }));
                  onClose();
                },
              })
            }
          >
            {t('common.delete')}
          </Button>
        </>
      }
    >
      <p>{t('groups.removeText')}</p>
      {removeMember.error && <FormError>{errorMessage(removeMember.error, t)}</FormError>}
    </Modal>
  );
}

function LeaveGroupModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { group } = useCurrentGroup();
  const leave = useLeaveGroup(group.id);

  return (
    <Modal
      size="sm"
      open={open}
      onClose={() => {
        onClose();
        leave.reset();
      }}
      title={t('groups.leaveTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={leave.isPending}
            onClick={() =>
              leave.mutate(undefined, {
                onSuccess: () => void navigate('/app', { replace: true }),
              })
            }
          >
            {t('groups.leave')}
          </Button>
        </>
      }
    >
      <p>{t('groups.leaveText')}</p>
      {leave.error && (
        <FormError>
          {isApiError(leave.error, 'LAST_ADMIN')
            ? t('groups.lastAdmin')
            : errorMessage(leave.error, t)}
        </FormError>
      )}
    </Modal>
  );
}
