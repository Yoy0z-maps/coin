# Phase 2 — Bithumb 공개 시장 데이터

## 실행과 조회

프로젝트 루트에서:

```sh
docker compose up -d --build --wait
curl --fail-with-body http://127.0.0.1:3000/markets
curl --fail-with-body http://127.0.0.1:3000/market/KRW-BTC/ticker
curl --fail-with-body 'http://127.0.0.1:3000/market/BTC/candles?timeframe=1h&limit=100'
```

공개 API는 API key/JWT 없이 호출합니다. `.env`는 수정하지 않습니다. Private API와 키의 유효성·권한 확인은 Phase 3 범위입니다. 키는 `crypto-monitor/.env`의 `BITHUMB_ACCESS_KEY`, `BITHUMB_SECRET_KEY`에만 저장하고 `.env.example`이나 채팅에 넣지 않습니다.

## REST 계약

| Endpoint | 응답 |
| --- | --- |
| `GET /markets` | `{market, koreanName, englishName, warning}[]` |
| `GET /market/:market/ticker` | `MarketTicker` 단일 객체 |
| `GET /market/:market/candles` | `Candle[]`, 과거 → 최신 순서 |

`BTC`, `btc`, `krw-btc`는 `KRW-BTC`로 정규화합니다. `BTC-ETH`도 지원합니다. 현재 공식 API가 제공하는 KRW/BTC 결제 통화만 허용합니다. 이름 형식 검증은 상장 여부 확인이 아니며 존재하지 않는 종목은 거래소의 400/404를 안전한 애플리케이션 오류로 반환합니다.

캔들 query:

- `timeframe`: `1m`, `5m`, `15m`, `1h`(기본), `4h`, `1d`.
- `limit`: 1–200 정수, 기본 100. 빈 문자열·소수·중복 파라미터·지원하지 않는 timeframe은 HTTP 400.
- 최근 데이터만 제공합니다. 과거 페이지 탐색용 `to` 파라미터는 아직 노출하지 않습니다.
- 거래소가 반환한 실제 캔들만 반환합니다. 데이터가 부족하면 요청 수보다 적거나 빈 배열일 수 있습니다. 없는 봉을 합성하거나 간격을 채우지 않습니다.
- 마지막 캔들은 진행 중일 수 있습니다. Phase 7 지표 계산에서 완성 봉 포함 정책을 별도로 정해야 합니다.

`Candle`: `{timestamp, open, high, low, close, volume}`. timestamp는 `candle_date_time_utc`에 명시적으로 UTC를 적용한 **봉 시작 시각**이며, 거래소의 마지막 체결 timestamp로 대체하지 않습니다. JSON 날짜는 ISO UTC입니다. 가격은 해당 마켓의 결제 통화, volume은 거래 대상 코인 수량입니다. 프런트엔드 차트 UI는 이 단계에 포함하지 않습니다.

`MarketTicker`:

| 필드 | 의미 |
| --- | --- |
| `market`, `price` | 시장 식별자와 현재 가격 |
| `changeRate` | 전일 종가 대비 부호 있는 **비율**. -0.01은 -1% |
| `changeRateBasis` | `PREVIOUS_CLOSE_KST` |
| `previousClose` | KST 0시 기준 전일 종가 |
| `highToday`, `lowToday` | ticker의 당일 고가·저가. 최근 24시간 고가·저가로 표시하지 않음 |
| `volume24h` | 최근 24시간 누적 코인 거래량 |
| `tradeValue24h` | 최근 24시간 누적 거래대금, 결제 통화 단위 |
| `timestamp` | v1 ticker가 제공한 정보 생성 timestamp |
| `change24h` | 별도 공식 legacy 공개 ticker의 최근 24시간 변동률, **퍼센트**. -3.1은 -3.1% |
| `change24hTimestamp` | 별도 24시간 자료의 timestamp |

두 ticker API는 별도 호출이므로 관측 시점이 정확히 일치하지 않을 수 있습니다. 각 API가 제공한 timestamp를 유지합니다. 별도 24시간 조회 실패 시 현재가는 유지하고 `change24h`, `change24hTimestamp`를 `null`로 반환합니다. 전일 대비 변화율을 24시간 변동률로 대신 쓰지 않습니다.

## 설계 및 장애 처리

```text
MarketController → MarketService → BithumbRestClient → Bithumb Public REST
                                       ↓
                                  응답 검증·내부 DTO
```

