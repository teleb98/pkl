/* 독서 알림 실제 스케줄링 — 설정에는 있었지만 실제로 울리는 코드가 없던 기능.
   앱이 열려 있는 동안 주기적으로 시각을 확인해, 설정된 시각을 지났고 오늘
   아직 안 울렸으면 브라우저 Notification 을 띄운다.
   한계: 완전히 닫힌 상태의 백그라운드 푸시는 지원하지 않음(서버 푸시 없이는
   웹/Electron 모두 불가) — 앱이 켜져 있을 때만 동작하는 포그라운드 알림. */
import { getNotificationSettings, getReadingStrategy } from '../store.js';

const LAST_FIRED_KEY = 'pkl_notif_last_fired_date';

export function getLastFiredDate() {
  try { return localStorage.getItem(LAST_FIRED_KEY); } catch { return null; }
}

function setLastFiredDate(d) {
  try { localStorage.setItem(LAST_FIRED_KEY, d); } catch { /* ignore */ }
}

/** 순수 판정 로직(테스트 용이) — 오늘 아직 안 울렸고 설정 시각을 지났으면 true */
export function shouldFireReminder(now, settings, lastFiredDate) {
  if (!settings?.enabled || !settings?.time) return false;
  const today = now.toISOString().slice(0, 10);
  if (lastFiredDate === today) return false;
  const [h, m] = settings.time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return now >= target;
}

/** 알림 본문 — 현재 책에 독서 전략(일일 목표)이 있으면 그 목표를 실어 보낸다.
 *  전략이 없거나 book 이 없으면 기존 일반 문구로 대체(하위 호환). */
export function buildReminderBody(book) {
  if (book?.id) {
    const strategy = getReadingStrategy(book.id);
    if (strategy?.dailyPageTarget) {
      return `《${book.title}》 오늘 목표 ${strategy.dailyPageTarget}p — 지금 읽어보세요 📖`;
    }
  }
  return '오늘의 독서 시간을 가져보세요 📖';
}

/** 알림 필요 여부를 확인하고, 필요하면 실제로 Notification 을 띄운다.
 *  주기적으로(예: 1분마다) 호출하는 용도. 반환값은 테스트/디버깅용.
 *  book 을 넘기면(현재 열려있는 책) 그 책의 전략 일일 목표를 알림 본문에 반영한다. */
export function checkAndFireReminder(now = new Date(), book = null) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const settings = getNotificationSettings();
  if (!shouldFireReminder(now, settings, getLastFiredDate())) return false;
  try {
    new Notification('PKL', { body: buildReminderBody(book), icon: '/icon-192.png' });
  } catch { /* 알림 생성 실패는 무시(권한 취소 등) */ }
  setLastFiredDate(now.toISOString().slice(0, 10));
  return true;
}
