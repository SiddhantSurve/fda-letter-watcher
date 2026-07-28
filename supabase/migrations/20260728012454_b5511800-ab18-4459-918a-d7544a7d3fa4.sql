
CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_new_warning BOOLEAN NOT NULL DEFAULT true,
  email_new_untitled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.letter_notifications_sent (
  letter_id UUID NOT NULL REFERENCES public.warning_letters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (letter_id, user_id)
);
GRANT ALL ON public.letter_notifications_sent TO service_role;
ALTER TABLE public.letter_notifications_sent ENABLE ROW LEVEL SECURITY;
-- no policies: service-role only
