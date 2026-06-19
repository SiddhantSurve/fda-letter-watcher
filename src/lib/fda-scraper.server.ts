const FDA_BASE = "https://www.fda.gov";
const AJAX = "https://www.fda.gov/datatables/views/ajax";

export interface ListingRow {
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

function abs(href: string | null | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return FDA_BASE + href;
  return null;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function extractHref(html: string): string | null {
  const m = html.match(/href="([^"]+)"/);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

async function fetchPage(start: number, length: number): Promise<{ total: number; data: string[][] }> {
  const url = `${AJAX}?_drupal_ajax=1&_wrapper_format=drupal_ajax&pager_element=0&view_name=warning_letter_solr_index&view_display_id=warning_letter_solr_block&view_path=/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters&view_dom_id=x&length=${length}&start=${start}&draw=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Lovable FDA Letter Tracker)",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  if (!res.ok) throw new Error(`FDA list fetch failed: ${res.status}`);
  const json = await res.json() as { recordsTotal: number; data: string[][] };
  return { total: json.recordsTotal, data: json.data };
}

export async function fetchAllListings(): Promise<ListingRow[]> {
  const pageSize = 500;
  const first = await fetchPage(0, pageSize);
  const rows: ListingRow[] = [];
  const all: string[][] = [...first.data];
  for (let start = pageSize; start < first.total; start += pageSize) {
    const p = await fetchPage(start, pageSize);
    all.push(...p.data);
  }
  for (const r of all) {
    const letter_url = abs(extractHref(r[2]));
    if (!letter_url) continue;
    rows.push({
      letter_url,
      posted_date: stripTags(r[0]),
      issue_date: stripTags(r[1]),
      company_name: stripTags(r[2]),
      issuing_office: stripTags(r[3]),
      subject: stripTags(r[4]),
      response_url: abs(extractHref(r[5])),
      closeout_url: abs(extractHref(r[6])),
      excerpt: stripTags(r[7] ?? ""),
    });
  }
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
