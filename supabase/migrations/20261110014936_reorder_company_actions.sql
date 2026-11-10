-- One validated transaction changes the complete order. Public clients cannot
-- move actions belonging to another company or silently overwrite a stale list.
CREATE OR REPLACE FUNCTION public.reorder_company_actions(p_company_id uuid, p_action_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
  supplied_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_edit_company(p_company_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para organizar estes botões.' USING ERRCODE = '42501';
  END IF;
  -- Serializes reorder requests and blocks concurrent inserts referencing the
  -- company until the order transaction finishes.
  PERFORM id FROM public.companies WHERE id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '42501'; END IF;
  PERFORM id FROM public.actions WHERE company_id=p_company_id ORDER BY id FOR UPDATE;
  SELECT count(*) INTO current_count FROM public.actions WHERE company_id=p_company_id;
  supplied_count := coalesce(cardinality(p_action_ids), 0);
  IF p_action_ids IS NULL OR array_position(p_action_ids, NULL) IS NOT NULL
    OR supplied_count <> (SELECT count(DISTINCT action_id) FROM unnest(p_action_ids) action_id)
    OR supplied_count <> current_count
    OR EXISTS (
      SELECT 1 FROM unnest(p_action_ids) requested(action_id)
      WHERE NOT EXISTS (SELECT 1 FROM public.actions a WHERE a.id=requested.action_id AND a.company_id=p_company_id)
    ) THEN
    RAISE EXCEPTION 'A lista de botões mudou. Atualize a página e tente novamente.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.actions a SET position=ordered.ordinality::integer-1, updated_at=now()
  FROM unnest(p_action_ids) WITH ORDINALITY AS ordered(id, ordinality)
  WHERE a.id=ordered.id AND a.company_id=p_company_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_company_actions(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_company_actions(uuid,uuid[]) TO authenticated;
