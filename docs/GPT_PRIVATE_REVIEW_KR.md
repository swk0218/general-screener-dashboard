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
