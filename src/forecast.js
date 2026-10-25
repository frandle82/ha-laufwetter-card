export function normalizeForecast(forecast,unitSystem={}){
  const temperatureUnit=unitSystem.temperature||"°C";
  const windUnit=unitSystem.wind_speed||"km/h";
  const numberOrNull=value=>{
    if(value==null||value==="")return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  };
  const toC=t=>{const value=numberOrNull(t);return value==null?null:temperatureUnit==="°F"?(value-32)*5/9:value;};
  const toKmh=v=>{const value=numberOrNull(v);return value==null?null:windUnit==="mph"?value*1.609344:windUnit==="m/s"?value*3.6:windUnit==="kn"?value*1.852:value;};
  return (forecast||[]).filter(x=>x.datetime&&!Number.isNaN(Date.parse(x.datetime))).map(x=>({
    datetime:x.datetime,temperature:toC(x.temperature),
    precipitation_probability:numberOrNull(x.precipitation_probability),
    precipitation:numberOrNull(x.precipitation),
    wind_speed:toKmh(x.wind_speed),wind_gust_speed:toKmh(x.wind_gust_speed),
    humidity:numberOrNull(x.humidity),
    uv_index:numberOrNull(x.uv_index),
    condition:x.condition||""
  })).sort((a,b)=>Date.parse(a.datetime)-Date.parse(b.datetime));
}
