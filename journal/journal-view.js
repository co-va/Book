import {
  actionBlock,
  button,
  durationText,
  modal,
  mountModal,
  mountRecordZ,
  openNotice,
  recordConfirmationMiniCard,
  recordZHost,
} from '../ui/ui.js';
import { getWorkplaces } from '../core/workplace-time.js';
import { personDisplay } from '../core/people/presentation.js';
import { getRecordPaymentState, recordAmountDue } from '../core/finance/index.js';
import {
  cancelRecord,
  deleteRecord,
  getRecord,
  refreshRecordsFromServer,
} from '../core/record/index.js';
import { flushBusinessPersistence } from '../core/business-persistence.js';

function formatDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1].slice(-2)}` : String(value || '');
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value) || 0)} ₽`;
}

function workplaceName(id) {
  const workplace = getWorkplaces().find((item) => String(item?.key ?? item?.id ?? '') === String(id || ''));
  return workplace?.name || workplace?.title || 'Рабочее пространство';
}

function actionSheet({ cancelled = false } = {}) {
  return actionBlock([
    !cancelled ? button('Корректировка', { variant: 'secondary', data: 'data-journal-record-correct' }) : '',
    !cancelled ? button('Отмена', { variant: 'danger', data: 'data-journal-record-cancel' }) : '',
    button('Удалить', { variant: 'critical', data: 'data-journal-record-delete' }),
  ].filter(Boolean).join(''));
}

export function openJournalView(record, { onClose = () => {} } = {}) {
  if (!record?.id) return null;

  let currentRecord = getRecord(record.id) || record;
  const layer = mountRecordZ({
    settings: false,
    title: personDisplay(currentRecord.person || {}).name || 'Запись',
    className: 'journal-view-z',
    onClose,
  });
  if (!layer) return null;

  const root = recordZHost(layer);

  const syncCurrent = () => {
    currentRecord = getRecord(currentRecord.id) || currentRecord;
    return currentRecord;
  };

  const persistAndRefresh = async () => {
    await flushBusinessPersistence();
    await refreshRecordsFromServer();
    syncCurrent();
  };

  const confirmCancel = (source) => {
    const confirm = mountModal(document.body, modal(
      `<div class="modal-title"><h2>Отменить?</h2><p>Запись останется в истории, время освободится.</p></div>${actionBlock([
        button('Нет', { variant: 'secondary', data: 'data-journal-record-cancel-no' }),
        button('Отмена', { variant: 'danger', data: 'data-journal-record-cancel-yes' }),
      ].join(''))}`,
      { variant: 'x', surface: 'app', title: 'Отмена' },
    ));
    if (!confirm) return;
    confirm.querySelector('[data-journal-record-cancel-no]')?.addEventListener('click', () => confirm.v2Close?.());
    confirm.querySelector('[data-journal-record-cancel-yes]')?.addEventListener('click', async (event) => {
      const submit = event.currentTarget;
      submit.disabled = true;
      if (!cancelRecord(source.id)) {
        submit.disabled = false;
        return;
      }
      try {
        await persistAndRefresh();
        confirm.v2Close?.();
        layer.v2Close?.();
      } catch (error) {
        await refreshRecordsFromServer().catch(() => null);
        openNotice({ title: 'Не удалось отменить', message: String(error?.message || 'Сервер не подтвердил отмену.') });
        if (submit.isConnected) submit.disabled = false;
      }
    });
  };

  const confirmDelete = (source) => {
    const confirm = mountModal(document.body, modal(
      `<div class="modal-title"><h2>Удалить?</h2><p>Запись и её история будут удалены без восстановления.</p></div>${actionBlock(
        button('Удалить', { variant: 'critical', data: 'data-journal-record-delete-confirm' }),
      )}`,
      { variant: 'x', surface: 'app', title: 'Удалить' },
    ));
    if (!confirm) return;
    confirm.querySelector('[data-journal-record-delete-confirm]')?.addEventListener('click', async (event) => {
      const submit = event.currentTarget;
      submit.disabled = true;
      if (!deleteRecord(source.id)) {
        submit.disabled = false;
        return;
      }
      try {
        await flushBusinessPersistence();
        await refreshRecordsFromServer();
        confirm.v2Close?.();
        layer.v2Close?.();
      } catch (error) {
        await refreshRecordsFromServer().catch(() => null);
        openNotice({ title: 'Не удалось удалить', message: String(error?.message || 'Сервер не подтвердил удаление.') });
        if (submit.isConnected) submit.disabled = false;
      }
    });
  };

  const openActions = () => {
    const source = syncCurrent();
    const actions = mountModal(document.body, modal(
      actionSheet({ cancelled: source.status === 'cancelled' }),
      { variant: 'x', surface: 'app' },
    ));
    if (!actions) return;

    actions.querySelector('[data-journal-record-correct]')?.addEventListener('click', async () => {
      actions.v2Close?.();
      const latest = syncCurrent();
      const { openRecords } = await import('../core/records/records.js');
      openRecords({
        context: 'professional',
        record: latest,
        professionalActions: true,
        onSaved: async (saved) => {
          currentRecord = saved;
          render();
          try {
            await persistAndRefresh();
            render();
          } catch (error) {
            await refreshRecordsFromServer().catch(() => null);
            syncCurrent();
            render();
            openNotice({ title: 'Не удалось сохранить', message: String(error?.message || 'Сервер не подтвердил изменения.') });
          }
        },
      });
    });

    actions.querySelector('[data-journal-record-cancel]')?.addEventListener('click', () => {
      actions.v2Close?.();
      confirmCancel(source);
    });

    actions.querySelector('[data-journal-record-delete]')?.addEventListener('click', () => {
      actions.v2Close?.();
      confirmDelete(source);
    });
  };

  const render = () => {
    const source = syncCurrent();
    const person = personDisplay(source.person || {});
    const procedures = Array.isArray(source.procedures) ? source.procedures : [];
    const totalDuration = procedures.reduce((sum, item) => sum + (Number(item?.duration) || 0), 0);
    const payment = getRecordPaymentState(source);
    const discountPercent = Number(source?.finance?.discountPercent || 0);
    const card = recordConfirmationMiniCard({
      workplace: workplaceName(source.workplaceId),
      date: formatDate(source.date),
      period: `${source.from || ''} - ${source.to || ''}`,
      uei: person.uei || '',
      name: person.name || 'Запись',
      phone: person.phone || '',
      groupText: source.group ? `Участники: ${Array.isArray(source.group?.participants) ? source.group.participants.length : 0} / ${Math.max(2, Math.floor(Number(source.group?.capacity) || 2))}` : '',
      duration: durationText(totalDuration || 30),
      discount: discountPercent > 0 ? `${discountPercent}%` : '0%',
      total: formatMoney(recordAmountDue(source)),
      procedures: procedures.map((item) => ({
        name: item?.name || '',
        durationText: durationText(Number(item?.duration) || 0),
        right: item?.cost === '' || item?.cost == null ? '' : formatMoney(item.cost),
      })),
    });

    root.innerHTML = `<div class="record-screen record-screen--state-view"><div role="button" tabindex="0" data-journal-record-actions>${card}</div></div>`;
    const cardButton = root.querySelector('[data-journal-record-actions]');
    cardButton?.addEventListener('click', openActions);
    cardButton?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openActions();
    });

    layer.dataset.journalViewPaymentState = payment.fullyPaid ? 'paid' : payment.partiallyPaid ? 'partial' : 'unpaid';
  };

  render();
  return layer;
}
