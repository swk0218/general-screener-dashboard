import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from 'node:crypto';
import { encryptEnvelope } from '../src/crypto/envelope.js';
import { ARTIFACT_KIND, encryptBriefingArtifact, readBriefingArtifact } from '../src/features/briefing/briefing-artifact.js';
import { demoRequested } from "../src/features/briefing/demo-gate.js";
import { briefingClocks, formatBriefingTime, engineState, insightView, isMockResponse, probeResponseLabel, roleReviewState, roleReviewBadge } from "../src/features/briefing/briefing-model.js";

test('synthetic input and real provider response are labelled independently',()=>{
  const real={demo:true,execution_mode:'provider_test',probe_context:{response_origin:'openai_network',call_status:'complete'}};
  assert.equal(isMockResponse(real),false);assert.match(probeResponseLabel(real),/실제 GPT/);
  assert.equal(isMockResponse({...real,probe_context:{response_origin:'offline_contract_fixture',call_status:'complete'}}),true);
  assert.equal(isMockResponse({...real,probe_context:{response_origin:'openai_network',call_status:'insufficient_zero_calls'}}),true);
  assert.equal(isMockResponse({demo:true,execution_mode:'fake_transport'}),true);
});

const fixture = JSON.parse(await readFile(new URL("../src/features/briefing/fixtures/ready.json", import.meta.url), "utf8"));

function citationArtifact(url, withoutRoles = false) {
  const data = structuredClone(fixture);
  data.companies[0].sources[0].url = url;
  if (withoutRoles) data.roles = [];
  data.execution_mode = 'fake_transport';
  data.identity.execution_mode = 'fake_transport';
  data.provider_receipt = {transport:'fake'};
  data.input_canonical_json = JSON.stringify(Object.fromEntries(
    ['schema_version','demo','session','engines','companies'].map(key=>[key,data[key]])
  ));
  const inputHash = createHash('sha256').update(data.input_canonical_json).digest('hex');
  data.identity.input_hash = inputHash;
  return {artifact_kind:ARTIFACT_KIND,version:1,created_at:data.generated_at,execution_mode:'fake_transport',
    source_binding:{input_hash:inputHash,assessment_session:data.session,screening_archive_sha256:'a'.repeat(64),normalizer_version:'briefing-native-input-v1'},briefing:data};
}

test('encrypted writer and reader reject credential-bearing or untrusted source links', async()=>{
  const password = 'synthetic-citation-test-only';
  for (const url of ['https://www.sec.gov/Archives/?apikey=SYNTHETIC_CANARY',
    'https://www.sec.gov/Archives/#SYNTHETIC_CANARY',
    'https://www.sec.gov/Archives/?%61pi%6bey=SYNTHETIC_CANARY',
    'https://www.sec.gov/Archives/?redirect=https%3A%2F%2Fexample.invalid%2Fcollect',
    'https://www.sec.gov/Archives/#token%3DSYNTHETIC_CANARY',
    'https://%75ser:%73ynthetic@www.sec.gov/Archives/',
    'https://ｗｗｗ.sec.gov/Archives/', 'https://www。sec.gov/Archives/',
    'https://%77ww.sec.gov/Archives/', 'https://www.sec.gov\\Archives/',
    'https://user:synthetic@www.sec.gov/Archives/', 'https://example.invalid/untrusted']) {
    for (const withoutRoles of [false,true]) {
      const artifact = citationArtifact(url,withoutRoles);
      await assert.rejects(encryptBriefingArtifact(artifact,password),/BRIEFING_ARTIFACT_INVALID/);
      // Even valid encryption and a matching input hash cannot bypass reader checks.
      const envelope = await encryptEnvelope(artifact,password);
      await assert.rejects(readBriefingArtifact(envelope,password,{
        expectedSession:artifact.briefing.session,now:Date.parse(artifact.created_at)
      }),/BRIEFING_ARTIFACT_INVALID/);
    }
  }
});

test('ordinary source links retain the encrypted offline reader path', async()=>{
  for (const url of ['https://www.sec.gov/Archives/', 'https://WWW.SEC.GOV/Archives/',
    'https://www.sec.gov/Archives/?', 'https://www.sec.gov/Archives/#',
    'https://www.sec.gov:443/Archives/', 'https://www.sec.gov:8443/Archives/']) {
    const artifact = citationArtifact(url);
    const envelope = await encryptBriefingArtifact(artifact,'synthetic-citation-test-only');
    const data = await readBriefingArtifact(envelope,'synthetic-citation-test-only',{
      expectedSession:artifact.briefing.session,now:Date.parse(artifact.created_at)
    });
    assert.equal(data.status,'ready');
    assert.equal(data.companies[0].sources[0].url,url);
  }
});

