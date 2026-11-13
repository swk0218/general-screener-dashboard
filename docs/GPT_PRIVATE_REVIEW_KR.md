# 비공개 GPT 체험본

원래 개발 브랜치의 별도 HTML entrypoint다. 운영 index/App이나 public/data를 바꾸지 않는다.
기존 General Screener 디자인과 정성 상태 표시를 사용한다. 외부 연결은 CSP로 막으며,
비공개 자료는 별도 체험 암호로 AES-GCM 암호화한다. 운영 비밀번호는 읽거나 바꾸지 않는다.

PRIVATE-review-inputs의 실제 TENX 수치 실행과 저장된 DOCN/GWRE SEC 제한 표본을 사용한다.
서로 다른 실행·수집 범위이므로 표본 판단을 수치 실행의 총점·순위에 합산하지 않는다.
TENX 121개 전체 순위 탐색, G/Y/C/V 상세, 저장된 표본 판단·정확한 인용·SEC 시각/원문,
MLG 반영식, Radar 미평가 상태를 제공한다. 새 FMP/GPT 요청·Telegram·운영 게시가 없다.
기준 점수 없는 표본을 실제 점수 변화로 표시하지 않는다.

로컬 개발은 `npm run dev` 후 /review.html을 연다. 기본은 검토 암호문 JSON을 사용자가
직접 불러오는 화면이다. 자료는 메모리에만 두며 잠금·새로고침 시 제거한다.

비공개 검토 자료를 한 파일에 넣어 전달할 때:

```sh
npm run build:review -- --inputs /private/PRIVATE-review-inputs \
  --output /private/GPT-Private-Review.html \
  --password-file /private/review-passphrase.txt
```

출력은 소스 checkout 밖에만 생성할 수 있다. 새 암호는 별도 0600 파일에 기록하며 출력하지
않는다. HTML에 암호를 넣지 않는다. 암호문 JSON도 별도로 생성한다. 결과물은 비공개로
전달하며 public assets·공개 저장소·운영 Pages에는 올리지 않는다.

검증은 npm run check, Pages artifact guard, 기존 briefing 및 review browser suites를 따른다.
오프라인 완성본은 file://로 열어 외부 요청 0, 잘못된 암호, 실제 종목 탐색, 모바일 overflow,
잠금 후 자료 제거까지 별도로 검증한다. 리뷰 UI가 통과해도 실제 provider/원장/위험 이력/
Radar 검색·게시 검증을 완료했다고 표현하지 않는다.

후속 실제 후보 검토는 `--observed-review /private/final-observed-replay`로 연결한다.
MLG·TENX 121개씩의 회사별 판정·보류 사유, MLG의 이전/제안 E·A, TENX의
원점수 S·검토 Q·참고 T와 전달 원문 발췌를 탐색한다. 미평가 Q는 null로 남기며
원본 숫자 표와 제한 SEC 표본을 보존한다. API 응답 확보·근거 규칙 통과·독립
회사 의미 검토·운영 설치는 서로 다른 완료 상태다. 생성 파일을 사이트에 자동
게시하거나 운영 비밀번호를 사용하지 않는다.

## 기존 제품과 같은 검토 UI · 2026-11-10

검토 진입점은 운영 UI와 같은 자체 호스팅 IBM Plex Sans KR/Mono 및
`styles/terminal-v2.css`의 기존 색상 토큰을 사용한다. 새 팔레트나 운영 화면
재설계는 추가하지 않는다. 본문은 Sans, 숫자·종목·짧은 식별자는 Mono를 쓴다.
모바일 본문 14px, 제목 24px, 절 제목 17px을 기준으로 위계를 구분한다.

개요 → 회사 검색/보류 필터 → 판단·S/Q/T → 원문·검토 메모 → 목록 복귀가
주 흐름이다. 모바일 상세에서 목록을 잠시 숨기고 닫으면 선택 버튼으로 포커스를
돌린다. 긴 문구는 전체 내용을 보존한 펼치기 버튼으로 읽는다. 이전 SEC 표본과
원본 수치·과거 위험 기록은 명시한 보관 영역에서 열 수 있다.

