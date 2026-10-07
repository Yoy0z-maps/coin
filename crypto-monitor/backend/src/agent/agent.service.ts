import { Inject, Injectable, Logger, ServiceUnavailableException, HttpException } from '@nestjs/common';
import { LLM_PROVIDER, LlmProvider } from './llm.provider';
import { MarketService } from '../market/market.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { DatabaseService } from '../database/database.service';
import { normalizeMarket, parseCandleQuery } from '../common/market';
export type AgentKind='market'|'portfolio'|'briefing';
@Injectable()
export class AgentService {
 private busy=false;private nextAt=0;private readonly logger=new Logger(AgentService.name);
 constructor(@Inject(LLM_PROVIDER) private readonly llm:LlmProvider,private readonly market:MarketService,private readonly portfolio:PortfolioService,private readonly db:DatabaseService){}
 status(){return {configured:this.llm.configured,provider:'gemini',portfolioDataSent:'valuation, currency, weight and profit rate; no credentials or account identifiers'};}
 async summarize(kind:AgentKind,input?:string,timeframe?:unknown){
  const normalized=kind==='market'?normalizeMarket(input):undefined;
  const query=parseCandleQuery(timeframe,'200');
  if(!this.llm.configured)throw new ServiceUnavailableException('AI requires GOOGLE_AI_STUDIO_API_KEY');
  if(this.busy||Date.now()<this.nextAt)throw new HttpException('AI request in progress or cooling down; retry shortly',429);
  this.busy=true;this.nextAt=Date.now()+10000;this.logger.log('Agent request started');
  try{
   const warnings:string[]=[];
   const alerts=await this.db.priceAlert.findMany({where:{enabled:true,...(normalized?{market:normalized}:{})},orderBy:{createdAt:'asc'},take:101});
   if(alerts.length>100)warnings.push('ALERTS_TRUNCATED_TO_100');
   const p=kind==='market'?null:await this.portfolio.getPortfolio().catch(()=>{warnings.push('PORTFOLIO_UNAVAILABLE');return null;});
   const portfolio=p?{valuationComplete:p.valuationComplete,totalAssetKRW:p.totalAssetKRW,knownValueKRW:p.knownValueKRW,accountsFetchedAt:p.accountsFetchedAt,unpricedCurrencies:p.unpricedCurrencies,assets:p.assets.slice(0,100).map(a=>({currency:a.currency,valuation:a.valuation,weight:a.portfolioWeight,profitRate:a.profitRate,pricingStatus:a.pricingStatus,priceTimestamps:a.priceTimestamps}))}:null;
   if(p&&p.assets.length>100)warnings.push('PORTFOLIO_ASSETS_TRUNCATED_TO_100');
   const watch=kind==='briefing'?await this.db.watchlist.findMany({where:{enabled:true},orderBy:{createdAt:'asc'},take:101}):[];
   const selected=normalized?[normalized]:[...new Set([...watch.map(w=>w.market),...alerts.map(a=>a.market),...(p?.assets.flatMap(a=>a.pricingMarkets)??[])])];
   if(selected.length>5)warnings.push('MARKET_ANALYSIS_LIMIT_5');
   const markets: Awaited<ReturnType<MarketService['getAnalysis']>>[]=[];
   // Sequential collection avoids flooding Bithumb's bounded REST queue.
   for(const symbol of selected.slice(0,5)){
    try{markets.push(await this.market.getAnalysis(symbol,query.timeframe));}
    catch{warnings.push(`MARKET_UNAVAILABLE:${symbol}`);}
   }
   const context={kind,timeframe:query.timeframe,collectedAt:new Date().toISOString(),portfolio,markets,alerts:alerts.slice(0,100).map(a=>{const price=markets.find(m=>m.market===a.market)?.price;const target=Number(a.targetPrice);return {market:a.market,condition:a.condition,target,distancePercent:price?(target-price)/price*100:null};}),warnings};
   if(!markets.length&&!portfolio)throw new ServiceUnavailableException('No usable market or portfolio data available');
   const summary=await this.llm.summarize(context);this.logger.log('Agent request completed');
   return {kind,summary,generatedAt:new Date().toISOString(),context};
  }catch(e){this.logger.warn('Agent request failed');if(e instanceof HttpException)throw e;throw new ServiceUnavailableException('AI context unavailable');}
  finally{this.busy=false;}
 }
}
