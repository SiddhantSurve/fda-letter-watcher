import * as cheerio from "cheerio";

const FDA_BASE = "https://www.fda.gov";
const LIST_URL =
  "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters";

export interface ScrapedRow {
  letter_url: string;
  posted_date: string;
  issue_date: string;
  company_name: string;
  issuing_office: string;
  subject: string;
  excerpt: string;
  response_url: string | null;
  closeout_url: string | null;
}

function absolutize(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return FDA_BASE + href;
  return null;
}

export async function fetchListing(): Promise<ScrapedRow[]> {
  const res = await fetch(LIST_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Lovable FDA Letter Tracker)" },
  });
  if (!res.ok) throw new Error(`FDA list fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows: ScrapedRow[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 7) return;
    const companyCell = $(tds[2]);
    const link = companyCell.find("a").attr("href");
    const letter_url = absolutize(link);
    if (!letter_url) return;
    const response_url = absolutize($(tds[5]).find("a").attr("href"));
    const closeout_url = absolutize($(tds[6]).find("a").attr("href"));
    rows.push({
      letter_url,
      posted_date: $(tds[0]).text().trim(),
      issue_date: $(tds[1]).text().trim(),
      company_name: companyCell.text().trim(),
      issuing_office: $(tds[3]).text().trim(),
      subject: $(tds[4]).text().trim(),
      excerpt: tds.length > 7 ? $(tds[7]).text().trim() : "",
      response_url,
      closeout_url,
    });
  });

  return rows;
}

export async function fetchBinary(url: string): Promise<{ body: Uint8Array; contentType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Lovable FDA Letter Tracker)" },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { body: buf, contentType };
}

export function slugifyFromUrl(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || crypto.randomUUID();
}
