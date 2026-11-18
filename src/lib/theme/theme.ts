/** Thème de l'espace admin, mémorisé dans un cookie : sombre (par défaut), clair, ou auto (suit l'appareil). */
export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "cockpit-theme";
export const THEME_LABELS: Record<Theme, string> = { dark: "Sombre", light: "Clair", system: "Auto" };

export const parseTheme = (v: string | undefined): Theme => (THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "dark";

/** Classe CSS à poser sur le conteneur de l'espace admin. */
export const themeClass = (t: Theme) => (t === "dark" ? "theme-dark" : t === "system" ? "theme-system" : "");
