import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { anthropicKey } from "@/lib/env";
import { TASK_PRIORITIES, type MeetingProposal } from "@/lib/db/types";

/**
 * Analyse d'une réunion par Claude : titre, résumé, décisions, tâches.
 * Claude répond en JSON contraint par un schéma ; les noms de personnes et de
 * projets sont ensuite rapprochés des membres et projets de l'espace (mapAnalysis).
 */

export const MODEL = "claude-opus-5-5";

export const AnalysisSchema = z.object({
  title: z.string().describe("Titre court de la réunion, 3 à 8 mots"),
  summary: z.string().describe("Résumé en 3 à 8 phrases, en français"),
  decisions: z.array(z.string()).describe("Décisions prises, une phrase chacune"),
  tasks: z.array(
    z.object({
      title: z.string().describe("Action à faire, à l'infinitif, moins de 80 caractères"),
      description: z.string().describe("Contexte utile tiré de la réunion ; chaîne vide si rien à ajouter"),
      priority: z.enum(TASK_PRIORITIES),
      assignee: z.string().describe("« moi » pour l'utilisateur, le nom exact d'un membre listé, ou chaîne vide"),
      project: z.string().describe("Nom exact d'un projet listé, ou chaîne vide"),
      due_on: z.string().describe("Échéance AAAA-MM-JJ si une date a été dite, sinon chaîne vide"),
      labels: z.array(z.string()).describe("0 à 3 étiquettes courtes en minuscules (ex. bug, ux, backend)"),
    }),
  ),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export interface AnalysisContext {
  workspace: string;
  members: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  /** Date du jour (AAAA-MM-JJ, Paris) pour interpréter « vendredi », « la semaine prochaine ». */
  today: string;
}

const SYSTEM = `Tu aides un développeur freelance à exploiter ses réunions avec ses clients.
On te donne la transcription brute d'une réunion, produite par la reconnaissance vocale du navigateur : elle contient des fautes, des mots mal reconnus, et n'indique pas qui parle. Déduis le sens du contexte.

Ce que tu produis :
- un titre et un résumé fidèles, en français, sans rien inventer ;
- les décisions effectivement prises ;
- les tâches concrètes qui ressortent de la réunion : ce qu'il faut faire ensuite, par qui. Ne crée pas de tâche pour une simple idée évoquée puis écartée, ni pour ce qui est déjà fait. Regroupe les doublons.

Pour chaque tâche :
- assignee : « moi » quand c'est au développeur de la faire (cas le plus fréquent : développement, correction, livraison) ; le nom exact d'un membre listé quand c'est à lui (fournir un contenu, valider, tester) ; vide si personne n'est désigné.
- project : le nom exact d'un projet listé si la tâche le concerne clairement, sinon vide.
- priority : urgent seulement si quelque chose est bloqué ou en panne ; high si c'est demandé en priorité ; none si rien n'est dit.
- due_on : seulement si une échéance a été dite ; convertis les dates relatives à partir de la date du jour.
Si la transcription est vide ou inexploitable, dis-le dans le résumé et ne propose aucune tâche.`;

export function buildUserPrompt(transcript: string, ctx: AnalysisContext) {
  const list = (xs: { name: string }[]) => (xs.length ? xs.map((x) => `- ${x.name}`).join("\n") : "(aucun)");
  return `Espace de travail : ${ctx.workspace}
Date du jour : ${ctx.today}

Membres de l'espace :
${list(ctx.members)}

Projets de l'espace :
${list(ctx.projects)}

<transcription>
${transcript}
</transcription>`;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Rapproche un nom cité d'un élément de la liste : égalité, puis prénom ou inclusion, sans ambiguïté. */
function match<T extends { name: string }>(raw: string, xs: T[]): T | null {
  const q = norm(raw);
  if (!q) return null;
  const exact = xs.filter((x) => norm(x.name) === q);
  if (exact.length === 1) return exact[0]!;
  const loose = xs.filter((x) => {
    const n = norm(x.name);
    return n.includes(q) || q.includes(n) || n.split(" ")[0] === q;
  });
  return loose.length === 1 ? loose[0]! : null;
}

/** Transforme la réponse de Claude en propositions rattachées aux vrais membres et projets. */
export function mapAnalysis(a: Analysis, ctx: AnalysisContext): { title: string; summary: string; decisions: string[]; proposals: MeetingProposal[] } {
  const proposals = a.tasks
    .filter((t) => t.title.trim())
    .slice(0, 30)
    .map((t): MeetingProposal => {
      const who = norm(t.assignee);
      const assignee = ["moi", "me", "toi", "owner"].includes(who) ? "owner" : (match(t.assignee, ctx.members)?.id ?? null);
      return {
        title: t.title.trim().slice(0, 200),
        description: t.description.trim(),
        priority: t.priority,
        assignee,
        project_id: match(t.project, ctx.projects)?.id ?? null,
        due_on: /^\d{4}-\d{2}-\d{2}$/.test(t.due_on) && !Number.isNaN(Date.parse(t.due_on)) ? t.due_on : null,
        labels: [...new Set(t.labels.map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 3),
        ticket_id: null,
      };
    });
  return {
    title: a.title.trim().slice(0, 120),
    summary: a.summary.trim(),
    decisions: a.decisions.map((d) => d.trim()).filter(Boolean),
    proposals,
  };
}

export class AnalysisError extends Error {}

/** Appel à Claude. Lève AnalysisError avec un message lisible par l'utilisateur. */
export async function analyzeTranscript(transcript: string, ctx: AnalysisContext) {
  const apiKey = anthropicKey();
  if (!apiKey) throw new AnalysisError("La clé de l'API Claude n'est pas configurée (ANTHROPIC_API_KEY).");
  const client = new Anthropic({ apiKey });
  let response;
  try {
    // Non streamé : la sortie reste courte (16k tokens max) ; la page autorise 5 minutes.
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Analyse fidèle d'un long texte : un peu plus de réflexion que le défaut (medium).
      output_config: { effort: "high", format: betaZodOutputFormat(AnalysisSchema) },
      // Si un filtre de sécurité refuse la demande (faux positif), l'API la relance sur un autre modèle.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: buildUserPrompt(transcript, ctx) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AnalysisError("Clé de l'API Claude refusée : vérifie ANTHROPIC_API_KEY.");
    if (err instanceof Anthropic.RateLimitError) throw new AnalysisError("Trop de demandes à Claude pour l'instant : réessaie dans une minute.");
    if (err instanceof Anthropic.BadRequestError) throw new AnalysisError(`Demande refusée par l'API Claude : ${err.message}`);
    if (err instanceof Anthropic.APIError) throw new AnalysisError(`Erreur de l'API Claude (${err.status ?? "réseau"}). Réessaie.`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new AnalysisError("Claude a refusé d'analyser cette transcription.");
  if (response.stop_reason === "max_tokens") throw new AnalysisError("Réponse de Claude tronquée : la réunion est peut-être trop longue.");
  if (!response.parsed_output) throw new AnalysisError("Réponse de Claude illisible. Réessaie.");
  return mapAnalysis(response.parsed_output, ctx);
}