AI 표시는 작은 기존 cyan 라벨로 제한한다. 보류는 기존 amber를 사용한다.
실제 최초 실행 수와 저장 응답 재검증 수는 Radar 상단에 계속 분리 표시한다.
보도 내용, 조건부 시장 해석, 원문·발행 시각 미확인 표기도 유지한다. 뉴스의
60초/포커스 시점 만료 확인을 보존하며 화면 갱신이 원래 시각을 바꾸지 않는다.

이 변경은 표시·탐색만 다룬다. 판정 문자열·인용·점수·순위·cutoff·운영 데이터는
수정하지 않는다. CI의 비교 스크린샷은 TEST_ONLY 합성 자료만 사용한다.
비공개 실제 자료 검사는 스크린샷/내용 보존 없이 별도로 수행한다. 운영 main
병합·활성화·Site 갱신은 사용자 검토 및 승인의 별도 단계다.


## 최종 디자인 정돈 · 2026-11-13

운영 main `1171094823333e875c324772fcda42c6876f255a`와 개발 기준
`629e9464aca361fbb8476273c6432cf28f0cb632`의 기존 styles.css,
terminal-v2.css, refinement.css와 fonts.css 및 폰트 트리는 동일하다.
원격 두 트리에 AGENTS.md는 있고 .agents/skills는 없다. PR #10의 사용자
시각 피드백에 따라 본문을 일괄 확대하지 않고 검토 영역의 역할만 맞춘다.

- 공통 1440px 프레임과 desktop gutter, 모바일 바깥 여백 20px를 사용한다.
  모바일 회사 목록·상세와 Radar는 페이지 기준선을 한 번만 상속한다.
- 검색은 13px, 펼치기와 보조 동작은 기존 11px 역할, 본문과 수치는
  기존 Sans/Mono 위계를 유지한다. 한국어 제목·설명은 어절 기준으로 줄바꿈한다.
- 뉴스의 헤드라인 → 확인 포인트 → 범위·조건을 갖춘 영향 배지를 유지한다.
  저장된 보도 내용과 기존 시장 해석은 한 펼치기 안에서 구분한다.
- 사후 수동 검토의 반복 재구성 접두사만 화면용 문구에서 줄인다.
  전체 저장 문구는 별도 펼치기로 보존하고 새 원문 확인·GPT 판단과 구분한다.
  원본 검토 시각과 별도 확인 발행 시각도 연도를 포함해 표시한다.
- 탭 전환 후 이전 스크롤 위치를 남기지 않고 새 화면 제목부터 보여 준다.
- 과거 저장 결과가 최신 기준의 새 재평가를 마친 것으로 보이지 않게 한다.
  실제 최초 실행과 저장 응답 재검증의 건수·원래 검색 시각은 그대로 표시한다.

UI만 다시 빌드할 때는 기존 암호문을 복호화·재암호화하지 않는다.

```sh
npm run build:review -- --encrypted-bundle /private/original.enc.json \
  --expected-envelope-sha256 ORIGINAL_SERIALIZED_ENVELOPE_SHA256 \
  --output /private/GPT-Private-Review.html
```

이 모드는 입력 JSON의 정확한 SHA와 envelope 형식 및 안전한 삽입을 확인하고
같은 직렬화 바이트를 넣는다. 암호를 받거나 새로 만들지 않으며 데이터 추가 옵션과
함께 사용할 수 없다. 인증 복호화와 실제 번들 검증은 기존 잠금 해제 시 수행한다.
빌드 결과와 암호문 사본은 checkout 밖에 0600으로 쓴다. 출력 HTML의 암호문이
원본과 완전히 같아야 한다. 운영 데이터·workflow·기존 UI foundation은 수정하지 않는다.

로컬 검증: Node 24.22.1에서 npm run check 165개 통과, Pages artifact guard
15개 통과. 접두사만 제거하고 원문을 보존하는 회귀 및 동일 암호문 빌드·오류 SHA·
데이터 변경 옵션·닫는 script 표기 거부를 확인했다. 브라우저 회귀의 변경 selector와
수동 검토 원문 펼치기 검사는 작성했으나 이 작업자는 실행하지 않았다. 실제 화면·
상호작용·작은 폭 검증은 별도 CUA 검사 결과를 따른다.
