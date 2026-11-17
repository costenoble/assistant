import Link from "next/link";
import { IconBell } from "../icons";

/** Cloche : nombre de notifications non lues. */
export function Bell({ unread }: { unread: number }) {
  return (
    <Link href="/notifications" aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"} className="icon-btn relative">
      <IconBell className="size-[18px]" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-critical px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>
      )}
    </Link>
  );
}