- BithumbModule만 외부 통신을 수행합니다. URL은 공식 origin으로 고정하며 GET만 사용하고 redirect를 거부합니다. 공개 요청에는 인증 헤더나 secret을 넣지 않습니다.
- 호출마다 최대 5초 timeout. 프로세스 전체에서 요청 시작 예약 간격 250ms, 최대 대기 5초로 제한합니다. 대기 초과 시 503. 다른 컨테이너가 같은 공인 IP로 하는 요청까지 통제하지는 않습니다.
- upstream 429에는 최대 60초의 초 단위 Retry-After 또는 기본 5초 대기를 적용합니다. 자동 재시도 루프는 없습니다.
- 응답의 숫자·시장 일치·UTC·OHLC·봉 중복을 검사합니다. 누락 데이터를 0으로 대체하지 않습니다.
- 요청·응답 원문, 헤더, secret, 외부 오류 객체를 로그에 남기지 않습니다. 실패 종류/HTTP 상태만 기록합니다.
- upstream 400/404 → 400/404, upstream 429 또는 대기열 초과 → 503, 네트워크/응답 스키마/기타 HTTP 실패 → 502, timeout → 504.
- 시장 데이터는 요청 시 조회하고 DB에 저장하지 않습니다. Prisma schema와 migration은 변경하지 않았습니다.
- `/market/:market/analysis`, Portfolio, WebSocket, 알림은 후속 단계입니다.

## 파일

- `backend/src/bithumb/bithumb.module.ts`: 외부 통신 provider 구성.
- `backend/src/bithumb/bithumb-rest.client.ts`: 공개 REST, timeout, 호출 제한, 오류 변환.
- `backend/src/bithumb/bithumb.mapper.ts`: 거래소 응답 런타임 검증·DTO 변환.
- `backend/src/common/market.ts`, `market.dto.ts`: 정규화, query 검증과 내부 DTO.
- `backend/src/market/market.module.ts`, `market.service.ts`, `market.controller.ts`: 시장 조회 계층.
- `backend/src/app.module.ts`: MarketModule 등록.
- `backend/test/market.test.cjs`: 정규화, 매핑, timeframe, 오류/timeout/429/호출 제한 테스트.
- `backend/test/market-live.cjs`: 실행 중인 Backend를 통한 실제 공개 API 검증.

## 검증

```sh
cd backend
npm test
cd ..
node backend/test/market-live.cjs
```

실제 API 검증은 인터넷 연결이 필요하며 시장 목록, BTC/ETH/XRP ticker·24시간 변동률, 6개 timeframe별 100개 봉, 최대 200개, 잘못된 입력의 400을 확인합니다. 사용자 지정 포트는 `MARKET_SMOKE_BASE_URL=http://127.0.0.1:포트`로 지정합니다. 실시간 가격은 고정값으로 비교하지 않습니다.

실측 결과 (2026-09-23):

- 기존 Phase 1을 포함한 단위 테스트 19개 통과.
- Docker Backend 재빌드 및 두 컨테이너 healthy 확인.
- 실제 시장 목록 493개, BTC/ETH/XRP 현재가와 24시간 변동률 조회 통과.
- 6개 시간대 각각 100개 봉, 최대 200개 조회 및 UTC 오름차순 검증 통과.
- 잘못된 timeframe·limit·중복 query·시장 입력은 HTTP 400 확인.
- `/health`의 DB 연결 정상, 기존 DB 테이블만 유지, 기존 n8n 계속 실행 확인.

## 공식 계약 확인 (2026-09-23)

공식 문서의 Markdown OpenAPI 정의(version 2.1.5)와 공개 API 실응답을 확인했습니다.

- [거래 대상 목록](https://apidocs.bithumb.com/reference/거래-대상-목록-조회): `/v1/market/all?isDetails=true`.
- [현재가](https://apidocs.bithumb.com/reference/현재가-조회): `/v1/ticker?markets=KRW-BTC`.
- [분봉](https://apidocs.bithumb.com/reference/분minute-캔들-조회): `/v1/candles/minutes/{unit}`, 1/5/15/60/240 매핑.
- [일봉](https://apidocs.bithumb.com/reference/일day-캔들-조회): `/v1/candles/days`.
- [최근 24시간 변동률](https://apidocs.bithumb.com/v1.2.0/reference/현재가-정보-조회): `/public/ticker/{base}_{quote}`의 `fluctate_rate_24H`.
- [요청 수 제한](https://apidocs.bithumb.com/docs/api-요청-수-제한-안내): IP/분류 단위 제한. 서버의 429를 우선합니다.

다음 Phase 3에서는 공식 Private REST/JWT 계약을 확인한 뒤 읽기 전용 자산 조회와 Portfolio 계산을 구현합니다. 별도 사용자 지시 후 진행합니다.
