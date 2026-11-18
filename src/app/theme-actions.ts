"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { THEME_COOKIE, parseTheme } from "@/lib/theme/theme";

export async function setThemeAction(value: string) {
  await requireOwner();
  (await cookies()).set(THEME_COOKIE, parseTheme(value), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
  revalidatePath("/", "layout");
}
