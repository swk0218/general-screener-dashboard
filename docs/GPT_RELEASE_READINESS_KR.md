# 배포급 데모 완료 판정표

이 문서는 완료/미완료를 기능별로 구분한다. 단일 합성 요청 성공이나 테스트 개수를 실제 분류 성능 개선으로 부르지 않는다. 이번 업데이트는 새 API 요청·예산예약·원격 push·운영 main/배포/권한 변경 없이 수행했다.

| 기능/조건 | 판정 | 실제 증거/남은 조건 |
|---|---|---|
| 기존 점수·순위·필터·publisher 보존 | PASS | 고정 회귀와 기존 engine/publisher diff 없음. 실제 보관 archive도 읽기만 하고 score/rank/filter 투영 해시·원본바이트 보존 |
| 실제 OpenAI→grounding→암호문→기존 잠금/화면 | PASS, 제한된 범위 | run41589507153 단일 합성 TENX 변화+근거 없는 기업 유보. 실제 화면15개, OFF10자산동일. 실제 문서 분류 일반화 증거 아님 |
| 열린 화면의 Radar 기한·거래일·달력 만료 재평가 | PASS | 30초 간격 및 focus/pageshow/visibility 재평가. stale 해석은 숨기고 이전 생성시각만 명시. 암호 보관/재호출 없음. 단위 및3화면폭 브라우저 회귀 |
| 기준일 결측과 보고서 생성시각 분리 | PASS | 복호화된 수신payload의 screening_price_as_of만 표시. current_price_as_of/보고서시각 대체 금지. GPT미생성이어도 원자료 보고시각은 별도 표시하고 기준일과 다름을 명시 |
| 달력 범위/만료/알 수 없는 설정 | PASS, 운영 유지 필요 | NYSE 검토 테이블 만료 시 null/HOLD. 가짜 오늘/직전날 fallback 없음. 아래 갱신 절차 필요 |
| 원래 제품 시험 실패의 구체 원인 | 미확정 | run41586229061 HTTP200 후 grounding거부. 세부 응답 미보존. 이후 성공으로 원인 해소를 주장하지 않음 |
| 실제 공시 완전명제/출처/반대근거 분류 | 미완료 | 신규 문서 v3 후보를 모델 출력 전 작성. 원문·taxonomy만의 독립검토→코드/참조 동결→같은 장부CAS 후 실행 필요 |
| 정상/지연/격리/상충의 다중 엔진 근거 보존 | 미완료 | 새 대표4요청 및0호출 유보 대조군 후보. 기존 불명 요청은 재전송하지 않음 |
| 실제 Screening 입력 기준일 | 외부 입력 결측 | b7a769598442ffb5874763573a62c71562032e90의 최신TENX41589289419/MLG39538430726은 screening_price_as_of가 없음. 비교 contract는 확인되더라도 날짜를 지어내지 않아 adapter/HOLD/0호출 확인 |
| 실제 FMP 입력으로 엔진 전체 재생 | 미검증 | 현재 고정 fixture는 synthetic FMP-shape. 실제 보관 엔진 산출물의 불변성은 확인했지만 실제 원 응답 재생과 같지 않음. provider_snapshot은 synthetic-only이고 live 원 응답 보관 경로 없음. 키 추출/새 FMP 조회/추가 과금 안 함 |
| 실제 Radar 복구 통합 | 외부 복구 대기 | dashboard78f881cb57652cff13da1a3cf8d0c3d4f3763bfb: FAILED/REVISION_QUARANTINED, source2026-10-19/expected2026-11-02. 구조 검증·시장유보 확인. 운영cipher는 복호화하지 않았으며 복구 전 정상 최신 판정 불가 |
| 전체 배포급 완료 | 미완료 | 위 실제 문서 품질·유효 실입력·복구 통합이 남음. 운영 배포는 별도 승인 대상 |

## 달력 유지와 열린 화면

이번 검사: 시점/문구 단위17PASS, 전체 frontend146PASS+기존Windows symlink EPERM2건, native session 브라우저12PASS(320/390/1440×정상/지연/자료없음/데이터기준일결측), 실제 시험 암호문이 있는 OFF build10asset SHA동일/private scanPASS. 최초 테스트 harness의 payload_json 접근/innerText 비교 차이와 sandbox TEMP의 원자적rename 제한은 수정·허용된TEMP 설정으로 재검증했으며 제품 검증 정책/OS권한은 완화하지 않았다. 이 개수는 투자·분류 성능 지표가 아니다.

기준 테이블은 NYSE 공식 https://www.nyse.com/trade/hours-calendars 이며 2026휴장/단축장·IANA America/New_York로 장마감을 계산한다. 확인일/만료일/적용연도가 코드에 명시되어 있다. 현재 테이블 유효기한은2026-11-10T03:20:00Z이며 그 순간부터 유보한다.

운영 담당자가 만료 전에 공식 정규/단축장과 임시휴장을 확인하고 table·checked_at·valid_until을 함께 새 브랜치에서 갱신한 뒤 휴장/단축장/DST/만료 회귀를 확인한다. 확인되지 않은 유효기한 연장, 주말만 뺀 날짜 추정, Radar 날짜를 달력으로 쓰는 fallback은 금지다. 이 작업은 운영 일정/자동 배포를 신설하지 않았다. 갱신 실패 시 서비스는 원래 엔진 화면을 유지하고 브리핑 최신 판단만 유보한다.

활성 화면은 최대30초 안에 재평가하며, 화면 복귀/창 활성화 시 즉시 재평가한다. 새 거래일이 완료되거나, 달력이 만료되거나,36시간 생성 수명/시장자료 유효성이 끝나면 기존 결과를 새 결과로 유지하지 않는다. 별도 passphrase 저장이나 공급자 요청은 없으며, 새 암호문을 읽으려면 기존 잠금 흐름으로 다시 연다. 이전 결과가 있으면 그 실제 기준일/생성시각을 이전 결과로 구분한다.

## 실자료를 정상으로 승격하기 위한 최소 조건

Screening 생산자가 실제 가격 원천에서 확인한 market session/as-of와 원천 receipt를 제공해야 한다. 보고서 날짜·현재 조회시각·GPT 추정으로 채우지 않는다. 데이터 제공 후 새 immutable archive→native validator→input hash→별도 암호화 artifact→reader 순서로 재검증한다. FMP 실응답 재생은 기존 권한·보관 가능한 최소자료·비밀 주입·무료/기존한도·보존정책을 먼저 확인해야 하며 합성 fixture_kind로 위장하지 않는다.

Radar 운영 복구는 별도 작업에서 수행된다. 이 앱 작업은 writer를 변경하지 않으며, 새 고정 producer_revision·source_session·cipher hash·publication receipt·AEAD/원 계약 검증이 일치할 때만 그 실제 결과를 통합 확인한다. 실제 운영 passphrase를 추출하여 시험하지 않는다. 실패/격리/지연 UX는 복구 전에 독립 검증 가능하며 정상 자료가 들어온 것으로 대체하지 않는다.
