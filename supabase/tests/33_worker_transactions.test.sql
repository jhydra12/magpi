begin;
create extension if not exists pgtap with schema extensions;
select plan(19);
select public.set_dream_execution_mode('compute');
insert into auth.users(id,email,instance_id,aud,role) values
('a3000000-0000-4000-8000-000000000001','worker-transactions@test.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated');
create temp table scope as select s.id space_id,s.org_id from public.spaces s join public.space_members m on m.space_id=s.id where m.user_id='a3000000-0000-4000-8000-000000000001' limit 1;
create temp table input as select jsonb_build_object('org_id',org_id,'space_id',space_id,'storage_path',space_id::text || '/test.md','title','Atomic','origin','upload') doc from scope;
create temp table queued as select q.* from input i, lateral public.enqueue_document(i.doc) q;
select is((select count(*) from queued),1::bigint,'document and job created');
select is((select document_id from public.enqueue_document((select doc from input))),(select document_id from queued),'replay uses same document');
select is((select ingest_job_id from public.enqueue_document((select doc from input))),(select ingest_job_id from queued),'replay uses same active job');
update public.ingest_jobs set status='succeeded' where id=(select ingest_job_id from queued);
select isnt((select ingest_job_id from public.enqueue_document((select doc from input),true)),(select ingest_job_id from queued),'changed source queues a new job');
select is((select count(*) from public.documents where id=(select document_id from queued)),1::bigint,'requeue does not duplicate document');
insert into public.chunks(org_id,space_id,document_id,ordinal,content,token_count,embedding)
select org_id,space_id,(select document_id from queued),0,'original',1,('[' || array_to_string(array_fill(0.1::real,array[1536]),',') || ']')::extensions.vector from scope;
insert into public.entities(org_id,space_id,kind,name,canonical_name) select org_id,space_id,'person','Alice','alice' from scope;
insert into public.entity_mentions(entity_id,document_id,chunk_id,space_id)
select e.id,c.document_id,c.id,c.space_id from public.entities e join public.chunks c on c.space_id=e.space_id join scope s on s.space_id=c.space_id;
select throws_ok(format('select public.replace_document_chunks(%L, %L::jsonb, %L::jsonb)',(select document_id from queued),'[{"ordinal":0,"content":"changed","token_count":1,"embedding":[0.1]}]','{}'),'22000',null,'invalid replacement fails');
select is((select content from public.chunks where document_id=(select document_id from queued)),'original','failed transaction keeps old chunk');
select is((select count(*) from public.entity_mentions where document_id=(select document_id from queued)),1::bigint,'failed transaction keeps graph evidence');
select public.replace_document_chunks((select document_id from queued),(select jsonb_agg(jsonb_build_object('ordinal',ordinal,'content',content,'token_count',token_count,'embedding',embedding::text::jsonb)) from public.chunks where document_id=(select document_id from queued)),'{"content_hash":"same"}');
select is((select count(*) from public.entity_mentions where document_id=(select document_id from queued)),1::bigint,'unchanged chunks preserve mentions');
-- A queue insertion failure must roll back the document created in the same RPC.
create function pg_temp.reject_test_ingest() returns trigger language plpgsql as $$
begin raise exception 'injected queue failure'; end; $$;
create trigger reject_test_ingest before insert on public.ingest_jobs for each row execute function pg_temp.reject_test_ingest();
select throws_ok(format('select public.enqueue_document(%L::jsonb)',(select jsonb_set(doc,'{storage_path}','"rollback.md"')::text from input)),'P0001','injected queue failure','job failure aborts enqueue');
select is((select count(*) from public.documents where storage_path='rollback.md'),0::bigint,'job failure leaves no orphan document');
drop trigger reject_test_ingest on public.ingest_jobs;
select is((select count(*) from public.enqueue_document((select jsonb_set(doc,'{storage_path}','"rollback.md"') from input))),1::bigint,'retry creates one document with a job');
-- Changing one chunk removes only its mentions; unchanged evidence remains connected.
insert into public.chunks(org_id,space_id,document_id,ordinal,content,token_count,embedding)
select org_id,space_id,document_id,1,'unchanged',token_count,embedding from public.chunks where document_id=(select document_id from queued);
insert into public.entity_mentions(entity_id,document_id,chunk_id,space_id)
select e.id,c.document_id,c.id,c.space_id from public.entities e join public.chunks c on c.space_id=e.space_id join scope s on s.space_id=c.space_id where c.ordinal=1;
select public.replace_document_chunks((select document_id from queued),(select jsonb_agg(jsonb_build_object('ordinal',ordinal,'content',case when ordinal=0 then 'replacement' else content end,'token_count',token_count,'embedding',embedding::text::jsonb)) from public.chunks where document_id=(select document_id from queued)),'{"content_hash":"changed"}');
select is((select count(*) from public.entity_mentions where document_id=(select document_id from queued)),1::bigint,'changed chunk loses only its own mention');
select is((select c.content from public.entity_mentions m join public.chunks c on c.id=m.chunk_id where m.document_id=(select document_id from queued)),'unchanged','unchanged chunk retains its original mention');
select is((select content from public.chunks where document_id=(select document_id from queued) and ordinal=0),'replacement','changed content commits successfully');
create temp table dreams as select r.id from scope s,lateral public.enqueue_dream(s.org_id,s.space_id,'a3000000-0000-4000-8000-000000000001',array['entities','digest','connections']::public.dream_kind[]) r;
select is((select count(*) from dreams),3::bigint,'all three tasks enqueued together');
select is((select count(*) from scope s,lateral public.enqueue_dream(s.org_id,s.space_id,'a3000000-0000-4000-8000-000000000001',array['entities','digest','connections']::public.dream_kind[]) r),3::bigint,'duplicate submission reuses active tasks');
-- Isolate the test queue from fixtures without persisting any changes.
update public.dream_runs set status='failed',error='test isolation',finished_at=now() where id not in(select id from dreams) and status='queued';
select is((select count(*) from public.claim_dream_runs(2)),2::bigint,'first worker atomically claims its capacity');
select is((select count(*) from public.claim_dream_runs(2)),1::bigint,'second worker claims only remaining work');
select * from finish();
rollback;
