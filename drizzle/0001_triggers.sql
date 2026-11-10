-- items : `updated_at` et `completed_at` tenus à jour par la base, quel que
-- soit le code qui écrit (synchros, actions, API d'ingestion).
CREATE FUNCTION touch_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('done', 'archived') AND OLD.status NOT IN ('done', 'archived') THEN
    NEW.completed_at := now();
  ELSIF NEW.status NOT IN ('done', 'archived') THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER items_touch BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION touch_item();
