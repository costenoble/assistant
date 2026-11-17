/**
 * Icônes au trait, 16 px, couleur du texte. Décoratives par défaut :
 * le bouton qui les porte doit avoir un aria-label.
 */
type P = { className?: string };
const base = (className?: string) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className,
});

export const IconCheck = ({ className }: P) => <svg {...base(className)}><path d="M3.5 8.5l3 3 6-7" /></svg>;
export const IconClock = ({ className }: P) => <svg {...base(className)}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>;
export const IconPause = ({ className }: P) => <svg {...base(className)}><path d="M6 4v8M10 4v8" /></svg>;
export const IconFlag = ({ className }: P) => <svg {...base(className)}><path d="M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8" /></svg>;
export const IconTask = ({ className }: P) => <svg {...base(className)}><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="M5.5 8l2 2 3-3.5" /></svg>;
export const IconReply = ({ className }: P) => <svg {...base(className)}><path d="M6.5 4L3 7.5 6.5 11" /><path d="M3 7.5h6a4 4 0 014 4V12" /></svg>;
export const IconSync = ({ className }: P) => <svg {...base(className)}><path d="M13 5.5A5.5 5.5 0 003.3 4.8M3 10.5a5.5 5.5 0 009.7.7" /><path d="M13 2.5v3h-3M3 13.5v-3h3" /></svg>;
export const IconPlus = ({ className }: P) => <svg {...base(className)}><path d="M8 3v10M3 8h10" /></svg>;
export const IconArrowLeft = ({ className }: P) => <svg {...base(className)}><path d="M12.5 8h-9M7 4.5L3.5 8 7 11.5" /></svg>;
export const IconLock = ({ className }: P) => <svg {...base(className)}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>;
export const IconEye = ({ className }: P) => <svg {...base(className)}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>;
export const IconExternal = ({ className }: P) => <svg {...base(className)}><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" /></svg>;
export const IconComment = ({ className }: P) => <svg {...base(className)}><path d="M3 3.5h10v7H7l-3 2.5v-2.5H3z" /></svg>;
export const IconBoard = ({ className }: P) => <svg {...base(className)}><rect x="2" y="2.5" width="3.5" height="11" rx="1" /><rect x="6.25" y="2.5" width="3.5" height="7" rx="1" /><rect x="10.5" y="2.5" width="3.5" height="9" rx="1" /></svg>;
export const IconList = ({ className }: P) => <svg {...base(className)}><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" /></svg>;
export const IconPaperclip = ({ className }: P) => <svg {...base(className)}><path d="M10.5 4.5 5.8 9.2a1.5 1.5 0 0 0 2.1 2.1l5-5a3 3 0 0 0-4.2-4.2l-5 5a4.5 4.5 0 0 0 6.4 6.4l4.2-4.2" /></svg>;
export const IconImage = ({ className }: P) => <svg {...base(className)}><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="5.5" cy="6.5" r="1" /><path d="m3 12 3.5-3.5 2.5 2.5 2-2L14 12" /></svg>;
export const IconSparkle = ({ className }: P) => <svg {...base(className)}><path d="M8 1.8 9.3 6l4.2 1.3-4.2 1.3L8 12.8 6.7 8.6 2.5 7.3 6.7 6zM13 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" /></svg>;
export const IconSend = ({ className }: P) => <svg {...base(className)}><path d="M2.5 8 13.5 2.5 10 13.5 7.5 8.5z" /><path d="M7.5 8.5 13.5 2.5" /></svg>;
export const IconBell = ({ className }: P) => <svg {...base(className)}><path d="M4 11.5V7.5a4 4 0 0 1 8 0v4l1 1.5H3z" /><path d="M6.5 14.5a1.6 1.6 0 0 0 3 0" /></svg>;
export const IconHome = ({ className }: P) => <svg {...base(className)}><path d="M2.5 7.5 8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H9.5v-3.5h-3v3.5H3a.5.5 0 0 1-.5-.5z" /></svg>;
export const IconMail = ({ className }: P) => <svg {...base(className)}><rect x="2" y="3.5" width="12" height="9" rx="1.5" /><path d="m2.5 4.5 5.5 4 5.5-4" /></svg>;
export const IconMic = ({ className }: P) => <svg {...base(className)}><rect x="6" y="2" width="4" height="7.5" rx="2" /><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14.5" /></svg>;
export const IconMore = ({ className }: P) => <svg {...base(className)}><path d="M3.5 8h.01M8 8h.01M12.5 8h.01" strokeWidth="2.4" /></svg>;
export const IconSearch = ({ className }: P) => <svg {...base(className)}><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>;
export const IconLogout = ({ className }: P) => <svg {...base(className)}><path d="M6 14H3.5a1 1 0 01-1-1V3a1 1 0 011-1H6M10.5 11L13.5 8l-3-3M13.5 8H6" /></svg>;

/** Marque Cockpit : un cadran. */
export function LogoMark({ className }: P) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className={className}>
      <circle cx="11" cy="11" r="9" />
      <path d="M11 11l5-5" />
      <path d="M11 2v2M20 11h-2M4 11H2" />
    </svg>
  );
}
