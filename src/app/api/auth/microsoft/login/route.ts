import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireOwner } from "@/lib/auth/require-owner";
import { buildAuthorizeUrl } from "@/lib/microsoft/oauth";

export async function GET() {
  await requireOwner();
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth/microsoft",
  });
  return response;
}
