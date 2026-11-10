BEGIN;
INSERT INTO public.companies(id,name,slug,phone,whatsapp,phone_enabled,whatsapp_enabled)
VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','Analytics contact fixture','analytics-contact-fixture-1eaa95ef','61999999999','61999999999',true,false);
INSERT INTO public.subscriptions(company_id,status,expires_at)
VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','active',now()+interval '1 day');
INSERT INTO public.actions(id,company_id,type,label,url)
VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967002','1eaa95ef-5038-4772-bf92-9f5a79967001','custom','Fixture button','https://example.invalid');
SET LOCAL ROLE anon;
INSERT INTO public.analytics_events(company_id,event_type,contact_type)
VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click','phone'),
('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click','phone_copy');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.analytics_events(company_id,event_type,contact_type)
    VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click','whatsapp');
    RAISE EXCEPTION 'Disabled WhatsApp contact was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.analytics_events(company_id,event_type)
    VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click');
    RAISE EXCEPTION 'Click without a target was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.analytics_events(company_id,event_type,contact_type)
    VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','page_view','phone');
    RAISE EXCEPTION 'Contact attached to page view was accepted';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.analytics_events(company_id,event_type,action_id,contact_type)
    VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click','1eaa95ef-5038-4772-bf92-9f5a79967002','phone');
    RAISE EXCEPTION 'A contact and action target were accepted together';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.analytics_events(company_id,event_type,contact_type)
    VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click','61999999999');
    RAISE EXCEPTION 'A personal phone number was accepted as a category';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE public.companies SET whatsapp_enabled=true
WHERE id='1eaa95ef-5038-4772-bf92-9f5a79967001';
SET LOCAL ROLE anon;
INSERT INTO public.analytics_events(company_id,event_type,contact_type)
VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click','whatsapp');
RESET ROLE;
-- Existing action clicks may lose their action ID on delete; the nullable
-- category must continue to permit that historical state.
INSERT INTO public.analytics_events(company_id,event_type,action_id,contact_type)
VALUES ('1eaa95ef-5038-4772-bf92-9f5a79967001','action_click',NULL,NULL);
ROLLBACK;
SELECT 'Contact analytics assertions passed; fixtures rolled back' AS result;
