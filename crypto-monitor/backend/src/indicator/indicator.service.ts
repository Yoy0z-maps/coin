import { Injectable } from '@nestjs/common';
import { Candle } from '../common/market.dto';
import { Timeframe, TIMEFRAMES } from '../common/market';
export function sma(values: number[], period: number): number | null {
  return values.length < period ? null : values.slice(-period).reduce((a,b)=>a+b,0)/period;
}
export function ema(values: number[], period: number): number[] {
  if(values.length<period)return [];
  let value=sma(values.slice(0,period),period)!; const out=[value];
  for(let i=period;i<values.length;i++){value+=(values[i]-value)*2/(period+1);out.push(value);}return out;
}
export function rsi(values: number[], period=14): number|null {
  if(values.length<=period)return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0)/period;loss+=Math.max(-d,0)/period;}
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;}
  return gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
}
@Injectable()
export class IndicatorService {
  analyze(input: Candle[], timeframe: Timeframe, now=new Date()) {
    const duration=(TIMEFRAMES[timeframe]??1440)*60000;
    const rows=[...input].sort((a,b)=>a.timestamp.getTime()-b.timestamp.getTime());
    for(let i=0;i<rows.length;i++){
      const r=rows[i];if(!Number.isFinite(r.timestamp.getTime())||!Number.isFinite(r.close)||r.close<=0||!Number.isFinite(r.volume)||r.volume<0||(i>0&&r.timestamp.getTime()===rows[i-1].timestamp.getTime()))throw new Error('Invalid indicator candles');
    }
    const closed=rows.filter(r=>r.timestamp.getTime()+duration<=now.getTime());
    const prices=closed.map(r=>r.close),fast=ema(prices,12),slow=ema(prices,26);
    const macd=slow.map((v,i)=>fast[i+14]-v),signal=ema(macd,9);
    const last=(values:number[])=>values.at(-1)??null;
    const m=last(macd),s=last(signal);
    const current=closed.at(-1)?.volume??null;
    const average20=closed.length>=21?sma(closed.slice(-21,-1).map(r=>r.volume),20):null;
    const gaps=closed.slice(1).filter((r,i)=>r.timestamp.getTime()-closed[i].timestamp.getTime()!==duration).length;
    return { candleCount:closed.length, excludedCandleCount:rows.length-closed.length, candleBasis:'CLOSED_ONLY' as const,
      asOf:closed.at(-1)?.timestamp??null, gapCount:gaps,
      indicators:{sma20:sma(prices,20),sma60:sma(prices,60),ema20:last(ema(prices,20)),ema60:last(ema(prices,60)),rsi14:rsi(prices),macd:{macd:m,signal:s,histogram:m===null||s===null?null:m-s}},
      volume:{current,average20,change:current===null||average20===null||average20===0?null:(current/average20-1)*100},
      warnings:[...(closed.length<60?['INSUFFICIENT_CANDLES']:[]),...(gaps?['CANDLE_GAPS_OBSERVED']:[])] };
  }
}
