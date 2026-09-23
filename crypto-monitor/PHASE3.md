# Phase 3 — 읽기 전용 자산 조회와 Portfolio

## 실행과 확인

프로젝트 루트에서:

```sh
docker compose up -d --build --wait
node backend/scripts/portfolio.cjs
```

두 번째 명령은 **Mac에서 실행하는 조회 도우미**입니다. 로컬 `.env`에서 접근 토큰과 포트를 읽어 `GET http://127.0.0.1:3000/portfolio`를 호출하고 실제 포트폴리오 JSON을 출력합니다. 토큰을 명령행 인자나 쉘 기록에 붙여 넣을 필요가 없습니다. 서버 접근 시 `X-Monitor-Token` 헤더가 필요합니다.

## 환경변수

- `BITHUMB_ACCESS_KEY` 또는 `BITHUMB_API_KEY`: 동일 역할입니다. 현재 사용자가 입력한 `BITHUMB_API_KEY` 이름을 지원합니다. 두 값이 모두 설정되어 서로 다르면 시작 시 거부합니다.
- `BITHUMB_SECRET_KEY`: 거래소 JWT 서명용 키.
- `PORTFOLIO_API_TOKEN`: 이 앱의 로컬 조회용 토큰입니다. 거래소 키와 별개이며 32–256자의 영문·숫자·`_`·`-`를 사용합니다. 이번 환경에는 64자리 난수를 생성해 `.env`에 추가했습니다. 기존 거래소 키 값은 보존했습니다.

새 설치 시 `openssl rand -hex 32`로 로컬 토큰을 생성할 수 있습니다. `.env` 권한은 600이고 Git/이미지에서 제외합니다. 환경변수 변경 후에는 `docker compose up -d`로 컨테이너를 재생성합니다. 단순 `restart`만으로는 변경된 환경변수가 반영되지 않습니다.

키에는 자산 조회에 필요한 최소 조회 권한만 부여하세요. 프로그램이 호출하는 Private endpoint는 **`GET /v1/accounts` 하나뿐**입니다. 계좌 조회 성공만으로 키의 다른 권한이 비활성화되었다고 확인할 수는 없습니다. 주문·취소·입출금 API는 구현하지 않습니다.

## 데이터 흐름

```text
PortfolioController (접근 토큰 검증, no-store)
  → PortfolioService
     → BithumbRestClient → BithumbAuthService → GET /v1/accounts
     → BithumbRestClient → 공개 시장 목록 및 묶음 ticker
     → PortfolioCalculator → 응답
```

- 요청마다 새 UUID nonce, 밀리초 timestamp, access_key를 담은 HS256 JWT를 생성합니다. accounts 조회는 파라미터가 없으므로 query_hash를 넣지 않습니다. 서명은 요청 대기 후 전송 직전에 생성합니다.
- 인증 헤더는 공식 `https://api.bithumb.com/v1/accounts`에만 전달합니다. 공개 시세 요청에는 전달하지 않으며 redirect를 거부합니다.
- Bithumb decimal 문자열은 계층 경계에서 검증 후 보존합니다. `decimal.js`로 계산하며 최종 JSON에 숫자로 변환합니다. 수량을 임의로 2자리 반올림하지 않습니다. 평가액·원금·손익은 소수 2자리, 수익률·비중은 4자리로 표시합니다. 자산별 표시값 합과 전체 합에는 반올림 차이가 있을 수 있습니다.
- balances, tickers, 계산 결과는 DB에 저장하거나 캐시하지 않습니다. Prisma schema/migration은 변경하지 않았습니다. Snapshot 및 `/portfolio/history`는 아직 구현하지 않았습니다.
- 계좌 잔고와 시세는 각각 조회되므로 원자적인 동일 시점 snapshot은 아닙니다. `accountsFetchedAt`, `calculatedAt`, 자산별 `priceTimestamps`로 관측 시점을 표시합니다.

## 응답과 계산 정책

최상위 필드:

| 필드 | 의미 |
| --- | --- |
| `valuationComplete` | 양수 잔고인 모든 자산의 원화 평가 가능 여부 |
| `totalAssetKRW` | 평가 완료 시 전체 자산 평가액. 미평가 자산이 있으면 `null` |
| `knownValueKRW` | 시세를 확인한 자산과 KRW 현금의 평가액 합 |
| `unpricedCurrencies` | 원화 평가하지 못한 자산 코드 |
| `accountsFetchedAt`, `calculatedAt` | UTC ISO 시각 |
| `assets` | 보유 수량이 양수인 자산 목록 |

자산별 필드:

- `availableBalance`: 거래소 `balance`에 해당하는 사용 가능 수량.
- `locked`: 묶인 수량.
- `balance`: 총 보유량 = availableBalance + locked. KRW도 둘을 합산합니다.
- `avgBuyPrice`, `avgBuyPriceCurrency`, `avgBuyPriceModified`: 거래소가 제공한 평균매수가·기준 통화·수정 여부.
- `currentPrice`: 코인 한 개의 원화 가격. KRW는 1.
- `valuation`: balance × currentPrice.
- `costBasisKRW`: 총 보유량 × 원화 기준 평균매수가.
- `profit`: valuation − costBasisKRW. 매매 수수료와 세금은 반영하지 않습니다.
- `profitRate`: profit / costBasisKRW × 100.
- `portfolioWeight`: valuation / 전체 평가액 × 100. 전체 평가액을 모르면 모든 비중을 `null`로 반환합니다.
- `pricingMarkets`, `priceTimestamps`: 원화 시세 또는 BTC 경유 환산의 근거와 시각.
- `pricingStatus`, `pricingUnavailableReason`, `costBasisStatus`: 데이터 이용 가능 상태.

