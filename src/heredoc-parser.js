(function(root){
'use strict';
function parseHeader(line){
  const match=String(line).match(/<<\s*(?:'([^']+)'|"([^"]+)"|([^\s;|&]+))/);
  if(!match)return null;
  const delimiter=match[1]||match[2]||match[3];
  if(!delimiter)return null;
  return {command:String(line).slice(0,match.index)+String(line).slice(match.index+match[0].length),delimiter,quoted:!!(match[1]||match[2])};
}
const api={parseHeader};root.LSAHeredocParser=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
