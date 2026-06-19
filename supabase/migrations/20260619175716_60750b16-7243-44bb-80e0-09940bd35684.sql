
CREATE TABLE public.warning_letters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  letter_url TEXT NOT NULL UNIQUE,
  posted_date TEXT,
  issue_date TEXT,
  company_name TEXT NOT NULL,
  issuing_office TEXT,
  subject TEXT,
  excerpt TEXT,
  letter_storage_path TEXT,
  response_url TEXT,
  response_storage_path TEXT,
  closeout_url TEXT,
  closeout_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.warning_letters TO anon, authenticated;
GRANT ALL ON public.warning_letters TO service_role;

ALTER TABLE public.warning_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read warning letters"
  ON public.warning_letters FOR SELECT
  USING (true);

CREATE INDEX warning_letters_posted_date_idx ON public.warning_letters (posted_date DESC);
