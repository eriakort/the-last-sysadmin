(function(root){
'use strict';
function parseHeader(line){
  line=String(line);let quote=null,escaped=false;
  for(let i=0;i<line.length-1;i++){
    const ch=line[i];
    if(escaped){escaped=false;continue;}
    if(ch==='\\'&&quote!=="'"){escaped=true;continue;}
    if(quote){if(ch===quote)quote=null;continue;}
    if(ch==="'"||ch==='"'){quote=ch;continue;}
    if(ch!=='<'||line[i+1]!=='<')continue;
    const start=i;i+=2;while(i<line.length&&/\s/.test(line[i]))i++;
    let delimiter='',quoted=false;
    if(line[i]==="'"||line[i]==='"'){
      quoted=true;const q=line[i++],end=line.indexOf(q,i);if(end<0)return null;
      delimiter=line.slice(i,end);i=end+1;
    }else{
      const end=i;while(i<line.length&&!/[\s;|&<>]/.test(line[i]))i++;
      delimiter=line.slice(end,i);
    }
    if(!delimiter)return null;
    return {command:(line.slice(0,start)+line.slice(i)).trimEnd(),delimiter,quoted};
  }
  return null;
}
const api={parseHeader};root.LSAHeredocParser=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
