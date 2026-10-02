import React from 'react';
import { Screen, Card, SectionLabel } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { UserNav } from '@/components/user-nav';
import { useUserQueue } from '@/lib/user-queue';
import { generateMockNotifications } from '@/lib/mock-notifications';

type RawNotification = any;

function timeAgo(input?: number | string): string {
  if (!input) return '';
  const now = Date.now();
  let ts = typeof input === 'number' ? input : Date.parse(String(input));
  if (Number.isNaN(ts)) return '';
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function normalize(raw: RawNotification) {
  if (!raw) return { id: String(Math.random()), icon: '✉', title: 'Notification', lines: [String(raw)], time: undefined };
  if (typeof raw === 'string') {
    const s = raw.trim();
    const lower = s.toLowerCase();
    if (lower.includes('your turn') || lower.includes('approaching') || lower.includes('you are currently #')) {
      return { id: s, icon: '●', title: 'Your turn is approaching!', lines: [s], time: undefined };
    }
    if (lower.includes('position changed') || (lower.includes('position') && lower.includes('changed'))) {
      return { id: s, icon: '●', title: 'Queue Updated', lines: [s], time: undefined };
    }
    if (lower.includes('joined') || lower.includes('you successfully joined')) {
      return { id: s, icon: '✔', title: 'Queue Joined', lines: [s], time: undefined };
    }
    if (lower.includes('unavailable') || lower.includes('temporarily') || lower.includes('closed')) {
      return { id: s, icon: '⚠', title: 'Service Update', lines: [s], time: undefined };
    }
    return { id: s, icon: '✉', title: 'Notification', lines: [s], time: undefined };
  }

  const id = raw.id ?? raw.key ?? JSON.stringify(raw);
  const message = raw.message ?? raw.text ?? raw.body ?? '';
  const lowerMsg = String(message).toLowerCase();
  const ts = raw.timestamp ?? raw.time ?? raw.createdAt ?? raw.date;

  if ((raw.type ?? '').toString().toLowerCase().includes('turn') || lowerMsg.includes('your turn') || lowerMsg.includes('approaching')) {
    return { id, icon: '●', title: raw.title ?? 'Your turn is approaching!', lines: Array.isArray(message) ? message : [String(message)], time: ts };
  }
  if ((raw.type ?? '').toString().toLowerCase().includes('update') || lowerMsg.includes('position changed') || (raw.oldPosition && raw.newPosition)) {
    if (raw.oldPosition && raw.newPosition && raw.serviceName) {
      return { id, icon: '●', title: raw.title ?? 'Queue Updated', lines: [`Your position changed from #${raw.oldPosition} to #${raw.newPosition}.`], time: ts };
    }
    return { id, icon: '●', title: raw.title ?? 'Queue Updated', lines: [String(message)], time: ts };
  }
  if ((raw.type ?? '').toString().toLowerCase().includes('joined') || lowerMsg.includes('joined')) {
    return { id, icon: '✔', title: raw.title ?? 'Queue Joined', lines: Array.isArray(message) ? message : [String(message)], time: ts };
  }
  if ((raw.type ?? '').toString().toLowerCase().includes('service') || lowerMsg.includes('unavailable') || lowerMsg.includes('temporarily')) {
    return { id, icon: '⚠', title: raw.title ?? 'Service Update', lines: Array.isArray(message) ? message : [String(message)], time: ts };
  }

  return { id, icon: raw.icon ?? '✉', title: raw.title ?? 'Notification', lines: Array.isArray(message) ? message : [String(message)], time: ts };
}

export default function UserNotificationsScreen() {
  const { notifications: baseNotifications, active, history } = useUserQueue();

  // dev-only: generate mocks from current queue state; keep production unchanged
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  const mockNotifications = isDev ? generateMockNotifications(active, history) : [];

  // If you also want a targeted developer user, handle that here (not inside the hook)
  const devUserName = 'Jordan Reyes';
  const jordanMocks = isDev && (baseNotifications as any[]).length && (typeof (global as any).__TEST_JORDAN__ !== 'undefined' || false) ? [] : [];
  // (Optionally create targeted mocks here if you need — keep them in the UI layer)

  const combined = [...mockNotifications, ...(baseNotifications ?? [])];

  const items = combined.map(normalize);

  return (
    <Screen title="Notifications" subtitle="Recent messages" nav={<UserNav />}>
      <SectionLabel>{`Notifications (${items.length})`}</SectionLabel>

      {items.length === 0 && <Card><ThemedText>No notifications yet.</ThemedText></Card>}

      {items.map(item => (
        <Card key={item.id} style={{ marginBottom: 12 }}>
          <ThemedText type="smallBold">{`${item.icon} ${item.title}`}</ThemedText>
          {item.lines.map((l, i) => <ThemedText key={i} type="small" accessibilityLiveRegion="polite">{l}</ThemedText>)}
          {item.time ? <ThemedText type="small" themeColor="textSecondary">{timeAgo(item.time)}</ThemedText> : null}
        </Card>
      ))}
    </Screen>
  );
}