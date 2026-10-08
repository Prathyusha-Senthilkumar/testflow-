import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { AppNotification } from "@/lib/api";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import type { NotificationTab } from "@/hooks/useNotifications";

const NOW = new Date("2026-10-08T15:00:00Z");
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

const items: AppNotification[] = [
  { id: "n1", type: "run_failed", severity: "error", title: "TC-007 Open assessments failed", body: "Timed out after 30000 ms waiting for locator 'button:has-text(\"Apply\")'.", link: "/projects/p1/results/r1", projectId: "p1", projectName: "Evolv", read: false, createdAt: at(4) },
  { id: "n2", type: "batch_completed", severity: "success", title: "Suite “Login & Authentication” finished", body: "6 passed · 0 failed in 1m 42s.", link: "/runs/batches/b1", projectId: "p1", projectName: "Evolv", read: false, createdAt: at(38) },
  { id: "n3", type: "auth_profile_attention", severity: "warning", title: "Auth profile “QA admin” session expires soon", body: "Renew the session to keep scheduled runs working.", link: "/projects/p1/auth-profiles", projectId: "p1", projectName: "Evolv", read: false, createdAt: at(95) },
  { id: "n4", type: "run_passed", severity: "success", title: "TC-002 Check curricula button passed", body: null, link: "/projects/p1/results/r2", projectId: "p1", projectName: "Evolv", read: true, createdAt: at(60 * 20) },
  { id: "n5", type: "system", severity: "info", title: "Worker updated to 1.4.0", body: "Runs now reuse warm browser contexts.", link: null, read: true, createdAt: at(60 * 50) },
];

function Panel(props: Partial<React.ComponentProps<typeof NotificationsPanel>>) {
  const [tab, setTab] = useState<NotificationTab>("all");
  return (
    <div className="w-[380px] overflow-hidden rounded-md border border-border bg-popover shadow-float">
      <NotificationsPanel
        tab={tab}
        onTabChange={setTab}
        items={items}
        unreadCount={3}
        now={NOW}
        onOpen={fn()}
        onMarkRead={fn()}
        onDismiss={fn()}
        onMarkAllRead={fn()}
        onLoadMore={fn()}
        {...props}
      />
    </div>
  );
}

const meta = {
  title: "Attest/Notifications/Panel",
  component: Panel,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hover an item to reveal "Mark as read" and "Dismiss". */
export const UnreadMix: Story = { args: { hasMore: true } };
export const AllRead: Story = { args: { items: items.map((item) => ({ ...item, read: true })), unreadCount: 0 } };
export const Empty: Story = { args: { items: [], unreadCount: 0 } };
export const Loading: Story = { args: { items: [], loading: true } };
export const Error: Story = { args: { items: [], error: "Could not reach the API." } };
export const LoadingMore: Story = { args: { hasMore: true, loadingMore: true } };
