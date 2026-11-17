import { describe, expect, it } from "vitest";
import { countRemoteImages, emailDocument, extractContent, parseSource, stripActiveContent, textToHtml } from "./message";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const multipart = [
  "From: Claire Leroy <claire@cabinet-leroy.fr>",
  "To: contact@ryan.dev",
  "Cc: Paul <paul@cabinet-leroy.fr>, compta@cabinet-leroy.fr",
  "Subject: Devis",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="mix"',
  "",
  "--mix",
  'Content-Type: multipart/related; boundary="rel"',
  "",
  "--rel",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p onclick="steal()">Bonjour <b>Ryan</b></p><script>alert(1)</script><img src="cid:logo@x"><img src="https://tracker.example/p.gif"><a href="javascript:evil()">x</a>',
  "--rel",
  "Content-Type: image/png",
  "Content-ID: <logo@x>",
  "Content-Transfer-Encoding: base64",
  "",
  PNG.toString("base64"),
  "--rel--",
  "--mix",
  'Content-Type: application/pdf; name="devis.pdf"',
  'Content-Disposition: attachment; filename="devis.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("%PDF-1.4 faux").toString("base64"),
  "--mix--",
  "",
].join("\r\n");

describe("contenu d'un mail", () => {
  it("HTML nettoyé, image intégrée recopiée, pièce jointe et copies listées", async () => {
    const c = extractContent(await parseSource(multipart));
    expect(c.cc).toEqual(["paul@cabinet-leroy.fr", "compta@cabinet-leroy.fr"]);
    expect(c.html).toContain("Bonjour <b>Ryan</b>");
    expect(c.html).not.toMatch(/<script|onclick|javascript:/i);
    expect(c.html).toContain("src=\"data:image/png;base64,");
    expect(c.html).not.toContain("cid:logo@x");
    expect(c.attachments).toEqual([{ index: 1, filename: "devis.pdf", contentType: "application/pdf", size: expect.any(Number) }]);
    expect(countRemoteImages(c.html)).toBe(1);
  });

  it("texte brut : liens cliquables, citations repérées, HTML échappé", () => {
    const h = textToHtml("Voir https://exemple.fr/page.\n> ancien message <b>\nFin");
    expect(h).toContain('<a href="https://exemple.fr/page">https://exemple.fr/page</a>.');
    expect(h).toContain('<span class="q">&gt; ancien message &lt;b&gt;</span>');
  });

  it("document d'affichage : rien d'extérieur sans accord, images distantes sur demande", () => {
    const blocked = emailDocument({ html: "<p>x</p>", text: null }, { images: false });
    expect(blocked).toContain("default-src 'none'");
    expect(blocked).toContain('img-src data: cid:">');
    expect(blocked).toContain('<base target="_blank">');
    expect(emailDocument({ html: "<p>x</p>", text: null }, { images: true })).toContain("img-src data: cid: https: http:");
    expect(emailDocument({ html: null, text: "Salut <toi>" }, { images: false })).toContain('<pre class="plain">Salut &lt;toi&gt;</pre>');
  });

  it("images distantes neutralisées tant qu'on ne les demande pas", () => {
    const html = `<img src="https://t.example/p.gif"><img alt="x" src='http://a.example/b.png' srcset="https://a.example/b2.png 2x"><td background="https://a.example/bg.jpg"><div style="background:url('https://a.example/c.png')">x</div><img src="data:image/png;base64,AAAA">`;
    const blocked = emailDocument({ html, text: null }, { images: false });
    expect(blocked).not.toMatch(/\s(src|srcset|background)=["']?https?:/i);
    expect(blocked).not.toMatch(/url\(\s*["']?https?:/i);
    expect(blocked).toContain('src="data:image/png;base64,AAAA"');
    expect(emailDocument({ html, text: null }, { images: true })).toContain('src="https://t.example/p.gif"');
  });

  it("iframes, formulaires et objets retirés", () => {
    expect(stripActiveContent('<iframe src="x">a</iframe><form action="y"><input>texte</form><embed src="z"/><meta http-equiv="refresh">ok')).toBe("texteok");
  });
});