원화 마켓을 우선 사용합니다. BTC 마켓만 있으면 해당 자산/BTC 가격 × BTC/KRW 가격으로 **현재 평가액**을 환산합니다. 공개 ticker는 중복을 제거하고 20개씩 순차 조회합니다.

평균매수가가 0이면 원금과 손익·수익률은 `null`입니다. 에어드롭·외부 입금 등을 무조건 수익으로 간주하지 않습니다. 과거 평균매수가가 BTC 기준이면 당시 환율을 알 수 없으므로 오늘의 BTC 가격으로 과거 원화 원금을 만들지 않습니다. 이 경우 `NON_KRW_COST_BASIS` 상태로 원화 손익을 `null`로 표시합니다. KRW 현금은 평가액과 원금이 같고 손익·수익률은 0입니다.

상장 폐지·미지원 시장 등으로 가격이 없으면 해당 자산을 숨기거나 0원 처리하지 않습니다. 평가액 `null`, 보유 수량 유지, 전체 평가 불완전으로 반환합니다. `NO_SUPPORTED_MARKET`은 현재 공개 목록에 원화 또는 지원 가능한 BTC 경로가 없다는 뜻이며, 상장 폐지를 단정하는 상태는 아닙니다. `MARKET_LIST_UNAVAILABLE`과 `QUOTE_UNAVAILABLE`은 각각 목록/시세 조회 실패를 뜻합니다.

## 오류와 개인정보

- 로컬 토큰 누락·오류: HTTP 401. 로컬 토큰 미설정: 503.
- 거래소 인증/권한 오류: 503과 정해진 코드만 반환합니다. 원문 오류·JWT·키·잔고는 로그에 남기지 않습니다.
- `BITHUMB_KEYS_MISSING`: 키 설정 확인.
- `BITHUMB_IP_NOT_ALLOWED`: 거래소에 등록한 공인 IP 확인.
- `BITHUMB_READ_PERMISSION_REQUIRED`: 자산 조회 권한 확인.
- `BITHUMB_TOKEN_EXPIRED`: Mac/Docker 시계 확인.
- `BITHUMB_SIGNATURE_REJECTED`, `BITHUMB_AUTH_REJECTED`: 키 쌍, Open API 버전, 유효기간·권한·IP를 확인합니다.
- 계좌 조회 자체가 실패하면 빈 지갑이나 0원으로 반환하지 않습니다. 반면 일부 공개 시세 실패는 잔고를 유지한 부분 응답으로 반환합니다.
- 가격 API의 timeout·호출 제한과 오류 처리는 Phase 2 정책을 따릅니다. health와 기존 공개 시세 endpoint는 별도 로컬 토큰 없이 계속 사용할 수 있습니다.

## 파일과 검증

추가: `bithumb-auth.service.ts`, `bithumb-account.mapper.ts`, `common/account.dto.ts`, `portfolio/`의 module/controller/service/calculator/guard, 조회 도우미 `scripts/portfolio.cjs`, `test/portfolio.test.cjs`, `test/portfolio-live.cjs`.

수정: `bithumb-rest.client.ts`, `bithumb.module.ts`, `app.module.ts`, 환경변수 검증, Compose, `.env.example`, package/lockfile, README. 로컬 `.env`에는 별도 접근 토큰만 추가했습니다.

```sh
cd backend
npm test
cd ..
node backend/test/portfolio-live.cjs
node backend/test/market-live.cjs
```

단위 테스트는 가짜 키와 잔고만 사용합니다. 실제 계좌 검증 스크립트는 실제 키로 계좌를 조회하되 보유 종목·잔고·평가액·토큰을 출력하지 않고 통과 여부만 출력합니다. 조회 도우미 `scripts/portfolio.cjs`는 사용자가 직접 결과를 볼 때 사용합니다.

## 실측 검증 결과 (2026-09-23)

- 전체 단위 테스트 34개 통과, Docker 빌드 성공, 두 서비스 healthy.
- 설정된 실제 키로 `GET /v1/accounts` 인증과 `GET /portfolio` 응답 성공.
- 실제 보유 자산 중 지원 가능한 공개 시장이 없는 항목을 확인했으며, `NO_SUPPORTED_MARKET`으로 표시합니다. 총평가액은 불완전 상태이고 확인 가능한 금액은 `knownValueKRW`로 구분됩니다.
- 접근 토큰 없음/오류에 HTTP 401, 성공/오류 응답의 `no-store` 확인.
- 기존 시장 493개, BTC/ETH/XRP ticker, 6개 timeframe 캔들 및 잘못된 입력 처리 회귀 검증 통과.
- PostgreSQL에는 기존 두 테이블만 존재하며 잔고·시세를 저장하지 않습니다. n8n 계속 실행 확인.
- Backend 로그에서 설정된 실제 키·secret·로컬 토큰·DB 비밀번호가 출력되지 않았음을 검사했습니다. 검사 과정에서도 값과 로그 원문을 출력하지 않았습니다.

## 공식 문서 확인 (2026-09-23)

- [인증 토큰 생성](https://apidocs.bithumb.com/docs/인증-토큰-생성하기): HS256, access_key, nonce, timestamp와 무파라미터 요청 계약.
- [전체 자산 조회](https://apidocs.bithumb.com/reference/전체-자산-조회): `/v1/accounts`, balance/locked 및 평균매수가 기준 통화.
- [ticker 묶음 조회 제한 공지](https://apidocs.bithumb.com/changelog/사전-공지-현재가-조회-markets-최대-개수-제한): 공지된 최대 200개보다 작은 20개 배치를 사용합니다.

다음은 Phase 4 관심 종목·가격 알림·알림 기록 DB 및 CRUD이며, 별도 사용자 지시 후 진행합니다.
