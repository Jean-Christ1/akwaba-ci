REVOKE ALL ON FUNCTION public.is_approved_runner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_errand_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_runner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_errand_participant(uuid, uuid) TO authenticated, service_role;