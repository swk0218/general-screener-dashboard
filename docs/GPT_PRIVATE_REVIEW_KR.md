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
