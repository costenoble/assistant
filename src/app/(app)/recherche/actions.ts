"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { searchAll } from "@/lib/search/queries";

export async function searchAction(q: string) {
  const { db } = await requireOwner();
  return searchAll(db, z.string().max(200).parse(q));
}
