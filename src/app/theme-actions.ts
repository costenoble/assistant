"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/session";
import { THEME_COOKIE, parseTheme } from "@/lib/theme/theme";

/** Thème choisi (toi ou un membre), gardé dans un cookie sur cet appareil. */
export async function setThemeAction(value: string) {
  if (!(await getSessionUser())) return;
  (await cookies()).set(THEME_COOKIE, parseTheme(value), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  revalidatePath("/", "layout");
}
