
ALTER TABLE public.warning_letters ADD COLUMN IF NOT EXISTS letter_kind text NOT NULL DEFAULT 'warning';
ALTER TABLE public.chat_threads ADD COLUMN IF NOT EXISTS letter_kind text NOT NULL DEFAULT 'warning';
CREATE INDEX IF NOT EXISTS warning_letters_kind_idx ON public.warning_letters(letter_kind);
CREATE INDEX IF NOT EXISTS chat_threads_kind_idx ON public.chat_threads(letter_kind);
