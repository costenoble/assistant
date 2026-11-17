import { describe, expect, it } from "vitest";
import { renderEmailHtml, senderFrom } from "./template";

describe("gabarit des emails envoyés", () => {
  it("expéditeur : « Cockpit » par défaut, nom de MAIL_FROM ou MAIL_FROM_NAME sinon", () => {
    expect(senderFrom("ryan.costenoble@cstlab.dev")).toEqual({ name: "Cockpit", address: "ryan.costenoble@cstlab.dev" });
    expect(senderFrom("ryan.costenoble@cstlab.dev", "CST Lab")).toEqual({ name: "CST Lab", address: "ryan.costenoble@cstlab.dev" });
    expect(senderFrom('"Atelier Ryan" <contact@ryan.dev>')).toEqual({ name: "Atelier Ryan", address: "contact@ryan.dev" });
    expect(senderFrom("<contact@ryan.dev>")).toEqual({ name: "Cockpit", address: "contact@ryan.dev" });
  });

  it("paragraphes, citation, bouton, lien de secours et pied de page, tout échappé", () => {
    const html = renderEmailHtml(
      {
        subject: "À valider : Export <CSV>",
        paragraphs: ["Bonjour Marc,", "La tâche « Export » est prête."],
        quote: "C'est en ligne\nsur la préproduction <b>",
        link: { url: "https://app.test/portail/demandes/1?a=1&b=2", label: "Ouvrir la tâche" },
        footer: "Ouvrez la tâche pour la valider.",
      },
      "Ryan Costenoble",
    );
    expect(html).toContain("<title>À valider : Export &lt;CSV&gt;</title>");
    expect(html).toContain("Bonjour Marc,");
    expect(html).toContain("C&#39;est en ligne<br>sur la préproduction &lt;b&gt;");
    expect(html).toContain('href="https://app.test/portail/demandes/1?a=1&amp;b=2"');
    expect(html).toContain(">Ouvrir la tâche</a>");
    expect(html).toContain("Ouvrez la tâche pour la valider.");
    expect(html).toContain("Ryan Costenoble");
    // Texte d'aperçu (préheader) : la première phrase utile, pas « Bonjour ».
    expect(html).toMatch(/opacity:0;color:transparent">La tâche « Export » est prête\.<\/div>/);
  });
});
