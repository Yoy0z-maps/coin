export interface Market { market: string; koreanName: string; englishName: string; warning: string }
export interface Watch { id: string; market: string; enabled: boolean }
export interface Alert { id: string; market: string; condition: 'ABOVE'|'BELOW'; targetPrice: string; enabled: boolean; triggerOnce: boolean; cooldownMinutes: number }
export interface Candle { timestamp: string; open: number; high: number; low: number; close: number; volume: number }
export interface Ticker { market: string; price: number; change24h: number|null; highToday: number; lowToday: number; volume24h: number; timestamp: string }
export interface Live { market: string; price: number; changeRate: number; volume24h: number; receivedAt: string; timestamp: string; streamType: string }
export interface Realtime { status: string; subscriptions: string[]; cacheHealthy: boolean; receivedCount: number; lastMessageAt: string|null; tickers: Live[]; activeAlertCount: number }
export interface Asset { currency: string; balance: number; availableBalance: number; locked: number; valuation: number|null; profit: number|null; profitRate: number|null; portfolioWeight: number|null; pricingUnavailableReason: string|null; currentPrice: number|null }
export interface Portfolio { valuationComplete: boolean; totalAssetKRW: number|null; knownValueKRW: number; unpricedCurrencies: string[]; accountsFetchedAt: string; assets: Asset[] }
