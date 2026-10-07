# Phase 7 — 기술적 지표

GET /market/:market/analysis?timeframe=1h (기본 1h). 지원 주기: 1m, 5m, 15m, 1h, 4h, 1d. 인증 없는 공개 시세 API입니다.

Bithumb에서 최근 캔들 최대 200개와 ticker를 조회합니다. 진행 중인 봉은 제외하고 시간순 마감 봉의 종가로 계산하며 PostgreSQL에 가격이나 지표를 저장하지 않습니다. 마지막 봉 시작 시각은 asOf, 현재가의 시각은 priceTimestamp, 계산 시각은 generatedAt입니다. 서로 다른 시점이므로 구분해서 사용해야 합니다.

- SMA20/60: 마지막 N개 종가의 단순 평균.
- EMA20/60: 첫 N개 SMA로 초기화하고 가중치 2/(N+1) 적용. 200개 조회 구간 초기화이므로 장기 히스토리를 사용하는 차트와 값이 다를 수 있습니다.
- RSI14: 최초 14개 가격 변화의 평균 상승/하락으로 초기화한 Wilder 방식. 이후 1/14 가중치. 상승·하락 모두 0이면 이 앱은 50을 반환합니다. 하락만 0이면 100, 상승만 0이면 0입니다.
- MACD: EMA12 − EMA26. Signal은 유효 MACD 9개 평균으로 초기화한 EMA9, Histogram은 MACD − Signal. 각 값은 필요한 봉이 부족하면 null입니다.
- 거래량: 마지막 마감 봉 거래량과 그 봉을 제외한 이전 20개 마감 봉 평균 비교. 변화율은 (현재/평균−1)×100. 평균 0 또는 자료 부족이면 null입니다.

시간 간격이 비어 있으면 gapCount/warnings로 알리며 가짜 봉을 생성하지 않습니다. 이 경우 이동평균 기간은 관측된 봉 수 기준입니다. 데이터 부족은 null과 경고로 표현합니다. highToday/lowToday는 현재 일자 기준으로 high24h/low24h라고 표시하지 않습니다.

프론트 차트 아래 기술적 지표 카드에서 확인합니다. 종목/주기를 바꾸거나 차트 새로고침을 누르면 지표를 다시 조회합니다. 지표 장애는 별도 영역에 표시하며 가격 알림 엔진과 의존하지 않습니다.

검증: `cd backend && npm test`, `cd frontend && npm run test:e2e`. 수열 기반 SMA/EMA, RSI 기준값, MACD 정렬과 Signal, 미완성 봉 제외, 거래량 분모, 부족 데이터·빈 구간·중복 봉을 검사합니다.

계산 참고: [Fidelity EMA](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ema), [Fidelity 지표 안내](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide).

다음 단계는 Phase 8 LLM 기반 시장·포트폴리오·브리핑 요약입니다. 이 단계에서는 AI 추천·매매 훈련·주문 기능을 구현하지 않습니다.

실측 검증 (2026-09-28): 백엔드 51개 테스트, 브라우저 2개 테스트 통과. 실제 Bithumb 6개 주기 모두 마감 봉 199개로 분석 응답 확인. 잘못된 주기는 HTTP 400, Docker 두 서비스 healthy 확인. 모바일 지표 카드 표시 확인.