test('failed or unavailable generation never exposes leftover role classifications',()=>{
  for(const status of ['unavailable','failed','pending']){
    const state=roleReviewState({...fixture,status});
    assert.equal(state.state,'held');assert.deepEqual(state.roles,[]);
    assert.equal(state.baselineDisplayAvailable,false);
  }
});
test('missing, quarantined or mismatched MLG data permits only document review',()=>{
  for(const patch of [{status:'missing'},{status:'quarantined'},{session:'1900-01-01'},{contract:'unavailable'},{contract:''}]){
    const data=structuredClone(fixture);Object.assign(data.engines.MLG.current,patch);
    const before=JSON.stringify(data);const state=roleReviewState(data);
    assert.equal(state.state,'comparison_held');assert.equal(state.roles.length,fixture.roles.length);
    assert.equal(state.baselineDisplayAvailable,false);assert.equal(roleReviewBadge(data.roles[0],state),'대조 보류');
    assert.equal(JSON.stringify(data),before);
  }
});
test('unconfirmed roles never receive a matching-classification badge',()=>{
  const state=roleReviewState(fixture);assert.equal(state.baselineDisplayAvailable,false);
  assert.equal(roleReviewBadge({role:'unknown',decision:'unconfirmed',comparison:'agree'},state),'대조 보류');
  assert.equal(roleReviewState({...fixture,roles:[]}).state,'no_evidence');
});

test("merged insights preserve both engine changes in either fact order", () => {
  const facts={...fixture.computed.facts,mlg_changes:{kind:'candidate_change',engine:'MLG',count_delta:-2,entered:['MLG-NEW'],exited:['MLG-OLD','MLG-OLD2','MLG-OLD3']}};
  for (const kind of ['market_conflict', 'candidate_review']) {
    for (const ids of [['tenx_changes','mlg_changes'],['mlg_changes','tenx_changes']]) {
      const fact_ids=kind==='market_conflict'?['market',...ids]:ids;
      const view=insightView({kind,fact_ids},facts);
      assert.match(view.fact,/TENX/);assert.match(view.fact,/MLG/);
      for(const id of ids)assert.ok(view.fact.includes(String(facts[id].count_delta)));
      if(kind==='candidate_review'){assert.match(view.fact,/MLG-NEW/);assert.match(view.fact,/MLG-OLD/);}
    }
  }
});
test("demo needs both explicit development config and the preview query", () => {
  const input = { dev: true, enabled: "true", search: "?demo=briefing" };
  assert.equal(demoRequested(input), true);
  for (const altered of [{ dev: false }, { enabled: undefined }, { search: "" }]) {
    assert.equal(demoRequested({ ...input, ...altered }), false);
  }
});
test("source freshness is independent of the briefing generation clock", () => {
  const radar = fixture.engines.Radar.current;
  assert.equal(engineState(radar, fixture.session), "기준일 일치");
  assert.equal(engineState({ ...radar, session: "2026-10-29" }, fixture.session), "이전 자료");
  assert.equal(engineState({ ...radar, status: "quarantined" }, fixture.session), "확인 보류");
});
test("prose renders code computed differences, never reranks the fixture", () => {
  const original = JSON.stringify(fixture);
  const view = insightView(fixture.insights[0], fixture.computed.facts);
  assert.match(view.fact, /\+1개/);
  assert.match(view.fact, /새 편입 2개·제외 1개/);
  assert.equal(JSON.stringify(fixture), original);
  assert.equal(fixture.score_effect, 0);
  assert.ok(fixture.demo);
});
test("generation clocks come from each result and preserve explicit timezone", () => {
  const data = structuredClone(fixture);
  data.generated_at = "2026-11-01T23:30:00Z";
  assert.equal(briefingClocks(data).generated, "2026-11-01 23:30 UTC");
  assert.equal(briefingClocks(data, "Asia/Seoul").generated, "2026-11-02 08:30 Asia/Seoul");
  assert.equal(briefingClocks(data).engines[0].asOf, fixture.engines.Radar.current.as_of);
  assert.equal(formatBriefingTime("invalid"), null);
  assert.equal(formatBriefingTime("2026-11-02T12:00:00"), null);
});
test("failed or missing result never borrows normal scenario dates", () => {
  for(const data of [{ status: "unavailable" }, { status: "disabled" }, { status: "unavailable", generated_at: fixture.generated_at }]) {
    const clocks = briefingClocks(data);
    assert.equal(clocks.generated, null);
    assert.equal(clocks.session, null);
    assert.ok(clocks.engines.every(clock => clock.asOf === null && clock.label === "자료 확인 불가"));
  }
});
test("explicit prior result is dated as previous and never a newly generated briefing", () => {
  const clocks = briefingClocks({status:"unavailable",previous_is_current:false,previous_briefing:fixture});
  assert.equal(clocks.generated,null);
  assert.equal(clocks.previousGenerated,formatBriefingTime(fixture.generated_at));
  assert.ok(clocks.engines.every(clock=>clock.label==='이전 결과'));
});
