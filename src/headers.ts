export function selectHeaders(input:Record<string,string|string[]|undefined>):Record<string,string>{
  const selected:Record<string,string>={};
  for(const [key,value] of Object.entries(input)){
    const name=key.toLowerCase();
    if(['content-type','user-agent','x-request-id'].includes(name)&&value!==undefined)selected[name]=Array.isArray(value)?value.join(','):value;
  }
  return selected;
}
