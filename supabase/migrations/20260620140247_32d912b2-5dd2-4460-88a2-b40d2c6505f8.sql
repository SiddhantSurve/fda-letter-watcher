ALTER TABLE public.warning_letters
  ADD COLUMN IF NOT EXISTS posted_on date;

CREATE OR REPLACE FUNCTION public.set_warning_letters_posted_on()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  BEGIN
    NEW.posted_on := to_date(NEW.posted_date, 'FMMM/FMDD/YYYY');
  EXCEPTION WHEN OTHERS THEN
    NEW.posted_on := NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warning_letters_set_posted_on ON public.warning_letters;
CREATE TRIGGER warning_letters_set_posted_on
  BEFORE INSERT OR UPDATE OF posted_date ON public.warning_letters
  FOR EACH ROW EXECUTE FUNCTION public.set_warning_letters_posted_on();

UPDATE public.warning_letters
  SET posted_on = (
    CASE WHEN posted_date ~ '^\d{1,2}/\d{1,2}/\d{4}$'
         THEN to_date(posted_date, 'FMMM/FMDD/YYYY')
         ELSE NULL END
  )
  WHERE posted_on IS NULL;

CREATE INDEX IF NOT EXISTS warning_letters_posted_on_idx
  ON public.warning_letters (posted_on DESC NULLS LAST);