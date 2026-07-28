import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/api/letter-pdf/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: letter, error } = await supabaseAdmin
          .from("warning_letters")
          .select("id, company_name, subject, issuing_office, posted_date, issue_date, letter_url, letter_storage_path")
          .eq("id", params.id)
          .single();
        if (error || !letter) return new Response("Not found", { status: 404 });

        const { getLetterText } = await import("@/lib/letter-context.server");
        const text = await getLetterText({
          letterUrl: letter.letter_url,
          storagePath: letter.letter_storage_path,
        });

        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

        const pageSize: [number, number] = [612, 792];
        const margin = 54;
        const maxWidth = pageSize[0] - margin * 2;

        const wrap = (str: string, f: typeof font, size: number): string[] => {
          const lines: string[] = [];
          for (const paragraph of str.split(/\n+/)) {
            const words = paragraph.split(/\s+/);
            let line = "";
            for (const w of words) {
              const test = line ? line + " " + w : w;
              if (f.widthOfTextAtSize(test, size) > maxWidth) {
                if (line) lines.push(line);
                line = w;
              } else {
                line = test;
              }
            }
            if (line) lines.push(line);
            lines.push("");
          }
          return lines;
        };

        // Sanitize: WinAnsi-safe (Helvetica doesn't support arbitrary unicode)
        const sanitize = (s: string) =>
          s
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, "-")
            .replace(/\u2026/g, "...")
            .replace(/[^\x00-\x7F]/g, "");

        let page = pdf.addPage(pageSize);
        let y = pageSize[1] - margin;

        const draw = (str: string, f: typeof font, size: number, color = rgb(0, 0, 0)) => {
          const lines = wrap(sanitize(str), f, size);
          for (const line of lines) {
            if (y < margin + size) {
              page = pdf.addPage(pageSize);
              y = pageSize[1] - margin;
            }
            page.drawText(line, { x: margin, y, size, font: f, color });
            y -= size * 1.35;
          }
        };

        draw(letter.company_name, bold, 16);
        if (letter.subject) draw(letter.subject, font, 11, rgb(0.3, 0.3, 0.3));
        const meta: string[] = [];
        if (letter.posted_date) meta.push(`Posted: ${letter.posted_date}`);
        if (letter.issue_date) meta.push(`Issued: ${letter.issue_date}`);
        if (letter.issuing_office) meta.push(letter.issuing_office);
        if (meta.length) draw(meta.join(" · "), font, 9, rgb(0.4, 0.4, 0.4));
        draw(`Source: ${letter.letter_url}`, font, 8, rgb(0.4, 0.4, 0.7));
        y -= 10;

        if (text) {
          draw(text, font, 10);
        } else {
          draw("Full letter text is not available in text form. Please refer to the source URL above.", font, 10);
        }

        const bytes = await pdf.save();
        const safeName = letter.company_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "letter";

        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
