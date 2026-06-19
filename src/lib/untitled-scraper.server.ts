// Scraper for FDA Untitled Letters (Office of Prescription Drug Promotion)
// Page: https://www.fda.gov/drugs/warning-letters-and-notice-violation-letters-pharmaceutical-companies/untitled-letters
// The page renders the data inline in a single HTML table — no AJAX endpoint.

const SOURCE_URL =
  "https://www.fda.gov/drugs/warning-letters-and-notice-violation-letters-pharmaceutical-companies/untitled-letters";

export interface UntitledRow {
  letter_url: string;         // PDF URL of the Untitled Letter
  issue_date: string;          // "5/26/2026"
  posted_date: string;         // same as issue_date (page has only one date)
  company_name: string;
  subject: string;             // Product / Issue column
  issuing_office: string;      // constant for this page
  excerpt: string;             // promotional material link description if any
  response_url: string | null;
  closeout_url: string | null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function findFirstPdfHref(html: string, labelRegex: RegExp): string | null {
  // Find an <a href="..."> whose visible text matches the regex
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = stripTags(m[2]);
    if (labelRegex.test(text)) return m[1].replace(/&amp;/g, "&");
  }
  return null;
}

export async function fetchUntitledListings(): Promise<UntitledRow[]> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Lovable FDA Letter Tracker)" },
  });
  if (!res.ok) throw new Error(`Untitled page fetch failed: ${res.status}`);
  const html = await res.text();

  // Grab the OPDP Untitled Letters table
  const tableMatch =
    html.match(/<table[^>]*summary="Untitled Letters[^"]*"[\s\S]*?<\/table>/i) ??
    html.match(/<table[^>]*class="table table-striped"[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const table = tableMatch[0];

  const absolutize = (u: string) =>
    u.startsWith("http") ? u : `https://www.fda.gov${u.startsWith("/") ? "" : "/"}${u}`;

  const rows: UntitledRow[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRe.exec(table))) {
    const inner = r[1];
    if (/<th\b/i.test(inner)) continue; // header
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let c;
    while ((c = cellRe.exec(inner))) cells.push(c[1]);
    if (cells.length < 5) continue;

    const [dateCell, companyCell, productCell, responseCell, closeoutCell] = cells;
    const date = stripTags(dateCell);

    // Company cell holds the company name (first <p>) + a list of PDF links
    const companyP = companyCell.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const company = stripTags(companyP ? companyP[1] : companyCell.split("<ul")[0]);
    const letterUrlRaw = findFirstPdfHref(companyCell, /untitled letter/i);
    if (!letterUrlRaw) continue;
    const letterUrl = absolutize(letterUrlRaw);


    const promoUrl = findFirstPdfHref(companyCell, /promotional/i);
    const product = stripTags(productCell);
    const responseUrl = findFirstPdfHref(responseCell, /response/i);
    const closeoutUrl = findFirstPdfHref(closeoutCell, /close-?out/i);

    rows.push({
      letter_url: letterUrl,
      issue_date: date,
      posted_date: date,
      company_name: company,
      subject: product,
      issuing_office: "Office of Prescription Drug Promotion",
      excerpt: promoUrl ? `Promotional material: ${promoUrl}` : "",
      response_url: responseUrl,
      closeout_url: closeoutUrl,
    });
  }
  return rows;
}
