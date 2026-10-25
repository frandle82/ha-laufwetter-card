import {scoreHour,bestWindow,scoreLabel} from "./scoring.js";
import {normalizeForecast} from "./forecast.js";
class LaufwetterCard extends HTMLElement{
  constructor(){super();this.attachShadow({mode:"open"});this.forecast=[];this.error="";this.loading=false;this.lastFetch=0;this.requestId=0;}
  disconnectedCallback(){this.requestId++;}
  setConfig(config){if(!config.entity)throw Error("Bitte eine weather-Entität angeben.");this.config={title:"Laufwetter",location:"",duration:60,refresh_minutes:30,...config};this.render();}
  set hass(hass){this._hass=hass;if(!this.config)return;this.render();const now=Date.now();if(!this.loading&&(now-this.lastFetch>=Math.max(5,Number(this.config.refresh_minutes))*60000)){this.fetchForecast();}}
  async fetchForecast(){if(!this._hass?.callWS||!this.config)return;this.loading=true;this.lastFetch=Date.now();const requestId=this.requestId;try{
    const result=await this._hass.callWS({type:"call_service",domain:"weather",service:"get_forecasts",service_data:{type:"hourly"},target:{entity_id:this.config.entity},return_response:true});
    if(requestId!==this.requestId)return;
    const data=result?.response||result;
    const forecast=data?.[this.config.entity]?.forecast;
    if(!Array.isArray(forecast))throw Error("Keine stündliche Prognose verfügbar.");
    const entity=this._hass.states?.[this.config.entity];
    const units={...this._hass.config?.unit_system,...entity?.attributes};
    this.forecast=normalizeForecast(forecast,{temperature:units.temperature_unit||units.temperature,wind_speed:units.wind_speed_unit||units.wind_speed});this.error="";
  }catch(err){if(requestId===this.requestId){this.error=String(err.message||err);this.forecast=[];}}finally{this.loading=false;this.render();}}
  render(){if(!this.shadowRoot||!this.config)return;
    const now=Date.now(),hours=this.forecast.filter(h=>Date.parse(h.datetime)>=now).slice(0,24).map(h=>({...h,...scoreHour(h)}));
    const best=bestWindow(hours,Number(this.config.duration)||60),first=hours[0],s=first?.score;
    const format=dt=>new Intl.DateTimeFormat("de-DE",{hour:"2-digit",minute:"2-digit"}).format(new Date(dt));
    const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const tint=x=>x==null?"#94a3b8":x>=80?"#22a06b":x>=65?"#88b65d":x>=45?"#e9b44c":"#d66b61";
    this.shadowRoot.innerHTML=`<style>:host{display:block}ha-card{padding:20px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px);font-family:var(--primary-font-family,sans-serif)}.head,.summary,.metrics,.best,.timeline{display:flex;justify-content:space-between;align-items:center;gap:12px}.small{font-size:12px;color:var(--secondary-text-color)}h2{margin:4px 0;font-size:27px;color:${tint(s)}}.gauge{width:86px;height:86px;border-radius:50%;border:7px solid ${tint(s)};display:grid;place-content:center;text-align:center}.gauge strong{font-size:28px}.metrics{margin:20px 0;text-align:center}.metrics>div{flex:1}.metrics strong{display:block;margin-bottom:4px}.best{border-top:1px solid var(--divider-color);padding-top:14px}.bars{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:3px;margin-top:16px}.bar{height:10px;border-radius:2px}.timeline{margin-top:7px}.error{color:var(--error-color);font-size:12px;margin-top:10px}</style><ha-card><div class="head"><strong>${esc(this.config.title)}</strong><span class="small">${esc(this.config.location)}</span></div><div class="summary"><div><span class="small">Aktuelle Prognosestunde</span><h2>${scoreLabel(s)}</h2><span class="small">${first?format(first.datetime):"Keine Prognose"}</span></div><div class="gauge"><strong>${s??"–"}</strong><span class="small">von 100</span></div></div><div class="metrics"><div><strong>${first?.temperature!=null?Math.round(first.temperature)+" °C":"–"}</strong><span class="small">Temperatur</span></div><div><strong>${first?.wind_speed!=null?Math.round(first.wind_speed)+" km/h":"–"}</strong><span class="small">Wind</span></div><div><strong>${first?.precipitation_probability!=null?Math.round(first.precipitation_probability)+" %":"–"}</strong><span class="small">Regenrisiko</span></div></div><div class="best"><span>Beste Laufzeit (${Number(this.config.duration)||60} Min.)</span><strong>${best?format(best.start):"–"}</strong></div><div class="bars">${hours.map(h=>`<div class="bar" title="${esc(format(h.datetime))}: ${h.score??"–"}/100" style="background:${tint(h.score)}"></div>`).join("")}</div><div class="timeline small"><span>Jetzt</span><span>+12 h</span><span>+24 h</span></div><div class="small" style="margin-top:12px">Eigener Wetterindex · keine medizinische Sicherheitsbewertung</div>${this.error?`<div class="error">${esc(this.error)}</div>`:""}</ha-card>`;
  }
  getCardSize(){return 4;}
}
customElements.define("laufwetter-card",LaufwetterCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"laufwetter-card",name:"Laufwetter Card",description:"Eigenständiger Laufwetter-Index mit Stundenprognose"});
